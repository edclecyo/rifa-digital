import { View, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

export default function Dashboard() {
  const [data, setData] = useState({
    faturamento: 0,
    totalUsuarios: 0,
    cartelasVendidas: 0,
    riscoMedio: 0,
  });

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'dashboard_publico', 'resumo'),
      (snap) => {
        if (snap.exists()) setData(snap.data());
      }
    );
    return unsub;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#020617', padding: 20 }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>
        📊 Visão Geral
      </Text>

      <Text style={{ color: '#22c55e', marginTop: 16 }}>
        💰 Faturamento: R$ {data.faturamento.toFixed(2)}
      </Text>

      <Text style={{ color: '#38bdf8' }}>
        👥 Usuários: {data.totalUsuarios}
      </Text>

      <Text style={{ color: '#facc15' }}>
        🎟️ Cartelas vendidas: {data.cartelasVendidas}
      </Text>

      <Text style={{ color: '#fb7185' }}>
        🧠 Risco médio: {data.riscoMedio}/100
      </Text>
    </View>
  );
}
