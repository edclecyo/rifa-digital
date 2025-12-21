import { View, Text, FlatList } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';

export default function AdminPagamentos() {
  const [pagamentos, setPagamentos] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, 'Pagamentos'),
      orderBy('criadoEm', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPagamentos(lista);
    });

    return unsubscribe;
  }, []);

  function statusColor(status) {
    if (status === 'pago') return '#16a34a';
    if (status === 'pendente') return '#facc15';
    return '#dc2626';
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a', padding: 20 }}>
      <Text
        style={{
          fontSize: 26,
          fontWeight: 'bold',
          color: '#fff',
          marginBottom: 20,
        }}
      >
        💳 Pagamentos
      </Text>

      <FlatList
        data={pagamentos}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: '#1e293b',
              padding: 16,
              borderRadius: 14,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>
              👤 {item.userNome || 'Usuário'}
            </Text>

            <Text style={{ color: '#cbd5f5', marginTop: 4 }}>
              💰 R$ {item.valor?.toFixed(2)}
            </Text>

            <Text style={{ color: '#cbd5f5' }}>
              💳 {item.tipo?.toUpperCase()}
            </Text>

            <Text
              style={{
                marginTop: 6,
                fontWeight: 'bold',
                color: statusColor(item.status),
              }}
            >
              {item.status?.toUpperCase()}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
