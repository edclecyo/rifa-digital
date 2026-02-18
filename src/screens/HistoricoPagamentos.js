import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function HistoricoPagamentos() {
  const { user } = useContext(AuthContext);

  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'Pedidos'),
      where('uid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        try {
          const lista = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((p) => p?.criadoEm?.toMillis)
            .sort((a, b) => b.criadoEm.toMillis() - a.criadoEm.toMillis());

          setPedidos(lista);
        } catch (err) {
          console.log('Erro ao processar pedidos:', err);
          setPedidos([]);
        }

        setLoading(false);
      },
      (error) => {
        console.log('Erro histórico pedidos:', error);
        setPedidos([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  /* ================= LOADING ================= */
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ marginTop: 10, color: '#6b7280' }}>
          Carregando seus pedidos...
        </Text>
      </View>
    );
  }

  /* ================= EMPTY ================= */
  if (pedidos.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
          Você ainda não fez nenhum pagamento
        </Text>
        <Text style={{ color: '#6b7280', marginTop: 8, textAlign: 'center' }}>
          Assim que você comprar uma cartela, o pedido aparecerá aqui.
        </Text>
      </View>
    );
  }

  /* ================= LISTA ================= */
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 15 }}>
        💳 Meus Pedidos
      </Text>

      <FlatList
        data={pedidos}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => {
          const dataFormatada = item.criadoEm?.toDate
            ? new Date(item.criadoEm.toDate()).toLocaleString('pt-BR')
            : '';

          return (
            <View
              style={{
                backgroundColor: '#f9fafb',
                borderRadius: 12,
                padding: 15,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#e5e7eb',
              }}
            >
              {/* 🆔 CÓDIGO DA CARTELA */}
<Text style={{ fontWeight: 'bold', fontSize: 16 }}>
  🎟️ {item.cartelas?.[0] || '—'}
</Text>

              {/* 👤 NOME */}
              <Text style={{ marginTop: 4 }}>
                👤 {item.nomeComprador || '—'}
              </Text>

              {/* 💰 VALOR (EM DESTAQUE) */}
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 18,
                  fontWeight: 'bold',
                  color: '#16a34a',
                }}
              >
                💰 R$ {Number(item.total || 0).toFixed(2)}
              </Text>

              {/* 🎟️ QUANTIDADE */}
              <Text style={{ marginTop: 4 }}>
                🎟️ Cartelas: {item.cartelas?.length || 0}
              </Text>

              {/* 📌 STATUS */}
              <Text style={{ marginTop: 2 }}>
                📌 Status: {item.status || '—'}
              </Text>

              {/* 📅 DATA */}
              <Text
                style={{
                  marginTop: 6,
                  color: '#6b7280',
                  fontSize: 12,
                }}
              >
                📅 {dataFormatada}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}
