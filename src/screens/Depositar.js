import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator, Image, ToastAndroid } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { db, functions, auth } from "../services/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

export default function Depositar() {
  const navigation = useNavigation();
  const [valor, setValor] = useState("");
  const [metodo, setMetodo] = useState("pix"); // "pix", "boleto", "cartao"
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [depositoConfirmado, setDepositoConfirmado] = useState(false);

  const uid = auth.currentUser?.uid;

  // 🔑 Ouvir alterações de saldo em tempo real
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "UsuariosPrivado", uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (depositoConfirmado) return; // evita alert repetido
        if (data.saldo && data.saldo > 0) {
          ToastAndroid.show(
            `✅ Depósito confirmado! Saldo atualizado: R$${data.saldo.toFixed(2)}`,
            ToastAndroid.LONG
          );
          setDepositoConfirmado(true);
        }
      }
    });
    return unsub;
  }, [uid, depositoConfirmado]);

  async function handleDepositar() {
    const deposito = parseFloat(valor.replace(",", "."));
    if (!deposito || deposito < 5) {
      Alert.alert("Erro", "Informe um valor válido (mínimo R$5).");
      return;
    }

    setLoading(true);
    setQrCode(null);
    setDepositoConfirmado(false);

    try {
      // 🔐 Chama Cloud Function segura para criar PIX/BOLETO/CARTÃO
      const criarPagamento = httpsCallable(functions, "criarPixDeposito");
      const res = await criarPagamento({ valor: deposito, metodo });

      // ⚡ Retorna QR Code ou link de pagamento
      setQrCode(res.data.qrCode || res.data.linkPagamento || res.data.copiaCola);

      Alert.alert(
        "Pagamento gerado",
        "Use o QR Code ou link para concluir o pagamento. Assim que confirmado, seu saldo será atualizado automaticamente."
      );
    } catch (err) {
      console.error(err);
      Alert.alert("Erro", "Não foi possível gerar o pagamento.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#0f172a", padding: 20 }}>
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 16 }}>
        💵 Depositar Saldo
      </Text>

      <View style={{ backgroundColor: "#020617", padding: 16, borderRadius: 14, marginBottom: 20 }}>
        <Text style={{ color: "#fff", marginBottom: 8 }}>Digite o valor para depósito:</Text>
        <TextInput
          placeholder="Ex: 50,00"
          placeholderTextColor="#94a3b8"
          value={valor}
          onChangeText={setValor}
          keyboardType="numeric"
          style={{
            backgroundColor: "#0f172a",
            color: "#fff",
            borderWidth: 1,
            borderColor: "#334155",
            borderRadius: 12,
            padding: 14,
            marginBottom: 12
          }}
        />

        {/* 🔘 Escolher método de pagamento */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
          {["pix", "boleto", "cartao"].map((m) => (
            <Pressable
              key={m}
              onPress={() => setMetodo(m)}
              style={{
                backgroundColor: metodo === m ? "#16a34a" : "#334155",
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", textTransform: "capitalize" }}>{m}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={handleDepositar}
          disabled={loading}
          style={{
            backgroundColor: "#16a34a",
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: "center",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>💳 Depositar</Text>}
        </Pressable>
      </View>

      {/* 🔎 QR Code / link de pagamento */}
      {qrCode && (
        <View style={{ backgroundColor: "#020617", padding: 16, borderRadius: 14 }}>
          <Text style={{ color: "#fff", marginBottom: 8 }}>📲 Use este QR Code ou link para pagar:</Text>
          {qrCode.startsWith("http") ? (
            <Text selectable style={{ color: "#facc15", fontWeight: "bold" }}>{qrCode}</Text>
          ) : (
            <Image source={{ uri: `data:image/png;base64,${qrCode}` }} style={{ width: 200, height: 200, alignSelf: "center" }} />
          )}
        </View>
      )}

      <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 16 }}>
        ℹ️ Seu saldo será atualizado automaticamente após confirmação do pagamento via Cloud Function.
      </Text>
    </ScrollView>
  );
}
