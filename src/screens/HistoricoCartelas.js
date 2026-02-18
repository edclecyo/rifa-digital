import React, { useEffect, useState, useContext, useCallback } from 'react';
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
  limit,
  startAfter,
  getDocs,
  doc,
} from 'firebase/firestore';

const PAGE_SIZE = 100;

export default function HistoricoCartelas() {
  const { user } = useContext(AuthContext);

  const [cartelas, setCartelas] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [statusSorteio, setStatusSorteio] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;

    const loadInitial = async () => {
      try {
        const q = query(
          collection(db, 'Usuarios', user.uid, 'HistoricoCartelas'),
          orderBy('compradaEm', 'desc'),
          limit(PAGE_SIZE)
        );

        const snap = await getDocs(q);

        setCartelas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } catch (e) {
        console.log('Erro ao carregar cartelas:', e);
      } finally {
        setLoading(false);
      }
    };

    loadInitial();

    const refStatus = doc(db, 'StatusSorteio', 'geral');
    const unsubStatus = onSnapshot(refStatus, snap => {
      if (snap.exists()) setStatusSorteio(snap.data());
    });

    return () => unsubStatus();
  }, [user?.uid]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDoc || !user?.uid) return;

    setLoadingMore(true);

    try {
      const q = query(
        collection(db, 'Usuarios', user.uid, 'HistoricoCartelas'),
        orderBy('compradaEm', 'desc'),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );

      const snap = await getDocs(q);

      const newDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      setCartelas(prev => [...prev, ...newDocs]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.log('Erro ao carregar mais:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, lastDoc, user?.uid]);

  const formatarData = timestamp => {
    if (!timestamp?.toDate) return '—';
    return timestamp.toDate().toLocaleString('pt-BR');
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.codigo}>🎟️ Cartela #{item.codigo || item.id}</Text>
      <Text>Status: {item.status}</Text>
      <Text>💰 R$ {Number(item.valor || 0).toFixed(2)}</Text>
      <Text>🕒 {formatarData(item.compradaEm)}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {statusSorteio && (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>Cartelas vendidas: {statusSorteio.cartelasVendidas}</Text>
          <Text style={styles.statusText}>Faltam: {statusSorteio.faltamCartelas}</Text>
          <Text style={styles.statusText}>
            Prêmio atual: R$ {Number(statusSorteio.premioAtual || 0).toFixed(2)}
          </Text>
        </View>
      )}

      <FlatList
        data={cartelas}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : null
        }
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statusBox: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
  },

  statusText: { fontSize: 14, color: '#075985', marginBottom: 2 },

  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },

  codigo: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
});
