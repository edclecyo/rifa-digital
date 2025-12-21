import { View, Text, Pressable } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export default function CustomDrawer(props) {
  const { profile, logout } = useContext(AuthContext);

  return (
    <DrawerContentScrollView {...props}>
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
          👤 {profile?.nome}
        </Text>
      </View>

      <Pressable onPress={() => props.navigation.navigate('PerfilUser')}>
        <Text style={{ padding: 15 }}>👤 Perfil</Text>
      </Pressable>

      <Pressable onPress={() => props.navigation.navigate('Configuracoes')}>
        <Text style={{ padding: 15 }}>⚙️ Configurações</Text>
      </Pressable>

      <Pressable onPress={() => props.navigation.navigate('SobreUser')}>
        <Text style={{ padding: 15 }}>ℹ️ Sobre</Text>
      </Pressable>

      <Pressable onPress={logout}>
        <Text style={{ padding: 15, color: 'red' }}>🚪 Sair</Text>
      </Pressable>
    </DrawerContentScrollView>
  );
}
