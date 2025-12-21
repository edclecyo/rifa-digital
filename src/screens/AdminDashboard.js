import { View, Text, ScrollView, Dimensions } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import Svg, { Rect } from 'react-native-svg';

const WIDTH = Dimensions.get('window').width - 40;

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalCartelas: 0,
    vendidas: 0,
    faturamento: 0,
    usuarios: 0,
  });

  useEffect(() => {
    const unsubCartelas = onSnapshot(
      collection(db, 'Cartelas'),
      (snap) => {
        const cartelas = snap.docs.map(d => d.data());
        const vendidas = cartelas.filter(c => c.vendida);

        setStats(prev => ({
          ...prev,
          totalCartelas: cartelas.length,
          vendidas: vendidas.length,
          faturamento: vendidas.reduce(
            (t, c) => t + (c.valor || 2),
            0
          ),
        }));
      }
    );

    const unsubUsuarios = onSnapshot(
      collection(db, 'Usuarios'),
      (snap) => {
        setStats(prev => ({
          ...prev,
          usuarios: snap.size,
        }));
      }
    );

    return () => {
      unsubCartelas();
      unsubUsuarios();
    };
  }, []);

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

  const vendidasPct =
    stats.totalCartelas > 0
      ? (stats.vendidas / stats.totalCartelas) * WIDTH
      : 0;

  const disponiveisPct = WIDTH - vendidasPct;

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
        📊 Dashboard Admin
      </Text>

      {/* CARDS */}
      <Card title="Total de Cartelas" value={stats.totalCartelas} />
      <Card title="Cartelas Vendidas" value={stats.vendidas} />
      <Card
        title="Faturamento (R$)"
        value={stats.faturamento.toFixed(2)}
      />
      <Card title="Usuários Cadastrados" value={stats.usuarios} />

      {/* GRÁFICO */}
      <Text
        style={{
          color: '#fff',
          fontSize: 18,
          fontWeight: 'bold',
          marginVertical: 16,
        }}
      >
        📈 Vendas de Cartelas
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
          Disponíveis: {stats.totalCartelas - stats.vendidas}
        </Text>
      </View>
    </ScrollView>
  );
}
