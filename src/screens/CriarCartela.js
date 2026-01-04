import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../services/firebase';

export default function CriarCartela() {
  const [loading, setLoading] = useState(false);

  async function criarCartelas() {
    if (loading) return;

    try {
      setLoading(true);

      const functions = getFunctions(app);
      const criarCartelasFn = httpsCallable(
        functions,
        'criarCartelasAutomatico'
      );

      const res = await criarCartelasFn();

      Alert.alert(
  '✅ Sucesso',
  `Cartelas criadas com sucesso\nRodada: ${res.data.rodada}`
);
    } catch (error) {
      console.log('❌ Erro criar cartelas:', error);

      if (error?.code === 'functions/unauthenticated') {
        Alert.alert(
          'Login necessário',
          'Você precisa estar logado como admin.'
        );
        return;
      }

      Alert.alert(
        'Erro',
        error?.message || 'Erro ao criar cartelas'
      );
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
        Geração automática até o limite de 1600 cartelas
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
