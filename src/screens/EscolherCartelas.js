import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { AuthContext } from '../contexts/AuthContext';
import { db, app } from '../services/firebase';
import {
  collection,
  query,
  where,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const VALOR_CARTELA = 2.5;
const MAX_RESERVAS = 20;
const { width } = Dimensions.get('window');

/* =========================================================
   🎟️ Cartela memoizada
========================================================= */
const CartelaItem = React.memo(
  ({ item, onPress, userId }) => {
    const minhaReserva = item.status === 'reservada' && item.reservadaPor === userId;

    return (
      <Pressable
        disabled={item.status === 'vendida'}
        onPress={() => onPress(item)}
        style={[
          styles.card,
          item.status === 'disponivel' && styles.disponivel,
          item.status === 'reservada' && styles.reservada,
          item.status === 'vendida' && styles.vendida,
          minhaReserva && styles.minhaReserva,
        ]}
      >
        <Text style={styles.cartelaId}>🎟️ Cartela #{item.id}</Text>
        <Text style={styles.numerosTexto}>
          🎯 nº da sorte [{item.numeros?.join(', ')}]
        </Text>
        <Text style={styles.valor}>💰 R$ {VALOR_CARTELA.toFixed(2)}</Text>

        {item.status === 'reservada' && (
          <Text style={styles.statusTexto}>
            ⏱️ {minhaReserva ? 'Sua reserva' : 'Reservada'}
          </Text>
        )}

        {item.status === 'vendida' && (
          <Text style={styles.vendidaTexto}>❌ Vendida</Text>
        )}
      </Pressable>
    );
  }
);

/* =========================================================
   📱 Escolher Cartelas
========================================================= */
export default function EscolherCartelas() {
  const { user, loading: authLoading } = useContext(AuthContext);

  const [cartelasMap, setCartelasMap] = useState(new Map());
  const [loadingReserva, setLoadingReserva] = useState(false);
  const [loadingCompra, setLoadingCompra] = useState(false);
  const [rodadaAtual, setRodadaAtual] = useState(1);

  const unsubCartelas = useRef(null);

  const functions = useMemo(() => getFunctions(app, 'us-central1'), []);
  const reservarCartela = useMemo(() => httpsCallable(functions, 'reservarCartela'), [functions]);
  const cancelarReserva = useMemo(() => httpsCallable(functions, 'cancelarReserva'), [functions]);
  const comprarComSaldo = useMemo(() => httpsCallable(functions, 'comprarComSaldo'), [functions]);

  /* 🔄 Rodada atual */
  useEffect(() => {
    const ref = doc(db, 'StatusSorteio', 'geral');
    return onSnapshot(ref, snap => {
      if (snap.exists()) setRodadaAtual(snap.data().rodada || 1);
    });
  }, []);

  /* 🔄 Cartelas em tempo real */
  useEffect(() => {
    if (!user?.uid || !rodadaAtual) return;

    unsubCartelas.current?.();

    const q = query(
      collection(db, 'Cartelas'),
      where('rodada', '==', rodadaAtual),
      where('status', 'in', ['disponivel', 'reservada'])
    );

    unsubCartelas.current = onSnapshot(q, snap => {
      const map = new Map();
      snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
      setCartelasMap(map);
    });

    return () => unsubCartelas.current?.();
  }, [user?.uid, rodadaAtual]);

  /* 🔘 Reservar / Cancelar */
  const onToggle = useCallback(
    cartela => {
      if (loadingReserva) return;

      const reservasAtuais = Array.from(cartelasMap.values()).filter(
        c => c.status === 'reservada' && c.reservadaPor === user.uid
      ).length;

      if (cartela.status === 'disponivel' && reservasAtuais >= MAX_RESERVAS) {
        return Alert.alert(`Limite de ${MAX_RESERVAS} cartelas por compra`);
      }

      setLoadingReserva(true);

      const acao = cartela.status === 'disponivel'
        ? reservarCartela
        : cancelarReserva;

      acao({ cartelaId: cartela.id })
        .catch(e => Alert.alert('Erro', e?.message || 'Falha na ação'))
        .finally(() => setLoadingReserva(false));
    },
    [loadingReserva, cartelasMap, user?.uid]
  );

  /* 🛒 Comprar com saldo (onCall) */
  const comprar = useCallback(async () => {
    try {
      const cartelasSelecionadas = Array.from(cartelasMap.values())
        .filter(c => c.status === 'reservada' && c.reservadaPor === user.uid)
        .map(c => c.id);

      if (cartelasSelecionadas.length === 0) {
        return Alert.alert('Nenhuma cartela reservada');
      }

      setLoadingCompra(true);

      await comprarComSaldo({
        cartelas: cartelasSelecionadas,
        nomeComprador: user.displayName || 'Anônimo',
      });

      Alert.alert('✅ Compra realizada com sucesso!');
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', err?.message || 'Falha ao comprar');
    } finally {
      setLoadingCompra(false);
    }
  }, [cartelasMap, user]);

  /* 🔹 Render */
  const cartelasArray = useMemo(
    () => Array.from(cartelasMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    [cartelasMap]
  );

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={cartelasArray}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <CartelaItem item={item} userId={user.uid} onPress={onToggle} />
        )}
        contentContainerStyle={{ paddingBottom: 180 }}
      />

      <View style={styles.botaoFixo}>
        <Text style={styles.resumoTexto}>
          🎟 {cartelasArray.filter(
            c => c.status === 'reservada' && c.reservadaPor === user.uid
          ).length} cartelas
        </Text>

        <Text style={styles.totalTexto}>
          💵 R$ {(cartelasArray.filter(
            c => c.status === 'reservada' && c.reservadaPor === user.uid
          ).length * VALOR_CARTELA).toFixed(2)}
        </Text>

        <Pressable
          onPress={comprar}
          disabled={loadingCompra}
          style={[styles.botaoComprarFinal, loadingCompra && { opacity: 0.6 }]}
        >
          {loadingCompra
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.botaoTexto}>COMPRAR CARTELAS</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

/* =========================================================
   🎨 ESTILOS
========================================================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  card: { padding: 16, marginBottom: 10, borderRadius: 14, width: width - 32, alignSelf: 'center' },
  disponivel: { backgroundColor: '#dcfce7' },
  reservada: { backgroundColor: '#fde68a' },
  vendida: { backgroundColor: '#fecaca' },
  minhaReserva: { borderWidth: 2, borderColor: '#2563eb', backgroundColor: '#dbeafe' },
  cartelaId: { fontWeight: 'bold', fontSize: 16 },
  numerosTexto: { marginTop: 6, fontWeight: '600' },
  valor: { marginTop: 6, fontWeight: 'bold' },
  statusTexto: { marginTop: 6, fontWeight: 'bold' },
  vendidaTexto: { marginTop: 6, fontWeight: 'bold', color: '#7f1d1d' },
  botaoFixo: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0f172a', padding: 16 },
  resumoTexto: { color: '#e5e7eb', fontSize: 16 },
  totalTexto: { color: '#22c55e', fontSize: 20, fontWeight: 'bold', marginVertical: 6 },
  botaoComprarFinal: { backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center' },
  botaoTexto: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
