const admin = require('firebase-admin');

admin.initializeApp();

async function setAdmin(uid) {
  await admin.auth().setCustomUserClaims(uid, {
    admin: true,
  });

  console.log('✅ Usuário agora é ADMIN');
}

// 🔴 COLE SEU UID AQUI
setAdmin('bS9x7QJ5SONjzjLqNP5w36EFysY2');
