import React, { useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  limit,
  where,
} from 'firebase/firestore';

export default function HistoricoCartelas() {
  const { user } = useContext(AuthContext);

  const [cartelas, setCartelas] = useState([]);
  const [statusSorteio, setStatusSorteio] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    /* ================= CARTELAS DO USUÁRIO ================= */
    const qCartelas = query(
      collection(db, 'Cartelas'),
      where('vendidaPor', '==', user.uid),
      where('status', '==', 'vendida'),
      orderBy('vendidaEm', 'desc')
    );

    const unsubCartelas = onSnapshot(qCartelas, snap => {
      setCartelas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    

    /* ================= RANKING ================= */
    const qRanking = query(
      collection(db, 'RankingCompradores'),
      orderBy('quantidade', 'desc'),
      limit(5)
    );

    const unsubRanking = onSnapshot(qRanking, snap => {
      setRanking(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubCartelas();
      unsubStatus();
      unsubRanking();
    };
  }, [user?.uid]);

  const formatarData = timestamp => {
    if (!timestamp?.toDate) return '—';
    return timestamp.toDate().toLocaleString('pt-BR');
  };

  const corNivel = nivel => {
    if (nivel === 'vermelho') return '#f87171';
    if (nivel === 'verde') return '#34d399';
    if (nivel === 'dourado') return '#facc15';
    return '#d1d5db';
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* STATUS DO SORTEIO */}
      {statusSorteio && (
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            Nível atual:{' '}
            <Text style={{ fontWeight: 'bold', color: corNivel(statusSorteio.nivel) }}>
              {statusSorteio.nivel}
            </Text>
          </Text>

          <Text style={styles.statusText}>
            Cartelas vendidas: {statusSorteio.cartelasVendidas}
          </Text>

          <Text style={styles.statusText}>
            Faltam: {statusSorteio.faltamCartelas}
          </Text>

          <Text style={styles.statusText}>
            Prêmio atual: R$ {Number(statusSorteio.premioAtual || 0).toFixed(2)}
          </Text>
        </View>
      )}

      {/* CARTELAS */}
      <Text style={styles.sectionTitle}>Minhas Cartelas</Text>

      {cartelas.length === 0 ? (
        <Text style={styles.emptyText}>Você ainda não comprou nenhuma cartela</Text>
      ) : (
        <FlatList
          data={cartelas}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={[styles.card, { borderColor: corNivel(statusSorteio?.nivel) }]}>
              <Text style={styles.codigo}>🎟️ {item.codigo}</Text>

              <Text style={{ marginVertical: 4 }}>
                👤 {item.nomeComprador || 'Usuário'}
              </Text>

              <Text>💰 R$ 2,50</Text>

              <Text>Status: {item.status}</Text>

              <Text>🕒 Comprada em: {formatarData(item.vendidaEm)}</Text>
            </View>
          )}
        />
      )}

      {/* RANKING */}
      <Text style={styles.sectionTitle}>Top Compradores</Text>

      {ranking.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum comprador ainda</Text>
      ) : (
        <FlatList
          data={ranking}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => (
            <View style={styles.rankingCard}>
              <Text style={{ fontWeight: 'bold' }}>
                {index + 1}º {item.nome || 'Usuário'}
              </Text>
              <Text>🎟️ {item.quantidade} cartelas</Text>
              <Text>💰 R$ {Number(item.total || 0).toFixed(2)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statusContainer: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
  },

  statusText: { fontSize: 16, marginBottom: 4, color: '#0c4a6e' },

  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginVertical: 12 },

  card: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#f3f4f6',
  },

  codigo: { fontWeight: 'bold', fontSize: 16 },

  emptyText: { textAlign: 'center', marginVertical: 10, color: '#6b7280' },

  rankingCard: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#dbeafe',
  },
});
