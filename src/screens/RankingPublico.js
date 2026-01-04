import { View, Text, FlatList } from 'react-native';
import { useEffect, useRef, useState, useContext } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import ConfettiCannon from 'react-native-confetti-cannon';
import RankingItem from '../components/RankingItem';
import { AuthContext } from '../contexts/AuthContext';

export default function RankingPublico() {
  const { user } = useContext(AuthContext);
  const [ranking, setRanking] = useState([]);
  const [confetti, setConfetti] = useState(false);
  const posicaoAnterior = useRef(null);

  useEffect(() => {
    const q = query(
      collection(db, 'RankingCompradores'),
      orderBy('quantidade', 'desc')
    );

    const unsub = onSnapshot(q, async (snap) => {
      const lista = snap.docs.map((doc, index) => ({
        id: doc.id,
        posicao: index + 1,
        userId: doc.data().userId,
        userNome: doc.data().nome || 'Usuário', // ✅ CAMPO CERTO
        quantidade: doc.data().quantidade || 0,
        valorTotal: doc.data().total || 0,     // ✅ CAMPO CERTO
      }));

      setRanking(lista);

      if (!user) return;

      const minhaPosicao = lista.find(
        i => i.userId === user.uid
      )?.posicao;

      if (!minhaPosicao) return;

      // 🔔 Subiu no ranking
      if (
        posicaoAnterior.current &&
        minhaPosicao < posicaoAnterior.current
      ) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🏆 Ranking',
            body: `Você subiu para ${minhaPosicao}º lugar!`,
          },
          trigger: null,
        });

        // 🎉 Virou líder
        if (minhaPosicao === 1) {
          setConfetti(true);
        }
      }

      posicaoAnterior.current = minhaPosicao;
    });

    return unsub;
  }, [user]);

  return (
    <View style={{ flex: 1, backgroundColor: '#020617', padding: 16 }}>
      {confetti && (
        <ConfettiCannon
          count={220}
          origin={{ x: 200, y: 0 }}
          fadeOut
          onAnimationEnd={() => setConfetti(false)}
        />
      )}

      <Text
        style={{
          fontSize: 26,
          fontWeight: 'bold',
          color: '#fff',
          marginBottom: 12,
        }}
      >
        🏆 Ranking Geral
      </Text>

      <FlatList
        data={ranking}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RankingItem
            item={item}
            isMe={item.userId === user?.uid}
          />
        )}
      />
    </View>
  );
}
