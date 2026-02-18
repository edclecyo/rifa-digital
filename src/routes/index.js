import { useContext, useMemo } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { View, ActivityIndicator } from "react-native";

import { AuthContext } from "../contexts/AuthContext";
import RootNavigator from "./RootNavigator";
import LGPDModal from "../components/LGPDModal";

export default function Routes() {
  const { user, loading, isAdmin, lgpdPendente, refreshLgpd } =
    useContext(AuthContext);

  const linking = useMemo(
    () => ({
      prefixes: [
        "rifadigital://",
        "https://rifa-digital-f6425.web.app",
      ],
      config: {
        screens: {
          Registrar: "register",
        },
      },
    }),
    []
  );

  /* ===============================
     ⏳ LOADING GLOBAL
  =============================== */
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  /* ===============================
     🔒 BLOQUEIO LGPD (ANTES DO NAV)
  =============================== */
  if (user && lgpdPendente) {
    return (
      <LGPDModal
        visible
        onAceito={async () => {
          if (user?.uid) {
            await refreshLgpd(user.uid);
          }
        }}
      />
    );
  }

  /* ===============================
     🚀 NAVEGAÇÃO NORMAL
  =============================== */
  return (
    <NavigationContainer linking={linking}>
      <RootNavigator user={user} isAdmin={isAdmin} />
    </NavigationContainer>
  );
}
