import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useState, useContext } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../services/firebase";
import { AuthContext } from "../contexts/AuthContext";
import { useNavigation } from "@react-navigation/native";

export default function Login() {
  const { loading: authLoading } = useContext(AuthContext);
  const navigation = useNavigation();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [logando, setLogando] = useState(false);

  /* ===============================
     🔐 LOGIN
  ================================ */
  async function handleLogin() {
    if (!email || !senha) {
      Alert.alert("Erro", "Preencha email e senha.");
      return;
    }

    if (logando || authLoading) return;

    try {
      setLogando(true);

      await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        senha
      );

      // ✅ NÃO navega aqui
      // AuthContext decide:
      // - se falta LGPD → abre modal
      // - se está ok → AppRoutes
    } catch (err) {
      console.error("❌ Erro login:", err);

      let msg = "Erro ao entrar.";

      if (err.code === "auth/user-not-found")
        msg = "Usuário não encontrado.";
      else if (err.code === "auth/wrong-password")
        msg = "Senha incorreta.";
      else if (err.code === "auth/invalid-email")
        msg = "Email inválido.";
      else if (err.code === "auth/too-many-requests")
        msg = "Muitas tentativas. Tente mais tarde.";

      Alert.alert("Erro", msg);
    } finally {
      setLogando(false);
    }
  }

  /* ===============================
     🔑 ESQUECI SENHA
  ================================ */
  async function handleEsqueciSenha() {
    if (!email) {
      Alert.alert("Atenção", "Informe seu email.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      Alert.alert(
        "Email enviado",
        "Verifique sua caixa de entrada ou spam."
      );
    } catch (err) {
      console.error("❌ Reset senha:", err);
      Alert.alert(
        "Erro",
        "Não foi possível enviar o email de redefinição."
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Entrar</Text>

        <TextInput
          placeholder="Email"
          placeholderTextColor="#94a3b8"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />

        <TextInput
          placeholder="Senha"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          value={senha}
          onChangeText={setSenha}
          style={styles.input}
        />

        <Pressable onPress={handleEsqueciSenha}>
          <Text style={styles.forgot}>Esqueci minha senha</Text>
        </Pressable>

        <Pressable
          onPress={handleLogin}
          disabled={logando || authLoading}
          style={[
            styles.button,
            (logando || authLoading) && { opacity: 0.7 },
          ]}
        >
          {logando || authLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.navigate("Register")}>
          <Text style={styles.register}>Criar uma conta</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ===============================
   🎨 ESTILOS
================================ */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#020617",
    padding: 24,
    borderRadius: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 24,
    color: "#fff",
  },
  input: {
    backgroundColor: "#1e293b",
    color: "#fff",
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
    fontSize: 16,
  },
  forgot: {
    color: "#38bdf8",
    textAlign: "right",
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#2563eb",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  register: {
    textAlign: "center",
    color: "#38bdf8",
    marginTop: 18,
    fontSize: 15,
  },
});
