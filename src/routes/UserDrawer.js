import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
} from '@react-navigation/drawer';
import { View, Text, Image } from 'react-native';
import { useContext } from 'react';

import HomeUser from '../screens/HomeUser';
import EscolherCartelas from '../screens/EscolherCartelas';
import MinhasCartelas from '../screens/MinhasCartelas';
import PerfilUser from '../screens/PerfilUser';
import ConfigUser from '../screens/ConfigUser';
import SobreUser from '../screens/SobreUser';
import RankingPublico from '../screens/RankingPublico';
import HistoricoPagamentos from '../screens/HistoricoPagamentos';
import InboxNotificacoes from '../screens/InboxNotificacoes';
import MeusGanhos from '../screens/MeusGanhos'; // 🔹 ADICIONADO
import HistoricoCartelas from '../screens/HistoricoCartelas'; // 🔹 ADICIONADO
import { AuthContext } from '../contexts/AuthContext';

const Drawer = createDrawerNavigator();

/* =======================
   DRAWER PERSONALIZADO
======================= */
function CustomDrawer(props) {
  const { user, profile, logout } = useContext(AuthContext);

  return (
    <DrawerContentScrollView {...props}>
      <View
        style={{
          padding: 20,
          backgroundColor: '#0f172a',
          marginBottom: 10,
        }}
      >
        <Image
          source={{
            uri:
              profile?.foto ||
              `https://ui-avatars.com/api/?name=${profile?.nome || 'User'}`,
          }}
          style={{
            width: 70,
            height: 70,
            borderRadius: 35,
            marginBottom: 10,
          }}
        />

        <Text style={{ color: '#fff', fontSize: 16 }}>
          {profile?.nome || 'Usuário'}
        </Text>

        <Text style={{ color: '#94a3b8', fontSize: 13 }}>
          {user?.email}
        </Text>
      </View>

      <DrawerItem
        label="Início"
        onPress={() => props.navigation.navigate('HomeUser')}
      />
      <DrawerItem
        label="Perfil"
        onPress={() => props.navigation.navigate('PerfilUser')}
      />
      <DrawerItem
        label="📥 Notificações"
        onPress={() => props.navigation.navigate('InboxNotificacoes')}
      />
	  <DrawerItem
        label=" 🎟️ Historico de Cartelas"
        onPress={() => props.navigation.navigate('HistoricoCartelas')}
      />
      <DrawerItem
        label="💳 Histórico de Pagamentos"
        onPress={() => props.navigation.navigate('HistoricoPagamentos')}
      />
      <DrawerItem
        label="💰 Meus Ganhos"
        onPress={() => props.navigation.navigate('MeusGanhos')} // 🔹 ADICIONADO
      />
      <DrawerItem
        label="🏆 Ranking"
        onPress={() => props.navigation.navigate('RankingPublico')}
      />
      <DrawerItem
        label="Configurações"
        onPress={() => props.navigation.navigate('ConfigUser')}
      />
      <DrawerItem
        label="Sobre"
        onPress={() => props.navigation.navigate('SobreUser')}
      />

      <DrawerItem
        label="Sair"
        onPress={logout}
        labelStyle={{ color: '#dc2626' }}
      />
    </DrawerContentScrollView>
  );
}

/* =======================
   DRAWER PRINCIPAL
======================= */
export default function UserDrawer() {
  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: '#fff',
          width: 280,
        },
      }}
      drawerContent={(props) => <CustomDrawer {...props} />}
    >
      <Drawer.Screen name="HomeUser" component={HomeUser} />
      <Drawer.Screen name="EscolherCartelas" component={EscolherCartelas} />
      <Drawer.Screen name="MinhasCartelas" component={MinhasCartelas} />
      <Drawer.Screen name="PerfilUser" component={PerfilUser} />
      <Drawer.Screen name="ConfigUser" component={ConfigUser} />
      <Drawer.Screen name="SobreUser" component={SobreUser} />
      <Drawer.Screen name="InboxNotificacoes" component={InboxNotificacoes} />
      <Drawer.Screen name="RankingPublico" component={RankingPublico} />
	  <Drawer.Screen name="HistoricoCartelas" component={HistoricoCartelas} />
      <Drawer.Screen
        name="HistoricoPagamentos"
        component={HistoricoPagamentos}
      />
      <Drawer.Screen
        name="MeusGanhos" // 🔹 ADICIONADO
        component={MeusGanhos}
      />
    </Drawer.Navigator>
  );
}
