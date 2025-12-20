import { View, Text, Pressable } from 'react-native';
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export default function HomeUser({ navigation }) {
  const { user, profile, logout } = useContext(AuthContext);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0f172a',
        padding: 20,
        justifyContent: 'space-between',
      }}
    >
      {/* Header */}
      <View style={{ marginTop: 40 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: 'bold',
            color: '#fff',
          }}
        >
          🎟️ Rifa Digital
        </Text>

        <Text
          style={{
            marginTop: 6,
            fontSize: 16,
            color: '#cbd5f5',
          }}
        >
          Olá, {profile?.nome || user?.nome}
        </Text>
      </View>

      {/* Cards */}
      <View>
        <Pressable
          onPress={() => navigation.navigate('EscolherCartelas')}
          style={{
            backgroundColor: '#2563eb',
            padding: 22,
            borderRadius: 16,
            marginBottom: 20,
            elevation: 4,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 18,
              fontWeight: 'bold',
              marginBottom: 4,
            }}
          >
            Comprar Cartelas
          </Text>

          <Text
            style={{
              color: '#e0e7ff',
              fontSize: 14,
            }}
          >
            Escolha suas combinações de 6 números
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('MinhasCartelas')}
          style={{
            backgroundColor: '#16a34a',
            padding: 22,
            borderRadius: 16,
            elevation: 4,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 18,
              fontWeight: 'bold',
              marginBottom: 4,
            }}
          >
            Minhas Cartelas
          </Text>

          <Text
            style={{
              color: '#dcfce7',
              fontSize: 14,
            }}
          >
            Veja suas compras e status
          </Text>
        </Pressable>
      </View>

      {/* Footer + Logout */}
      <View>
        <Text
          style={{
            textAlign: 'center',
            color: '#94a3b8',
            marginBottom: 12,
          }}
        >
          Boa sorte 🍀
        </Text>

        <Pressable
          onPress={logout}
          style={{
            backgroundColor: '#dc2626',
            padding: 14,
            borderRadius: 12,
            alignItems: 'center',
			
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontWeight: 'bold',
              fontSize: 16,
            }}
          >
            Sair da Conta
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
