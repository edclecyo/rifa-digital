import { View, Text, FlatList } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export default function RankingCompradores() {
  const [ranking, setRanking] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'Cartelas'),
      (snap) => {
        const vendidos = snap.docs
          .map(d => d.data())
          .filter(c => c.vendida);

        const mapa = {};

        vendidos.forEach(c => {
          if (!mapa[c.userId]) {
            mapa[c.userId] = {
              userId: c.userId,
              nome: c.userNome || 'Usuário',
              total: 0,
              quantidade: 0,
            };
          }

          mapa[c.userId].quantidade += 1;
          mapa[c.userId].total += c.valor || 2;
        });

        const lista = Object.values(mapa).sort((a, b) => {
          if (b.quantidade === a.quantidade) {
            return b.total - a.total;
          }
          return b.quantidade - a.quantidade;
        });

        setRanking(lista);
      }
    );

    return unsub;
  }, []);

  function Medalha({ index }) {
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
        keyExtractor={(item) => item.userId}
        renderItem={({ item, index }) => (
          <View
            style={{
              backgroundColor: '#1e293b',
              padding: 16,
              borderRadius: 14,
              marginBottom: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View>
              <Text style={{ color: '#fff', fontSize: 18 }}>
                {Medalha({ index })} {item.nome}
              </Text>
              <Text style={{ color: '#cbd5f5', marginTop: 4 }}>
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
