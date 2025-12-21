import { View, Text, FlatList, Pressable, Alert } from 'react-native';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
  addDoc,
} from 'firebase/firestore';

const VALOR_CARTELA = 2;

export default function EscolherCartelas({ navigation }) {
  const { user, profile } = useContext(AuthContext);
  const [cartelas, setCartelas] = useState([]);
  const [selecionadas, setSelecionadas] = useState([]);

  useEffect(() => {
    carregarCartelas();
  }, []);

  async function carregarCartelas() {
    const snap = await getDocs(collection(db, 'Cartelas'));
    const lista = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    setCartelas(lista);
  }

  function toggleCartela(cartela) {
    if (cartela.vendida) return;

    const existe = selecionadas.find((c) => c.id === cartela.id);

    if (existe) {
      setSelecionadas((prev) =>
        prev.filter((c) => c.id !== cartela.id)
      );
    } else {
      setSelecionadas((prev) => [...prev, cartela]);
    }
  }

  async function confirmarCompra() {
    if (selecionadas.length === 0) {
      Alert.alert('Erro', 'Selecione ao menos uma cartela');
      return;
    }

    try {
      // 🔹 1. Marca cartelas como vendidas
      for (const cartela of selecionadas) {
        await updateDoc(doc(db, 'Cartelas', cartela.id), {
          vendida: true,
          userId: user.uid,
          userNome: profile?.nome || user.email,
          vendidaEm: Timestamp.now(),
        });
      }

      // 🔹 2. REGISTRA O PAGAMENTO (NOVO 🔥)
      await addDoc(collection(db, 'Pagamentos'), {
        userId: user.uid,
        userNome: profile?.nome || user.email,
        quantidade: selecionadas.length,
        valorTotal: selecionadas.length * VALOR_CARTELA,
        metodo: 'PIX',
        status: 'aprovado',
        criadoEm: Timestamp.now(),
      });

      Alert.alert(
        'Sucesso',
        `Compra realizada!\nTotal: R$ ${
          selecionadas.length * VALOR_CARTELA
        }`
      );

      setSelecionadas([]);
      navigation.navigate('HomeUser');
    } catch (e) {
      console.log(e);
      Alert.alert(
        'Erro',
        'Alguma cartela já foi vendida. Atualize a lista.'
      );
      carregarCartelas();
    }
  }

  function renderItem({ item }) {
    const selecionada = selecionadas.some((c) => c.id === item.id);

    return (
      <Pressable
        onPress={() => toggleCartela(item)}
        disabled={item.vendida}
        style={{
          padding: 12,
          marginBottom: 8,
          borderRadius: 8,
          backgroundColor: item.vendida
            ? '#9ca3af'
            : selecionada
            ? '#16a34a'
            : '#e5e7eb',
        }}
      >
        <Text style={{ fontWeight: 'bold' }}>
          Cartela #{item.id}
        </Text>

        <Text>{item.numeros.join(' - ')}</Text>

        <Text style={{ marginTop: 5 }}>
          {item.vendida ? '❌ Vendida' : '💰 R$ 2,00'}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, padding: 15 }}>
      <Text style={{ fontSize: 22, marginBottom: 10 }}>
        Cartelas disponíveis
      </Text>

      <FlatList
        data={cartelas}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
      />

      <Pressable
        onPress={confirmarCompra}
        style={{
          backgroundColor:
            selecionadas.length > 0 ? '#2563eb' : '#9ca3af',
          padding: 15,
          borderRadius: 10,
          marginTop: 10,
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center' }}>
          Confirmar compra
        </Text>
      </Pressable>
    </View>
  );
}
