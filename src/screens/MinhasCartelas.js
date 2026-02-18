import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useContext, useEffect, useState, useRef } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export default function MinhasCartelas() {
  const { user } = useContext(AuthContext);

  const [cartelas, setCartelas] = useState([]);
  const [status, setStatus] = useState('Carregando...');
  const [loading, setLoading] = useState(true);

  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    if (!user?.uid) {
      setCartelas([]);
      setStatus('Usuário não autenticado');
      setLoading(false);
      return;
    }

    // 🔹 coleção correta
    const ref = collection(db, 'UsuariosPrivado', user.uid, 'HistoricoCartelas');

    const unsubscribe = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        if (!mounted.current) return;

        try {
          // 🔒 ignora somente cache vazio
          const docs = snap.docs;

          if (!docs.length) {
            setCartelas([]);
            setStatus('Nenhuma cartela encontrada');
            setLoading(false);
            return;
          }

          const lista = docs
            .map((docSnap) => {
              const d = docSnap.data() || {};

              return {
                id: docSnap.id,
                codigo: d.codigo || docSnap.id,
                numeros: Array.isArray(d.numeros) ? d.numeros : [],
                valor: Number(d.valor) || 2.5,
                userNome: d.userNome || 'Usuário',
                compradaEm: d.compradaEm || null,
              };
            })
            // 📊 ordenação segura
            .sort(
              (a, b) =>
                (b.compradaEm?.toMillis?.() || 0) -
                (a.compradaEm?.toMillis?.() || 0)
            );

          setCartelas(lista);
          setStatus(`✅ ${lista.length} cartela(s) carregada(s)`);
        } catch (err) {
          console.log('Erro ao processar cartelas:', err);
          setCartelas([]);
          setStatus('Erro ao carregar cartelas');
        }

        setLoading(false);
      },
      (error) => {
        console.log('Erro ao buscar cartelas:', error);
        setCartelas([]);
        setStatus('Erro ao carregar cartelas');
        setLoading(false);
      }
    );

    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [user?.uid]);

  function formatarData(timestamp) {
    if (!timestamp?.toDate) return '—';
    return timestamp.toDate().toLocaleString('pt-BR');
  }

  /* ================= LOADING ================= */
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#f3f4f6',
        }}
      >
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={{ marginTop: 10, color: '#6b7280' }}>
          Carregando suas cartelas...
        </Text>
      </View>
    );
  }

  /* ================= TELA ================= */
  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: '#f3f4f6' }}>
      <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 6 }}>
        🎟️ Minhas Cartelas
      </Text>

      <Text style={{ color: '#6b7280', marginBottom: 12 }}>{status}</Text>

      <FlatList
        data={cartelas}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={() => (
          <Text
            style={{
              textAlign: 'center',
              marginTop: 40,
              color: '#6b7280',
            }}
          >
            Você ainda não comprou nenhuma cartela
          </Text>
        )}
        renderItem={({ item }) => (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#e5e7eb',
              borderRadius: 12,
              padding: 15,
              marginBottom: 12,
              backgroundColor: '#ffffff',
            }}
          >
            <Text
              style={{
                fontWeight: 'bold',
                fontSize: 16,
                marginBottom: 6,
              }}
            >
              🎟️ Cartela #{item.codigo}
            </Text>

            <Text style={{ marginBottom: 4 }}>
              🔢 Números:{' '}
              {item.numeros.length ? item.numeros.join(' - ') : '—'}
            </Text>

            <Text style={{ marginBottom: 4 }}>
              💰 Valor: R$ {item.valor.toFixed(2)}
            </Text>

            <Text style={{ marginBottom: 4 }}>
              👤 Comprador: {item.userNome}
            </Text>

            {item.compradaEm && (
              <Text style={{ marginBottom: 6 }}>
                🕒 Comprada em: {formatarData(item.compradaEm)}
              </Text>
            )}

            <Text style={{ color: '#16a34a', fontWeight: 'bold' }}>
              ✅ Comprada
            </Text>
          </View>
        )}
      />
    </View>
  );
}
