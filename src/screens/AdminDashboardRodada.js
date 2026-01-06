import { View, Text, ScrollView, Dimensions } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import Svg, { Rect } from 'react-native-svg';

const WIDTH = Dimensions.get('window').width - 40;
const VALOR_CARTELA = 2.5;

export default function AdminDashboardRodada() {
  const [rodadaAtual, setRodadaAtual] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    vendidas: 0,
    faturamento: 0,
  });

  // 🔄 Rodada atual
  useEffect(() => {
    const unsubRodada = onSnapshot(
      doc(db, 'Rodadas', 'atual'),
      (snap) => {
        if (snap.exists()) {
          setRodadaAtual(snap.data().numero);
        }
      }
    );

    return unsubRodada;
  }, []);

  // 📊 Dados da rodada
  useEffect(() => {
    if (!rodadaAtual) return;

    const unsubCartelas = onSnapshot(
      collection(db, 'Cartelas'),
      (snap) => {
        const cartelas = snap.docs
          .map(d => d.data())
          .filter(c => c.rodada === rodadaAtual);

        const vendidas = cartelas.filter(
          c => c.status === 'vendida'
        );

        setStats({
          total: cartelas.length,
          vendidas: vendidas.length,
          faturamento: vendidas.length * VALOR_CARTELA,
        });
      }
    );

    return unsubCartelas;
  }, [rodadaAtual]);

  const vendidasPct =
    stats.total > 0 ? (stats.vendidas / stats.total) * WIDTH : 0;

  const disponiveisPct = WIDTH - vendidasPct;

  function Card({ title, value }) {
    return (
      <View
        style={{
          backgroundColor: '#1e293b',
          padding: 20,
          borderRadius: 14,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: '#cbd5f5', fontSize: 14 }}>
          {title}
        </Text>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold' }}>
          {value}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0f172a', padding: 20 }}
    >
      <Text
        style={{
          fontSize: 26,
          fontWeight: 'bold',
          color: '#fff',
          marginBottom: 20,
        }}
      >
        🎯 Dashboard por Rodada
      </Text>

      <Card title="Rodada Atual" value={rodadaAtual ?? '—'} />
      <Card title="Total de Cartelas" value={stats.total} />
      <Card title="Cartelas Vendidas" value={stats.vendidas} />
      <Card
        title="Faturamento (R$)"
        value={stats.faturamento.toFixed(2)}
      />

      {/* GRÁFICO */}
      <Text
        style={{
          color: '#fff',
          fontSize: 18,
          fontWeight: 'bold',
          marginVertical: 16,
        }}
      >
        📈 Progresso da Rodada
      </Text>

      <Svg height="40" width={WIDTH}>
        <Rect
          x="0"
          y="0"
          width={vendidasPct}
          height="40"
          fill="#16a34a"
        />
        <Rect
          x={vendidasPct}
          y="0"
          width={disponiveisPct}
          height="40"
          fill="#334155"
        />
      </Svg>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 8,
        }}
      >
        <Text style={{ color: '#16a34a' }}>
          Vendidas: {stats.vendidas}
        </Text>
        <Text style={{ color: '#cbd5f5' }}>
          Disponíveis: {stats.total - stats.vendidas}
        </Text>
      </View>
    </ScrollView>
  );
}
