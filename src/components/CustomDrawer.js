import { View, Text, Pressable } from "react-native";
import { DrawerContentScrollView } from "@react-navigation/drawer";
import { useContext } from "react";
import { AuthContext } from "../contexts/AuthContext";

export default function CustomDrawer(props) {
  const { profile, logout } = useContext(AuthContext);

  return (
    <DrawerContentScrollView {...props}>
      {/* HEADER */}
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold" }}>
          👤 {profile?.nome || "Usuário"}
        </Text>
      </View>

      {/* ITENS DO MENU */}
      <Pressable onPress={() => props.navigation.jumpTo("Perfil")}>
        <Text style={{ padding: 15 }}>👤 Perfil</Text>
      </Pressable>

      <Pressable onPress={() => props.navigation.jumpTo("Config")}>
        <Text style={{ padding: 15 }}>⚙️ Configurações</Text>
      </Pressable>

      <Pressable onPress={() => props.navigation.jumpTo("Sobre")}>
        <Text style={{ padding: 15 }}>ℹ️ Sobre</Text>
      </Pressable>

      {/* SAIR */}
      <Pressable onPress={logout}>
        <Text style={{ padding: 15, color: "red" }}>🚪 Sair</Text>
      </Pressable>
    </DrawerContentScrollView>
  );
}
