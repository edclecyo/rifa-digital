const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * 📊 Auditoria imutável (nível fintech)
 */
async function auditar(evento) {
  const ano = new Date().getFullYear();

  await db
    .collection('Auditoria')
    .doc(String(ano))
    .collection('eventos')
    .add({
      ...evento,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
}

module.exports = { auditar };