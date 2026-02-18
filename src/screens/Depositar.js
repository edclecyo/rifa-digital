import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  ToastAndroid,
} from "react-native";
import { db, functions, auth } from "../services/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

export default function Depositar() {
  const [valor, setValor] = useState("");
  const [metodo, setMetodo] = useState("pix");
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [depositoConfirmado, setDepositoConfirmado] = useState(false);
  const [ultimoTxid, setUltimoTxid] = useState(null);

  const uid = auth.currentUser?.uid;

  // 🔄 Atualiza saldo automaticamente (CORRIGIDO)
  useEffect(() => {
    if (!uid) return;

    const unsub = onSnapshot(doc(db, "UsuariosPrivado", uid), (snap) => {
      const saldoRaw = snap.data()?.saldo;
      const saldo = Number(saldoRaw ?? 0); // ← garante número

      if (!depositoConfirmado && saldo > 0) {
        ToastAndroid.show(
          `✅ Depósito confirmado! Saldo: R$ ${saldo.toFixed(2)}`,
          ToastAndroid.LONG
        );
        setDepositoConfirmado(true);
      }
    });

    return unsub;
  }, [uid, depositoConfirmado]);

  // 💳 Criar PIX
  async function handleDepositar() {
    const deposito = Number(valor.replace(",", "."));

    if (!deposito || deposito < 5) {
      Alert.alert("Valor inválido", "O depósito mínimo é R$ 5,00.");
      return;
    }

    setLoading(true);
    setQrCode(null);
    setDepositoConfirmado(false);
    setUltimoTxid(null);

    try {
      const criarPagamento = httpsCallable(functions, "criarPixDeposito");
      const res = await criarPagamento({ valor: deposito, metodo });

      setQrCode(
        res.data.qrCode || res.data.linkPagamento || res.data.copiaCola || null
      );
      setUltimoTxid(res.data.txid || null);

      Alert.alert(
        "PIX gerado",
        "Pague o QR Code abaixo. O saldo será liberado automaticamente."
      );
    } catch (err) {
      console.error("Erro ao gerar PIX:", err);
      Alert.alert("Erro", "Não foi possível gerar o pagamento.");
    } finally {
      setLoading(false);
    }
  }

  // 🧪 Simular pagamento PIX (sandbox)
  async function simularPagamento() {
    if (!ultimoTxid) {
      Alert.alert("Erro", "Nenhum PIX gerado ainda.");
      return;
    }

    try {
      const fn = httpsCallable(functions, "simularPagamentoPix");
      await fn({ txid: ultimoTxid });

      Alert.alert("Sucesso", "Pagamento PIX simulado!");
    } catch (e) {
      console.log("Erro ao simular PIX:", e);
      Alert.alert("Erro", "Falha ao confirmar pagamento.");
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#020617" }}>
      {/* Header */}
      <View style={{ padding: 24 }}>
        <Text style={{ color: "#fff", fontSize: 26, fontWeight: "bold" }}>
          💰 Depositar
        </Text>
        <Text style={{ color: "#94a3b8", marginTop: 4 }}>
          Adicione saldo usando PIX, boleto ou cartão.
        </Text>
      </View>

      {/* Card principal */}
      <View
        style={{
          backgroundColor: "#0f172a",
          marginHorizontal: 20,
          borderRadius: 20,
          padding: 20,
        }}
      >
        <Text style={{ color: "#fff", marginBottom: 8 }}>
          Valor do depósito
        </Text>

        <TextInput
          placeholder="R$ 50,00"
          placeholderTextColor="#64748b"
          value={valor}
          onChangeText={setValor}
          keyboardType="numeric"
          style={{
            backgroundColor: "#020617",
            color: "#fff",
            borderRadius: 14,
            padding: 16,
            fontSize: 18,
            marginBottom: 16,
          }}
        />

        {/* Métodos */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          {["pix", "boleto", "cartao"].map((m) => (
            <Pressable
              key={m}
              onPress={() => setMetodo(m)}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                alignItems: "center",
                backgroundColor: metodo === m ? "#22c55e" : "#020617",
                borderWidth: 1,
                borderColor: metodo === m ? "#22c55e" : "#1e293b",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>
                {m.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Botão gerar */}
        <Pressable
          onPress={handleDepositar}
          disabled={loading}
          style={{
            backgroundColor: "#22c55e",
            paddingVertical: 16,
            borderRadius: 16,
            alignItems: "center",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
              Gerar pagamento
            </Text>
          )}
        </Pressable>
      </View>

      {/* QR Code */}
      {qrCode && (
        <View
          style={{
            backgroundColor: "#0f172a",
            margin: 20,
            borderRadius: 20,
            padding: 20,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", marginBottom: 12, fontSize: 16 }}>
            Escaneie para pagar
          </Text>

          {qrCode.startsWith("http") ? (
            <Text selectable style={{ color: "#facc15", fontWeight: "bold" }}>
              {qrCode}
            </Text>
          ) : (
            <Image
              source={{ uri: `data:image/png;base64,${qrCode}` }}
              style={{ width: 220, height: 220 }}
            />
          )}

          {/* Botão simulação */}
          <Pressable
            onPress={simularPagamento}
            style={{
              backgroundColor: "#2563eb",
              padding: 14,
              borderRadius: 14,
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "bold" }}>
              🧪 Simular pagamento PIX (teste)
            </Text>
          </Pressable>
        </View>
      )}

      <Text
        style={{
          color: "#64748b",
          fontSize: 12,
          textAlign: "center",
          marginBottom: 30,
        }}
      >
        O saldo é liberado automaticamente após a confirmação do pagamento.
      </Text>
    </ScrollView>
  );
}
