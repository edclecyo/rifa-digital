import { View, Text, FlatList } from 'react-native';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { escutarCartelas } from '../services/cartelaService';

export default function MinhasCartelas() {
  const { user } = useContext(AuthContext);
  const [cartelas, setCartelas] = useState([]);

  useEffect(() => {
    if (!user?.uid) return;

    // 🔥 Escuta em tempo real
    const unsubscribe = escutarCartelas(user.uid, (lista) => {
      setCartelas(lista);
    });

    return unsubscribe;
  }, [user?.uid]);

  function formatarData(timestamp) {
    if (!timestamp?.toDate) return '—';
    return timestamp.toDate().toLocaleString('pt-BR');
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text
        style={{
          fontSize: 22,
          fontWeight: 'bold',
          marginBottom: 15,
        }}
      >
        🎟️ Minhas Cartelas
      </Text>

      {cartelas.length === 0 && (
        <Text style={{ textAlign: 'center', marginTop: 40 }}>
          Você ainda não comprou nenhuma cartela
        </Text>
      )}

      <FlatList
        data={cartelas}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#e5e7eb',
              borderRadius: 10,
              padding: 15,
              marginBottom: 12,
              backgroundColor: '#f9fafb',
            }}
          >
            <Text
              style={{
                fontWeight: 'bold',
                fontSize: 16,
                marginBottom: 6,
              }}
            >
              🎟️ Cartela #{item.id}
            </Text>

            <Text style={{ marginBottom: 4 }}>
              🔢 Números:{' '}
              {item.numeros?.length
                ? item.numeros.join(' - ')
                : '—'}
            </Text>

            <Text style={{ marginBottom: 4 }}>
              💰 Valor: R$ {Number(item.valor || 2.5).toFixed(2)}
            </Text>

            {item.userNome && (
              <Text style={{ marginBottom: 4 }}>
                👤 Comprador: {item.userNome}
              </Text>
            )}

            {item.vendidaEm && (
              <Text style={{ marginBottom: 6 }}>
                🕒 Comprada em: {formatarData(item.vendidaEm)}
              </Text>
            )}

            <Text
              style={{
                color: item.vendida ? '#16a34a' : '#dc2626',
                fontWeight: 'bold',
              }}
            >
              {item.vendida ? '✅ Comprada' : '⏳ Pendente'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
