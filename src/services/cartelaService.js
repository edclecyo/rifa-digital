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
  return await addDoc(collection(db, 'Cartelas'), {
    userId: user.uid,       // nome do campo consistente
    numeros,
    vendida: false,
    criadoEm: serverTimestamp(),
    vendidaEm: null,        // garante que o campo existe
    userNome: user.displayName || user.email, // opcional
  });
}

// Escutar cartelas do usuário
export function escutarCartelas(uid, callback) {
  const q = query(
    collection(db, 'Cartelas'),
    where('userId', '==', uid),
    orderBy('vendidaEm','criadoEm', 'desc')   // ordem DESC
  );

  return onSnapshot(q, (snap) => {
    const lista = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(lista);
  });
}
