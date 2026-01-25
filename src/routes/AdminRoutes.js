import { createNativeStackNavigator } from "@react-navigation/native-stack";

/* ===============================
   📌 TELAS PRINCIPAIS
================================ */
import HomeAdmin from "../screens/HomeAdmin";
import AdminDashboard from "../screens/AdminDashboard";
import AdminDashboardRodada from "../screens/AdminDashboardRodada";
import DashboardFinanceiroMensal from "../screens/DashboardFinanceiroMensal";

/* ===============================
   🎟️ RIFAS
================================ */
import AdminRifas from "../screens/AdminRifas";
import CriarCartela from "../screens/CriarCartela";
import StatusSorteio from "../screens/StatusSorteio";
import HistoricoSorteios from "../screens/HistoricoSorteios";

/* ===============================
   👥 USUÁRIOS & PAGAMENTOS
================================ */
import AdminUsuarios from "../screens/AdminUsuarios";
import RankingCompradores from "../screens/RankingCompradores";
import AdminPagamentos from "../screens/AdminPagamentos";

/* ===============================
   🧠 COMPLIANCE / SEGURANÇA
================================ */
import AntifraudeAdmin from "../screens/AntifraudeAdmin";
import AdminCompliance from "../screens/AdminCompliance";

/* ===============================
   ⚖️ LGPD / JURÍDICO
================================ */
import AdminLGPD from "../screens/AdminLGPD";
import AuditoriaLGPD from "../screens/AuditoriaLGPD";

/* ===============================
   📢 PROMOÇÕES
================================ */
import AdminPromocaoHome from "../screens/AdminPromocaoHome";

const Stack = createNativeStackNavigator();

export default function AdminRoutes() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerTitleAlign: "center",
      }}
    >
      {/* 🏠 HOME */}
      <Stack.Screen
        name="HomeAdmin"
        component={HomeAdmin}
        options={{ title: "Painel Admin" }}
      />

      {/* 📊 DASHBOARDS */}
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboard}
        options={{ title: "Dashboard Geral" }}
      />
      <Stack.Screen
        name="AdminDashboardRodada"
        component={AdminDashboardRodada}
        options={{ title: "Dashboard da Rodada" }}
      />
      <Stack.Screen
        name="DashboardFinanceiroMensal"
        component={DashboardFinanceiroMensal}
        options={{ title: "Financeiro Mensal" }}
      />

      {/* 🎟️ RIFAS */}
      <Stack.Screen
        name="AdminRifas"
        component={AdminRifas}
        options={{ title: "Gerenciar Rifas" }}
      />
      <Stack.Screen
        name="CriarCartela"
        component={CriarCartela}
        options={{ title: "Criar Cartelas" }}
      />
      <Stack.Screen
        name="StatusSorteio"
        component={StatusSorteio}
        options={{ title: "Status do Sorteio" }}
      />
      <Stack.Screen
        name="HistoricoSorteios"
        component={HistoricoSorteios}
        options={{ title: "Histórico de Sorteios" }}
      />

      {/* 👥 USUÁRIOS */}
      <Stack.Screen
        name="AdminUsuarios"
        component={AdminUsuarios}
        options={{ title: "Usuários" }}
      />
      <Stack.Screen
        name="RankingCompradores"
        component={RankingCompradores}
        options={{ title: "Ranking de Compradores" }}
      />

      {/* 💳 PAGAMENTOS */}
      <Stack.Screen
        name="AdminPagamentos"
        component={AdminPagamentos}
        options={{ title: "Pagamentos" }}
      />

      {/* 🧠 SEGURANÇA */}
      <Stack.Screen
        name="AntifraudeAdmin"
        component={AntifraudeAdmin}
        options={{ title: "Antifraude" }}
      />

      {/* ⚖️ COMPLIANCE */}
      <Stack.Screen
        name="AdminCompliance"
        component={AdminCompliance}
        options={{ title: "Compliance & Legal" }}
      />

      {/* 📄 LGPD */}
      <Stack.Screen
        name="AdminLGPD"
        component={AdminLGPD}
        options={{ title: "Termos LGPD" }}
      />
      <Stack.Screen
        name="AuditoriaLGPD"
        component={AuditoriaLGPD}
        options={{ title: "Auditoria LGPD" }}
      />

      {/* 📢 PROMOÇÕES */}
      <Stack.Screen
        name="AdminPromocaoHome"
        component={AdminPromocaoHome}
        options={{ title: "Promoções Home" }}
      />
    </Stack.Navigator>
  );
}
