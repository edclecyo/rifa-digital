import { View, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export default function StatusSorteio() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'StatusSorteio', 'geral'),
      (snap) => {
        if (snap.exists()) {
          setStatus(snap.data());
        }
      }
    );

    return unsub;
  }, []);

  if (!status) return null;

  const cores = {
    vermelho: '#dc2626',
    verde: '#16a34a',
    dourado: '#facc15',
  };

  const corAtual = cores[status.nivel] || '#dc2626';

  return (
    <View
      style={{
        backgroundColor: corAtual,
        padding: 16,
        borderRadius: 16,
        margin: 16,
      }}
    >
      <Text
        style={{
          color: '#020617',
          fontWeight: 'bold',
          fontSize: 18,
        }}
      >
        🎰 Sorteio — Rodada {status.rodada || 1}
      </Text>

      <Text style={{ color: '#020617', marginTop: 6 }}>
        🎟️ Cartelas vendidas: {status.cartelasVendidas || 0}
      </Text>

      <Text style={{ color: '#020617' }}>
        🎯 Meta atual: {status.metaAtual || 0}
      </Text>

      <Text
        style={{
          color: '#020617',
          marginTop: 6,
          fontWeight: 'bold',
        }}
      >
        🔔 Nível: {(status.nivel || 'vermelho').toUpperCase()}
      </Text>

      {status.sorteioLiberado && (
        <Text
          style={{
            marginTop: 8,
            fontWeight: 'bold',
            color: '#14532d',
          }}
        >
          ✅ Sorteio liberado!
        </Text>
      )}
    </View>
  );
}
