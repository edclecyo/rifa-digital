import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export default function MeusGanhos() {
  const { user } = useContext(AuthContext);

  const [saldo, setSaldo] = useState(0);
  const [historico, setHistorico] = useState([]);

  useEffect(() => {
    if (!user?.uid) return;

    const indicacaoRef = doc(db, 'Indicacoes', user.uid);

    const unsubIndicacao = onSnapshot(indicacaoRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      setSaldo(data.saldo || 0);

      if (data.historico) {
        const historicoOrdenado = [...data.historico].sort(
          (a, b) => b.timestamp?.seconds - a.timestamp?.seconds
        );
        setHistorico(historicoOrdenado);
      } else {
        setHistorico([]);
      }
    });

    return () => unsubIndicacao();
  }, [user?.uid]);

  return (
    <FlatList
      data={historico}
      keyExtractor={(item, index) =>
        item.timestamp?.seconds?.toString() || index.toString()
      }
      renderItem={({ item }) => (
        <View style={styles.itemHistorico}>
          <Text style={styles.itemNome}>
            Usuário indicado: {item.compradorNome || 'Anônimo'}
          </Text>
          <Text style={styles.itemValor}>+ R$ {item.valor.toFixed(2)}</Text>
          <Text style={styles.itemData}>
            {item.timestamp
              ? new Date(item.timestamp.seconds * 1000).toLocaleString()
              : ''}
          </Text>
        </View>
      )}
      ListHeaderComponent={
        <>

          <Text style={styles.titulo}>💰 Meus Ganhos</Text>

          <View style={styles.saldoContainer}>
            <Text style={styles.saldoLabel}>Saldo Total</Text>
            <Text style={styles.saldoValor}>R$ {saldo.toFixed(2)}</Text>
          </View>

          <Text style={styles.historicoTitulo}>Histórico de Indicações</Text>

          {historico.length === 0 && (
            <Text style={styles.semHistorico}>
              Você ainda não recebeu indicações.
            </Text>
          )}
        </>
      }
      contentContainerStyle={{ padding: 20, backgroundColor: '#1e293b' }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e293b' },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
  saldoContainer: {
    backgroundColor: '#0f172a',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 30,
  },
  saldoLabel: { color: '#94a3b8', fontSize: 16 },
  saldoValor: { color: '#22c55e', fontSize: 32, fontWeight: 'bold', marginTop: 5 },
  historicoTitulo: { fontSize: 22, fontWeight: 'bold', color: '#facc15', marginBottom: 10 },
  semHistorico: { color: '#cbd5f5', fontStyle: 'italic' },
  itemHistorico: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  itemNome: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  itemValor: { color: '#22c55e', fontSize: 16, marginTop: 4 },
  itemData: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
});
