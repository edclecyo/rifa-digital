// routes/RootNavigator.js
import AuthRoutes from "./AuthRoutes";
import AppRoutes from "./AppRoutes";
import AdminRoutes from "./AdminRoutes";

export default function RootNavigator({ user, isAdmin }) {
  /* ===============================
     🔐 NÃO LOGADO
  =============================== */
  if (!user) {
    return <AuthRoutes />;
  }

  /* ===============================
     👑 ADMIN
  =============================== */
  if (isAdmin) {
    return <AdminRoutes />;
  }

  /* ===============================
     👤 USUÁRIO COMUM
  =============================== */
  return <AppRoutes />;
}
