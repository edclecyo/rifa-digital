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
      nome: user.displayName || "Usuário",
      tipo: "user",
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 🔥 Atualiza StatusGlobal
    const ref = db.collection("StatusGlobal").doc("geral");
    await ref.set(
      {
        usuarios: admin.firestore.FieldValue.increment(1),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
);

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
/* ===============================
   💰 CONFIRMAR COMPRA (atualizado com dashboard)
================================ */
exports.confirmarCompra = functions.https.onCall(
  async ({ cartelas }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Usuário não autenticado'
      );
    }

    const uid = context.auth.uid;
    const nomeComprador =
      context.auth.token.name ||
      context.auth.token.email?.split('@')[0] ||
      'Usuário';

    if (!Array.isArray(cartelas) || cartelas.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Cartelas inválidas'
      );
    }

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
      const promessas = chunk.map(async (cartelaId) => {
        const ref = db.collection('Cartelas').doc(cartelaId);
        const snap = await ref.get();

        if (!snap.exists) {
          throw new functions.https.HttpsError(
            'not-found',
            `Cartela ${cartelaId} não existe`
          );
        }

        const c = snap.data();

        if (
          c.status !== 'reservada' ||
          c.reservadaPor !== uid ||
          (c.reservaExpiraEm && c.reservaExpiraEm.toMillis() < Date.now())
        ) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Cartela ${cartelaId} indisponível`
          );
        }

        // Atualiza cartela
        batch.update(ref, {
          status: 'vendida',
          vendidaPara: uid,
          vendidaEm: agora,
          nomeComprador,
          reservadaPor: null,
          reservaExpiraEm: null,
        });

        // Histórico do usuário
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
      });

      await Promise.all(promessas);
      await batch.commit();
    };

    for (let i = 0; i < chunks.length; i += 5) {
      const lote = chunks.slice(i, i + 5);
      await Promise.all(lote.map((chunk) => processarBatch(chunk)));
    }

    if (cartelasCompradas.length === 0) {
      throw new functions.https.HttpsError(
        'not-found',
        'Nenhuma cartela válida para comprar'
      );
    }

    // 🔹 Atualiza ranking do usuário
    await atualizarRankingUsuario(uid, cartelasCompradas);

    // 🔹 Atualiza status do sorteio
    await atualizarStatusSorteio(cartelasCompradas.length);

    // 🔹 Atualiza dashboard global
    await atualizarStatusGlobal({ novasVendas: cartelasCompradas.length });

    return {
      success: true,
      totalCompradas: cartelasCompradas.length,
      nomeComprador,
    };
  }
);




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

exports.confirmarPagamento = functions.https.onCall(
  async ({ pedidoId }, context) => {
    if (!context.auth?.token?.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Apenas admin'
      );
    }

    const pedidoRef = db.collection('Pedidos').doc(pedidoId);
    const pedidoSnap = await pedidoRef.get();

    if (!pedidoSnap.exists) {
      throw new functions.https.HttpsError('not-found');
    }

    const pedido = pedidoSnap.data();

    if (pedido.status !== 'pendente') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Pedido já processado'
      );
    }

    await exports.confirmarCompra(
      { cartelas: pedido.cartelas },
      context
    );

    await pedidoRef.update({
      status: 'pago',
      pagoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

async function antiSpam(uid) {
  const ref = db.collection('AntiSpam').doc(uid);
  const snap = await ref.get();
  const agora = Date.now();

  if (snap.exists && snap.data().until > agora) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Aguarde alguns segundos'
    );
  }

  await ref.set({
    until: agora + 3000, // 3 segundos
  });
}
