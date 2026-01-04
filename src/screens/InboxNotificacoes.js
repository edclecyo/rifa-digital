import { View, Text, FlatList, Pressable, Alert } from 'react-native';
import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';

export default function InboxNotificacoes() {
  const { user } = useContext(AuthContext);
  const navigation = useNavigation();
  const [notificacoes, setNotificacoes] = useState([]);

  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(doc(db, 'Usuarios', user.uid), (snap) => {
      const data = snap.data();
      if (!data) return;

      const lista = [];

      if (data.ultimaCompraConfirmada) {
        lista.push({
          id: 'compra',
          titulo: '💰 Compra Confirmada',
          corpo: data.ultimaCompraConfirmada,
          tipo: 'compra',
        });
      }

      if (data.ultimaAtualizacaoRanking) {
        lista.push({
          id: 'ranking',
          titulo: '🏆 Ranking Atualizado',
          corpo: data.ultimaAtualizacaoRanking,
          tipo: 'ranking',
        });
      }

      setNotificacoes(lista);
    });

    return () => unsub();
  }, [user]);

  async function abrirNotificacao(item) {
    if (item.tipo === 'ranking') {
      navigation.navigate('RankingPublico');
    } else {
      Alert.alert(item.titulo, item.corpo);
    }

    // 🔴 Marca como lida (limpa badge)
    await updateDoc(doc(db, 'Usuarios', user.uid), {
      ultimaCompraConfirmada: null,
      ultimaAtualizacaoRanking: null,
    });
  }

  function renderItem({ item }) {
    return (
      <Pressable
        onPress={() => abrirNotificacao(item)}
        style={{
          padding: 16,
          borderBottomWidth: 1,
          borderColor: '#334155',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
          {item.titulo}
        </Text>
        <Text style={{ color: '#cbd5f5', marginTop: 4 }}>
          {item.corpo}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <View
        style={{
          padding: 20,
          borderBottomWidth: 1,
          borderColor: '#334155',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>
          🔔 Notificações
        </Text>
      </View>

      {notificacoes.length === 0 ? (
        <Text
          style={{
            color: '#94a3b8',
            textAlign: 'center',
            marginTop: 40,
          }}
        >
          Nenhuma notificação
        </Text>
      ) : (
        <FlatList
          data={notificacoes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}
