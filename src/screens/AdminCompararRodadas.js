import { View, Text, FlatList } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const VALOR_CARTELA = 2.5;

export default function AdminCompararRodadas() {
  const [rodadas, setRodadas] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'Cartelas'),
      (snap) => {
        const mapa = {};

        snap.docs.forEach(doc => {
          const c = doc.data();
          if (!mapa[c.rodada]) {
            mapa[c.rodada] = {
              rodada: c.rodada,
              total: 0,
              vendidas: 0,
            };
          }

          mapa[c.rodada].total += 1;
          if (c.status === 'vendida') {
            mapa[c.rodada].vendidas += 1;
          }
        });

        const lista = Object.values(mapa).map(r => ({
          ...r,
          faturamento: r.vendidas * VALOR_CARTELA,
        }));

        lista.sort((a, b) => b.rodada - a.rodada);
        setRodadas(lista);
      }
    );

    return unsub;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a', padding: 20 }}>
      <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 20 }}>
        📊 Comparação de Rodadas
      </Text>

      <FlatList
        data={rodadas}
        keyExtractor={(item) => String(item.rodada)}
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: '#1e293b',
              padding: 18,
              borderRadius: 16,
              marginBottom: 14,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
              🎯 Rodada {item.rodada}
            </Text>

            <Text style={{ color: '#cbd5f5', marginTop: 6 }}>
              🎟️ Vendidas: {item.vendidas} / {item.total}
            </Text>

            <Text style={{ color: '#16a34a', marginTop: 6, fontWeight: 'bold' }}>
              💰 R$ {item.faturamento.toFixed(2)}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
