import { View, Text, FlatList } from 'react-native';
import { useEffect, useState, useContext } from 'react';
import { db } from '../services/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { AuthContext } from '../contexts/AuthContext';

export default function AdminComprasCartelas() {
  const { isAdmin } = useContext(AuthContext);
  const [compras, setCompras] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;

    const q = query(
      collection(db, 'Compras'),
      orderBy('criadoEm', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const lista = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setCompras(lista);
      },
      (error) => {
        console.log('Erro ao carregar compras:', error.message);
      }
    );

    return unsubscribe;
  }, [isAdmin]);

  if (!isAdmin) return null;

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
        🧾 Compras de Cartelas
      </Text>

      <FlatList
        data={compras}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <Text
            style={{
              color: '#94a3b8',
              textAlign: 'center',
              marginTop: 40,
            }}
          >
            Nenhuma compra registrada
          </Text>
        )}
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: '#020617',
              padding: 16,
              borderRadius: 14,
              marginBottom: 12,
              borderLeftWidth: 4,
              borderLeftColor: '#22c55e',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>
              👤 {item.userNome || item.uid}
            </Text>

            <Text style={{ color: '#cbd5f5', marginTop: 4 }}>
              🎟️ Cartela: {item.cartelaId}
            </Text>

            <Text style={{ color: '#cbd5f5' }}>
              💰 R$ {Number(item.valor || 0).toFixed(2)}
            </Text>

            <Text style={{ color: '#94a3b8', marginTop: 4, fontSize: 12 }}>
              📅 {item.criadoEm?.toDate?.().toLocaleString() || '—'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
