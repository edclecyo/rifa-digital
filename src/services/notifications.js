import { View, Text, FlatList, Pressable } from 'react-native';
import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';

export default function Notificacoes({ navigation }) {
  const { user } = useContext(AuthContext);
  const [lista, setLista] = useState([]);

  useEffect(() => {
    const ref = collection(db, 'Usuarios', user.uid, 'Notificacoes');
    const unsub = onSnapshot(ref, (snap) => {
      const dados = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      setLista(dados);
    });

    return unsub;
  }, []);

  async function abrir(n) {
    await updateDoc(
      doc(db, 'Usuarios', user.uid, 'Notificacoes', n.id),
      { lida: true }
    );

    if (n.tipo === 'ranking') {
      navigation.navigate('RankingPublico');
    }
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <FlatList
        data={lista}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => abrir(item)}
            style={{
              padding: 15,
              marginBottom: 10,
              borderRadius: 10,
              backgroundColor: item.lida ? '#e5e7eb' : '#bfdbfe',
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>{item.titulo}</Text>
            <Text>{item.corpo}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
