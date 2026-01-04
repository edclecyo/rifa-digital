import {
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

import { getFunctions, httpsCallable } from 'firebase/functions';

import { db, app } from './firebase';

/**
 * 🔹 Comprar cartela (Cloud Function)
 */
export async function comprarCartela(cartelaId) {
  const functions = getFunctions(app);
  const comprarCartelaFn = httpsCallable(functions, 'comprarCartela');

  return await comprarCartelaFn({ cartelaId });
}

/**
 * 🔹 Escutar cartelas do usuário
 */
export function escutarCartelas(uid, callback) {
  const q = query(
    collection(db, 'Cartelas'),
    where('userId', '==', uid)
  );

  return onSnapshot(
    q,
    (snap) => {
      const lista = snap.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((c) => c.criadoEm)
        .sort((a, b) => {
          const aTime =
            a.vendidaEm?.toMillis?.() || a.criadoEm.toMillis();
          const bTime =
            b.vendidaEm?.toMillis?.() || b.criadoEm.toMillis();
          return bTime - aTime;
        });

      callback(lista);
    },
    (error) => {
      console.error('❌ Erro escutarCartelas:', error);
    }
  );
}
