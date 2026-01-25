/* ===============================
   🔧 INICIALIZAÇÃO
================================ */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { CloudTasksClient } = require('@google-cloud/tasks');
const { exigirKycNivel } = require("./financeiro/kyc");
const crypto = require("crypto");
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

// Versão inicial da configuração LGPD
const VERSAO_INICIAL = "1.0";
const VERSAO_ATUAL = "1.0";


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
  /* ===============================
     🔐 PROTEÇÃO CLOUD TASKS
  ================================ */
  const taskName = req.headers["x-cloudtasks-taskname"];
  if (!taskName) {
    return res.status(403).send("Forbidden");
  }

  const { compraId } = req.body;
  if (!compraId) {
    return res.status(400).send("compraId obrigatório");
  }

  const compraRef = db.collection("Compras").doc(compraId);
  let compra;

  /* ===============================
     🧠 FSM HARD + IDEMPOTÊNCIA
  ================================ */
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(compraRef);
      if (!snap.exists) {
        throw new Error("Compra inexistente");
      }

      compra = snap.data();

      // 🔒 IDEMPOTÊNCIA ABSOLUTA
      if (compra.status !== "PENDENTE") {
        throw new Error(`Compra já processada (${compra.status})`);
      }

      // 🔐 Trava FSM
      tx.update(compraRef, {
        status: "PROCESSANDO",
        processandoEm: admin.firestore.FieldValue.serverTimestamp(),
        taskName, // auditoria
      });
    });
  } catch (err) {
    // ⚠️ Task duplicada / replay → ACK silencioso
    return res.status(200).send({ ok: true, ignored: true });
  }

  try {
    /* ===============================
       🛡️ ANTIFRAUDE
    ================================ */
    await avaliarRiscoAntifraude({
      uid: compra.uid,
      pedidoId: compraId,
      ip: req.headers["x-forwarded-for"] || null,
      deviceId: compra.deviceId || null,
    });

    /* ===============================
       💰 FINANCEIRO (LEDGER)
    ================================ */
    await registrarDebito(compraId);

    /* ===============================
       🎟️ CARTELAS (TRAVA HARD)
    ================================ */
    await venderCartelas(compraId);

    /* ===============================
       🔗 COMPARTILHAMENTO PAGO
       (somente após compra válida)
    ================================ */
    await registrarCompartilhamentoAposCompra({
      indicadoUid: compra.uid,
    });

    /* ===============================
       ✅ FINALIZA FSM
    ================================ */
    await compraRef.update({
      status: "PROCESSADA",
      finalizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).send({ ok: true });

  } catch (err) {
    console.error("🔥 Erro workerProcessarCompra:", err);

    /* ===============================
       ❌ ERRO CONTROLADO
       (sem retry infinito)
    ================================ */
    await compraRef.update({
      status: "ERRO",
      erro: err.message,
      erroEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(500).send(err.message);
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
   workerProcessarPedid
================================ */
exports.workerProcessarPedido = functions.firestore
  .document("Pedidos/{pedidoId}")
  .onUpdate(async (change, context) => {
    const depois = change.after.data();
    const pedidoId = context.params.pedidoId;

    if (depois.status !== "pago" || depois.processado) return;

    const {
      VALOR_CARTELA,
      FUNDO_PREMIO,
      VALOR_INDICACAO,
      CUSTO_APP,
      LUCRO_PLATAFORMA,
    } = require("./financeiro.config");

    const batch = db.batch();

    // 🔹 Criar cartela
    const cartelaRef = db.collection("Cartelas").doc();
    batch.set(cartelaRef, {
      uid: depois.uid,
      pedidoId,
      valorUnitario: VALOR_CARTELA,
      fundoPremio: FUNDO_PREMIO,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 🔹 Financeiro
    const financeiroRef = db.collection("Financeiro").doc();
    batch.set(financeiroRef, {
      uid: depois.uid,
      pedidoId,
      entrada: VALOR_CARTELA,
      premio: FUNDO_PREMIO,
      indicacao: VALOR_INDICACAO,
      custoApp: CUSTO_APP,
      lucroPlataforma: LUCRO_PLATAFORMA,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 🔹 Atualizar sorteio
    batch.update(db.doc("Sorteios/ativo"), {
      cartelasVendidas: admin.firestore.FieldValue.increment(1),
      fundoPremio: admin.firestore.FieldValue.increment(FUNDO_PREMIO),
    });

    // 🔹 Marcar pedido como processado
    batch.update(change.after.ref, { processado: true });

    await batch.commit();
  });

/* ===============================
   registrarCompartilhamentoAposCompra
================================ */
async function registrarCompartilhamentoAposCompra({ indicadoUid }) {
  const indicacaoRef = db.collection("Indicacoes").doc(indicadoUid);
  const hoje = new Date().toISOString().slice(0, 10);

  await db.runTransaction(async (tx) => {
    const indicacaoSnap = await tx.get(indicacaoRef);
    if (!indicacaoSnap.exists) return; // sem indicação

    const indicacao = indicacaoSnap.data();

    // 🔒 Já paga → idempotência
    if (indicacao.pago === true) return;

    const { indicadorUid } = indicacao;

    // 🔒 Anti auto-indicação
    if (indicadorUid === indicadoUid) return;

    const diarioRef = db
      .collection("IndicacoesDiarias")
      .doc(`${indicadorUid}_${hoje}`);

    const diarioSnap = await tx.get(diarioRef);
    const totalPagoHoje = diarioSnap.exists
      ? diarioSnap.data().totalPago || 0
      : 0;

    // ⛔ Limite diário: 3
    if (totalPagoHoje >= 3) return;

    // 💰 Credita saldo
    tx.update(
      db.collection("UsuariosPrivado").doc(indicadorUid),
      {
        saldo: admin.firestore.FieldValue.increment(0.25),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      }
    );

    // 📊 Atualiza controle diário
    tx.set(
      diarioRef,
      {
        indicadorUid,
        data: hoje,
        totalPago: totalPagoHoje + 1,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 🔐 Marca indicação como paga (NUNCA mais paga)
    tx.update(indicacaoRef, {
      pago: true,
      pagoEm: admin.firestore.FieldValue.serverTimestamp(),
      valorPago: 0.25,
    });

    // 📜 Ledger imutável
    tx.set(
      db
        .collection("UsuariosPrivado")
        .doc(indicadorUid)
        .collection("LedgerFinanceiro")
        .doc(),
      {
        tipo: "indicacao",
        valor: 0.25,
        indicadoUid,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      }
    );
  });
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
   atualizarMissaoIndicacao
================================ */
async function atualizarMissaoIndicacao(uid) {
  const ref = db.collection('MissoesAtivas').doc(uid);

  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return;

    const data = snap.data();
    if (data.atual >= data.meta) return;

    t.update(ref, {
      atual: admin.firestore.FieldValue.increment(1),
    });
  });
}

/* ===============================
   criarOuResetarMissao
================================ */
exports.criarOuResetarMissao = functions.auth.user().onCreate(async (user) => {
  const ref = db.collection('MissoesAtivas').doc(user.uid);

  const agora = admin.firestore.Timestamp.now();
  const expira = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );

  await ref.set({
    meta: 3,
    atual: 0,
    recompensa: '1 cartela grátis',
    tipo: 'diaria',
    criadaEm: agora,
    expiraEm: expira,
  });
});
/* ===============================
  atualizarRanking de Indicaçoes
================================ */
async function atualizarRanking(uid, nome) {
  const ref = db.collection('RankingIndicacoes').doc(uid);

  await ref.set(
    {
      nome,
      quantidade: admin.firestore.FieldValue.increment(1),
      atualizadoEm: admin.firestore.Timestamp.now(),
    },
    { merge: true }
  );
}
/* ===============================
   verificarSorteio
================================ */
exports.verificarSorteio = functions.firestore
  .document("Sorteios/ativo")
  .onUpdate(async (change) => {
    const depois = change.after.data();
    const cartelas = depois.cartelasVendidas;

    const controleRef = db.doc("Sorteios/controle");
    const controleSnap = await controleRef.get();

    const ultimo = controleSnap.exists ? controleSnap.data().ultimoSorteioEm : 0;

    let premio = null;
    let limite = null;

    if (cartelas >= ultimo + 500) {
      premio = 500;
      limite = ultimo + 500;
    } else if (cartelas >= ultimo + 100) {
      premio = 100;
      limite = ultimo + 100;
    }

    if (!premio) return;

    const cartelasSnap = await db
      .collection("Cartelas")
      .where("criadoEm", "<=", admin.firestore.Timestamp.fromMillis(Date.now()))
      .get();

    if (cartelasSnap.empty) return;

    const vencedor =
      cartelasSnap.docs[Math.floor(Math.random() * cartelasSnap.docs.length)];

    const batch = db.batch();

    batch.set(db.collection("Premios").doc(), {
      uid: vencedor.data().uid,
      valor: premio,
      cartelasNoMomento: limite,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.set(controleRef, { ultimoSorteioEm: limite }, { merge: true });

    await batch.commit();
  });

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
   getRankingSemanal
================================ */
exports.getRankingSemanal = functions.https.onCall(async () => {
  return db.collection("Ranking")
    .orderBy("pontuacao", "desc")
    .limit(10)
    .get();
});
/* ===============================
   getDashboardResumo
================================ */
exports.getDashboardResumo = functions
  .region('southamerica-east1')
  .https.onCall(async (_, context) => {

    // 🔐 Apenas admin (ou você pode liberar user)
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated');
    }

    const hoje = new Date().toISOString().slice(0, 10);

    const [
      faturamentoSnap,
      usuariosSnap,
      cartelasSnap,
      fraudeSnap
    ] = await Promise.all([
      db.collection('FinanceiroResumo').doc(hoje).get(),
      db.collection('UsuariosResumo').doc(hoje).get(),
      db.collection('CartelasResumo').doc(hoje).get(),
      db.collection('FraudesIndicacao')
        .where('data', '==', hoje)
        .get(),
    ]);

    return {
      faturamentoHoje: faturamentoSnap.exists ? faturamentoSnap.data().total : 0,
      usuariosAtivos: usuariosSnap.exists ? usuariosSnap.data().ativos : 0,
      cartelasVendidasHoje: cartelasSnap.exists ? cartelasSnap.data().vendidas : 0,
      indicacoesSuspeitas: fraudeSnap.size,
    };
  });
/* ===============================
   SORTEIO AUTOMÁTICO
================================ */
async function sortearPremio(premio, nivel, rodadaId) {
  const sorteioKey = `rodada_${rodadaId}_${nivel}`;
  const lockRef = db.collection("Locks").doc(sorteioKey);

  await db.runTransaction(async tx => {
    const lockSnap = await tx.get(lockRef);
    if (lockSnap.exists) return; // 🔒 já sorteado

    const snap = await tx.get(
      db.collection("Cartelas")
        .where("rodada", "==", rodadaId)
        .where("status", "==", "vendida")
    );

    if (snap.empty) return;

    const vencedora = snap.docs[
      Math.floor(Math.random() * snap.docs.length)
    ];

    tx.set(db.collection("Sorteios").doc(sorteioKey), {
      rodadaId,
      cartelaId: vencedora.id,
      premio,
      nivel,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(lockRef, {
      executado: true,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}
/* ===============================
  verificarDepositosPendentes
================================ */
exports.verificarDepositosPendentes = functions.pubsub
  .schedule('every 1 minutes')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    console.log('⏱ Verificando depósitos pendentes...');

    try {
      const depositosSnap = await db
        .collectionGroup('Depositos')
        .where('status', '==', 'pendente')
        .limit(50)
        .get();

      if (depositosSnap.empty) {
        console.log('✅ Nenhum depósito pendente');
        return null;
      }

      for (const depDoc of depositosSnap.docs) {
        const dep = depDoc.data();

        const userRef = depDoc.ref.parent.parent;
        if (!userRef) continue;

        const uid = userRef.id;
        const valor = Number(dep.valor || 0);

        if (!uid || valor <= 0) continue;

        const saldoRef = db.collection('UsuariosPrivado').doc(uid);

        await db.runTransaction(async (tx) => {
          const saldoSnap = await tx.get(saldoRef);
          const saldoAtual = saldoSnap.exists
            ? saldoSnap.data().saldo || 0
            : 0;

          tx.set(
            saldoRef,
            {
              saldo: saldoAtual + valor,
              atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          tx.update(depDoc.ref, {
            status: 'confirmado',
            confirmadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });

          tx.set(
            saldoRef.collection('HistoricoFinanceiro').doc(),
            {
              tipo: 'deposito',
              valor,
              origem: 'pix',
              criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            }
          );
        });

        console.log(`💰 Depósito confirmado | UID: ${uid} | Valor: ${valor}`);
      }

      return null;
    } catch (err) {
      console.error('❌ Erro verificarDepositosPendentes:', err);
      return null;
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
    calcularScoreIndicaca
  ================================ */
async function calcularScoreIndicacao({ indicadorUid, indicadoUid, ip, deviceId }) {
  let score = 0;

  // ⚠️ Mesmo IP
  if (await mesmoIP(indicadorUid, indicadoUid, ip)) score += 30;

  // ⚠️ Mesmo device
  if (await mesmoDevice(indicadorUid, indicadoUid, deviceId)) score += 40;

  // ⚠️ Muitas indicações recentes
  if (await excessoIndicacoes(indicadorUid)) score += 20;

  // ⚠️ Conta nova
  if (await contaNova(indicadorUid)) score += 10;

  return score;
   }
  
// ==============================
// Função interna: cria ou atualiza ConfigLGPD
// ==============================
async function criarOuAtualizarConfigLGPD() {
  const ref = db.collection("ConfigLGPD").doc("ATUAL");
  const snap = await ref.get();
  const agora = admin.firestore.FieldValue.serverTimestamp();

  if (!snap.exists) {
    await ref.set({
      versao: String(VERSAO_ATUAL),
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    });

    return { versao: String(VERSAO_ATUAL) };
  }

  const dados = snap.data();

  if (String(dados.versao) !== String(VERSAO_ATUAL)) {
    await ref.update({
      versao: String(VERSAO_ATUAL),
      atualizadoEm: agora,
    });

    return { versao: String(VERSAO_ATUAL) };
  }

  return { versao: String(dados.versao) };
}
// ==============================
// 🔐 inicializarConfigLGPD
// ==============================
exports.inicializarConfigLGPD = functions
  .region("southamerica-east1")
  .https.onCall(async () => {
    try {
      return await criarOuAtualizarConfigLGPD();
    } catch (err) {
      console.error("❌ inicializarConfigLGPD:", err);
      throw new functions.https.HttpsError(
        "internal",
        "Erro ao inicializar ConfigLGPD"
      );
    }
  });
// ==============================
// 🔐 GARANTIA AUTOMÁTICA NO DEPLOY
// ==============================
exports.garantirConfigLGPD = functions
  .region("southamerica-east1")
  .runWith({ timeoutSeconds: 60 })
  .pubsub.schedule("every 24 hours")
  .onRun(async () => {
    try {
      const r = await criarOuAtualizarConfigLGPD();
      console.log("🛡️ garantirConfigLGPD:", r.status);
    } catch (err) {
      console.error("❌ garantirConfigLGPD:", err);
    }
  });
  // ==============================
// 👤 AO CRIAR USUÁRIO → GARANTE LGPD
// ==============================
exports.onUserCreateGarantirLGPD = functions
  .region("southamerica-east1")
  .auth.user()
  .onCreate(async () => {
    try {
      const r = await criarOuAtualizarConfigLGPD();
      console.log("👤 LGPD onCreate:", r.status);
    } catch (err) {
      console.error("❌ LGPD onCreate:", err);
    }
  });
/* ===============================
   registrarAceiteLgpd (OFICIAL)
================================ */
exports.registrarAceiteLgpd = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuário não autenticado"
      );
    }

    try {
      const uid = context.auth.uid;
      const agora = admin.firestore.FieldValue.serverTimestamp();

      // ==============================
      // Lê Configuração LGPD
      // ==============================
      const configRef = db.collection("ConfigLGPD").doc("ATUAL");
      const configSnap = await configRef.get();

      if (!configSnap.exists) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Configuração LGPD não encontrada."
        );
      }

      const config = configSnap.data();

      if (!config?.ativo) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Termo LGPD desativado"
        );
      }

      const versao = String(config.versao || "1.0");
      const origem = String(data?.origem || "desconhecida");
      const device = String(data?.device || "unknown");

      // ==============================
      // IP e User-Agent
      // ==============================
      const ip =
        context.rawRequest?.headers["x-forwarded-for"] ||
        context.rawRequest?.ip ||
        "0.0.0.0";

      const userAgent =
        context.rawRequest?.headers["user-agent"] || "unknown";

      // ==============================
      // Referência do usuário privado
      // ==============================
      const userRef = db.doc(`UsuariosPrivado/${uid}`);
      const userSnap = await userRef.get();

      const email = userSnap.exists
        ? userSnap.data()?.email || "desconhecido"
        : "desconhecido";

      // ⛔ Já aceitou a mesma versão
      if (
        userSnap.exists &&
        userSnap.data()?.consentimentoLGPD?.aceito === true &&
        userSnap.data()?.consentimentoLGPD?.versao === versao
      ) {
        return { status: "already_accepted" };
      }

      // ==============================
      // Hash de auditoria
      // ==============================
      const hash = crypto
        .createHash("sha256")
        .update(
          `${uid}|${email}|${versao}|${origem}|${device}|${Date.now()}`
        )
        .digest("hex");

      // ==============================
      // Auditoria LGPD
      // ==============================
      await db.collection("AuditoriaLGPD").add({
        uid,
        email,
        versao,
        origem,
        device,
        ip,
        userAgent,
        aceitoEm: agora,
        hash,
      });

      // ==============================
      // Atualiza consentimento
      // ==============================
      await userRef.set(
        {
          consentimentoLGPD: {
            aceito: true,
            versao,
            origem,
            device,
            aceitoEm: agora,
          },
        },
        { merge: true }
      );

      return { status: "ok" };
    } catch (err) {
      console.error("❌ registrarAceiteLgpd:", err);

      throw new functions.https.HttpsError(
        "internal",
        "Erro ao registrar aceite LGPD"
      );
    }
  });


 /* ===============================
   gerarPdfLegal (LGPD)
================================ */
exports.gerarPdfLegal = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuário não autenticado"
      );
    }

    const uid = context.auth.uid;

    /* ===============================
       BUSCA USUÁRIO
    ================================ */
    const userRef = db.collection("UsuariosPrivado").doc(uid);
const userSnap = await userRef.get();

if (!userSnap.exists || userSnap.data()?.lgpd?.aceito !== true) {
  throw new functions.https.HttpsError(
    "failed-precondition",
    "LGPD não aceita"
  );
}

const lgpd = userSnap.data().lgpd;
const versaoTermo = lgpd.versao || "1.0";

    /* ===============================
       PREPARAÇÃO PDF
    ================================ */
    const pdfDoc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = new PassThrough();
    pdfDoc.pipe(stream);

    /* ===============================
       CABEÇALHO
    ================================ */
    pdfDoc
      .fontSize(18)
      .text("TERMO DE CONSENTIMENTO LGPD", { align: "center" })
      .moveDown(1);

    pdfDoc
      .fontSize(11)
      .text(`Versão do termo: ${versaoTermo}`, { align: "center" })
      .moveDown(2);

    pdfDoc
      .fontSize(12)
      .text(
        "Este documento comprova o consentimento expresso do titular para o tratamento de dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).",
        { align: "justify" }
      )
      .moveDown(2);

    /* ===============================
       DADOS DO TITULAR
    ================================ */
    pdfDoc.fontSize(12);
    pdfDoc.text(`Nome: ${user.nome || "Não informado"}`);
    pdfDoc.text(`Email: ${user.email || "Não informado"}`);
    pdfDoc.text(`UID: ${uid}`);

    const aceiteEm = user.consentimentoLGPD.aceitoEm?.toDate
      ? user.consentimentoLGPD.aceitoEm.toDate().toLocaleString("pt-BR")
      : "Data indisponível";

    pdfDoc.text(`Data do aceite: ${aceiteEm}`);
    pdfDoc.text(`Endereço IP: ${user.consentimentoLGPD.ip || "Não informado"}`);
    pdfDoc.text(
      `Dispositivo: ${user.consentimentoLGPD.device || "Não informado"}`
    );

    pdfDoc.moveDown(2);

    /* ===============================
       TEXTO LEGAL
    ================================ */
    pdfDoc.fontSize(11).text(
      `
O titular declara ciência e concordância com a coleta, armazenamento,
tratamento e eventual compartilhamento de seus dados pessoais, estritamente
para fins operacionais, de segurança, antifraude, financeiros e cumprimento
de obrigações legais e regulatórias.

Os dados não serão comercializados, nem utilizados para finalidades diversas
das aqui descritas, exceto quando exigido por autoridade legal competente.

Este consentimento poderá ser revogado a qualquer momento, respeitadas as
obrigações legais aplicáveis.
      `,
      { align: "justify" }
    );

    pdfDoc.moveDown(3);

    /* ===============================
       ASSINATURA DIGITAL
    ================================ */
    const assinaturaDigital = `${uid.substring(0, 8)}-${Date.now()}`;

    pdfDoc.fontSize(11).text(`Assinatura digital: ${assinaturaDigital}`);
    pdfDoc.moveDown(1);

    pdfDoc.text(
      "Documento gerado automaticamente pelo sistema, com validade jurídica.",
      { align: "center" }
    );

    pdfDoc.end();

    /* ===============================
       COLETA PDF + HASH
    ================================ */
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));

    return new Promise((resolve, reject) => {
      stream.on("end", async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);

          const hash = crypto
            .createHash("sha256")
            .update(pdfBuffer)
            .digest("hex");

          /* ===============================
             SALVAR NO STORAGE
          ================================ */
          const bucket = admin.storage().bucket();
          const filePath = `lgpd/${uid}/termo-v${versaoTermo}-${Date.now()}.pdf`;

          await bucket.file(filePath).save(pdfBuffer, {
            contentType: "application/pdf",
            metadata: {
              metadata: {
                uid,
                versao: versaoTermo,
                hash,
              },
            },
          });

          /* ===============================
             REGISTRO HISTÓRICO
          ================================ */
          await db.collection("HistoricoLGPD").add({
            uid,
            versao: versaoTermo,
            hashPdf: hash,
            storagePath: filePath,
            ip: user.consentimentoLGPD.ip || null,
            device: user.consentimentoLGPD.device || null,
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });

          resolve({
            base64: pdfBuffer.toString("base64"), // mantém compatibilidade
            hash,
            versao: versaoTermo,
            nomeArquivo: `termo-lgpd-${uid}.pdf`,
            mimeType: "application/pdf",
          });
        } catch (err) {
          console.error("Erro PDF LGPD:", err);
          reject(
            new functions.https.HttpsError(
              "internal",
              "Erro ao gerar documento LGPD"
            )
          );
        }
      });

      stream.on("error", (err) => {
        console.error("Stream PDF:", err);
        reject(
          new functions.https.HttpsError(
            "internal",
            "Erro no stream do PDF"
          )
        );
      });
    });
  });
