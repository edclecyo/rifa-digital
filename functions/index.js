const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/* ===============================
   🔧 CONFIGURAÇÕES
================================ */
const SUPER_ADMIN_UID = "WttevCDh6haanBH0v98nggOsBm62";
const TOTAL_CARTELAS = 1600;
const NUMEROS_POR_CARTELA = 6;
const LIMITE_BATCH = 500;
const TEMPO_RESERVA_MS = 15 * 1000;

/* ===============================
   🔐 DEFINIR ADMIN
================================ */
exports.definirAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth)
    throw new functions.https.HttpsError("unauthenticated");

  if (context.auth.uid !== SUPER_ADMIN_UID)
    throw new functions.https.HttpsError("permission-denied");

  const { uid } = data;
  if (!uid)
    throw new functions.https.HttpsError("invalid-argument");

  await admin.auth().setCustomUserClaims(uid, { admin: true });

  await db.collection("Usuarios").doc(uid).set(
    {
      tipo: "admin",
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { success: true };
});

/* ===============================
   👤 CRIAR USUÁRIO
================================ */
exports.criarUsuarioAoRegistrar = functions.auth.user().onCreate(async user => {
  await db.collection("Usuarios").doc(user.uid).set({
    uid: user.uid,
    email: user.email || null,
    nome: user.displayName || "Usuário",
    tipo: "user",
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
});

/* ===============================
   🎯 GERAR NÚMEROS
================================ */
function gerarNumeros() {
  const set = new Set();
  while (set.size < NUMEROS_POR_CARTELA) {
    set.add(Math.floor(Math.random() * 60) + 1);
  }
  return Array.from(set).sort((a, b) => a - b);
}

/* ===============================
   🎟️ CRIAR CARTELAS
================================ */
exports.criarCartelasAutomatico = functions.https.onCall(async (_, context) => {
  if (!context.auth || !context.auth.token.admin)
    throw new functions.https.HttpsError("permission-denied");

  const rodadaRef = db.collection("Rodadas").doc("atual");
  const rodadaSnap = await rodadaRef.get();
  const rodada = rodadaSnap.exists ? rodadaSnap.data().numero + 1 : 1;

  let batch = db.batch();
  let count = 0;

  for (let i = 0; i < TOTAL_CARTELAS; i++) {
    const codigo = i.toString().padStart(6, "0");
    const ref = db.collection("Cartelas").doc(`${rodada}_${codigo}`);

    batch.set(ref, {
      rodada,
      codigo,
      numeros: gerarNumeros(),
      status: "disponivel",
      fila: [],
      reservadaPor: null,
      reservaExpiraEm: null,
      userId: null,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    count++;
    if (count === LIMITE_BATCH) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) await batch.commit();
  await rodadaRef.set({ numero: rodada }, { merge: true });

  return {
    success: true,
    criadas: TOTAL_CARTELAS,
    total: TOTAL_CARTELAS,
    rodada
  };
});

/* ===============================
   🧠 ENTRAR NA FILA / RESERVAR
================================ */
exports.reservarCartela = functions.https.onCall(async (data, context) => {
  if (!context.auth)
    throw new functions.https.HttpsError("unauthenticated");

  const uid = context.auth.uid;
  const { cartelaId } = data;

  if (!cartelaId)
    throw new functions.https.HttpsError("invalid-argument");

  const ref = db.collection("Cartelas").doc(cartelaId);

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists)
      throw new functions.https.HttpsError("not-found");

    const c = snap.data();
    const agora = Date.now();

    if (c.status === "vendida")
      throw new functions.https.HttpsError("failed-precondition", "Cartela vendida");

    if (
      c.status === "reservada" &&
      c.reservadaPor !== uid &&
      c.reservaExpiraEm.toMillis() > agora
    ) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Cartela reservada por outro usuário"
      );
    }

    if (c.status === "reservada" && c.reservaExpiraEm.toMillis() <= agora) {
      tx.update(ref, {
        status: "disponivel",
        reservadaPor: null,
        reservaExpiraEm: null,
      });
    }

    tx.update(ref, {
      status: "reservada",
      reservadaPor: uid,
      reservaExpiraEm: admin.firestore.Timestamp.fromMillis(
        agora + TEMPO_RESERVA_MS
      ),
    });
  });

  return { success: true, tempo: TEMPO_RESERVA_MS };
});

