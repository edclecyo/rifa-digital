import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useContext, useEffect, useState, useRef } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export default function MinhasCartelas() {
  const { user } = useContext(AuthContext);
  const [cartelas, setCartelas] = useState([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    if (!user?.uid) {
      setCartelas([]);
      setLoading(false);
      return;
    }

    const ref = collection(db, 'UsuariosPrivado', user.uid, 'HistoricoCartelas');
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (!mounted.current) return;

      const lista = snap.docs.map(docSnap => {
        const d = docSnap.data() || {};
        return {
          id: docSnap.id,
          codigo: d.codigo || docSnap.id,
        };
      });
      setCartelas(lista);
      setLoading(false);
    });

    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [user?.uid]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={{ marginTop: 10, color: '#6b7280' }}>Carregando suas cartelas...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: '#f3f4f6' }}>
      <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 12 }}>🎟️ Minhas Cartelas</Text>

      <FlatList
        data={cartelas}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 15, marginBottom: 12, backgroundColor: '#ffffff' }}>
            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>🎟️ Cartela #{item.codigo}</Text>
          </View>
        )}
        ListEmptyComponent={() => (
          <Text style={{ textAlign: 'center', marginTop: 40, color: '#6b7280' }}>
            Você ainda não comprou nenhuma cartela
          </Text>
        )}
      />
    </View>
  );
}
