import { View, Text, FlatList } from 'react-native';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { escutarCartelas } from '../services/cartelaService'; // use a função que criamos

export default function MinhasCartelas() {
  const { user } = useContext(AuthContext);
  const [cartelas, setCartelas] = useState([]);

  useEffect(() => {
    if (!user) return;

    // Usa a função escutarCartelas, que já lida com vendidaEm
    const unsubscribe = escutarCartelas(user.uid, (lista) => {
      setCartelas(lista);
    });

    return unsubscribe;
  }, [user]);

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
                marginBottom: 5,
              }}
            >
              Cartela #{item.id}
            </Text>

            <Text style={{ marginBottom: 5 }}>
              🔢 Números: {item.numeros?.join(' - ')}
            </Text>

            <Text style={{ marginBottom: 5 }}>
              💰 Valor: R$ {item.valor?.toFixed(2) || '2.00'}
            </Text>

            {item.userNome && (
              <Text style={{ marginBottom: 5 }}>
                👤 Comprador: {item.userNome}
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
