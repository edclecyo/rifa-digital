import { View, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

export default function Dashboard() {
  const [data, setData] = useState({});

  useEffect(() => {
    return onSnapshot(doc(db, 'dashboard', 'resumo'), snap => {
      setData(snap.data());
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#020617', padding: 20 }}>
      <Text style={{ color: '#fff', fontSize: 22 }}>📊 Dashboard</Text>

      <Text style={{ color: '#22c55e', marginTop: 15 }}>
        💰 Faturamento: R$ {data?.faturamento || 0}
      </Text>

      <Text style={{ color: '#38bdf8' }}>
        👥 Usuários: {data?.totalUsuarios || 0}
      </Text>

      <Text style={{ color: '#facc15' }}>
        🎟️ Cartelas: {data?.cartelasVendidas || 0}
      </Text>
    </View>
  );
}
