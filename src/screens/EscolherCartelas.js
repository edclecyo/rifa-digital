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

import { useEffect, useState, useContext, useRef } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db, app } from '../services/firebase';

import {
  collection,
  query,
  where,
  doc,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';

import { getFunctions, httpsCallable } from 'firebase/functions';

const VALOR_CARTELA = 2.5;
const PAGE_SIZE = 60;
const { width } = Dimensions.get('window');

/* =========================================================
   ⏳ CONTADOR
========================================================= */
function useCountdown(timestamp) {
  const [tempo, setTempo] = useState(0);

  useEffect(() => {
    if (!timestamp) {
      setTempo(0);
      return;
    }

    const interval = setInterval(() => {
      const diff = Math.max(
        0,
        Math.floor((timestamp.toMillis() - Date.now()) / 1000)
      );
      setTempo(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [timestamp]);

  return tempo;
}

/* =========================================================
   🎟️ CARTELA
========================================================= */
function CartelaItem({ item, loading, onPress, userId }) {
  const tempo = useCountdown(item.reservaExpiraEm);
  const segundos = String(tempo).padStart(2, '0');

  const minhaReserva =
    item.status === 'reservada' && item.reservadaPor === userId;

  const reservadaPorOutro =
    item.status === 'reservada' && item.reservadaPor !== userId;

  return (
    <Pressable
      disabled={loading || item.status === 'vendida'}
      onPress={() => onPress(item)}
      style={[
        styles.card,
        item.status === 'disponivel' && styles.disponivel,
        item.status === 'reservada' && styles.reservada,
        item.status === 'vendida' && styles.vendida,
        minhaReserva && styles.minhaReserva,
      ]}
    >
      <Text style={styles.cartelaId}>🎟️ Cartela #{item.codigo}</Text>

      <Text style={styles.numerosTexto}>
        🎯 nº da sorte [{item.numeros?.join(', ')}]
      </Text>

      <Text style={styles.valor}>💰 R$ {VALOR_CARTELA.toFixed(2)}</Text>

      {item.status === 'reservada' && (
        <Text style={styles.statusTexto}>
          {reservadaPorOutro
            ? `⏳ Reservada · libera em ${segundos}s`
            : `⏱️ Reservada para você · ${segundos}s`}
        </Text>
      )}

      {item.status === 'vendida' && (
        <Text style={styles.vendidaTexto}>❌ Vendida</Text>
      )}
    </Pressable>
  );
}

/* =========================================================
   📱 TELA
========================================================= */
export default function EscolherCartelas() {
  const { user, loading: authLoading } = useContext(AuthContext);

  const [cartelas, setCartelas] = useState([]);
  const [todas, setTodas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [minhasReservas, setMinhasReservas] = useState([]);

  const [rodadaAtual, setRodadaAtual] = useState(1);
  const [lastIndex, setLastIndex] = useState(0);
  const [fim, setFim] = useState(false);

  const unsub = useRef(null);

  /* 🔥 FUNCTIONS */
  const functions = getFunctions(app, 'us-central1');
  const reservarCartela = httpsCallable(functions, 'reservarCartela');
  const cancelarReserva = httpsCallable(functions, 'cancelarReserva');
  const confirmarCompra = httpsCallable(functions, 'confirmarCompra');

  /* 🔄 RODADA */
  useEffect(() => {
    return onSnapshot(doc(db, 'Rodadas', 'atual'), snap => {
      if (snap.exists()) setRodadaAtual(snap.data().numero);
    });
  }, []);

  /* 📡 CARTELAS */
  useEffect(() => {
    if (!user?.uid) return;

    unsub.current?.();

    const q = query(
      collection(db, 'Cartelas'),
      where('rodada', '==', rodadaAtual)
    );

    unsub.current = onSnapshot(q, snap => {
      const lista = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => Number(a.codigo) - Number(b.codigo));

      setTodas(lista);
      setCartelas(lista.slice(0, PAGE_SIZE));
      setLastIndex(PAGE_SIZE);
      setFim(lista.length <= PAGE_SIZE);
    });

    return () => unsub.current?.();
  }, [rodadaAtual, user?.uid]);

  /* 📌 MINHAS RESERVAS (TEMPO REAL) */
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'Cartelas'),
      where('status', '==', 'reservada'),
      where('reservadaPor', '==', user.uid)
    );

    return onSnapshot(q, snap => {
      setMinhasReservas(snap.docs.map(d => d.id));
    });
  }, [user?.uid]);

  /* ➕ PAGINAÇÃO */
  function carregarMais() {
    if (fim) return;
    const next = todas.slice(lastIndex, lastIndex + PAGE_SIZE);
    setCartelas(prev => [...prev, ...next]);
    setLastIndex(lastIndex + next.length);
    if (lastIndex + PAGE_SIZE >= todas.length) setFim(true);
  }

  /* 🧠 TOGGLE */
  async function onToggle(cartela) {
    try {
      if (
        cartela.status === 'reservada' &&
        cartela.reservadaPor === user.uid
      ) {
        await cancelarReserva({ cartelaId: cartela.id });
        return;
      }

      if (cartela.status === 'disponivel') {
        await reservarCartela({ cartelaId: cartela.id });
      }
    } catch (e) {
      Alert.alert('Erro', e.message || 'Falha na ação');
    }
  }

  /* 💰 COMPRAR */
  async function comprar() {
    try {
      setLoading(true);

      if (minhasReservas.length === 0) {
        return Alert.alert('Nenhuma cartela reservada');
      }

      await confirmarCompra({ cartelas: minhasReservas });

      Alert.alert(
        '✅ Compra confirmada',
        `${minhasReservas.length} cartela(s)`
      );
    } catch (e) {
      Alert.alert('Erro', e.message || 'Falha na compra');
    } finally {
      setLoading(false);
    }
  }

  const totalCartelas = minhasReservas.length;
  const totalValor = totalCartelas * VALOR_CARTELA;

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        🎟️ Cartelas — Rodada {rodadaAtual}
      </Text>

      <FlatList
        data={cartelas}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <CartelaItem
            item={item}
            userId={user.uid}
            loading={loading}
            onPress={onToggle}
          />
        )}
        onEndReached={carregarMais}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: 200 }}
      />

      {/* 🔻 RESUMO FIXO */}
      <View style={styles.resumoContainer}>
        <Text style={styles.resumoText}>
          🎟️ Cartelas: {totalCartelas}
        </Text>
        <Text style={styles.resumoText}>
          💰 Unitário: R$ {VALOR_CARTELA.toFixed(2)}
        </Text>
        <Text style={styles.totalTexto}>
          Total: R$ {totalValor.toFixed(2)}
        </Text>

        <Pressable
          disabled={totalCartelas === 0 || loading}
          onPress={comprar}
          style={[
            styles.botaoComprarFinal,
            totalCartelas === 0 && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.botaoTexto}>
            Comprar cartela
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* =========================================================
   🎨 ESTILOS
========================================================= */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },

  card: {
    padding: 16,
    marginBottom: 10,
    borderRadius: 14,
    width: width - 32,
  },

  disponivel: { backgroundColor: '#dcfce7' },
  reservada: { backgroundColor: '#fde68a' },
  vendida: { backgroundColor: '#fecaca' },

  minhaReserva: {
    borderWidth: 2,
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },

  cartelaId: { fontWeight: 'bold', fontSize: 16 },
  numerosTexto: { marginTop: 6, fontWeight: '600' },
  valor: { marginTop: 6, fontWeight: 'bold' },

  statusTexto: { marginTop: 6, fontWeight: 'bold' },
  vendidaTexto: {
    marginTop: 6,
    fontWeight: 'bold',
    color: '#7f1d1d',
  },

  resumoContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111',
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  resumoText: { color: '#ccc', fontSize: 14 },
  totalTexto: {
    color: '#22c55e',
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 8,
  },

  botaoComprarFinal: {
    backgroundColor: '#16a34a',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },

  botaoTexto: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
