import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';

export default function AntifraudeAdmin({ navigation }) {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'AntifraudeEventos'),
      orderBy('criadoEm', 'desc')
    );

    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEventos(data);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} />;
  }

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: '#020617' }}>
      <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 20 }}>
        🛡️ Antifraude
      </Text>

      <FlatList
        data={eventos}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <View style={{
            backgroundColor: '#0f172a',
            padding: 16,
            borderRadius: 12,
            marginBottom: 12
          }}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>
              🚨 {item.tipo}
            </Text>

            <Text style={{ color: '#cbd5f5' }}>
              UID: {item.uid}
            </Text>

            <Text style={{ color: item.severidade === 'ALTA' ? '#ef4444' : '#facc15' }}>
              Severidade: {item.severidade}
            </Text>

            <Text style={{ color: '#94a3b8', marginTop: 4 }}>
              Pedido: {item.pedidoId}
            </Text>

            <Pressable
              onPress={() => navigation.navigate('AdminUsuarioDetalhe', { uid: item.uid })}
              style={{
                marginTop: 10,
                backgroundColor: '#2563eb',
                padding: 10,
                borderRadius: 8
              }}
            >
              <Text style={{ color: '#fff', textAlign: 'center' }}>
                Ver Usuário
              </Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
