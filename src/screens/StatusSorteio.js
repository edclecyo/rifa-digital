import { View, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export default function StatusSorteio() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'StatusSorteio', 'geral'), // mantém conforme função
      (snap) => {
        if (snap.exists()) setStatus(snap.data());
      }
    );

    return unsub;
  }, []);

  if (!status) return null;

  return (
    <View
      style={{
        backgroundColor: '#e0f2fe',
        padding: 16,
        borderRadius: 16,
        margin: 16,
      }}
    >
      {/* Rodada atual */}
      <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 6 }}>
        🎰 Rodada: {status.rodada || 1}
      </Text>

      {/* Cartelas vendidas */}
      <Text style={{ fontSize: 16, marginBottom: 4 }}>
        🎟️ Vendidas: {status.cartelasVendidas || 0}
      </Text>

      {/* Meta atual processada */}
      <Text style={{ fontSize: 16, marginBottom: 4 }}>
        🎯 Última meta: {status.metaAtual || 0}
      </Text>

      {/* Prêmio atual */}
      <Text style={{ fontSize: 16, marginBottom: 4, fontWeight: 'bold' }}>
        💰 Prêmio atual: R$ {Number(status.premioAtual || 0).toFixed(2)}
      </Text>

      {/* Sorteio liberado */}
      {status.sorteioLiberado && (
        <Text style={{ marginTop: 8, fontWeight: 'bold', color: '#14532d' }}>
          ✅ Sorteio liberado!
        </Text>
      )}
    </View>
  );
}
