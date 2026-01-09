import { View, Text, ActivityIndicator, ScrollView, Pressable } from 'react-native';
import { useEffect, useState, useContext } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../services/firebase';
import { AuthContext } from '../contexts/AuthContext';

export default function DashboardFinanceiroMensal() {
  const { isAdmin } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState(null);

  const agora = new Date();
  const mesId = `${agora.getFullYear()}-${String(
    agora.getMonth() + 1
  ).padStart(2, '0')}`;

  useEffect(() => {
    if (!isAdmin) return;

    const ref = doc(db, 'FinanceiroMensal', mesId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        setDados(
          snap.exists()
            ? snap.data()
            : {
                faturamento: 0,
                premiosPagos: 0,
                saquesPagos: 0,
                lucro: 0,
              }
        );
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, [isAdmin]);

  async function exportarCSV() {
    const fn = httpsCallable(functions, 'exportarFinanceiroMensalCSV');
    const res = await fn({ mes: mesId });
    alert(res.data.csv); // ou enviar para backend/email
  }

  if (!isAdmin) return null;

  if (loading || !dados) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020617' }}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={{ color: '#cbd5f5' }}>Carregando financeiro...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0f172a', padding: 20 }}>
      <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 20 }}>
        📊 Financeiro Mensal
      </Text>

      <Box titulo="💰 Faturamento" valor={dados.faturamento} cor="#22c55e" />
      <Box titulo="🏆 Prêmios pagos" valor={dados.premiosPagos} cor="#e11d48" />
      <Box titulo="🏦 Saques pagos" valor={dados.saquesPagos} cor="#f97316" />
      <Box titulo="📈 Lucro líquido" valor={dados.lucro} cor="#38bdf8" />

      <Pressable
        onPress={exportarCSV}
        style={{
          marginTop: 30,
          backgroundColor: '#22c55e',
          padding: 16,
          borderRadius: 14,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#020617', fontWeight: 'bold' }}>
          📤 Gerar CSV (Admin)
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Box({ titulo, valor, cor }) {
  return (
    <View
      style={{
        backgroundColor: '#020617',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderLeftWidth: 5,
        borderLeftColor: cor,
      }}
    >
      <Text style={{ color: '#94a3b8' }}>{titulo}</Text>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>
        R$ {Number(valor || 0).toFixed(2)}
      </Text>
    </View>
  );
}
