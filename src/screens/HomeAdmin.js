import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useContext, useEffect } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export default function HomeAdmin({ navigation }) {
  const { logout, loading, isAdmin } = useContext(AuthContext);

  // 🔐 PROTEÇÃO ABSOLUTA — TOKEN ADMIN
  useEffect(() => {
    if (!loading && !isAdmin) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    }
  }, [loading, isAdmin]);

  // ⏳ Enquanto valida token
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#020617',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color="#9333ea" />
        <Text style={{ color: '#cbd5f5', marginTop: 12 }}>
          Validando acesso admin...
        </Text>
      </View>
    );
  }

  // ❌ NÃO ADMIN
  if (!isAdmin) return null;

  // ✅ ADMIN CONFIRMADO
  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a', padding: 20 }}>
      {/* Header */}
      <View style={{ marginTop: 40, marginBottom: 20 }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#fff' }}>
          👑 Área Administrativa
        </Text>

        <Text style={{ marginTop: 6, fontSize: 16, color: '#cbd5f5' }}>
          Painel de controle do sistema
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 🔥 Criar Cartelas */}
        <Pressable
          onPress={() => navigation.navigate('CriarCartela', { modo: 'criar' })}
          style={{
            backgroundColor: '#9333ea',
            padding: 22,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
            Criar Cartelas
          </Text>
          <Text style={{ color: '#f3e8ff', marginTop: 4 }}>
            Gerar novas cartelas da rifa
          </Text>
        </Pressable>

        {/* 🎯 Promoções */}
        <Pressable
          onPress={() => navigation.navigate('AdminPromocaoHome')}
          style={{
            backgroundColor: '#facc15',
            padding: 22,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#020617', fontSize: 18, fontWeight: 'bold' }}>
            🎯 Promoções (Home)
          </Text>
          <Text style={{ color: '#713f12', marginTop: 4 }}>
            Banner, prêmio, contador e CTA
          </Text>
        </Pressable>

        {/* 🎯 Dashboard por Rodada */}
        <Pressable
          onPress={() => navigation.navigate('AdminDashboardRodada')}
          style={{
            backgroundColor: '#64748b',
            padding: 22,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
            🎯 Dashboard por Rodada
          </Text>
        </Pressable>

        {/* 💰 NOVO — Dashboard Financeiro Mensal */}
        <Pressable
          onPress={() => navigation.navigate('DashboardFinanceiroMensal')}
          style={{
            backgroundColor: '#22c55e',
            padding: 22,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#022c22', fontSize: 18, fontWeight: 'bold' }}>
            💰 Dashboard Financeiro Mensal
          </Text>
          <Text style={{ color: '#064e3b', marginTop: 4 }}>
            Entradas, saídas, lucro e Pix
          </Text>
        </Pressable>

        {/* 📊 Dashboard Geral */}
        <Pressable
          onPress={() => navigation.navigate('AdminDashboard')}
          style={{
            backgroundColor: '#0ea5e9',
            padding: 22,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
            Dashboard Geral
          </Text>
          <Text style={{ color: '#e0f2fe', marginTop: 4 }}>
            Métricas e desempenho
          </Text>
        </Pressable>

        {/* 🏆 Histórico Sorteios */}
        <Pressable
          onPress={() => navigation.navigate('HistoricoSorteios')}
          style={{
            backgroundColor: '#9333ea',
            padding: 22,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
            🏆 Histórico de Sorteios
          </Text>
        </Pressable>

        {/* 📡 Status Sorteios */}
        <Pressable
          onPress={() => navigation.navigate('StatusSorteio')}
          style={{
            backgroundColor: '#16a34a',
            padding: 22,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
            Status de Sorteios
          </Text>
          <Text style={{ color: '#dcfce7', marginTop: 4 }}>
            Acompanhamento em tempo real
          </Text>
        </Pressable>

        {/* 💳 Pagamentos */}
        <Pressable
          onPress={() => navigation.navigate('AdminPagamentos')}
          style={{
            backgroundColor: '#f59e0b',
            padding: 22,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
            Pagamentos
          </Text>
          <Text style={{ color: '#fef3c7', marginTop: 4 }}>
            Histórico financeiro
          </Text>
        </Pressable>
      </ScrollView>

      {/* Footer */}
      <View>
        <Text style={{ textAlign: 'center', color: '#94a3b8', marginBottom: 12 }}>
          Acesso restrito 🔐 (Admin confirmado)
        </Text>

        <Pressable
          onPress={logout}
          style={{
            backgroundColor: '#dc2626',
            padding: 14,
            borderRadius: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
            Sair da Conta
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
