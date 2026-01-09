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

// Medals colors
const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']; // ouro, prata, bronze

export default function RankingPublico() {
  const { user } = useContext(AuthContext);

  const [ranking, setRanking] = useState([]);
  const [confetti, setConfetti] = useState(false);
  const [statusSorteio, setStatusSorteio] = useState({
    cartelasVendidas: 0,
    faltamCartelas: 0,
    nivel: 'vermelho',
  });
  const [minhaPosicao, setMinhaPosicao] = useState(null);
  const [meuRanking, setMeuRanking] = useState(null);

  const posicaoAnterior = useRef(null);
  const confeteDisparado = useRef(false);
  const flatListRef = useRef(null); // 🔹 referência para scroll

  /* 🔹 Ranking em tempo real */
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

      const meuItem = lista.find(item => item.userId === user.uid);
      if (!meuItem) return;

      setMinhaPosicao(meuItem.posicao);
      setMeuRanking(meuItem);

      /* 🔔 Subiu no ranking */
      if (posicaoAnterior.current && meuItem.posicao < posicaoAnterior.current) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: '🏆 Ranking',
            body: `Você subiu para ${meuItem.posicao}º lugar!`,
          },
          trigger: null,
        });
      }

      /* 🎉 Virou líder (confete 1x) */
      if (meuItem.posicao === 1 && !confeteDisparado.current) {
        setConfetti(true);
        confeteDisparado.current = true;
      }

      if (meuItem.posicao !== 1) {
        confeteDisparado.current = false;
      }

      posicaoAnterior.current = meuItem.posicao;

      /* 🔹 Scroll automático até o usuário */
      setTimeout(() => {
        if (flatListRef.current && meuItem.posicao > 1) {
          flatListRef.current.scrollToIndex({
            index: meuItem.posicao - 1,
            animated: true,
            viewPosition: 0.5, // centraliza o usuário na tela
          });
        }
      }, 300); // pequeno delay para garantir que o FlatList já tenha atualizado
    });

    return unsub;
  }, [user?.uid]);

  /* 🔹 Status do sorteio em tempo real */
  useEffect(() => {
    const ref = collection(db, 'StatusSorteio');

    const unsub = onSnapshot(ref, snap => {
      snap.docs.forEach(doc => {
        const data = doc.data();
        setStatusSorteio({
          cartelasVendidas: data.cartelasVendidas || 0,
          faltamCartelas: data.faltamCartelas || 0,
          nivel: data.nivel || 'vermelho',
        });
      });
    });

    return unsub;
  }, []);

  function medalha(index) {
    if (index < 3) return `🏅`;
    return `#${index + 1}`;
  }

  function medalhaCor(index) {
    return MEDAL_COLORS[index] || '#fff';
  }

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
          marginBottom: 4,
        }}
      >
        🏆 Ranking Geral
      </Text>

      {/* 🔹 Destaque do usuário logado */}
      {meuRanking && (
        <View
          style={{
            backgroundColor: '#1f2937',
            padding: 16,
            borderRadius: 12,
            marginBottom: 12,
            borderWidth: 2,
            borderColor: '#facc15',
          }}
        >
          <Text
            style={{
              color: '#facc15',
              fontWeight: 'bold',
              fontSize: 16,
              marginBottom: 4,
            }}
          >
            Sua posição: {minhaPosicao}º
          </Text>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
            {meuRanking.userNome}
          </Text>
          <Text style={{ color: '#cbd5f5' }}>
            🎟️ {meuRanking.quantidade} cartelas | 💰 R$ {Number(meuRanking.valorTotal).toFixed(2)}
          </Text>
        </View>
      )}

      {/* 🔹 Status do sorteio */}
      <Text style={{ color: '#94a3b8', marginBottom: 12 }}>
        🎟️ Vendidas: {statusSorteio.cartelasVendidas} | 
        Faltam: {statusSorteio.faltamCartelas} | 
        Nível: {statusSorteio.nivel.toUpperCase()}
      </Text>

      {/* 🔹 Ranking completo */}
      <FlatList
        ref={flatListRef} // 🔹 referência para scroll
        data={ranking}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <View
            style={{
              backgroundColor: item.userId === user?.uid ? '#111827' : '#1e293b',
              padding: 16,
              borderRadius: 14,
              marginBottom: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderWidth: item.userId === user?.uid ? 2 : 0,
              borderColor: item.userId === user?.uid ? '#facc15' : 'transparent',
            }}
          >
            <View>
              <Text
                style={{
                  color: medalhaCor(index),
                  fontSize: 18,
                  fontWeight: 'bold',
                }}
              >
                {medalha(index)} {item.userNome}
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
              R$ {Number(item.valorTotal).toFixed(2)}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
