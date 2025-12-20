import { View, Text, FlatList } from 'react-native';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useEffect, useState } from 'react';

export default function AdminUsuarios() {
  const [Usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Usuarios'), snap => {
      setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return unsub;
  }, []);

  return (
    <FlatList
      data={usuarios}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={{ padding: 15, borderBottomWidth: 1 }}>
          <Text>👤 {item.nome}</Text>
          <Text>📧 {item.email}</Text>
          <Text>🔑 {item.tipo}</Text>
        </View>
      )}
    />
  );
}
