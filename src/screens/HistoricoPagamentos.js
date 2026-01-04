import { View, Text, FlatList } from 'react-native';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';

export default function HistoricoPagamentos() {
  const { user } = useContext(AuthContext);
  const [pagamentos, setPagamentos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    // ✅ Query compatível com rules (SEM orderBy)
    const q = query(
      collection(db, 'Pagamentos'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const lista = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
            };
          })
          // ✅ Garante segurança
          .filter((p) => p.criadoEm)
          // ✅ Ordenação FEITA NO JS (evita índice)
          .sort(
            (a, b) =>
              b.criadoEm.toMillis() - a.criadoEm.toMillis()
          );

        setPagamentos(lista);
        setLoading(false);
      },
      (error) => {
        console.log('Erro histórico pagamentos:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ textAlign: 'center' }}>
          Carregando pagamentos...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text
        style={{
          fontSize: 22,
          fontWeight: 'bold',
          marginBottom: 15,
        }}
      >
        💳 Histórico de Pagamentos
      </Text>

      {pagamentos.length === 0 && (
        <Text style={{ textAlign: 'center', marginTop: 40 }}>
          Nenhum pagamento encontrado
        </Text>
      )}

      <FlatList
        data={pagamentos}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: '#f9fafb',
              borderRadius: 10,
              padding: 15,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: '#e5e7eb',
            }}
          >
            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>
              💰 R$ {item.valorTotal?.toFixed(2)}
            </Text>

            <Text>🎟️ Cartelas: {item.quantidade}</Text>
            <Text>💳 Método: {item.metodo}</Text>
            <Text>📌 Status: {item.status}</Text>

            <Text
              style={{
                marginTop: 6,
                color: '#6b7280',
                fontSize: 12,
              }}
            >
              📅{' '}
              {item.criadoEm?.toDate
                ? new Date(
                    item.criadoEm.toDate()
                  ).toLocaleString()
                : ''}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
