import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';

export default function HistoricoSorteios() {
  const [sorteios, setSorteios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'Rodadas'), // ✅ COLEÇÃO CORRETA
      orderBy('criadoEm', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const lista = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setSorteios(lista);
        setLoading(false);
      },
      (error) => {
        console.log('❌ Erro ao carregar sorteios:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a', padding: 20 }}>
      <Text
        style={{
          fontSize: 26,
          fontWeight: 'bold',
          color: '#fff',
          marginBottom: 20,
        }}
      >
        🏆 Histórico de Sorteios
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#22c55e" />
      ) : (
        <FlatList
          data={sorteios}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={() => (
            <Text
              style={{
                color: '#94a3b8',
                textAlign: 'center',
                marginTop: 40,
              }}
            >
              Nenhum sorteio realizado ainda
            </Text>
          )}
          renderItem={({ item }) => (
            <View
              style={{
                backgroundColor: '#020617',
                padding: 18,
                borderRadius: 16,
                marginBottom: 14,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                🎯 Rodada #{item.rodada || '-'}
              </Text>

              <Text style={{ color: '#cbd5f5', marginTop: 6 }}>
                🧾 Cartela: {item.cartelaId || '-'}
              </Text>

              <Text style={{ color: '#cbd5f5' }}>
                🔢 Números: {item.numeros?.join(' - ') || '-'}
              </Text>

              <Text style={{ color: '#cbd5f5', marginTop: 6 }}>
                👤 Ganhador: {item.nomeGanhador || 'Usuário'}
              </Text>

              <Text
                style={{
                  color: '#16a34a',
                  fontWeight: 'bold',
                  marginTop: 6,
                  fontSize: 16,
                }}
              >
                💰 Prêmio: R$ {Number(item.premio || 0).toFixed(2)}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}
