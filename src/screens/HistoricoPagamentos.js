import { View, Text, FlatList } from 'react-native';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';

export default function HistoricoPagamentos() {
  const { user } = useContext(AuthContext);
  const [pagamentos, setPagamentos] = useState([]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'Pagamentos'),
      where('userId', '==', user.uid),
      orderBy('criadoEm', 'desc')
    );

    const unsub = onSnapshot(q, snap => {
      const lista = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPagamentos(lista);
    });

    return unsub;
  }, [user]);

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 20 }}>
        💳 Histórico de Pagamentos
      </Text>

      <FlatList
        data={pagamentos}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View
            style={{
              padding: 15,
              borderRadius: 12,
              marginBottom: 12,
              backgroundColor: '#f1f5f9',
            }}
          >
            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>
              💰 R$ {item.valorTotal.toFixed(2)}
            </Text>

            <Text>🎟️ Cartelas: {item.quantidade}</Text>
            <Text>💳 Método: {item.metodo}</Text>
            <Text>📌 Status: {item.status}</Text>

            <Text style={{ marginTop: 5, color: '#64748b' }}>
              {item.criadoEm?.toDate().toLocaleString()}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
