import { View, Text, Pressable } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export default function PromoBanner({ onPress, nivelAtual }) {
  const [promo, setPromo] = useState(null);
  const [tempo, setTempo] = useState('');

  const glow = useSharedValue(1);

  // 🔥 Glow / Pulse infinito
  useEffect(() => {
    glow.value = withRepeat(
      withTiming(1.08, { duration: 900 }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glow.value }],
    shadowOpacity: glow.value > 1 ? 0.9 : 0.4,
  }));

  // 🔥 Escuta promo dinâmica
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'Promocoes', 'home'), (snap) => {
      if (snap.exists() && snap.data().ativo) {
        setPromo(snap.data());
      } else {
        setPromo(null);
      }
    });

    return unsub;
  }, []);

  // ⏳ Contador regressivo
  useEffect(() => {
    if (!promo?.encerraEm) return;

    const interval = setInterval(() => {
      const fim = promo.encerraEm.toDate
        ? promo.encerraEm.toDate()
        : new Date(promo.encerraEm);

      const agora = new Date();
      const diff = fim - agora;

      if (diff <= 0) {
        setTempo('Encerrado');
        return;
      }

      const h = Math.floor(diff / 1000 / 60 / 60);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);

      setTempo(`${h}h ${m}m ${s}s`);
    }, 1000);

    return () => clearInterval(interval);
  }, [promo]);

  if (!promo) return null;

  return (
    <Animated.View
      style={[
        {
          backgroundColor: '#020617',
          padding: 20,
          borderRadius: 20,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: '#334155',
          shadowColor: '#facc15',
          shadowRadius: 15,
          elevation: 10,
        },
        animatedStyle,
      ]}
    >
      {/* TÍTULO */}
      <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#facc15' }}>
        {promo.titulo}
      </Text>
{/* NÍVEL ATUAL */}
<View
  style={{
    marginTop: 10,
    backgroundColor:
      nivelAtual === 'vermelho'
        ? 'rgba(220,38,38,0.25)'
        : nivelAtual === 'verde'
        ? 'rgba(34,197,94,0.25)'
        : 'rgba(250,204,21,0.25)',
    padding: 10,
    borderRadius: 12,
  }}
>
  <Text
    style={{
      fontWeight: 'bold',
      color:
        nivelAtual === 'vermelho'
          ? '#fecaca'
          : nivelAtual === 'verde'
          ? '#bbf7d0'
          : '#fde68a',
      textAlign: 'center',
    }}
  >
    🎯 Nível atual do sorteio:{' '}
    {nivelAtual === 'vermelho'
      ? 'VERMELHO — R$100'
      : nivelAtual === 'verde'
      ? 'VERDE — R$500'
      : 'DOURADO — R$1.000'}
  </Text>
</View>
      {/* INFO */}
      <Text style={{ marginTop: 6, fontSize: 15, color: '#e5e7eb' }}>
        🎟️ Cartela: R$ {promo.valorCartela?.toFixed(2)}
      </Text>

      {/* 🔥 NÍVEIS DE PRÊMIO */}
      <View style={{ marginTop: 14 }}>
        {/* DOURADO */}
        <View
          style={{
            backgroundColor: 'rgba(250,204,21,0.15)',
            padding: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: '#fde68a', fontWeight: 'bold' }}>
            🟡 Nível Dourado — R$ 1.000
          </Text>
        </View>
		
		{/* VERDE */}
        <View
          style={{
            backgroundColor: 'rgba(34,197,94,0.15)',
            padding: 12,
            borderRadius: 12,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: '#86efac', fontWeight: 'bold' }}>
            🟢 Nível Verde — R$ 500
          </Text>
        </View>
		
      </View>
		{/* VERMELHO */}
        <View
          style={{
            backgroundColor: 'rgba(220,38,38,0.15)',
            padding: 12,
            borderRadius: 12,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: '#fca5a5', fontWeight: 'bold' }}>
            🔴 Nível Vermelho — R$ 100
          </Text>
        </View>

      {/* TEMPO */}
      <Text style={{ marginTop: 10, fontWeight: 'bold', color: '#38bdf8' }}>
        ⏳ Encerra em: {tempo}
      </Text>

      {/* CTA */}
      <Pressable
        onPress={onPress}
        style={{
          marginTop: 16,
          backgroundColor: '#2563eb',
          padding: 14,
          borderRadius: 14,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
          {promo.cta || 'Comprar agora'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
