import { View, Text } from 'react-native';

export default function SobreUser() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0f172a',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>
        ℹ️ Sobre
      </Text>

      <Text
        style={{
          color: '#cbd5f5',
          textAlign: 'center',
          marginTop: 10,
        }}
      >
        Rifa Digital{'\n'}
        Versão 1.0{'\n'}
        Desenvolvido para sorteios online.
      </Text>
    </View>
  );
}
