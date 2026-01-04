// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.sendPushNotification = functions.firestore
  .document("Usuarios/{uid}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const uid = context.params.uid;

    const expoPushToken = after.expoPushToken;
    if (!expoPushToken) return null;

    let message = null;

    if (after.ultimaCompraConfirmada && after.ultimaCompraConfirmada !== before.ultimaCompraConfirmada) {
      message = {
        to: expoPushToken,
        sound: "default",
        title: "Compra Confirmada",
        body: after.ultimaCompraConfirmada,
      };
    }

    if (after.rankingAtualizado && after.rankingAtualizado !== before.rankingAtualizado) {
      message = {
        to: expoPushToken,
        sound: "default",
        title: "🏆 Ranking Atualizado",
        body: after.rankingAtualizado,
      };
    }

    if (message) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });
    }

    return null;
  });
