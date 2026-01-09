import { View, Text, FlatList } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export default function RankingCompradores() {
  const [ranking, setRanking] = useState([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // 🔥 Busca ordenada por quantidade (segura, sem índice composto)
    const q = query(
      collection(db, 'RankingCompradores'),
      orderBy('quantidade', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      snap => {
        if (!mounted.current) return;

        let lista = snap.docs.map(docSnap => {
          const d = docSnap.data() || {};

          return {
            id: docSnap.id,
            nome: d.nome || 'Usuário',
            quantidade: Number(d.quantidade) || 0,
            total: Number(d.total) || 0,
          };
        });

        // 🔥 Segundo critério de ordenação no JS
        lista.sort((a, b) => {
          if (b.quantidade !== a.quantidade) {
            return b.quantidade - a.quantidade;
          }
          return b.total - a.total;
        });

        setRanking(lista);
      },
      error => {
        console.log('❌ Erro ao carregar ranking:', error);
      }
    );

    return () => {
      mounted.current = false;
      unsubscribe();
    };
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
        keyExtractor={item => item.id}
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
                {medalha(index)} {item.nome}
              </Text>

              <Text
                style={{
                  color: '#cbd5f5',
                  marginTop: 4,
                }}
              >
                🎟️ {item.quantidade} cartelas
              </Text>
            </View>

            <Text
              style={{
                color: '#16a34a',
                fontSize: 18,
                fontWeight: 'bold',
              }}
            >
              R$ {item.total.toFixed(2)}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
