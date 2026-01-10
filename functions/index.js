const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { Parser } = require("json2csv");
const os = require("os");
const path = require("path");
const fs = require("fs");

admin.initializeApp();
const db = admin.firestore();

/* ===============================
   🔧 CONFIGURAÇÕES GERAIS
================================ */
const SUPER_ADMIN_UID = "WttevCDh6haanBH0v98nggOsBm62";
const TOTAL_CARTELAS = 1600;
const NUMEROS_POR_CARTELA = 6;
const LIMITE_BATCH = 500;
const TEMPO_RESERVA_MS = 15 * 1000;

/* ===============================
   🚦 FEATURE FLAGS
================================ */
const CONFIG = {
  SORTEIO_ATIVO: true,
  SAQUE_ATIVO: true,
};

/* ===============================
   💰 VALORES
================================ */
const VALOR_CARTELA = 2.5;
const VALOR_SORTEIO = 2.0;
const VALOR_PLATAFORMA = 0.25;
const VALOR_INDICACAO = 0.25;

/* ===============================
   🎯 METAS
================================ */
const METAS = [
  { cartelas: 100, premio: 100, nivel: "vermelho" },
  { cartelas: 500, premio: 500, nivel: "verde" },
  { cartelas: 1000, premio: 1000, nivel: "dourado" },
];

/* ===============================
   🔐 HASH AUDITORIA
================================ */
function gerarHash(payload, hashAnterior = "") {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload) + hashAnterior)
    .digest("hex");
}

/* ===============================
   👤 CRIAR USUÁRIO
================================ */
exports.criarUsuarioAoRegistrar = functions.auth.user().onCreate(
  async (user) => {
    await db.collection("Usuarios").doc(user.uid).set({
      uid: user.uid,
      email: user.email || null,

      nome: "__PENDENTE__",
      nomeConfirmado: false,

      perfilCompleto: false,
      statusConta: "PENDENTE",

      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      confirmadoEm: null,
    });
  }
);

/* ===============================
   👤 enfileirarValidacaoNome
================================ */
exports.enfileirarValidacaoNome = functions.firestore
  .document("Usuarios/{uid}")
  .onUpdate(async (change, context) => {
    const antes = change.before.data();
    const depois = change.after.data();

    if (depois.nomeConfirmado) return null;
    if (antes.nome === depois.nome) return null;
    if (!depois.nome || depois.nome === "__PENDENTE__") return null;

    // Envia para fila (Cloud Tasks)
    await enqueueNomeTask(context.params.uid);

    return null;
  });
