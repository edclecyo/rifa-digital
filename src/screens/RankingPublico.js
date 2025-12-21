import { View, Text, FlatList } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

const PREMIOS = {
  1: 500,
  2: 300,
  3: 200,
};

export default function RankingPublico() {
  const [ranking, setRanking] = useState([]);

  useEffect(() => {
    carregarRanking();
  }, []);

  async function carregarRanking() {
    const q = query(
      collection(db, 'Cartelas'),
      where('vendida', '==', true)
    );

    const snap = await getDocs(q);

    const mapa = {};

    snap.docs.forEach(doc => {
      const c = doc.data();
      if (!mapa[c.userId]) {
        mapa[c.userId] = {
          userId: c.userId,
          nome: c.userNome || 'Usuário',
          total: 0,
        };
      }
      mapa[c.userId].total += 1;
    });

    const lista = Object.values(mapa)
      .sort((a, b) => b.total - a.total)
      .map((item, index) => ({
        ...item,
        posicao: index + 1,
        premio: PREMIOS[index + 1] || 0,
      }));

    setRanking(lista);
  }

  function medalha(pos) {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `${pos}º`;
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
        🏆 Ranking Geral
      </Text>

      <FlatList
        data={ranking}
        keyExtractor={item => item.userId}
        renderItem={({ item }) => (
          <View
            style={{
              padding: 15,
              borderRadius: 12,
              marginBottom: 12,
              backgroundColor: '#f1f5f9',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
              {medalha(item.posicao)} {item.nome}
            </Text>

            <Text>🎟️ Cartelas: {item.total}</Text>

            {item.premio > 0 && (
              <Text style={{ color: '#16a34a', fontWeight: 'bold' }}>
                💰 Prêmio: R$ {item.premio}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
