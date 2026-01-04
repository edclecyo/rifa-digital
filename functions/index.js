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
   💰 CONFIRMAR COMPRA
================================ */
exports.confirmarCompra = functions.https.onCall(async (data, context) => {
  if (!context.auth)
    throw new functions.https.HttpsError("unauthenticated");

  const uid = context.auth.uid;
  const { cartelas } = data;

  if (!Array.isArray(cartelas) || cartelas.length === 0)
    throw new functions.https.HttpsError("invalid-argument");

  // ✅ BUSCAR NOME DO COMPRADOR
  const userSnap = await db.collection("Usuarios").doc(uid).get();
  const nomeComprador = userSnap.exists
    ? userSnap.data().nome || "Usuário"
    : "Usuário";

  const batch = db.batch();

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
      nomeComprador, // ✅ NOVO CAMPO
      vendidaEm: admin.firestore.FieldValue.serverTimestamp(),
      reservadaPor: null,
      reservaExpiraEm: null,
    });
  }

  await batch.commit();
  return { success: true };
});
