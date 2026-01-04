import { View, Text, FlatList } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';

export default function RankingCompradores() {
  const [ranking, setRanking] = useState([]);

  useEffect(() => {
    // 🔥 Ranking agregado (Cloud Function)
    // ⚠️ orderBy precisa de índice (quantidade desc, total desc)
    const q = query(
      collection(db, 'RankingCompradores'),
      orderBy('quantidade', 'desc'),
      orderBy('total', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const lista = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setRanking(lista);
      },
      (error) => {
        console.log('❌ Erro ao carregar ranking:', error);
      }
    );

    return unsubscribe;
  }, []);

  function medalha(index) {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
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
        🏆 Ranking de Compradores
      </Text>

      <FlatList
        data={ranking}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={() => (
          <Text
            style={{
              color: '#94a3b8',
              textAlign: 'center',
              marginTop: 40,
            }}
          >
            Nenhum ranking disponível ainda
          </Text>
        )}
        renderItem={({ item, index }) => (
          <View
            style={{
              backgroundColor: '#1e293b',
              padding: 16,
              borderRadius: 14,
              marginBottom: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View>
              <Text
                style={{
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 'bold',
                }}
              >
                {medalha(index)} {item.nome || 'Usuário'}
              </Text>

              <Text style={{ color: '#cbd5f5', marginTop: 4 }}>
                🎟️ {item.quantidade || 0} cartelas
              </Text>
            </View>

            <Text
              style={{
                color: '#16a34a',
                fontSize: 18,
                fontWeight: 'bold',
              }}
            >
              R$ {Number(item.total || 0).toFixed(2)}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
