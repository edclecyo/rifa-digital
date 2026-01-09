import { View, Text, FlatList, Pressable, Alert } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';

export default function AdminAuditoria({ auditorias }) {

  async function verificar() {
    try {
      const fn = httpsCallable(functions, 'verificarAuditoria');
      const res = await fn();

      if (res.data.valido) {
        Alert.alert('✅ Auditoria íntegra', 'Nenhuma fraude detectada');
      } else {
        Alert.alert('🚨 FRAUDE DETECTADA', `Erro em ${res.data.erroEm}`);
      }
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Pressable
        onPress={verificar}
        style={{ backgroundColor: '#16a34a', padding: 14, borderRadius: 12 }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: 'bold' }}>
          🔍 Verificar Integridade
        </Text>
      </Pressable>

      <FlatList
        data={auditorias}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderBottomWidth: 1 }}>
            <Text>📌 {item.tipo}</Text>
            <Text>👤 {item.uid}</Text>
            <Text>🔗 {item.hash.slice(0, 16)}...</Text>
          </View>
        )}
      />
    </View>
  );
}