exports.sincronizarNomeUsuario = functions.firestore
  .document("Usuarios/{uid}")
  .onWrite(async (change, context) => {
    const { uid } = context.params;

    // Documento removido
    if (!change.after.exists) return null;

    const antes = change.before.data();
    const depois = change.after.data();

    // 🔒 Já confirmado → nunca mais roda
    if (depois.nomeConfirmado === true) return null;

    // 🔁 Nome não mudou
    if (antes?.nome === depois?.nome) return null;

    // 🚫 Nome inválido
    if (
      !depois?.nome ||
      typeof depois.nome !== "string" ||
      depois.nome === "__PENDENTE__"
    ) {
      return null;
    }

    const nomeLimpo = depois.nome.trim();

    if (nomeLimpo.length < 3) return null;

    // 🔥 Atualiza Auth UMA ÚNICA VEZ
    await admin.auth().updateUser(uid, {
      displayName: nomeLimpo,
    });

    // 🔄 Atualiza Firestore UMA ÚNICA VEZ
    await change.after.ref.update({
      nome: nomeLimpo,
      nomeConfirmado: true,
      perfilCompleto: true,
    });

    return null;
  });
  /* ===============================
   📊 workerValidarNome
================================ */
  exports.workerValidarNome = functions.https.onRequest(
  async (req, res) => {
    const { uid } = req.body;

    const ref = db.collection("Usuarios").doc(uid);
    const snap = await ref.get();

    if (!snap.exists) return res.sendStatus(200);

    const user = snap.data();

    if (user.nomeConfirmado) return res.sendStatus(200);

    const nomeLimpo = user.nome.trim();
    if (nomeLimpo.length < 3) return res.sendStatus(200);

    // 🔒 Atualiza AUTH (autoridade)
    await admin.auth().updateUser(uid, {
      displayName: nomeLimpo,
    });

    // 🔒 Confirma no banco
    await ref.update({
      nome: nomeLimpo,
      nomeConfirmado: true,
      perfilCompleto: true,
      statusConta: "ATIVA",
      confirmadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 🧾 Auditoria
    await db.collection("AuditoriaUsuarios").add({
      uid,
      acao: "CONFIRMOU_NOME",
      nome: nomeLimpo,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.sendStatus(200);
  }
);
/* ===============================
   📊 avaliarKyc
================================ */
exports.avaliarKyc = functions.firestore
  .document("Usuarios/{uid}")
  .onUpdate(async (change) => {
    const antes = change.before.data();
    const depois = change.after.data();

    let novoNivel = 0;
    if (depois.nomeConfirmado) novoNivel = 1;
    if (depois.documentoValidado) novoNivel = 2;
    if (depois.selfieValidada) novoNivel = 3;

    if (novoNivel === antes.kycNivel) return null;

    return change.after.ref.update({
      kycNivel: novoNivel,
      statusConta: novoNivel >= 1 ? "ATIVA" : "PENDENTE",
    });
  });
  /* ===============================
   📊 registrarMovimento
================================ */
  async function registrarMovimento({
  uid,
  tipo,
  valor,
  origem,
  referenciaId,
}) {
  await db.collection("Ledger").add({
    uid,
    tipo,
    valor,
    origem,
    referenciaId,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
}

 /* ===============================
   📊 recalcularSaldo
================================ */
exports.recalcularSaldo = functions.firestore
  .document("Ledger/{id}")
  .onCreate(async (snap) => {
    const { uid, tipo, valor } = snap.data();

    const walletRef = db.collection("Wallets").doc(uid);

    await walletRef.set(
      {
        saldoAtual: admin.firestore.FieldValue.increment(
          tipo === "CREDITO" ? valor : -valor
        ),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  /* ===============================
   📊 antifraudeBasica
================================ */
  exports.antifraudeBasica = functions.firestore
  .document("Ledger/{id}")
  .onCreate(async (snap) => {
    const { uid, valor } = snap.data();

    if (valor > 5000) {
      await db.collection("Usuarios").doc(uid).update({
        statusConta: "LIMITADA",
        riscoScore: admin.firestore.FieldValue.increment(20),
      });
    }
  });
  /* ===============================
   📊 salvarPushToken
================================ */
  exports.salvarPushToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated');
  }

  const { pushToken } = data;
  if (!pushToken || typeof pushToken !== 'string') {
    throw new functions.https.HttpsError('invalid-argument');
  }

  await db.collection('UsuariosPrivado').doc(context.auth.uid).set(
    {
      pushToken,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
});

 /* ===============================
   📊 enfileirarPush
================================ */
exports.enfileirarPush = functions.firestore
  .document('PushQueue/{id}')
  .onCreate(async (snap) => {
    // Cloud Task criada aqui
  });
  
  /* ===============================
   📊 processarPush
================================ */
 exports.processarPush = functions.https.onRequest(async (req, res) => {
  const { uid, titulo, corpo } = req.body;

  const devices = await db
    .collection('UsuariosDevices')
    .doc(uid)
    .collection('lista')
    .where('ativo', '==', true)
    .get();

  for (const doc of devices.docs) {
    // envia push individual
  }

  res.sendStatus(200);
});
/* ===============================
   📊 CRIAR CARTELAS AUTOMATICO
================================ */
exports.criarCartelasAutomatico = functions.https.onCall(
  async (_, context) => {
    if (!context.auth || context.auth.uid !== SUPER_ADMIN_UID) {
      throw new functions.https.HttpsError("permission-denied", "Acesso negado");
    }

    const statusRef = db.collection("StatusSorteio").doc("geral");
    const statusSnap = await statusRef.get();
    const rodadaAtual = statusSnap.exists ? statusSnap.data().rodada || 1 : 1;

    const cartelasRef = db.collection("Cartelas");
    const existentes = await cartelasRef.get();

    if (existentes.size >= TOTAL_CARTELAS)
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Limite de cartelas atingido"
      );

    let batch = db.batch();
    let count = 0;

    for (let i = existentes.size + 1; i <= TOTAL_CARTELAS; i++) {
      const id = `C${i.toString().padStart(4, "0")}`;
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

      count++;
      if (count % LIMITE_BATCH === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }

    await batch.commit();
    return { success: true, rodada: rodadaAtual };
  }
);

/* ===============================
   🔹 ATUALIZA STATUS DO SORTEIO
================================ */
async function atualizarStatusSorteio(qtd) {
  const ref = db.collection("StatusSorteio").doc("geral");

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const atual = snap.exists ? snap.data() : {
      rodada: 1,
      cartelasVendidas: 0,
      ultimaMetaProcessada: 0,
    };

    const cartelasVendidas = atual.cartelasVendidas + qtd;
    let metaAtual = atual.metaAtual || METAS[0].cartelas;
    let premioAtual = atual.premioAtual || METAS[0].premio;
    let nivel = atual.nivel || METAS[0].nivel;
    let sorteioLiberado = false;
    let ultimaMeta = atual.ultimaMetaProcessada;

    for (const meta of METAS) {
      if (cartelasVendidas >= meta.cartelas && ultimaMeta < meta.cartelas) {
        metaAtual = meta.cartelas;
        premioAtual = meta.premio;
        nivel = meta.nivel;
        sorteioLiberado = true;
        ultimaMeta = meta.cartelas;
        break;
      }
    }

    tx.set(ref, {
      rodada: atual.rodada,
      cartelasVendidas,
      metaAtual,
      premioAtual,
      nivel,
      sorteioLiberado,
      ultimaMetaProcessada: ultimaMeta,
      faltamCartelas: TOTAL_CARTELAS - cartelasVendidas,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

/* ===============================
   🎟️ RESERVAR CARTELA
================================ */
exports.reservarCartela = functions.https.onCall(async ({ cartelaId }, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated");
  }

  const ref = db.collection("Cartelas").doc(cartelaId);
  const uid = context.auth.uid;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new functions.https.HttpsError("not-found");

    const c = snap.data();
    const agora = Date.now();

    if (c.status !== "disponivel") {
      throw new functions.https.HttpsError("failed-precondition");
    }

    tx.update(ref, {
      status: "reservada",
      reservadaPor: uid,
      reservaExpiraEm: admin.firestore.Timestamp.fromMillis(
        agora + TEMPO_RESERVA_MS
      ),
    });
  });

  return { success: true };
});

/* ===============================
   ❌ CANCELAR RESERVA
================================ */
exports.cancelarReserva = functions.https.onCall(
  async ({ cartelaId }, context) => {
    if (!context.auth)
      throw new functions.https.HttpsError('unauthenticated');

    const uid = context.auth.uid;
    const ref = db.collection('Cartelas').doc(cartelaId);

    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;

      const c = snap.data();
      if (c.status === 'reservada' && c.reservadaPor === uid) {
        tx.update(ref, {
          status: 'disponivel',
          reservadaPor: null,
          reservaExpiraEm: null,
        });
      }
    });

    return { success: true };
  }
);

/* ===============================
   🧹 LIMPAR RESERVAS
================================ */
exports.limparReservasExpiradas = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    const snap = await db
      .collection('Cartelas')
      .where('status', '==', 'reservada')
      .where(
        'reservaExpiraEm',
        '<=',
        admin.firestore.Timestamp.now()
      )
      .limit(500)
      .get();

    const batch = db.batch();
    snap.docs.forEach(d => {
      batch.update(d.ref, {
        status: 'disponivel',
        reservadaPor: null,
        reservaExpiraEm: null,
      });
    });

    await batch.commit();
  });

/* ===============================
   💰 CONFIRMAR COMPRA
================================ */

exports.confirmarCompra = functions.https.onCall(async ({ cartelas }, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated');
  }

  const uid = context.auth.uid;
  const nomeComprador =
    context.auth.token.name ||
    context.auth.token.email?.split('@')[0] ||
    'Usuário';

  if (!Array.isArray(cartelas) || cartelas.length === 0) {
    throw new functions.https.HttpsError('invalid-argument');
  }

  const cartelasCompradas = await processarCompra({
    uid,
    cartelas,
    nomeComprador,
  });

  if (!cartelasCompradas.length) {
    throw new functions.https.HttpsError('failed-precondition');
  }

  await atualizarRankingUsuario(uid, cartelasCompradas);
  await atualizarStatusSorteio(cartelasCompradas.length);
  await atualizarStatusGlobal({ novasVendas: cartelasCompradas.length });

  return {
    success: true,
    totalCompradas: cartelasCompradas.length,
    nomeComprador,
  };
});

async function processarCompra({ uid, cartelas, nomeComprador }) {
  const agora = admin.firestore.Timestamp.now();
  const historicoRef = db
    .collection('Usuarios')
    .doc(uid)
    .collection('HistoricoCartelas');

  const CHUNK_SIZE = 500;
  const cartelasCompradas = [];

  const chunks = [];
  for (let i = 0; i < cartelas.length; i += CHUNK_SIZE) {
    chunks.push(cartelas.slice(i, i + CHUNK_SIZE));
  }

  const processarBatch = async (chunk) => {
    const batch = db.batch();

    for (const cartelaId of chunk) {
      const ref = db.collection('Cartelas').doc(cartelaId);
      const snap = await ref.get();

      if (!snap.exists) {
        throw new functions.https.HttpsError('not-found');
      }

      const c = snap.data();

      if (
        c.status !== 'reservada' ||
        c.reservadaPor !== uid ||
        (c.reservaExpiraEm && c.reservaExpiraEm.toMillis() < Date.now())
      ) {
        throw new functions.https.HttpsError('failed-precondition');
      }

      batch.update(ref, {
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
  };

  for (let i = 0; i < chunks.length; i += 5) {
    await Promise.all(chunks.slice(i, i + 5).map(processarBatch));
  }

  return cartelasCompradas;
}


/* ===============================
   🎯 ATUALIZA RANKING EM TEMPO REAL
================================ */
async function atualizarRankingUsuario(uid, cartelasCompradas) {
  if (!uid || !Array.isArray(cartelasCompradas) || cartelasCompradas.length === 0) {
    return;
  }

  const quantidade = cartelasCompradas.length;
  const total = cartelasCompradas.reduce((sum, c) => sum + (c.valor || VALOR_CARTELA), 0);

  const userSnap = await db.collection("Usuarios").doc(uid).get();
  const nomeUsuario = userSnap.exists ? userSnap.data().nome || "Usuário" : "Usuário";

  const rankingRef = db.collection("RankingCompradores").doc(uid);

  await rankingRef.set(
    {
      userId: uid,
      nome: nomeUsuario,
      quantidade: admin.firestore.FieldValue.increment(quantidade),
      total: admin.firestore.FieldValue.increment(total),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`Ranking atualizado para ${nomeUsuario}: +${quantidade} cartelas, R$ ${total.toFixed(2)}`);
}

/* ===============================
   🌍 STATUS GLOBAL (DASHBOARD)
================================ */
async function atualizarStatusGlobal({ novasVendas = 0 }) {
  const ref = db.collection("StatusGlobal").doc("geral");

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    const atual = snap.exists
      ? snap.data()
      : {
          totalCartelas: TOTAL_CARTELAS,
          cartelasVendidas: 0,
          faturamento: 0,
          usuarios: 0,
          cartelasReservadas: 0,
        };

    const cartelasVendidas = (atual.cartelasVendidas || 0) + novasVendas;
    const faturamento = cartelasVendidas * VALOR_CARTELA;

    tx.set(
      ref,
      {
        totalCartelas: TOTAL_CARTELAS,
        cartelasVendidas,
        faturamento,
        usuarios: atual.usuarios,
        cartelasReservadas: atual.cartelasReservadas || 0,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/* ===============================
   🌍 criarCheckout
================================ */
exports.criarCheckout = functions.https.onCall(
  async ({ cartelas }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated');
    }

    const uid = context.auth.uid;

    const pedidoRef = await db.collection('Pedidos').add({
      uid,
      cartelas,
      status: 'pendente',
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      pedidoId: pedidoRef.id,
    };
  }
);
/* ===============================
   🌍 confirmarPagamento
================================ */
exports.confirmarPagamento = functions.https.onCall(async ({ pedidoId }, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied');
  }

  const pedidoRef = db.collection('Pedidos').doc(pedidoId);
  const pedidoSnap = await pedidoRef.get();

  if (!pedidoSnap.exists) {
    throw new functions.https.HttpsError('not-found');
  }

  const pedido = pedidoSnap.data();
  if (pedido.status !== 'pendente') {
    throw new functions.https.HttpsError('failed-precondition');
  }

  const nomeComprador = 'Pagamento Manual';

  const cartelasCompradas = await processarCompra({
    uid: pedido.uid,
    cartelas: pedido.cartelas,
    nomeComprador,
  });

  await pedidoRef.update({
    status: 'pago',
    pagoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, total: cartelasCompradas.length };
});
/* ===============================
   🌍 registrarDevice
================================ */
exports.registrarDevice = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated');
  }

  const uid = context.auth.uid;
  const { deviceId, pushToken, platform } = data;

  if (!deviceId || !platform) {
    throw new functions.https.HttpsError('invalid-argument');
  }

  const devicesRef = db.collection('UsuariosDevices').doc(uid);
  const snap = await devicesRef.collection('lista').get();

  if (snap.size >= 3) {
    throw new functions.https.HttpsError('permission-denied');
  }

  await devicesRef.collection('lista').doc(deviceId).set({
    deviceId,
    platform,
    expoPushToken: pushToken || null,
    ativo: true,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    ultimoAcesso: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
});
/*=============================
   🌍 bloquearConta
================================ */
exports.bloquearConta = functions.https.onCall(async (data, context) => {
  if (!context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied');
  }

  const { uid, motivo } = data;

  await db.collection('UsuariosFlags').doc(uid).set({
    contaBloqueada: true,
    motivo,
    bloqueadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
});
/* ===============================
   🔐 registrarLogin (CORRETO)
================================ */
exports.registrarLogin = functions
  .region('southamerica-east1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }

    const uid = context.auth.uid;

    // 🔄 Normalização de payload
    const deviceId = data?.deviceId || null;
    const platform = data?.platform || data?.plataforma || null;
    const origem = data?.origem || null;

    // 🧾 AUDITORIA (imutável)
    await db.collection('AuditoriaLogin').add({
      uid,
      deviceId,
      platform,
      origem,
      ip: context.rawRequest?.ip || null,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 📌 FLAGS OPERACIONAIS
    await db.collection('UsuariosFlags').doc(uid).set(
      {
        ultimoLogin: admin.firestore.FieldValue.serverTimestamp(),
        ultimoDevice: deviceId,
        plataforma: platform,
        origemUltimoLogin: origem,
      },
      { merge: true }
    );

    return { ok: true };
  });