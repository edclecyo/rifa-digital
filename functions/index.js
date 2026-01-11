/* ===============================
   🔧 INICIALIZAÇÃO
================================ */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { CloudTasksClient } = require('@google-cloud/tasks');
const { exigirKycNivel } = require("./financeiro/kyc");
const PDFDocument = require("pdfkit");
const { PassThrough } = require("stream");

admin.initializeApp();
const db = admin.firestore();
const tasksClient = new CloudTasksClient();

/* ===============================
   CONFIGURAÇÕES
================================ */
const SUPER_ADMIN_UID = "WttevCDh6haanBH0v98nggOsBm62";
const TOTAL_CARTELAS = 1600;
const NUMEROS_POR_CARTELA = 6;
const LIMITE_BATCH = 500;
const TEMPO_RESERVA_MS = 15 * 60 * 1000; // 15 minutos
const VALOR_CARTELA = 2.5;

/* ===============================
   METAS
================================ */
const METAS = [
  { cartelas: 100, premio: 100, nivel: "vermelho" },
  { cartelas: 500, premio: 500, nivel: "verde" },
  { cartelas: 1000, premio: 1000, nivel: "dourado" },
];
/* ===============================
   exigirAdmin
================================ */
function exigirAdmin(context) {
  if (!context.auth || context.auth.uid !== SUPER_ADMIN_UID) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Acesso restrito ao admin'
    );
  }
}
/* ===============================
  adminForcarRollback
================================ */
exports.adminForcarRollback = functions.https.onCall(
  async ({ pedidoId, motivo }, context) => {
    exigirAdmin(context);

    const pedidoRef = db.collection('Pedidos').doc(pedidoId);
    const snap = await pedidoRef.get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found');

    const pedido = snap.data();
    if (pedido.status === 'ROLLBACK_EXECUTADO') return;

    await rollbackPedidoFinanceiro({
      uid: pedido.uid,
      pedidoId,
      motivo: motivo || 'Admin',
    });

    return { success: true };
  }
);
/* ===============================
  registrarLogin
================================ */
exports.registrarLogin = functions
  .region('southamerica-east1')
  .https.onCall(async (data, context) => {

    // 🔐 1️⃣ Autenticação obrigatória
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Usuário não autenticado'
      );
    }

    const uid = context.auth.uid;
    const { deviceId, platform } = data;

    if (!deviceId || !platform) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'deviceId e platform são obrigatórios'
      );
    }

    const userPrivRef = db.collection('UsuariosPrivado').doc(uid);
    const deviceRef = userPrivRef.collection('Dispositivos').doc(deviceId);
    const auditoriaRef = db.collection('AuditoriaLogin').doc();

    await db.runTransaction(async (tx) => {

      // 🔎 Inicialização segura
      const userSnap = await tx.get(userPrivRef);
      if (!userSnap.exists) {
        tx.set(userPrivRef, {
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          scoreAntifraude: 0,
          bloqueado: false,
        });
      }

      const userData = userSnap.data() || {};
      if (userData.bloqueado === true) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Conta bloqueada por segurança'
        );
      }

      // 📱 Registrar dispositivo
      const deviceSnap = await tx.get(deviceRef);
      if (!deviceSnap.exists) {
        tx.set(deviceRef, {
          platform,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          ultimoLogin: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 🚨 Novo dispositivo → aumenta score
        tx.update(userPrivRef, {
          scoreAntifraude: admin.firestore.FieldValue.increment(25),
        });
      } else {
        tx.update(deviceRef, {
          ultimoLogin: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 📊 Contar dispositivos
      const devicesSnap = await userPrivRef.collection('Dispositivos').get();
      const totalDevices = devicesSnap.size;

      // 🛑 Regra antifraude: bloqueia se >=4 dispositivos
      if (totalDevices >= 4) {
        tx.update(userPrivRef, {
          bloqueado: true,
          motivoBloqueio: 'Múltiplos dispositivos',
          bloqueadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 📑 Auditoria de login
      tx.set(auditoriaRef, {
        uid,
        deviceId,
        platform,
        totalDevices,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        tipo: 'login',
        ip: context.rawRequest?.ip || null,
      });
    });

    return {
      ok: true,
      message: 'Login registrado com sucesso',
    };
  });

/* ===============================
  adminAjustarSaldo
================================ */
exports.adminAjustarSaldo = functions.https.onCall(
  async ({ uid, valor, motivo }, context) => {
    exigirAdmin(context);

    const ref = db.collection('UsuariosPrivado').doc(uid);

    await db.runTransaction(async tx => {
      tx.update(ref, {
        saldo: admin.firestore.FieldValue.increment(valor),
      });

      tx.set(ref.collection('LedgerFinanceiro').doc(), {
        tipo: 'ajuste_admin',
        valor,
        motivo,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  }
);
/* ===============================
  adminBloquearUsuario
================================ */
exports.adminBloquearUsuario = functions.https.onCall(
  async ({ uid, bloqueado }, context) => {
    exigirAdmin(context);

    await db.collection('UsuariosPrivado').doc(uid).set({
      bloqueado,
      bloqueadoEm: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { success: true };
  }
);
/* ===============================
   ENQUEUE COMPRA (Cloud Tasks)
================================ */
async function enqueueCompraTask({ uid, cartelas, nomeComprador, compraId }) {
  const project = process.env.GCP_PROJECT;
  const location = 'us-central1';
  const queue = 'compras-cartelas';
  const url = `https://${location}-${project}.cloudfunctions.net/workerProcessarCompra`;

  const payload = { uid, cartelas, nomeComprador, compraId };

  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
    },
  };

  const parent = tasksClient.queuePath(project, location, queue);
  await tasksClient.createTask({ parent, task });
}
/* ===============================
   CRIAR CARTELAS AUTOMÁTICO
================================ */
exports.criarCartelasAutomatico = functions.https.onCall(
  async (_, context) => {
    // 🔐 Verifica admin
    if (!context.auth || context.auth.uid !== SUPER_ADMIN_UID) {
      throw new functions.https.HttpsError("permission-denied", "Acesso negado");
    }

    const statusRef = db.collection("StatusSorteio").doc("geral");
    const statusSnap = await statusRef.get();
    const rodadaAtual = statusSnap.exists ? statusSnap.data().rodada || 1 : 1;

    const cartelasRef = db.collection("Cartelas");
    const existentesSnap = await cartelasRef.where('rodada', '==', rodadaAtual).get();
    const existentes = existentesSnap.docs.map(d => d.id);

    if (existentes.length >= TOTAL_CARTELAS)
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Limite de cartelas atingido"
      );

    let batch = db.batch();
    let count = 0;
    const codigosUsados = new Set(existentes);

    // 🔄 Cria cartelas até atingir TOTAL_CARTELAS
    for (let i = 1; i <= TOTAL_CARTELAS; i++) {
      const id = `C${i.toString().padStart(4, "0")}`;
      if (codigosUsados.has(id)) continue; // não repete

      const numeros = [];
      while (numeros.length < NUMEROS_POR_CARTELA) {
        const n = Math.floor(Math.random() * 60) + 1;
        if (!numeros.includes(n)) numeros.push(n);
      }

      batch.set(cartelasRef.doc(id), {
        codigo: i,
        numeros,
        rodada: rodadaAtual,
        status: "disponivel",
        reservadaPor: null,
        reservaExpiraEm: null,
        nomeComprador: " ",
        criadaEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      codigosUsados.add(id);
      count++;

      if (count % LIMITE_BATCH === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }

    await batch.commit();

    // 🔔 Atualiza status geral da rodada
    await atualizarStatusSorteio(0); // 0 porque apenas criamos, não vendemos

    // 🔁 Dispara sorteio automático se metas forem atingidas
    const statusAtualSnap = await statusRef.get();
    const statusAtual = statusAtualSnap.exists ? statusAtualSnap.data() : {};
    
    for (const meta of METAS) {
      if (
        statusAtual.cartelasVendidas >= meta.cartelas &&
        (statusAtual.ultimaMetaProcessada || 0) < meta.cartelas
      ) {
        // 🔥 Executa sorteio para essa meta
        await sortearPremio(meta.premio, meta.nivel, rodadaAtual);

        // 🔄 Atualiza ultima meta processada
        await statusRef.update({
          ultimaMetaProcessada: meta.cartelas,
        });
      }
    }

    return { success: true, rodada: rodadaAtual, criadas: count };
  }
);

/* ===============================
   CHECKOUT / CRIAR PEDIDO
================================ */
exports.criarCheckout = functions.https.onCall(async ({ cartelas }, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated');
  const uid = context.auth.uid;

  // Cria pedido
  const pedidoRef = await db.collection('Pedidos').add({
    uid,
    cartelas,
    status: 'pendente',
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Enfileira compra para processamento
  await enqueueCompraTask({ uid, cartelas, nomeComprador: 'Usuário', compraId: pedidoRef.id });

  return { pedidoId: pedidoRef.id };
});
/* ===============================
   verificarAntifraude
================================ */
async function verificarAntifraude({
  uid,
  pedidoId,
  ip = null,
  deviceId = null,
}) {
  const JANELA_MS = 30 * 1000; // 30 segundos
  const LIMITE_PEDIDOS = 3;

  // 🔎 Últimos pedidos do usuário
  const pedidosSnap = await db
    .collection("Pedidos")
    .where("uid", "==", uid)
    .orderBy("criadoEm", "desc")
    .limit(5)
    .get();

  if (pedidosSnap.empty) return true;

  const agora = Date.now();

  const recentes = pedidosSnap.docs.filter(doc => {
    const criadoEm = doc.data().criadoEm?.toMillis?.();
    return criadoEm && agora - criadoEm < JANELA_MS;
  });

  // 🧠 Regra antifraude: compras muito rápidas
  if (recentes.length >= LIMITE_PEDIDOS) {
    const eventoRef = db.collection("AntifraudeEventos").doc();

    // 🔒 Evento antifraude imutável
    await eventoRef.set({
      uid,
      pedidoId,
      tipo: "COMPRA_RAPIDA",
      severidade: "MEDIA",
      score: 60,
      janelaMs: JANELA_MS,
      totalPedidos: recentes.length,
      ip,
      deviceId,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      permitido: false,
      motivo: "COMPRA_RAPIDA",
      severidade: "MEDIA",
    };
  }

  return { permitido: true };
}
/* ===============================
   WORKER COMPRA (Cloud Tasks)
================================ */
exports.workerProcessarCompra = functions.https.onRequest(async (req, res) => {
  const header = req.headers['x-cloudtasks-taskname'];
  if (!header) return res.status(403).send("Forbidden");

  await db.runTransaction(async tx => {
    const snap = await tx.get(compraRef);
    if (!snap.exists) throw new Error("Compra inexistente");

    const compra = snap.data();

    // 🔒 FSM HARD
    if (compra.status !== "PENDENTE") {
      return;
    }
await avaliarRiscoAntifraude({
  uid: compra.uid,
  pedidoId: compraId,
  ip: req.headers["x-forwarded-for"],
  deviceId: compra.deviceId || null,
});
    tx.update(compraRef, {
      status: "PROCESSANDO",
      processandoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  try {
    // 💰 Ledger (imutável)
    await registrarDebito(compraId);

    // 🎟️ Vender cartelas
    await venderCartelas(compraId);

    await compraRef.update({
      status: "PROCESSADA",
      finalizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.send({ ok: true });
  } catch (err) {
    await compraRef.update({
      status: "ERRO",
      erro: err.message,
    });
    res.status(500).send(err.message);
  }
});

/* ===============================
   PROCESSAR COMPRA
================================ */
async function processarCompra({ uid, cartelas, nomeComprador }) {
  const agora = admin.firestore.Timestamp.now();
  const historicoRef = db.collection('Usuarios').doc(uid).collection('HistoricoCartelas');
  const cartelasCompradas = [];
  const CHUNK_SIZE = 500;

  // Divide em chunks para não estourar batch
  for (let i = 0; i < cartelas.length; i += CHUNK_SIZE) {
    const chunk = cartelas.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    const refs = chunk.map(id => db.collection('Cartelas').doc(id));
    const snaps = await db.getAll(...refs);

    for (let j = 0; j < snaps.length; j++) {
      const snap = snaps[j];
      const cartelaId = chunk[j];
      if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Cartela inexistente');

      const c = snap.data();
      if (c.status !== 'reservada' || c.reservadaPor !== uid ||
          (c.reservaExpiraEm && c.reservaExpiraEm.toMillis() < Date.now())
      ) throw new functions.https.HttpsError('failed-precondition', 'Cartela inválida ou reserva expirada');

      batch.update(refs[j], {
        status: 'vendida',
        vendidaPara: uid,
        vendidaEm: agora,
        nomeComprador,
        reservadaPor: null,
        reservaExpiraEm: null,
      });

      batch.set(historicoRef.doc(cartelaId), {
        codigo: c.codigo,
        numeros: c.numeros,
        rodada: c.rodada,
        valor: VALOR_CARTELA,
        status: 'vendida',
        compradaEm: agora,
        userNome: nomeComprador,
      });

      cartelasCompradas.push({ id: cartelaId, valor: VALOR_CARTELA });
    }

    await batch.commit();
  }

  return cartelasCompradas;
}

/* ===============================
   ATUALIZAR RANKING
================================ */
async function atualizarRankingUsuario(uid, cartelasCompradas) {
  if (!uid || !cartelasCompradas?.length) return;
  const quantidade = cartelasCompradas.length;
  const total = cartelasCompradas.reduce((sum, c) => sum + c.valor, 0);
  const userSnap = await db.collection("Usuarios").doc(uid).get();
  const nomeUsuario = userSnap.exists ? userSnap.data().nome || "Usuário" : "Usuário";

  await db.collection("RankingCompradores").doc(uid).set({
    userId: uid,
    nome: nomeUsuario,
    quantidade: admin.firestore.FieldValue.increment(quantidade),
    total: admin.firestore.FieldValue.increment(total),
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

/* ===============================
   ATUALIZAR STATUS GLOBAL
================================ */
async function atualizarStatusGlobal({ novasVendas = 0 }) {
  const ref = db.collection("StatusGlobal").doc("geral");
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const atual = snap.exists ? snap.data() : { totalCartelas: TOTAL_CARTELAS, cartelasVendidas:0, faturamento:0 };
    const cartelasVendidas = (atual.cartelasVendidas || 0) + novasVendas;
    const faturamento = cartelasVendidas * VALOR_CARTELA;
    tx.set(ref, { ...atual, cartelasVendidas, faturamento, atualizadoEm: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
  });
}

/* ===============================
   ATUALIZAR STATUS SORTEIO
================================ */
async function atualizarStatusSorteio(qtdVendidas) {
  const ref = db.collection("StatusSorteio").doc("geral");

  let sorteioParaExecutar = null;

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const atual = snap.exists
      ? snap.data()
      : { rodada: 1, cartelasVendidas: 0, ultimaMetaProcessada: 0 };

    const cartelasVendidas = (atual.cartelasVendidas || 0) + qtdVendidas;

    let nivelSorteio = null;
    let premioSorteio = 0;
    let ultimaMeta = atual.ultimaMetaProcessada || 0;

    for (const meta of METAS) {
      if (cartelasVendidas >= meta.cartelas && ultimaMeta < meta.cartelas) {
        nivelSorteio = meta.nivel;
        premioSorteio = meta.premio;
        ultimaMeta = meta.cartelas;

        // 🔒 Guarda decisão para fora da transaction
        sorteioParaExecutar = {
          rodada: atual.rodada,
          premio: premioSorteio,
          nivel: nivelSorteio,
        };
        break;
      }
    }

    tx.set(
      ref,
      {
        rodada: atual.rodada,
        cartelasVendidas,
        metaAtual: ultimaMeta,
        nivel: nivelSorteio,
        premioAtual: premioSorteio,
        sorteioLiberado: !!sorteioParaExecutar,
        ultimaMetaProcessada: ultimaMeta,
        faltamCartelas: TOTAL_CARTELAS - cartelasVendidas,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  // 🚀 EXECUTA FORA DA TRANSACTION (correto)
  if (sorteioParaExecutar) {
    await sortearPremio(
      sorteioParaExecutar.premio,
      sorteioParaExecutar.nivel,
      sorteioParaExecutar.rodada
    );
  }
}

/* ===============================
   SORTEIO AUTOMÁTICO
================================ */
async function sortearPremio(premio, nivel, rodadaId) {
  const snap = await db.collection("Cartelas")
    .where("rodada", "==", rodadaId)
    .where("status", "==", "vendida")
    .get();

  if (snap.empty) return;

  const vencedora = snap.docs[
    Math.floor(Math.random() * snap.docs.length)
  ];

  await db.collection("Sorteios").add({
    rodadaId,
    cartelaId: vencedora.id,
    premio,
    nivel,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
}
/* ===============================
  verificarDepositosPendentes
================================ */
exports.verificarDepositosPendentes = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    console.log('⏱ Verificando depósitos pendentes...');

    const depositosSnap = await db
      .collectionGroup('Depositos')
      .where('status', '==', 'pendente')
      .limit(50)
      .get();

    if (depositosSnap.empty) return;

    for (const depDoc of depositosSnap.docs) {
      const dep = depDoc.data();
      const uid = depDoc.ref.parent.parent.id;
      const valor = dep.valor || 0;
      if (valor <= 0) continue;

      const saldoRef = db.collection('UsuariosPrivado').doc(uid);

      await db.runTransaction(async (tx) => {
        const saldoSnap = await tx.get(saldoRef);
        const saldoAtual = saldoSnap.exists ? saldoSnap.data().saldo || 0 : 0;

        tx.set(saldoRef, {
          saldo: saldoAtual + valor,
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        tx.update(depDoc.ref, {
          status: 'confirmado',
          confirmadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.set(saldoRef.collection('HistoricoFinanceiro').doc(), {
          tipo: 'deposito',
          valor,
          origem: 'pix',
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log(`💰 Depósito confirmado: ${valor} → ${uid}`);
    }
  });

  /* ===============================
   API — COMPRAR COM SALDO
================================ */
exports.comprarComSaldo = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated");
  }

  const uid = context.auth.uid;
  const { cartelas, nomeComprador } = data;

  if (!Array.isArray(cartelas) || cartelas.length === 0) {
    throw new functions.https.HttpsError("invalid-argument");
  }

  // 🔐 KYC
  const userPrivado = await db.doc(`UsersPrivado/${uid}`).get();
  if ((userPrivado.data()?.kycNivel || 0) < 2) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "KYC insuficiente"
    );
  }

  // 🧾 Criar compra
  const compraRef = db.collection("Compras").doc();
  await compraRef.set({
    uid,
    nomeComprador,
    cartelas,
    status: "PENDENTE",
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  // ⚡ Criar task
  const queuePath = client.queuePath(
    process.env.GCP_PROJECT,
    "us-central1",
    "fila-compras"
  );

  const task = {
    httpRequest: {
      httpMethod: "POST",
      url: `https://us-central1-${process.env.GCP_PROJECT}.cloudfunctions.net/workerProcessarCompra`,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify({ compraId: compraRef.id })).toString("base64"),
    },
  };

  await client.createTask({ parent: queuePath, task });

  return { ok: true, compraId: compraRef.id };
});
 /* ===============================
     rollbackPedidoFinanceiro
  ================================ */
async function rollbackPedidoFinanceiro({ uid, pedidoId, motivo }) {
  const saldoRef = db.collection('UsuariosPrivado').doc(uid);
  const pedidoRef = db.collection('Pedidos').doc(pedidoId);

  await db.runTransaction(async (tx) => {
    const pedidoSnap = await tx.get(pedidoRef);
    if (!pedidoSnap.exists) return;

    const pedido = pedidoSnap.data();

    // 🔒 Evita rollback duplo
    if (pedido.rollbackExecutado) return;

    const valor = pedido.valorTotal;

    // ➕ Devolve saldo
    tx.update(saldoRef, {
      saldo: admin.firestore.FieldValue.increment(valor),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 📊 Ledger reverso
    tx.set(
      saldoRef.collection('LedgerFinanceiro').doc(),
      {
        tipo: 'rollback',
        origem: 'pedido',
        valor,
        referencia: pedidoId,
        motivo,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      }
    );

    // 🧠 Atualiza FSM
    tx.update(pedidoRef, {
      status: 'ROLLBACK_EXECUTADO',
      rollbackExecutado: true,
      rollbackMotivo: motivo,
      rollbackEm: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}
 /* ===============================
     criarPixDeposito
  ================================ */
exports.criarPixDeposito = functions.https.onCall(async ({ valor }, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated');
  if (valor < 5) throw new functions.https.HttpsError('invalid-argument');

  const uid = context.auth.uid;
  const txid = `PIX_${uid}_${Date.now()}`;

  // 🔐 Cria registro local
  const depRef = db
    .collection('UsuariosPrivado')
    .doc(uid)
    .collection('Depositos')
    .doc(txid);

  await depRef.set({
    valor,
    txid,
    status: 'pendente',
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 🔗 CHAMADA AO PSP PIX (exemplo)
  const pix = await criarPixNoBanco({
    valor,
    txid,
    descricao: 'Depósito saldo',
  });

  return {
    txid,
    qrCode: pix.qrCode,
    copiaCola: pix.copiaCola,
  };
});
 /* ===============================
    webhookPix
  ================================ */
exports.webhookPix = functions.https.onRequest(async (req, res) => {
  try {
    const { txid, valor, status } = req.body;

    // 🔐 Validação básica
    if (!txid || typeof valor !== 'number' || !status) {
      return res.status(400).send('Payload inválido');
    }

    // ⛔ Ignora eventos não confirmados
    if (status !== 'CONFIRMADO') {
      return res.sendStatus(200);
    }

    // 🔎 Localiza depósito (collectionGroup)
    const snap = await db
      .collectionGroup('Depositos')
      .where('txid', '==', txid)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn(`⚠️ Depósito não encontrado: ${txid}`);
      return res.sendStatus(404);
    }

    const depDoc = snap.docs[0];
    const deposito = depDoc.data();

    // 🔁 Idempotência HARD
    if (deposito.status === 'confirmado') {
      return res.sendStatus(200);
    }

    // 🧮 Validação de valor
    if (deposito.valor !== valor) {
      console.error(`❌ Valor divergente PIX ${txid}`);
      return res.status(409).send('Valor divergente');
    }

    const uid = depDoc.ref.parent.parent.id;
    const saldoRef = db.collection('UsuariosPrivado').doc(uid);

    // 💰 CONCILIAÇÃO ATÔMICA
    await db.runTransaction(async (tx) => {
      // ➕ Credita saldo
      tx.update(saldoRef, {
        saldo: admin.firestore.FieldValue.increment(valor),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 🧾 Atualiza depósito
      tx.update(depDoc.ref, {
        status: 'confirmado',
        confirmadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 📊 Ledger financeiro IMUTÁVEL
      tx.set(saldoRef.collection('LedgerFinanceiro').doc(), {
        tipo: 'deposito_pix',
        valor,
        txid,
        origem: 'PIX',
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    console.log(`✅ PIX conciliado: ${txid} → UID ${uid}`);
    return res.sendStatus(200);

  } catch (error) {
    console.error('🔥 Erro webhookPix:', error);
    return res.status(500).send('Erro interno');
  }
});

 /* ===============================
    avaliarRiscoAntifraude
  ================================ */
async function avaliarRiscoAntifraude({ uid, pedidoId, ip, deviceId }) {
  let score = 0;

  const pedidosRecentes = await db.collection("Pedidos")
    .where("uid", "==", uid)
    .orderBy("criadoEm", "desc")
    .limit(5)
    .get();

  if (pedidosRecentes.size >= 3) score += 30;

  if (ip) {
    const ipSnap = await db.collection("AntifraudeEventos")
      .where("ip", "==", ip)
      .limit(3)
      .get();
    if (ipSnap.size >= 2) score += 25;
  }

  if (deviceId) score += 20;

  let nivel = "NORMAL";
  if (score >= 70) nivel = "RISCO_ALTO";
  else if (score >= 40) nivel = "SUSPEITO";

  await db.collection("AntifraudeScore").doc(uid).set({
    uid,
    score,
    nivel,
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (nivel === "RISCO_ALTO") {
    await db.collection("UsuariosPrivado").doc(uid).set({
      bloqueado: true,
      bloqueadoEm: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return { score, nivel };
}
   /* ===============================
    registrarEventoAntifraude
  ================================ */
  async function registrarEventoAntifraude(payload) {
  await db.collection("AntifraudeEventos").add({
    ...payload,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
}
 /* ===============================
    gerarPdfLegal
  ================================ */
exports.gerarPdfLegal = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated");
  }

  const uid = context.auth.uid;

  // 🔎 Dados do usuário
  const userSnap = await db.collection("Usuarios").doc(uid).get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Usuário não encontrado");
  }

  const user = userSnap.data();

  if (!user.consentimentoLGPD?.aceito) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "LGPD não aceita"
    );
  }

  // 🧾 Criação do PDF
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const stream = new PassThrough();
  doc.pipe(stream);

  /* ===============================
     CABEÇALHO
  ================================ */
  doc
    .fontSize(18)
    .text("TERMO DE CONSENTIMENTO LGPD", { align: "center" })
    .moveDown(2);

  doc
    .fontSize(12)
    .text(
      "Este documento comprova o consentimento expresso do usuário para tratamento de dados pessoais conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).",
      { align: "justify" }
    )
    .moveDown(2);

  /* ===============================
     DADOS DO USUÁRIO
  ================================ */
  doc.fontSize(12).text(`Nome: ${user.nome}`);
  doc.text(`Email: ${user.email}`);
  doc.text(`UID: ${uid}`);
  doc.text(
    `Data do aceite: ${
      user.consentimentoLGPD.aceitoEm.toDate().toLocaleString("pt-BR")
    }`
  );
  doc.text(`IP: ${user.consentimentoLGPD.ip || "não informado"}`);
  doc.text(`Device: ${user.consentimentoLGPD.device || "não informado"}`);

  doc.moveDown(2);

  /* ===============================
     TEXTO LEGAL
  ================================ */
  doc.fontSize(11).text(
    `
O titular declara estar ciente e de acordo com a coleta, armazenamento,
tratamento e compartilhamento de seus dados pessoais, exclusivamente para
fins operacionais, financeiros, antifraude, cumprimento de obrigações legais
e regulatórias, incluindo integração com instituições financeiras e meios
de pagamento.

Este consentimento pode ser revogado a qualquer momento mediante solicitação
formal, respeitando as obrigações legais vigentes.
    `,
    { align: "justify" }
  );

  doc.moveDown(3);

  /* ===============================
     ASSINATURA DIGITAL
  ================================ */
  doc.text("Assinatura digital:", { continued: true });
  doc.text(` ${uid.substring(0, 8)}-${Date.now()}`);
  doc.moveDown(1);

  doc.text("Documento gerado automaticamente pelo sistema.", {
    align: "center",
  });

  doc.end();

  /* ===============================
     RETORNO BASE64
  ================================ */
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));

  return new Promise((resolve, reject) => {
    stream.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      resolve({
        base64: pdfBuffer.toString("base64"),
        nomeArquivo: `termo-lgpd-${uid}.pdf`,
      });
    });

    stream.on("error", reject);
  });
});