import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// 👇 EXPORT NOMEADO (OBRIGATÓRIO)
export function escutarNumerosComprados(callback) {
  return onSnapshot(collection(db, 'Rifas'), snapshot => {
    const ocupados = snapshot.docs.map(doc => doc.id);
    callback(ocupados);
  });
}

export async function comprarNumero({ numero, user }) {
  const ref = doc(db, 'Rifas', numero);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    throw new Error(`Número ${numero} já comprado`);
  }

  await setDoc(ref, {
    numero,
    uid: user.uid,
    nome: user.email,
    status: 'pendente',
    criadoEm: serverTimestamp(),
  });
}
