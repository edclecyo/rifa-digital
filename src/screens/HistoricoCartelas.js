import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';

import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';

export default function HistoricoCartelas() {
  const { user } = useContext(AuthContext);
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'Usuarios', user.uid, 'HistoricoCartelas'),
      orderBy('compradaEm', 'desc')
    );

    const unsub = onSnapshot(q, snap => {
      setLista(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎟️ Minhas Cartelas</Text>

      <FlatList
        data={lista}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.codigo}>#{item.codigo}</Text>
            <Text>Rodada: {item.rodada}</Text>
            <Text>Status: {item.status}</Text>
            <Text>💰 R$ {item.valor.toFixed(2)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 20 }}>
            Nenhuma cartela ainda
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },

  card: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },

  codigo: { fontWeight: 'bold', fontSize: 16 },

  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
