import { View, Text, Pressable, ScrollView } from 'react-native';
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export default function HomeAdmin({ navigation }) {
  const { logout } = useContext(AuthContext);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0f172a',
        padding: 20,
      }}
    >
      {/* Header */}
      <View style={{ marginTop: 40, marginBottom: 20 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: 'bold',
            color: '#fff',
          }}
        >
          👑 Área Administrativa
        </Text>

        <Text
          style={{
            marginTop: 6,
            fontSize: 16,
            color: '#cbd5f5',
          }}
        >
          Painel de controle do sistema
        </Text>
      </View>

      {/* Cards */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 🔥 Criar Cartelas */}
        <Pressable
          onPress={() =>
            navigation.navigate('CriarCartela', { modo: 'criar' })
          }
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

        {/* 📊 Dashboard */}
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
            Dashboard
          </Text>
          <Text style={{ color: '#e0f2fe', marginTop: 4 }}>
            Métricas e desempenho
          </Text>
        </Pressable>

        {/* 🎯 Gerenciar Rifas */}
        <Pressable
          onPress={() => navigation.navigate('AdminRifas')}
          style={{
            backgroundColor: '#2563eb',
            padding: 22,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
            Gerenciar Rifas
          </Text>
          <Text style={{ color: '#e0e7ff', marginTop: 4 }}>
            Criar, editar e encerrar rifas
          </Text>
        </Pressable>

        {/* 👥 Usuários */}
        <Pressable
          onPress={() => navigation.navigate('AdminUsuarios')}
          style={{
            backgroundColor: '#16a34a',
            padding: 22,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
            Usuários
          </Text>
          <Text style={{ color: '#dcfce7', marginTop: 4 }}>
            Visualizar e gerenciar usuários
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
<Pressable
  onPress={() => navigation.navigate('RankingCompradores')}
  style={{
    backgroundColor: '#f59e0b',
    padding: 22,
    borderRadius: 16,
    marginBottom: 20,
    elevation: 4,
  }}
>
  <Text
    style={{
      color: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 4,
    }}
  >
    🏆 Ranking de Compradores
  </Text>

  <Text style={{ color: '#fef3c7', fontSize: 14 }}>
    Veja quem mais comprou cartelas
  </Text>
</Pressable>

        {/* 🔔 Notificações */}
        <Pressable
          onPress={() => navigation.navigate('AdminNotificacoes')}
          style={{
            backgroundColor: '#ec4899',
            padding: 22,
            borderRadius: 16,
            marginBottom: 30,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
            Notificações
          </Text>
          <Text style={{ color: '#fce7f3', marginTop: 4 }}>
            Enviar avisos aos usuários
          </Text>
        </Pressable>
      </ScrollView>

      {/* Footer + Logout */}
      <View>
        <Text
          style={{
            textAlign: 'center',
            color: '#94a3b8',
            marginBottom: 12,
          }}
        >
          Acesso restrito 🔐
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
          <Text
            style={{
              color: '#fff',
              fontWeight: 'bold',
              fontSize: 16,
            }}
          >
            Sair da Conta
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
