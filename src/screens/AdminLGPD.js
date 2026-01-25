import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
} from "react-native";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase";

export default function AdminLGPD() {
  const [texto, setTexto] = useState("");
  const [versao, setVersao] = useState("1.0");
  const [ativo, setAtivo] = useState(true);
  const [loading, setLoading] = useState(false);

  /* ===============================
     🔄 CARREGAR LGPD
  ================================ */
  useEffect(() => {
    async function load() {
      try {
        const ref = doc(db, "ConfigLGPD", "atual");
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          setTexto(data.texto || "");
          setVersao(data.versaoAtual || "1.0");
          setAtivo(data.ativo !== false);
        }
      } catch (err) {
        console.error("❌ Erro carregar LGPD:", err);
      }
    }
    load();
  }, []);

  /* ===============================
     💾 SALVAR LGPD
  ================================ */
  async function salvar() {
    if (!texto.trim()) {
      Alert.alert("Erro", "O texto do termo não pode estar vazio.");
      return;
    }

    try {
      setLoading(true);

      await setDoc(
        doc(db, "ConfigLGPD", "atual"),
        {
          texto,
          versaoAtual: versao,
          ativo,
          atualizadoEm: serverTimestamp(),
        },
        { merge: true }
      );

      Alert.alert("Sucesso", "Termo LGPD atualizado.");
    } catch (err) {
      console.error("❌ LGPD Admin:", err);
      Alert.alert("Erro", "Falha ao salvar LGPD.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>📄 Termos LGPD</Text>

      <Text style={styles.label}>Versão</Text>
      <TextInput
        value={versao}
        onChangeText={setVersao}
        style={styles.input}
        placeholder="Ex: 1.0"
        placeholderTextColor="#64748b"
      />

      <View style={styles.switchRow}>
        <Text style={styles.label}>LGPD Ativa</Text>
        <Switch value={ativo} onValueChange={setAtivo} />
      </View>

      <Text style={styles.label}>Texto do Termo</Text>
      <TextInput
        value={texto}
        onChangeText={setTexto}
        multiline
        style={styles.textarea}
        textAlignVertical="top"
        placeholder={`TERMOS DE USO E POLÍTICA DE PRIVACIDADE – LGPD

1. INTRODUÇÃO
Este Termo regula o uso da plataforma de Rifa Digital, em conformidade
com a Lei nº 13.709/2018 (LGPD).

2. DADOS COLETADOS
- Nome
- E-mail
- Dispositivo
- Histórico de compras
- IP e logs de acesso

3. FINALIDADE
- Processamento de pagamentos
- Prevenção à fraude
- Cumprimento legal
- Comunicação com o usuário

4. CONSENTIMENTO
O aceite é obrigatório para uso da plataforma.

5. ATUALIZAÇÕES
Sempre que houver alteração relevante, o usuário será solicitado
a aceitar novamente.`}
        placeholderTextColor="#64748b"
      />

      <Pressable
        style={[styles.button, loading && { opacity: 0.6 }]}
        onPress={salvar}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Salvando..." : "Salvar Termo"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#020617",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#facc15",
    marginBottom: 16,
    textAlign: "center",
  },
  label: {
    color: "#e5e7eb",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#020617",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    marginBottom: 12,
  },
  textarea: {
    backgroundColor: "#020617",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    height: 320,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#16a34a",
    padding: 14,
    borderRadius: 10,
    marginTop: 16,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },
});
