import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator, ScrollView } from "react-native";
import { httpsCallable } from "firebase/functions";
import { functions, auth } from "../services/firebase";

export default function Saque() {
  const [valor, setValor] = useState("");
  const [chavePix, setChavePix] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSaque() {
    const saqueValor = parseFloat(valor.replace(",", "."));

    if (!saqueValor || saqueValor < 5) {
      return Alert.alert("Erro", "Valor mínimo para saque é R$5,00");
    }

    if (!chavePix || chavePix.length < 5) {
      return Alert.alert("Erro", "Informe uma chave Pix válida");
    }

    setLoading(true);

    try {
      const solicitarSaque = httpsCallable(functions, "solicitarSaquePix");

      await solicitarSaque({
        valor: saqueValor,
        chavePix,
      });

      Alert.alert("✅ Saque solicitado", "Seu saque foi enviado para processamento via Pix.");

      setValor("");
      setChavePix("");
    } catch (err) {
      console.error(err);
      Alert.alert("Erro", err?.message || "Não foi possível solicitar o saque");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#0f172a", padding: 20 }}>
      <Text style={{ color: "#fff", fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>
        💸 Sacar via Pix
      </Text>

      <View style={{ backgroundColor: "#020617", padding: 16, borderRadius: 16 }}>
        <Text style={{ color: "#cbd5f5", marginBottom: 6 }}>Valor do saque</Text>
        <TextInput
          placeholder="Ex: 50,00"
          placeholderTextColor="#64748b"
          keyboardType="numeric"
          value={valor}
          onChangeText={setValor}
          style={{
            backgroundColor: "#0f172a",
            color: "#fff",
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#334155",
            marginBottom: 14,
          }}
        />

        <Text style={{ color: "#cbd5f5", marginBottom: 6 }}>Chave Pix</Text>
        <TextInput
          placeholder="CPF, e‑mail, telefone ou chave aleatória"
          placeholderTextColor="#64748b"
          value={chavePix}
          onChangeText={setChavePix}
          style={{
            backgroundColor: "#0f172a",
            color: "#fff",
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#334155",
            marginBottom: 18,
          }}
        />

        <Pressable
          onPress={handleSaque}
          disabled={loading}
          style={{
            backgroundColor: "#22c55e",
            padding: 16,
            borderRadius: 14,
            alignItems: "center",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>
              SOLICITAR SAQUE
            </Text>
          )}
        </Pressable>
      </View>

      <Text style={{ color: "#64748b", fontSize: 12, marginTop: 16 }}>
        ℹ️ O saque será analisado automaticamente e enviado via Pix após aprovação do sistema.
      </Text>
    </ScrollView>
  );
}
