import { View, Text, Dimensions, FlatList } from 'react-native';
import { useEffect, useState, useContext } from 'react';
import { db } from '../services/firebase';
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { AuthContext } from '../contexts/AuthContext';
import Svg, { Rect } from 'react-native-svg';

const WIDTH = Dimensions.get('window').width - 40;

export default function AdminDashboard() {
  const { isAdmin } = useContext(AuthContext);

  const [stats, setStats] = useState({
    totalCartelas: 0,
    cartelasVendidas: 0,
    cartelasReservadas: 0,
    cartelasDisponiveis: 0,
    faturamento: 0,
    usuarios: 0,
  });

  const [rankingUsuarios, setRankingUsuarios] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;

    /* ===============================
       🔹 Estatísticas globais
    ================================ */
    const refStats = doc(db, 'StatusGlobal', 'geral');
    const unsubStats = onSnapshot(refStats, (snap) => {
      if (!snap.exists()) return;

      const data = snap.data() || {};
      const total = data.totalCartelas || 0;
      const vendidas = data.cartelasVendidas || 0;
      const reservadas = data.cartelasReservadas || 0;
      const disponiveis = total - vendidas - reservadas;

      setStats({
        totalCartelas: total,
        cartelasVendidas: vendidas,
        cartelasReservadas: reservadas,
        cartelasDisponiveis: disponiveis,
        faturamento: data.faturamento || 0,
        usuarios: data.usuarios || 0,
      });
    });

    /* ===============================
       🔹 Ranking de compradores
    ================================ */
    const qRanking = query(
      collection(db, 'RankingCompradores'),
      orderBy('quantidade', 'desc'),
      limit(10)
    );

    const unsubRanking = onSnapshot(qRanking, (snap) => {
      const ranking = snap.docs.map((d) => ({
        id: d.id,
        nome: d.data().nome || 'Usuário',
        quantidade: d.data().quantidade || 0,
        total: d.data().total || 0,
      }));

      setRankingUsuarios(ranking);
    });

    return () => {
      if (typeof unsubStats === 'function') unsubStats();
      if (typeof unsubRanking === 'function') unsubRanking();
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const vendidasPct =
    stats.totalCartelas > 0
      ? (stats.cartelasVendidas / stats.totalCartelas) * WIDTH
      : 0;

  const reservadasPct =
    stats.totalCartelas > 0
      ? (stats.cartelasReservadas / stats.totalCartelas) * WIDTH
      : 0;

  const disponiveisPct =
    stats.totalCartelas > 0
      ? (stats.cartelasDisponiveis / stats.totalCartelas) * WIDTH
      : 0;

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
        <Text style={{ color: '#cbd5f5', fontSize: 14 }}>{title}</Text>
        <Text
          style={{
            color: '#fff',
            fontSize: 26,
            fontWeight: 'bold',
          }}
        >
          {value}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rankingUsuarios}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          <Text
            style={{
              fontSize: 26,
              fontWeight: 'bold',
              color: '#fff',
              marginBottom: 20,
            }}
          >
            📊 Dashboard Global
          </Text>

          <Card title="Total de Cartelas" value={stats.totalCartelas} />
          <Card title="Cartelas Vendidas" value={stats.cartelasVendidas} />
          <Card title="Cartelas Reservadas" value={stats.cartelasReservadas} />
          <Card title="Cartelas Disponíveis" value={stats.cartelasDisponiveis} />
          <Card
            title="Faturamento (R$)"
            value={Number(stats.faturamento).toFixed(2)}
          />
          <Card title="Usuários Cadastrados" value={stats.usuarios} />

          <Text
            style={{
              color: '#fff',
              fontSize: 18,
              fontWeight: 'bold',
              marginVertical: 16,
            }}
          >
            📈 Progresso de Vendas
          </Text>

          <Svg height="40" width={WIDTH}>
            <Rect x="0" y="0" width={vendidasPct} height="40" fill="#16a34a" />
            <Rect
              x={vendidasPct}
              y="0"
              width={reservadasPct}
              height="40"
              fill="#fde68a"
            />
            <Rect
              x={vendidasPct + reservadasPct}
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
              Vendidas: {stats.cartelasVendidas}
            </Text>
            <Text style={{ color: '#fde68a' }}>
              Reservadas: {stats.cartelasReservadas}
            </Text>
            <Text style={{ color: '#cbd5f5' }}>
              Disponíveis: {stats.cartelasDisponiveis}
            </Text>
          </View>

          <Text
            style={{
              color: '#fff',
              fontSize: 20,
              fontWeight: 'bold',
              marginVertical: 16,
            }}
          >
            🥇 Top Compradores
          </Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <View
          style={{
            padding: 14,
            marginBottom: 8,
            borderRadius: 12,
            backgroundColor: '#1e293b',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>
            {index + 1}º {item.nome}
          </Text>
          <Text style={{ color: '#cbd5f5' }}>
            🎟️ Cartelas: {item.quantidade}
          </Text>
          <Text style={{ color: '#22c55e' }}>
            💰 Total: R$ {Number(item.total).toFixed(2)}
          </Text>
        </View>
      )}
      contentContainerStyle={{
        padding: 20,
        backgroundColor: '#0f172a',
      }}
    />
  );
}
