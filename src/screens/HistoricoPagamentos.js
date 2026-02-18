import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function HistoricoPagamentos() {
  const { user } = useContext(AuthContext);

  const [pagamentos, setPagamentos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    // 🔎 Query SEM orderBy → evita erro de índice
    const q = query(
      collection(db, 'Pagamentos'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        try {
          const lista = snapshot.docs
            .map((doc) => {
              const data = doc.data();
              return { id: doc.id, ...data };
            })
            // 🔐 garante timestamp válido
            .filter((p) => p?.criadoEm?.toMillis)
            // 📊 ordenação no JS (seguro)
            .sort(
              (a, b) => b.criadoEm.toMillis() - a.criadoEm.toMillis()
            );

          setPagamentos(lista);
        } catch (err) {
          console.log('Erro ao processar histórico:', err);
          setPagamentos([]);
        }

        setLoading(false);
      },
      (error) => {
        console.log('Erro histórico pagamentos:', error);
        setPagamentos([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  /* ================= LOADING ================= */
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ marginTop: 10, color: '#6b7280' }}>
          Carregando pagamentos...
        </Text>
      </View>
    );
  }

  /* ================= EMPTY ================= */
  if (pagamentos.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
          Nenhum pagamento encontrado
        </Text>
        <Text style={{ color: '#6b7280', marginTop: 8 }}>
          Assim que você fizer um pagamento, ele aparecerá aqui.
        </Text>
      </View>
    );
  }

  /* ================= LISTA ================= */
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text
        style={{
          fontSize: 22,
          fontWeight: 'bold',
          marginBottom: 15,
        }}
      >
        💳 Histórico de Pagamentos
      </Text>

      <FlatList
        data={pagamentos}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => {
          const dataFormatada = item.criadoEm?.toDate
            ? new Date(item.criadoEm.toDate()).toLocaleString()
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
              <Text style={{ fontWeight: 'bold', fontSize: 17 }}>
                💰 R$ {Number(item.valorTotal || 0).toFixed(2)}
              </Text>

              <Text style={{ marginTop: 4 }}>
                🎟️ Cartelas: {item.quantidade || 0}
              </Text>

              <Text>💳 Método: {item.metodo || '—'}</Text>

              <Text>📌 Status: {item.status || '—'}</Text>

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
