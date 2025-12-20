import { View, Text, Pressable } from 'react-native';
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
        justifyContent: 'space-between',
      }}
    >
      {/* Header */}
      <View style={{ marginTop: 40 }}>
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
          Painel de controle
        </Text>
      </View>

      {/* Cards */}
      <View>
        {/* 🔥 BOTÃO - Criar Cartelas (MODO CRIAR) */}
        <Pressable
          onPress={() =>
            navigation.navigate('CriarCartela', {
              modo: 'criar',
            })
          }
          style={{
            backgroundColor: '#9333ea',
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
            Criar Cartelas
          </Text>

          <Text
            style={{
              color: '#f3e8ff',
              fontSize: 14,
            }}
          >
            Gerar novas cartelas da rifa
          </Text>
        </Pressable>

        {/* EXISTENTE */}
        <Pressable
          onPress={() => navigation.navigate('AdminRifas')}
          style={{
            backgroundColor: '#2563eb',
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
            Gerenciar Rifas
          </Text>

          <Text
            style={{
              color: '#e0e7ff',
              fontSize: 14,
            }}
          >
            Criar, editar e encerrar rifas
          </Text>
        </Pressable>

        {/* EXISTENTE */}
        <Pressable
          onPress={() => navigation.navigate('AdminUsuarios')}
          style={{
            backgroundColor: '#16a34a',
            padding: 22,
            borderRadius: 16,
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
            Usuários
          </Text>

          <Text
            style={{
              color: '#dcfce7',
              fontSize: 14,
            }}
          >
            Visualizar e gerenciar usuários
          </Text>
        </Pressable>
      </View>

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
