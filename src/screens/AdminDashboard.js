import { View, Text, Pressable } from 'react-native';

export default function AdminDashboard({ navigation }) {
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 26, fontWeight: 'bold', marginBottom: 20 }}>
        📊 Painel Admin
      </Text>

      <Pressable
        onPress={() => navigation.navigate('AdminRifas')}
        style={{
          backgroundColor: '#2563eb',
          padding: 15,
          borderRadius: 10,
          marginBottom: 15,
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center' }}>
          🎟️ Rifas vendidas
        </Text>
      </Pressable>

      <Pressable
        onPress={() => navigation.navigate('AdminUsuarios')}
        style={{
          backgroundColor: '#16a34a',
          padding: 15,
          borderRadius: 10,
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center' }}>
          👥 Usuários
        </Text>
      </Pressable>
    </View>
  );
}
