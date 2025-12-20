import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';

// Buscar todos os números vendidos
export async function buscarRifas() {
  const q = query(
    collection(db, 'Rifas'),
    orderBy('criadoEm', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

// Marcar número como pago
export async function marcarComoPago(numero) {
  const ref = doc(db, 'Rifas', numero);
  await updateDoc(ref, {
    status: 'pago',
  });
}
