import { View, Text, Switch } from 'react-native';
import { useState } from 'react';

export default function ConfigUser() {
  const [notificacoes, setNotificacoes] = useState(true);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0f172a',
        padding: 20,
      }}
    >
      <Text
        style={{
          color: '#fff',
          fontSize: 22,
          fontWeight: 'bold',
          marginBottom: 30,
        }}
      >
        ⚙️ Configurações
      </Text>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <Text style={{ color: '#cbd5f5', fontSize: 16 }}>
          Receber notificações
        </Text>

        <Switch
          value={notificacoes}
          onValueChange={setNotificacoes}
        />
      </View>
    </View>
  );
}
