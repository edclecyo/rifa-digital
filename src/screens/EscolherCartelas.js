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
import { db, functions } from '../services/firebase';
import {
  collection,
  query,
  where,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useFocusEffect } from '@react-navigation/native';

const VALOR_CARTELA = 2.5;
const MAX_RESERVAS = 20;
const TEMPO_RESERVA_MS = 20000; // 20 segundos
const { width } = Dimensions.get('window');

/* =========================================================
   🎟️ Cartela memoizada ULTRA RÁPIDA
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
  },
  (prev, next) =>
    prev.item.status === next.item.status &&
    prev.item.reservadaPor === next.item.reservadaPor
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
  const reservaTimers = useRef(new Map());

  /* 🔄 Rodada atual */
  useEffect(() => {
    const ref = doc(db, 'StatusSorteio', 'geral');
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setRodadaAtual(snap.data().rodada || 1);
    });
    return unsub;
  }, []);

  /* 🔄 Cartelas tempo real OTIMIZADO */
  useEffect(() => {
    if (!user?.uid || !rodadaAtual) return;

    unsubCartelas.current?.();

    const q = query(
  collection(db, 'Cartelas'),
  where('rodada', '==', rodadaAtual),
  where('status', 'in', ['disponivel', 'reservada', 'vendida']) // pega todas, não só vendidas
);

    unsubCartelas.current = onSnapshot(q, (snap) => {
      setCartelasMap((prev) => {
        const map = new Map(prev);

        snap.docChanges().forEach((change) => {
          const data = { id: change.doc.id, ...change.doc.data() };
          if (change.type === 'removed') {
            map.delete(change.doc.id);
            // limpa timer se existir
            if (reservaTimers.current.has(change.doc.id)) {
              clearTimeout(reservaTimers.current.get(change.doc.id));
              reservaTimers.current.delete(change.doc.id);
            }
          } else {
            map.set(change.doc.id, data);
          }
        });

        return map;
      });
    });

    return () => unsubCartelas.current?.();
  }, [user?.uid, rodadaAtual]);

  /* ===============================
     🧹 CANCELAR RESERVAS AO SAIR DA TELA
  ================================= */
  useFocusEffect(
    useCallback(() => {
      return () => {
        const minhasReservas = Array.from(cartelasMap.values())
          .filter(c => c.status === 'reservada' && c.reservadaPor === user.uid)
          .map(c => c.id);

        if (minhasReservas.length === 0) return;

        const cancelarReservas = async () => {
          try {
            const fn = httpsCallable(functions, 'reservarCartelas');
            await fn({ cartelas: minhasReservas, acao: 'cancelar' });
            console.log('Reservas canceladas ao sair da tela');
          } catch (e) {
            if (e?.message?.includes('já vendida')) {
              console.log('Alguma cartela já foi vendida, ignorando.');
            } else {
              console.log('Erro ao cancelar reservas:', e);
            }
          }
        };

        cancelarReservas();

        // limpa todos timers
        reservaTimers.current.forEach(timer => clearTimeout(timer));
        reservaTimers.current.clear();
      };
    }, [cartelasMap, user?.uid])
  );

  /* 🔘 Reservar / cancelar com timeout */
  const onToggle = useCallback(
    async (cartela) => {
      if (loadingReserva) return;

      const reservasAtuais = Array.from(cartelasMap.values()).filter(
        (c) => c.status === 'reservada' && c.reservadaPor === user.uid
      ).length;

      if (cartela.status === 'vendida') return;

      if (cartela.status === 'disponivel' && reservasAtuais >= MAX_RESERVAS) {
        Alert.alert(`Limite de ${MAX_RESERVAS} cartelas por compra`);
        return;
      }

      setLoadingReserva(true);

      try {
        const fn = httpsCallable(functions, 'reservarCartelas');

        const acao =
          cartela.status === 'reservada' && cartela.reservadaPor === user.uid
            ? 'cancelar'
            : 'reservar';

        await fn({ cartelas: [cartela.id], acao });

        // se reservou, inicia timer de 20s
        if (acao === 'reservar') {
          if (reservaTimers.current.has(cartela.id)) {
            clearTimeout(reservaTimers.current.get(cartela.id));
          }

          const timer = setTimeout(async () => {
            try {
              await fn({ cartelas: [cartela.id], acao: 'cancelar' });
              reservaTimers.current.delete(cartela.id);
              console.log(`Reserva de ${cartela.id} expirada`);
            } catch (e) {
              console.log('Erro ao cancelar reserva expirada:', e);
            }
          }, TEMPO_RESERVA_MS);

          reservaTimers.current.set(cartela.id, timer);
        } else {
          // cancelou manual → limpa timer
          if (reservaTimers.current.has(cartela.id)) {
            clearTimeout(reservaTimers.current.get(cartela.id));
            reservaTimers.current.delete(cartela.id);
          }
        }
      } catch (e) {
        Alert.alert('Erro', e?.message || 'Falha ao atualizar reserva');
      } finally {
        setLoadingReserva(false);
      }
    },
    [loadingReserva, cartelasMap, user?.uid]
  );

  /* 🛒 Comprar */
  const comprar = useCallback(async () => {
    try {
      const cartelasSelecionadas = Array.from(cartelasMap.values())
        .filter((c) => c.status === 'reservada' && c.reservadaPor === user.uid)
        .map((c) => c.id);

      if (cartelasSelecionadas.length === 0) {
        return Alert.alert('Nenhuma cartela reservada');
      }

      setLoadingCompra(true);

      const fn = httpsCallable(functions, 'criarCheckout');
      const res = await fn({ cartelas: cartelasSelecionadas });

      const data = res?.data;

      if (data?.urlPagamento) {
        Alert.alert('Pagamento gerado', 'Abra o link para concluir.');
      } else {
        Alert.alert('✅ Pedido criado!');
      }
    } catch (err) {
      Alert.alert('Erro', err?.message || 'Falha ao comprar');
    } finally {
      setLoadingCompra(false);
    }
  }, [cartelasMap, user]);

  /* 🔹 Lista ordenada */
  const cartelasArray = useMemo(
    () =>
      Array.from(cartelasMap.values()).sort((a, b) =>
        String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
      ),
    [cartelasMap]
  );

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const totalReservadas = cartelasArray.filter(
    (c) => c.status === 'reservada' && c.reservadaPor === user?.uid
  ).length;

  return (
    <View style={styles.container}>
      <FlatList
        data={cartelasArray}
        extraData={Array.from(cartelasMap.values())
          .filter(c => c.status === 'reservada' && c.reservadaPor === user.uid)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CartelaItem item={item} userId={user.uid} onPress={onToggle} />
        )}
        contentContainerStyle={{ paddingBottom: 180 }}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={10}
        removeClippedSubviews
        updateCellsBatchingPeriod={50}
        getItemLayout={(_, index) => ({
          length: 90,
          offset: 90 * index,
          index,
        })}
      />

      <View style={styles.botaoFixo}>
        <Text style={styles.resumoTexto}>🎟 {totalReservadas} cartelas</Text>

        <Text style={styles.totalTexto}>
          💵 R$ {(totalReservadas * VALOR_CARTELA).toFixed(2)}
        </Text>

        <Pressable
          onPress={comprar}
          disabled={loadingCompra || totalReservadas === 0}
          style={[
            styles.botaoComprarFinal,
            (loadingCompra || totalReservadas === 0) && { opacity: 0.6 },
          ]}
        >
          {loadingCompra ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.botaoTexto}>COMPRAR CARTELAS</Text>
          )}
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
  card: {
    padding: 16,
    marginBottom: 10,
    borderRadius: 14,
    width: width - 32,
    alignSelf: 'center',
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
  vendidaTexto: { marginTop: 6, fontWeight: 'bold', color: '#7f1d1d' },
  botaoFixo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  resumoTexto: { color: '#e5e7eb', fontSize: 16 },
  totalTexto: {
    color: '#22c55e',
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 6,
  },
  botaoComprarFinal: {
    backgroundColor: '#16a34a',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  botaoTexto: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
