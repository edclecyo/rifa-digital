import { View, Text, ScrollView } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import {
  doc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';

export default function AdminDashboardRodada() {
  const [status, setStatus] = useState(null);
  const [rodadas, setRodadas] = useState([]);
  const [alertas, setAlertas] = useState([]);

  /* ===============================
     STATUS ATUAL
  ================================ */
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'StatusSorteio', 'geral'),
      async snap => {
        if (!snap.exists()) return;

        const data = snap.data();
        setStatus(data);
        validarInconsistencias(data);
      }
    );

    return unsub;
  }, []);

  /* ===============================
     HISTÓRICO
  ================================ */
  useEffect(() => {
    const q = query(
      collection(db, 'Rodadas'),
      orderBy('rodada', 'desc'),
      limit(10)
    );

    const unsub = onSnapshot(q, snap => {
      setRodadas(
        snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
        }))
      );
    });

    return unsub;
  }, []);

  /* ===============================
     🔍 VALIDAÇÃO ANTIFRAUDE
  ================================ */
  async function validarInconsistencias(status) {
    const problemas = [];

    // 1️⃣ Status fechado sem sorteio
    if (status.status === 'fechado') {
      const sorteioSnap = await getDocs(
        query(collection(db, 'Sorteios'))
      );

      const existe = sorteioSnap.docs.some(
        d => d.data().rodada === status.rodada
      );

      if (!existe) {
        problemas.push('⚠️ Rodada fechada sem sorteio gerado');
      }
    }

    // 2️⃣ Cartelas inconsistentes
    if (
      status.sorteioLiberado &&
      status.cartelasVendidas < status.metaAtual
    ) {
      problemas.push('⚠️ Sorteio liberado com cartelas insuficientes');
    }

    // 3️⃣ Prêmio inválido
    if (!status.premioAtual || status.premioAtual <= 0) {
      problemas.push('⚠️ Prêmio inválido');
    }

    // 4️⃣ Rodada sem registro
    const rodadaSnap = await getDocs(
      query(collection(db, 'Rodadas'))
    );

    const rodadaExiste = rodadaSnap.docs.some(
      d => d.data().rodada === status.rodada
    );

    if (status.status === 'fechado' && !rodadaExiste) {
      problemas.push('⚠️ Rodada fechada sem registro em Rodadas');
    }

    setAlertas(problemas);
  }

  function nivelCor(nivel) {
    if (nivel === 'vermelho') return '#dc2626';
    if (nivel === 'verde') return '#16a34a';
    if (nivel === 'dourado') return '#facc15';
    return '#475569';
  }

  if (!status) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0f172a', padding: 20 }}>
      <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#fff' }}>
        🛡️ Dashboard Antifraude
      </Text>

      {/* STATUS ATUAL */}
      <View
        style={{
          backgroundColor: nivelCor(status.nivel),
          padding: 18,
          borderRadius: 16,
          marginVertical: 20,
        }}
      >
        <Text style={{ color: '#020617', fontWeight: 'bold', fontSize: 18 }}>
          🎰 Rodada {status.rodada}
        </Text>

        <Text style={{ color: '#020617', marginTop: 6 }}>
          🎟️ {status.cartelasVendidas} / {status.metaAtual} cartelas
        </Text>

        <Text style={{ color: '#020617', marginTop: 6 }}>
          💰 Prêmio: R$ {status.premioAtual?.toFixed(2)}
        </Text>

        <Text style={{ color: '#020617', marginTop: 6, fontWeight: 'bold' }}>
          🔔 Status: {status.status?.toUpperCase()}
        </Text>
      </View>

      {/* ALERTAS */}
      {alertas.length > 0 && (
        <View
          style={{
            backgroundColor: '#7f1d1d',
            padding: 16,
            borderRadius: 14,
            marginBottom: 20,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', marginBottom: 6 }}>
            🚨 ALERTAS DE INCONSISTÊNCIA
          </Text>

          {alertas.map((a, i) => (
            <Text key={i} style={{ color: '#fecaca', marginTop: 4 }}>
              {a}
            </Text>
          ))}
        </View>
      )}

      {/* HISTÓRICO */}
      <Text
        style={{
          color: '#fff',
          fontSize: 20,
          fontWeight: 'bold',
          marginBottom: 12,
        }}
      >
        📊 Últimas Rodadas
      </Text>

      {rodadas.map(r => (
        <View
          key={r.id}
          style={{
            backgroundColor: '#1e293b',
            padding: 16,
            borderRadius: 14,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>
            🎰 Rodada {r.rodada}
          </Text>

          <Text style={{ color: '#cbd5f5', marginTop: 4 }}>
            💰 Prêmio: R$ {r.premio?.toFixed(2)}
          </Text>

          <Text style={{ color: '#16a34a', marginTop: 6 }}>
            FINALIZADA
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
