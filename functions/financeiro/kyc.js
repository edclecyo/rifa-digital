const functions = require("firebase-functions");

function exigirKycNivel(userPrivado, nivelMinimo) {
  if ((userPrivado.kycNivel || 0) < nivelMinimo) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "KYC insuficiente para esta operação"
    );
  }
}

module.exports = { exigirKycNivel };
