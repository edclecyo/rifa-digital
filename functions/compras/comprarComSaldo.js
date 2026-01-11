const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

exports.comprarComSaldo = functions
  .region("us-central1")
  .runWith({ memory: "1GB", timeoutSeconds: 540 })
  .https.onCall(async (data, context) => {

    /* 🔐 Auth obrigatória */
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuário não autenticado"
      );
    }

    const uid = context.auth.uid;
    const { cartelas, nomeComprador } = data;

    if (!Array.isArray(cartelas) || cartelas.length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Cartelas inválidas"
      );
    }

    /* 👤 Dados privados do usuário */
    const userPrivRef = db.collection("UsuariosPrivados").doc(uid);
    const userPrivSnap = await userPrivRef.get();

    if (!userPrivSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Usuário não encontrado");
    }

    const userPriv = userPrivSnap.data();

    /* 🔎 KYC mínimo (ex: nível 1) */
    if ((userPriv.kycNivel || 0) < 1) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "KYC insuficiente para compra"
      );
    }

    /* 💰 Saldo */
    const valorTotal = cartelas.length * 2.5;

    if ((userPriv.saldo || 0) < valorTotal) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Saldo insuficiente"
      );
    }

    /* 🧾 Compra idempotente */
    const compraRef = db.collection("Compras").doc();
    const compraId = compraRef.id;

    await db.runTransaction(async (tx) => {
      tx.update(userPrivRef, {
        saldo: admin.firestore.FieldValue.increment(-valorTotal),
      });

      tx.set(compraRef, {
        uid,
        cartelas,
        nomeComprador,
        valorTotal,
        tipo: "SALDO",
        status: "PROCESSANDO",
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return {
      success: true,
      compraId,
    };
  });
