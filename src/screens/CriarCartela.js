import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useState } from 'react';
import { db } from '../services/firebase';
import {
  collection,
  writeBatch,
  doc,
  Timestamp,
} from 'firebase/firestore';

const TOTAL_CARTELAS = 1000;
const NUMEROS_POR_CARTELA = 6;

function gerarNumeros() {
  const set = new Set();
  while (set.size < NUMEROS_POR_CARTELA) {
    set.add(Math.floor(Math.random() * 60) + 1);
  }
  return Array.from(set).sort((a, b) => a - b);
}

export default function CriarCartela() {
  const [loading, setLoading] = useState(false);

  async function criarCartelas() {
    try {
      setLoading(true);

      const batch = writeBatch(db);
      const ref = collection(db, 'Cartelas');

      for (let i = 0; i < TOTAL_CARTELAS; i++) {
        const cartelaRef = doc(ref);

        batch.set(cartelaRef, {
          numeros: gerarNumeros(),
          vendida: false,
          userId: null,
          valor: 2,
          criadoEm: Timestamp.now(),
        });
      }

      await batch.commit();

      Alert.alert('Sucesso', '✅ Cartelas criadas com sucesso!');
    } catch (error) {
      console.log(error);
      Alert.alert('Erro', 'Erro ao criar cartelas');
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
        Gerar {TOTAL_CARTELAS} cartelas automaticamente
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
            Criar Cartelas no Banco
          </Text>
        )}
      </Pressable>
    </View>
  );
}
