import { View, Text, Pressable } from 'react-native';
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export default function HomeUser({ navigation }) {
  const { user, profile } = useContext(AuthContext);

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
        <Pressable onPress={() => navigation.openDrawer()}>
          <Text style={{ color: '#fff', fontSize: 26 }}>☰</Text>
        </Pressable>

        <Text
          style={{
            fontSize: 28,
            fontWeight: 'bold',
            color: '#fff',
            marginTop: 10,
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
          Olá, {profile?.nome || user?.displayName || 'Usuário'}
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
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 18,
              fontWeight: 'bold',
            }}
          >
            Comprar Cartelas
          </Text>

          <Text style={{ color: '#e0e7ff', marginTop: 4 }}>
            Escolha seus números
          </Text>
        </Pressable>
<Pressable
  onPress={() => navigation.navigate('RankingPublico')}
  style={{
    backgroundColor: '#f59e0b',
    padding: 22,
    borderRadius: 16,
    marginBottom: 20,
  }}
>
  <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
    🏆 Ranking Geral
  </Text>
</Pressable>

        <Pressable
          onPress={() => navigation.navigate('MinhasCartelas')}
          style={{
            backgroundColor: '#16a34a',
            padding: 22,
            borderRadius: 16,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 18,
              fontWeight: 'bold',
            }}
          >
            Minhas Cartelas
          </Text>

          <Text style={{ color: '#dcfce7', marginTop: 4 }}>
            Acompanhe suas compras
          </Text>
        </Pressable>
      </View>

      {/* Footer */}
      <Text style={{ textAlign: 'center', color: '#94a3b8' }}>
        Boa sorte 🍀
      </Text>
    </View>
  );
}
