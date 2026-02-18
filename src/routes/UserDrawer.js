import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
} from "@react-navigation/drawer";
import { View, Text, Image } from "react-native";
import { useContext } from "react";

import HomeUser from "../screens/HomeUser";
import MinhasCartelas from "../screens/MinhasCartelas";
import PerfilUser from "../screens/PerfilUser";
import ConfigUser from "../screens/ConfigUser";
import SobreUser from "../screens/SobreUser";
import RankingPublico from "../screens/RankingPublico";
import HistoricoPagamentos from "../screens/HistoricoPagamentos";
import InboxNotificacoes from "../screens/InboxNotificacoes";
import MeusGanhos from "../screens/MeusGanhos";
import HistoricoCartelas from "../screens/HistoricoCartelas";
import { AuthContext } from "../contexts/AuthContext";
import Carteira from "../screens/Carteira";
import Sacar from "../screens/Sacar";
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
          backgroundColor: "#0f172a",
          marginBottom: 10,
        }}
      >
        <Image
          source={{
            uri:
              profile?.foto ||
              `https://ui-avatars.com/api/?name=${profile?.nome || "User"}`,
          }}
          style={{
            width: 70,
            height: 70,
            borderRadius: 35,
            marginBottom: 10,
          }}
        />

        <Text style={{ color: "#fff", fontSize: 16 }}>
          {profile?.nome || "Usuário"}
        </Text>

        <Text style={{ color: "#94a3b8", fontSize: 13 }}>
          {user?.email}
        </Text>
      </View>

      {/* 🔑 SEMPRE jumpTo dentro do Drawer */}
      <DrawerItem label="🏠 Início" onPress={() => props.navigation.jumpTo("Home")} />
      <DrawerItem label="👤 Perfil" onPress={() => props.navigation.jumpTo("Perfil")} />
      <DrawerItem
        label="📥 Notificações"
        onPress={() => props.navigation.jumpTo("InboxNotificacoes")}
      />
      <DrawerItem
        label="💳 Carteira"
        onPress={() => props.navigation.jumpTo("Carteira")}
      />
	  <DrawerItem
        label="🎟️ Histórico de Cartelas"
        onPress={() => props.navigation.jumpTo("HistoricoCartelas")}
      />
      <DrawerItem
        label="💳 Histórico de Pagamentos"
        onPress={() => props.navigation.jumpTo("HistoricoPagamentos")}
      />
      <DrawerItem
        label="💰 Meus Ganhos"
        onPress={() => props.navigation.jumpTo("MeusGanhos")}
      />
      <DrawerItem
        label="🏆 Ranking"
        onPress={() => props.navigation.jumpTo("RankingPublico")}
      />
      <DrawerItem
        label="⚙️ Configurações"
        onPress={() => props.navigation.jumpTo("Config")}
      />
      <DrawerItem
        label="ℹ️ Sobre"
        onPress={() => props.navigation.jumpTo("Sobre")}
      />

      <DrawerItem
        label="🚪 Sair"
        onPress={logout}
        labelStyle={{ color: "#dc2626" }}
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
          backgroundColor: "#fff",
          width: 280,
        },
      }}
      drawerContent={(props) => <CustomDrawer {...props} />}
    >
      <Drawer.Screen name="Home" component={HomeUser} />
      <Drawer.Screen name="MinhasCartelas" component={MinhasCartelas} />
      <Drawer.Screen name="Perfil" component={PerfilUser} />
      <Drawer.Screen name="Config" component={ConfigUser} />
      <Drawer.Screen name="Sobre" component={SobreUser} />
      <Drawer.Screen name="InboxNotificacoes" component={InboxNotificacoes} />
      <Drawer.Screen name="RankingPublico" component={RankingPublico} />
      <Drawer.Screen name="HistoricoCartelas" component={HistoricoCartelas} />
      <Drawer.Screen name="Carteira" component={Carteira} />
	  <Drawer.Screen name="Sacar" component={Sacar} />
	  <Drawer.Screen
        name="HistoricoPagamentos"
        component={HistoricoPagamentos}
      />
      <Drawer.Screen name="MeusGanhos" component={MeusGanhos} />
    </Drawer.Navigator>
  );
}
