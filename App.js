import { useContext } from "react";
import { View, ActivityIndicator } from "react-native";
import Routes from "./src/routes";
import { AuthProvider, AuthContext } from "./src/contexts/AuthContext";

function AppContent() {
  const { loading } = useContext(AuthContext);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // ❌ NÃO trava LGPD aqui
  // ❌ NÃO renderiza tela LGPD
  // ✅ Routes decide tudo
  return <Routes />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
