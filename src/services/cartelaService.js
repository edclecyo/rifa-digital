import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from './firebase';

// Salvar cartela
export async function salvarCartela({ user, numeros }) {
  return await addDoc(collection(db, 'cartelas'), {
    uid: user.uid,
    numeros,
    criadoEm: serverTimestamp(),
  });
}

// Escutar cartelas do usuário
export function escutarCartelas(uid, callback) {
  const q = query(
    collection(db, 'cartelas'),
    where('uid', '==', uid),
    orderBy('criadoEm', 'desc')
  );

  return onSnapshot(q, snap => {
    const lista = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(lista);
  });
}
