import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useEffect, useState, useRef, useContext } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { AuthContext } from '../contexts/AuthContext';

export default function RankingCompradores() {
  const { user } = useContext(AuthContext);

  const [ranking, setRanking] = useState([]);
  const [rodada, setRodada] = useState(1);
  const [loading, setLoading] = useState(true);

  const mounted = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  /* ================= RODADA ATUAL ================= */
  useEffect(() => {
    const ref = doc(db, 'StatusSorteio', 'geral');

    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setRodada(snap.data().rodada || 1);
    });

    return unsub;
  }, []);

  /* ================= RANKING TEMPO REAL ================= */
  useEffect(() => {
    mounted.current = true;

    const ref = collection(db, 'RankingCompradores');

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!mounted.current) return;

        let lista = snap.docs.map((docSnap) => {
          const d = docSnap.data() || {};

          return {
            id: docSnap.id,
            nome: d.nome || 'Usuário',
            quantidade: Number(d.quantidade) || 0,
            total: Number(d.total) || 0,
            rodada: d.rodada || 1,
          };
        });

        /* 🔥 FILTRA PELA RODADA ATUAL */
        lista = lista.filter((u) => u.rodada === rodada);

        /* 🔥 ORDENAÇÃO SEGURA */
        lista.sort((a, b) => {
          if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
          return b.total - a.total;
        });

        setRanking(lista);
        setLoading(false);

        /* ✨ animação suave */
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();
      },
      (error) => {
        console.log('Erro ranking:', error);
        setLoading(false);
      }
    );

    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [rodada]);

  /* ================= MEDALHAS ================= */
  function medalha(index) {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  }

  /* ================= LOADING ================= */
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#020617',
        }}
      >
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={{ color: '#94a3b8', marginTop: 10 }}>
          Carregando ranking...
        </Text>
      </View>
    );
  }

  /* ================= ITEM ================= */
  const renderItem = ({ item, index }) => {
    const isMe = item.id === user?.uid;
    const isTop3 = index < 3;

    return (
      <Animated.View
        style={{
          opacity: fadeAnim,
          backgroundColor: isMe ? '#065f46' : '#020617',
          padding: 16,
          borderRadius: 18,
          marginBottom: 12,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderWidth: isTop3 ? 2 : 1,
          borderColor: isTop3 ? '#facc15' : '#1e293b',
          shadowColor: isTop3 ? '#facc15' : '#000',
          shadowOpacity: 0.6,
          shadowRadius: 8,
          elevation: isTop3 ? 8 : 2,
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
            {medalha(index)} {item.nome} {isMe && '🔥'}
          </Text>

          <Text style={{ color: '#94a3b8', marginTop: 4 }}>
            🎟️ {item.quantidade} cartelas
          </Text>
        </View>

        <Text
          style={{
            color: '#22c55e',
            fontSize: 18,
            fontWeight: 'bold',
          }}
        >
          R$ {item.total.toFixed(2)}
        </Text>
      </Animated.View>
    );
  };

  /* ================= TELA ================= */
  return (
    <View style={{ flex: 1, backgroundColor: '#020617', padding: 20 }}>
      <Text
        style={{
          fontSize: 28,
          fontWeight: 'bold',
          color: '#fff',
          marginBottom: 6,
        }}
      >
        🏆 Ranking da Rodada {rodada}
      </Text>

      <Text style={{ color: '#94a3b8', marginBottom: 20 }}>
        Os maiores compradores aparecem aqui em tempo real
      </Text>

      <FlatList
        data={ranking}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={() => (
          <Text
            style={{
              color: '#64748b',
              textAlign: 'center',
              marginTop: 40,
            }}
          >
            Nenhum comprador nesta rodada ainda
          </Text>
        )}
      />
    </View>
  );
}
