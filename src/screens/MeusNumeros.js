import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
} from 'react-native';

import { auth, db } from '../services/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';

export default function MeusNumeros() {
  const [numeros, setNumeros] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'cartelas'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('criadoEm', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = [];
      snapshot.forEach((doc) => {
        lista.push({ id: doc.id, ...doc.data() });
      });
      setNumeros(lista);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (numeros.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ textAlign: 'center' }}>
          Você ainda não comprou números
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text
        style={{
          fontSize: 24,
          textAlign: 'center',
          marginBottom: 20,
        }}
      >
        Meus Números
      </Text>

      <FlatList
        data={numeros}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={{
              borderWidth: 1,
              borderRadius: 10,
              padding: 15,
              marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: 18 }}>
              🎟️ Número: {item.numero}
            </Text>

            <Text>Status: {item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}
