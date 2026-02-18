import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';

export default function CriarCartela() {
  const [loading, setLoading] = useState(false);

  async function criarCartelas() {
    if (loading) return;

    try {
      setLoading(true);

      const criarCartelasFn = httpsCallable(functions, 'criarCartelasAutomatico');

      const res = await criarCartelasFn();

      Alert.alert(
        '✅ Sucesso',
        `Cartelas criadas com sucesso!

Rodada: ${res.data.rodada}
Criadas agora: ${res.data.criadas}`
      );
    } catch (error) {
      console.log('❌ Erro criar cartelas:', error);

      if (error?.code === 'functions/unauthenticated') {
        Alert.alert('Login necessário', 'Você precisa estar logado como admin.');
        return;
      }

      // 🚫 rodada já finalizada (12.500)
      if (error?.message?.includes('Rodada finalizada')) {
        Alert.alert(
          'Rodada encerrada',
          'As 12.500 cartelas já foram vendidas.\nAguardando sorteio e reset automático.'
        );
        return;
      }

      Alert.alert('Erro', error?.message || 'Erro ao criar cartelas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <Text
        style={{
          color: '#fff',
          fontSize: 26,
          fontWeight: 'bold',
          textAlign: 'center',
          marginBottom: 10,
        }}
      >
        🎟️ Criar Cartelas
      </Text>

      <Text
        style={{
          color: '#cbd5f5',
          textAlign: 'center',
          marginBottom: 30,
        }}
      >
        Geração contínua até atingir 12.500 vendas na rodada
      </Text>

      <Pressable
        onPress={criarCartelas}
        disabled={loading}
        style={{
          backgroundColor: loading ? '#64748b' : '#9333ea',
          padding: 18,
          borderRadius: 14,
          alignItems: 'center',
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text
            style={{
              color: '#fff',
              fontSize: 18,
              fontWeight: 'bold',
            }}
          >
            Criar Cartelas
          </Text>
        )}
      </Pressable>
    </View>
  );
}
