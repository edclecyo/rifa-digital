import { useContext } from "react";
import { NavigationContainer } from "@react-navigation/native";

import { AuthContext } from "../contexts/AuthContext";
import AuthRoutes from "./AuthRoutes";
import AppRoutes from "./AppRoutes";
import AdminRoutes from "./AdminRoutes";
import LGPDModal from "../components/LGPDModal";

export default function Routes() {
  const { user, loading, isAdmin, lgpdPendente } = useContext(AuthContext);

  if (loading) return null;

  return (
    <>
      <NavigationContainer>
        {!user && <AuthRoutes />}
        {user && !isAdmin && <AppRoutes />}
        {user && isAdmin && <AdminRoutes />}
      </NavigationContainer>

      {/* 🔒 LGPD SEMPRE POR CIMA */}
     <LGPDModal
  visible={lgpdPendente === true}
  onAceito={async () => {
    await refreshLgpd(); // 🔥 atualiza do Firestore
  }}
/>
    </>
  );
}
