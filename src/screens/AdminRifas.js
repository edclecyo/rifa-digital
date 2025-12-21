import { View, Text, FlatList } from 'react-native';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useEffect, useState } from 'react';

export default function AdminRifas() {
  const [cartelas, setCartelas] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, 'Cartelas'),
      orderBy('criadoEm', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setCartelas(
        snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
      );
    });

    return unsub;
  }, []);

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text
        style={{
          fontSize: 22,
          fontWeight: 'bold',
          marginBottom: 15,
        }}
      >
        📊 Cartelas da Rifa
      </Text>

      <FlatList
        data={cartelas}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View
            style={{
              padding: 15,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#e5e7eb',
              marginBottom: 12,
              backgroundColor: item.vendida ? '#ecfdf5' : '#f9fafb',
            }}
          >
            <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>
              🎟️ Cartela #{item.id}
            </Text>

            <Text style={{ marginBottom: 4 }}>
              🔢 Números: {item.numeros?.join(' - ')}
            </Text>

            <Text style={{ marginBottom: 4 }}>
              💰 Valor: R$ {item.valor?.toFixed(2) || '2.00'}
            </Text>

            <Text
              style={{
                fontWeight: 'bold',
                color: item.vendidaEm ? '#16a34a' : '#dc2626',
                marginBottom: 4,
              }}
            >
              {item.vendidaEm ? '✅ Vendida' : '🟡 Disponível'}
            </Text>

            {item.vendida && (
              <Text style={{ fontSize: 12, color: '#374151' }}>
                👤 Comprador UID: {item.userId}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
