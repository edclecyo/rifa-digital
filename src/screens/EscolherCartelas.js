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
        <Text style={styles.numerosTexto}>🎯 nº da sorte [{item.numeros?.join(', ')}]</Text>
        <Text style={styles.valor}>💰 R$ {VALOR_CARTELA.toFixed(2)}</Text>
        {item.status === 'reservada' && (
          <Text style={styles.statusTexto}>
            ⏱️ {minhaReserva ? 'Sua reserva' : 'Reservada'}
          </Text>
        )}
        {item.status === 'vendida' && <Text style={styles.vendidaTexto}>❌ Vendida</Text>}
      </Pressable>
    );
  },
  (prev, next) =>
    prev.item.status === next.item.status &&
    prev.item.id === next.item.id &&
    prev.item.reservadaPor === next.item.reservadaPor
);

/* =========================================================
   📱 Escolher Cartelas otimizado
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
  const confirmarCompra = useMemo(() => httpsCallable(functions, 'confirmarCompra'), [functions]);

  /* 🔄 Rodada atual */
  useEffect(() => {
    const ref = doc(db, 'StatusSorteio', 'geral');
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setRodadaAtual(snap.data().rodada || 1);
    });
    return unsub;
  }, []);

  /* 🔄 Cartelas em tempo real */
  useEffect(() => {
    if (!user?.uid || !rodadaAtual) return;

    unsubCartelas.current?.();
    const q = query(collection(db, 'Cartelas'), where('rodada', '==', rodadaAtual));

    unsubCartelas.current = onSnapshot(q, snap => {
      // Atualiza o Map com todos os docs do snapshot, garantindo que cartelas apareçam imediatamente
      const map = new Map();
      snap.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
      setCartelasMap(map);
    });

    return () => unsubCartelas.current?.();
  }, [user?.uid, rodadaAtual]);

  /* 🔘 Reservar / Cancelar */
  const onToggle = useCallback(
    cartela => {
      if (loadingReserva) return;

      setLoadingReserva(true);
      const acao = cartela.status === 'disponivel' ? reservarCartela : cancelarReserva;
      acao({ cartelaId: cartela.id })
        .catch(e => Alert.alert('Erro', e?.message || e?.details || 'Falha na ação'))
        .finally(() => setLoadingReserva(false));
    },
    [loadingReserva, reservarCartela, cancelarReserva]
  );

  /* 🛒 Comprar cartelas */
  const comprar = useCallback(() => {
    const minhasReservasArray = Array.from(cartelasMap.values())
      .filter(c => c.status === 'reservada' && c.reservadaPor === user.uid)
      .map(c => c.id);

    if (minhasReservasArray.length === 0) return Alert.alert('Nenhuma cartela reservada');

    setLoadingCompra(true);
    confirmarCompra({ cartelas: minhasReservasArray })
      .then(() => {
        Alert.alert('✅ Compra confirmada');
      })
      .catch(e => Alert.alert('Erro', e?.message || e?.details || 'Erro ao comprar'))
      .finally(() => setLoadingCompra(false));
  }, [cartelasMap, confirmarCompra, user?.uid]);

  /* 🔹 FlatList renderItem */
  const renderItem = useCallback(
    ({ item }) => <CartelaItem item={item} userId={user?.uid} onPress={onToggle} />,
    [user?.uid, onToggle]
  );

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
        renderItem={renderItem}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={11}
        removeClippedSubviews={false} // para evitar flash
        contentContainerStyle={{ paddingBottom: 180 }}
      />

      {/* 🛒 BOTÃO FIXO */}
      <View style={styles.botaoFixo}>
        <Text style={styles.resumoTexto}>🎟 {cartelasArray.filter(c => c.status === 'reservada' && c.reservadaPor === user.uid).length} cartelas</Text>
        <Text style={styles.totalTexto}>💵 R$ {(cartelasArray.filter(c => c.status === 'reservada' && c.reservadaPor === user.uid).length * VALOR_CARTELA).toFixed(2)}</Text>
        <Pressable
          onPress={comprar}
          disabled={loadingCompra || cartelasArray.filter(c => c.status === 'reservada' && c.reservadaPor === user.uid).length === 0}
          style={[
            styles.botaoComprarFinal,
            (loadingCompra || cartelasArray.filter(c => c.status === 'reservada' && c.reservadaPor === user.uid).length === 0) && { opacity: 0.6 },
          ]}
        >
          {loadingCompra ? <ActivityIndicator color="#fff" /> : <Text style={styles.botaoTexto}>COMPRAR CARTELA</Text>}
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
