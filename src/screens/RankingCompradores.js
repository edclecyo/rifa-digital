import { View, Text, FlatList, ActivityIndicator, Animated, Dimensions } from 'react-native';
import { useEffect, useState, useRef, useContext } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { AuthContext } from '../contexts/AuthContext';
import ConfettiCannon from 'react-native-confetti-cannon';

const { width } = Dimensions.get('window');

export default function RankingCompradores() {
  const { user } = useContext(AuthContext);

  const [ranking, setRanking] = useState([]);
  const [rodada, setRodada] = useState(1);
  const [loading, setLoading] = useState(true);

  const mounted = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const previousPositions = useRef(new Map());

  const [subidaMsg, setSubidaMsg] = useState('');
  const subidaAnim = useRef(new Animated.Value(0)).current;
  const [showConfetti, setShowConfetti] = useState(false);

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
            rodada: d.rodada || 1,
          };
        });

        // FILTRA PELA RODADA ATUAL
        lista = lista.filter((u) => u.rodada === rodada);

        // ORDENAÇÃO ALFABÉTICA (ou métrica futura)
        lista.sort((a, b) => a.nome.localeCompare(b.nome));

        // CHECAR SUBIDA DE POSIÇÃO
        lista.forEach((u, index) => {
          const prevIndex = previousPositions.current.get(u.id);
          if (prevIndex !== undefined && prevIndex > index && u.id === user?.uid) {
            setShowConfetti(true);
            setSubidaMsg(`🔥 Você subiu para ${index + 1}º lugar!`);
            Animated.sequence([
              Animated.timing(subidaAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
              Animated.delay(2500),
              Animated.timing(subidaAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
            ]).start();
          }
          previousPositions.current.set(u.id, index);
        });

        setRanking(lista);
        setLoading(false);

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
  }, [rodada, user?.uid]);

  function medalha(index) {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={{ color: '#94a3b8', marginTop: 10 }}>Carregando ranking...</Text>
      </View>
    );
  }

  const renderItem = ({ item, index }) => {
    const isMe = item.id === user?.uid;
    const isTop3 = index < 3;

    return (
      <Animated.View
        style={{
          opacity: fadeAnim,
          backgroundColor: isMe ? '#065f46' : '#1e293b',
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 16,
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: isTop3 ? 2 : 0,
          borderColor: isTop3 ? '#facc15' : 'transparent',
          shadowColor: '#000',
          shadowOpacity: isTop3 ? 0.5 : 0.2,
          shadowRadius: 6,
          elevation: isTop3 ? 6 : 2,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
          {medalha(index)} {item.nome} {isMe && '🔥'}
        </Text>
      </Animated.View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a', padding: 20 }}>
      {/* ALERTA DE SUBIDA */}
      {subidaMsg.length > 0 && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 20,
            left: width * 0.1,
            right: width * 0.1,
            backgroundColor: '#16a34a',
            padding: 12,
            borderRadius: 14,
            opacity: subidaAnim,
            zIndex: 999,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' }}>
            {subidaMsg}
          </Text>
        </Animated.View>
      )}

      {/* 🎉 CONFETES */}
      {showConfetti && (
        <ConfettiCannon
          count={120}
          origin={{ x: width / 2, y: 0 }}
          fadeOut={true}
          autoStart={true}
          onAnimationEnd={() => setShowConfetti(false)}
        />
      )}

      <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 20 }}>
        🏆 Ranking da Rodada {rodada}
      </Text>

      <FlatList
        data={ranking}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={() => (
          <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>
            Nenhum comprador nesta rodada ainda
          </Text>
        )}
      />
    </View>
  );
}
