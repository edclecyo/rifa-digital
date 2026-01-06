import { View, Text, FlatList } from 'react-native';
import { useEffect, useRef, useState, useContext } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import ConfettiCannon from 'react-native-confetti-cannon';
import RankingItem from '../components/RankingItem';
import { AuthContext } from '../contexts/AuthContext';

/* 🔔 Configuração das notificações */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RankingPublico() {
  const { user } = useContext(AuthContext);

  const [ranking, setRanking] = useState([]);
  const [confetti, setConfetti] = useState(false);

  const posicaoAnterior = useRef(null);
  const confeteDisparado = useRef(false);

  useEffect(() => {
    const q = query(
      collection(db, 'RankingCompradores'),
      orderBy('quantidade', 'desc')
    );

    const unsub = onSnapshot(q, snap => {
      const lista = snap.docs.map((doc, index) => ({
        id: doc.id,
        posicao: index + 1,
        userId: doc.data().userId,
        userNome: doc.data().nome || 'Usuário',
        quantidade: doc.data().quantidade || 0,
        valorTotal: doc.data().total || 0,
      }));

      setRanking(lista);

      if (!user?.uid) return;

      const minhaPosicao = lista.find(
        item => item.userId === user.uid
      )?.posicao;

      if (!minhaPosicao) return;

      /* 🔔 Subiu no ranking */
      if (
        posicaoAnterior.current &&
        minhaPosicao < posicaoAnterior.current
      ) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: '🏆 Ranking',
            body: `Você subiu para ${minhaPosicao}º lugar!`,
          },
          trigger: null,
        });
      }

      /* 🎉 Virou líder (confete 1x) */
      if (minhaPosicao === 1 && !confeteDisparado.current) {
        setConfetti(true);
        confeteDisparado.current = true;
      }

      if (minhaPosicao !== 1) {
        confeteDisparado.current = false;
      }

      posicaoAnterior.current = minhaPosicao;
    });

    return unsub;
  }, [user?.uid]);

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
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
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