exports.limparReservasExpiradas = functions.pubsub
  .schedule("every 1 minutes")
  .onRun(async () => {
    const agora = admin.firestore.Timestamp.now();

    const snap = await db
      .collection("Cartelas")
      .where("status", "==", "reservada")
      .where("reservaExpiraEm", "<=", agora)
      .get();

    const batch = db.batch();

    snap.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: "disponivel",
        reservadaPor: null,
        reservaExpiraEm: null,
      });
    });

    await batch.commit();
    return null;
  });

/* ===============================
   ❌ CANCELAR RESERVA
================================ */
exports.cancelarReserva = functions.https.onCall(async (data, context) => {
  if (!context.auth)
    throw new functions.https.HttpsError("unauthenticated");

  const uid = context.auth.uid;
  const { cartelaId } = data;

  if (!cartelaId)
    throw new functions.https.HttpsError("invalid-argument");

  const ref = db.collection("Cartelas").doc(cartelaId);

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists)
      throw new functions.https.HttpsError("not-found");

    const c = snap.data();

    if (c.status !== "reservada" || c.reservadaPor !== uid) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Reserva não pertence ao usuário"
      );
    }

    tx.update(ref, {
      status: "disponivel",
      reservadaPor: null,
      reservaExpiraEm: null,
    });
  });

  return { success: true };
});
/* ===============================
   📊 ATUALIZAR STATUS DO SORTEIO
================================ */
async function atualizarStatusSorteio(qtdComprada, valorCartela) {
  const statusRef = db.collection("StatusSorteio").doc("geral");
  const rodadaRef = db.collection("Rodadas").doc("atual");

  await db.runTransaction(async (tx) => {
    const statusSnap = await tx.get(statusRef);
    const rodadaSnap = await tx.get(rodadaRef);

    const rodadaAtual = rodadaSnap.exists
      ? rodadaSnap.data().numero
      : 1;

    const data = statusSnap.exists
      ? statusSnap.data()
      : {
          cartelasVendidas: 0,
          arrecadadoTotal: 0,
          rodada: rodadaAtual,
          nivel: "vermelho",
          status: "aberto",
        };

    const cartelasVendidas =
      (data.cartelasVendidas || 0) + qtdComprada;

    const arrecadadoTotal =
      (data.arrecadadoTotal || 0) + qtdComprada * valorCartela;

    // 🎯 METAS
    let metaAtual = 100;
    let premioAtual = 100;
    let nivel = "vermelho";
    let status = "aberto";
    let sorteioLiberado = false;

    if (cartelasVendidas >= 1000) {
      metaAtual = 1000;
      premioAtual = 1000;
      nivel = "dourado";
      status = "fechado";
      sorteioLiberado = true;
    } else if (cartelasVendidas >= 500) {
      metaAtual = 500;
      premioAtual = 500;
      nivel = "verde";
    }

    const faltamCartelas = Math.max(
      metaAtual - cartelasVendidas,
      0
    );

    tx.set(
      statusRef,
      {
        rodada: rodadaAtual,
        cartelasVendidas,
        arrecadadoTotal,
        valorCartela,
        metaAtual,
        premioAtual,
        faltamCartelas,
        nivel,               // 🔥 SEMPRE DEFINIDO
        status,              // 🔥 EVITA undefined
        sorteioLiberado,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}
/* ===============================
   💰 CONFIRMAR COMPRA
================================ */
exports.confirmarCompra = functions.https.onCall(async (data, context) => {
  if (!context.auth)
    throw new functions.https.HttpsError("unauthenticated");

  const uid = context.auth.uid;
  const { cartelas } = data;

  if (!Array.isArray(cartelas) || cartelas.length === 0)
    throw new functions.https.HttpsError("invalid-argument");

  // 🔍 Buscar usuário
  const userSnap = await db.collection("Usuarios").doc(uid).get();
  const nomeComprador = userSnap.exists
    ? userSnap.data().nome || "Usuário"
    : "Usuário";

  const batch = db.batch();
  const agora = admin.firestore.FieldValue.serverTimestamp();

  // 🔢 VALOR DA CARTELA (ajuste se mudar no futuro)
  const VALOR_CARTELA = 2.5;
  const quantidade = cartelas.length;
  const totalCompra = quantidade * VALOR_CARTELA;

  // 🎟️ Atualizar cartelas
  for (const id of cartelas) {
    const ref = db.collection("Cartelas").doc(id);
    const snap = await ref.get();

    if (!snap.exists)
      throw new functions.https.HttpsError("not-found");

    const c = snap.data();

    if (
      c.status !== "reservada" ||
      c.reservadaPor !== uid ||
      c.reservaExpiraEm.toMillis() < Date.now()
    ) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Reserva inválida ou expirada"
      );
    }

    batch.update(ref, {
      status: "vendida",
      userId: uid,
      nomeComprador,
      vendidaEm: agora,
      reservadaPor: null,
      reservaExpiraEm: null,
    });
  }

  // 🏆 ATUALIZAR RANKING
  const rankingRef = db.collection("RankingCompradores").doc(uid);

  batch.set(
    rankingRef,
    {
      userId: uid,
      nome: nomeComprador,
      quantidade: admin.firestore.FieldValue.increment(quantidade),
      total: admin.firestore.FieldValue.increment(totalCompra),
      atualizadoEm: agora,
    },
    { merge: true }
  );

  await batch.commit();

// 📊 ATUALIZA STATUS DO SORTEIO
await atualizarStatusSorteio(quantidade, VALOR_CARTELA);

return {
  success: true,
  quantidade,
  total: totalCompra,
};
});
/* ===============================
   🔄 RESETAR RODADA
================================ */
async function resetarRodada() {
  const rodadaRef = db.collection("Rodadas").doc("atual");
  const statusRef = db.collection("StatusSorteio").doc("geral");

  const rodadaSnap = await rodadaRef.get();
  const novaRodada = rodadaSnap.exists
    ? rodadaSnap.data().numero + 1
    : 1;

  // Atualiza rodada
  await rodadaRef.set({ numero: novaRodada });

  // Reseta status
  await statusRef.set({
    cartelasVendidas: 0,
    arrecadadoTotal: 0,
    valorCartela: 2.5,
    metaAtual: 100,
    premioAtual: 100,
    faltamCartelas: 100,
    sorteioLiberado: false,
    nivel: "vermelho",
    rodada: novaRodada,
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  return novaRodada;
}
/* ===============================
   🎰 EXECUTAR SORTEIO
================================ */
exports.executarSorteio = functions.https.onCall(async (_, context) => {
  if (!context.auth || !context.auth.token.admin)
    throw new functions.https.HttpsError("permission-denied");

  const statusSnap = await db.collection("StatusSorteio").doc("geral").get();
  if (!statusSnap.exists || !statusSnap.data().sorteioLiberado)
    throw new functions.https.HttpsError("failed-precondition", "Sorteio não liberado");

  const rodada = statusSnap.data().rodada;
  const premio = statusSnap.data().premioAtual;

  const cartelasSnap = await db
    .collection("Cartelas")
    .where("rodada", "==", rodada)
    .where("status", "==", "vendida")
    .get();

  if (cartelasSnap.empty)
    throw new functions.https.HttpsError("not-found", "Nenhuma cartela vendida");

  const vencedora =
    cartelasSnap.docs[Math.floor(Math.random() * cartelasSnap.docs.length)];

  const c = vencedora.data();

  await db.collection("Sorteios").doc(`rodada_${rodada}`).set({
    rodada,
    premio,
    cartelaId: vencedora.id,
    numeros: c.numeros,
    userId: c.userId,
    nome: c.nomeComprador,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  await resetarRodada();

  return {
    success: true,
    ganhador: c.nomeComprador,
    premio,
    numeros: c.numeros,
  };
});
exports.fecharRodadaAutomatico = functions.firestore
  .document('Cartelas/{cartelaId}')
  .onWrite(async () => {
    const rodadaSnap = await db.collection('Rodadas').doc('atual').get();
    if (!rodadaSnap.exists) return null;

    const rodadaAtual = rodadaSnap.data().numero;

    const snap = await db
      .collection('Cartelas')
      .where('rodada', '==', rodadaAtual)
      .get();

    const total = snap.size;
    const vendidas = snap.docs.filter(
      d => d.data().status === 'vendida'
    ).length;

    if (vendidas < total) return null;

    // 🔒 FECHA RODADA
    await db.collection('StatusSorteio').doc('geral').set({
      rodada: rodadaAtual,
      status: 'fechado',
      fechadoEm: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // ➕ CRIA NOVA RODADA
    await db.collection('Rodadas').doc('atual').update({
      numero: rodadaAtual + 1,
    });

    return null;
  });
