import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../services/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useRoute } from "@react-navigation/native";

export default function Register() {
  const route = useRoute();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigoConvite, setCodigoConvite] = useState("");
  const [loading, setLoading] = useState(false);

  /* 🔗 CAPTURA CÓDIGO DO DEEP LINK */
  useEffect(() => {
    if (route.params?.codigo) {
      setCodigoConvite(route.params.codigo);
    }
  }, [route.params]);

  async function handleRegister() {
    if (!nome || !email || !senha) {
      Alert.alert("Erro", "Preencha todos os campos.");
      return;
    }

    setLoading(true);

    try {
      /* 🔐 CRIA USUÁRIO */
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        senha
      );

      const user = cred.user;

      /* 👤 DISPLAY NAME */
      await updateProfile(user, { displayName: nome });

      /* 📄 USUÁRIO PÚBLICO */
      await setDoc(doc(db, "Usuarios", user.uid), {
        uid: user.uid,
        nome,
        email: user.email,
        tipo: "user",
        criadoEm: serverTimestamp(),

        // 🔗 CONVITE
        codigoConvite: codigoConvite || null,
        conviteValidado: false,

        compartilhamento: {
          codigo: null,
          uso: 0,
        },
      });

      /* 🔒 USUÁRIO PRIVADO */
      await setDoc(
        doc(db, "UsuariosPrivado", user.uid),
        {
          criadoEm: serverTimestamp(),
          bloqueado: false,
          scoreAntifraude: 0,
        },
        { merge: true }
      );

      Alert.alert("Sucesso", "Conta criada com sucesso!");
    } catch (err) {
      console.error("❌ Erro ao criar conta:", err);

      let msg = "Falha ao criar conta.";
      if (err.code === "auth/email-already-in-use")
        msg = "Este email já está em uso.";
      else if (err.code === "auth/weak-password")
        msg = "A senha deve ter pelo menos 6 caracteres.";

      Alert.alert("Erro", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Criar Conta</Text>

        {codigoConvite ? (
          <Text style={styles.convite}>
            🎁 Código aplicado: {codigoConvite}
          </Text>
        ) : null}

        <TextInput
          placeholder="Nome"
          placeholderTextColor="#94a3b8"
          value={nome}
          onChangeText={setNome}
          style={styles.input}
        />

        <TextInput
          placeholder="Email"
          placeholderTextColor="#94a3b8"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />

        <TextInput
          placeholder="Senha"
          placeholderTextColor="#94a3b8"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          style={styles.input}
        />

        <Pressable
          style={[styles.button, loading && { opacity: 0.7 }]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Criar Conta</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/* ===============================
   STYLES
================================ */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
  },
  convite: {
    color: "#facc15",
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    padding: 14,
    color: "#fff",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#2563eb",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
