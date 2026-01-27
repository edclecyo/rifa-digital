import { useContext } from "react";
import { NavigationContainer } from "@react-navigation/native";
import * as Linking from "expo-linking";

import { AuthContext } from "../contexts/AuthContext";
import AuthRoutes from "./AuthRoutes";
import AppRoutes from "./AppRoutes";
import AdminRoutes from "./AdminRoutes";
import LGPDModal from "../components/LGPDModal";

/* 🔗 CONFIGURAÇÃO DE DEEP LINK */
const linking = {
  prefixes: ["rifa-digital--rifa-digital-f6425.us-central1.hosted.app"],
  config: {
    screens: {
      Registrar: {
        path: "register",
        parse: {
          codigo: (codigo) => codigo,
        },
      },
    },
  },
};

export default function Routes() {
  const { user, loading, isAdmin, lgpdPendente, refreshLgpd } =
    useContext(AuthContext);

  if (loading) return null;

  return (
    <>
       {/* 🔗 LINKING AQUI */}
      <NavigationContainer linking={linking}>
        {!user && <AuthRoutes />}
        {user && !isAdmin && <AppRoutes />}
        {user && isAdmin && <AdminRoutes />}
      </NavigationContainer>

      {/* 🔒 LGPD SEMPRE POR CIMA */}
      <LGPDModal
        visible={lgpdPendente === true}
        onAceito={async () => {
          if (user?.uid) {
            await refreshLgpd(user.uid);
          }
        }}
      />
    </>
  );
}
