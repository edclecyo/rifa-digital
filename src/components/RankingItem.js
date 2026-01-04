import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

export default function RankingItem({ item, isMe }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.1, { duration: 300 }),
      withTiming(1, { duration: 300 })
    );
  }, [item.posicao]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isTop3 = item.posicao <= 3;
  const isLeader = item.posicao === 1;

  const backgroundColor = isLeader
    ? '#facc15'
    : isTop3
    ? '#fde68a'
    : '#0f172a';

  const borderColor = isMe ? '#22c55e' : '#334155';

  function medalha(pos) {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `#${pos}`;
  }

  return (
    <Animated.View
      style={[
        {
          padding: 14,
          borderRadius: 12,
          marginBottom: 10,
          backgroundColor,
          borderWidth: 2,
          borderColor,
        },
        animatedStyle,
      ]}
    >
      <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#020617' }}>
  {medalha(item.posicao)} {item.userNome}
  {isMe && ' (Você)'}
</Text>

      <Text>🎟️ Cartelas: {item.quantidade}</Text>
      <Text>💰 Total: R$ {item.valorTotal?.toFixed(2)}</Text>

      {isLeader && (
        <Text style={{ marginTop: 4, fontWeight: 'bold' }}>
          👑 LÍDER DO RANKING
        </Text>
      )}
    </Animated.View>
  );
}
