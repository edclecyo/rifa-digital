import { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Share,
  Alert,
  ToastAndroid,
    Platform,
} from "react-native";
import { AuthContext } from "../contexts/AuthContext";
import { db, functions } from "../services/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { httpsCallable } from "firebase/functions";
import ShareCard from "../components/ShareCard";
export default function HomeUser() {
  const { profile } = useContext(AuthContext);
  const navigation = useNavigation();

  const [saldo, setSaldo] = useState(0);
  const [usuarioPrivado, setUsuarioPrivado] = useState({
    compartilhamento: { saldo: 0, codigo: "" },
    premios: 0,
    deposito: 0,
  });

  /* 🔑 Ouvir mudanças no Firestore (dados privados do usuário) */
  useEffect(() => {
    if (!profile?.uid) return;

    const unsub = onSnapshot(doc(db, "UsuariosPrivado", profile.uid), (snap) => {
      if (!snap.exists()) return;

      const data = snap.data();
      const premios = data.premios || 0;
      const compartilhamento = data.compartilhamento?.saldo || 0;
      const deposito = data.saldo || 0;

      const total = premios + compartilhamento + deposito;

      // 🔔 Notificação de ganho (só dispara quando aumenta)
      if (
        usuarioPrivado.premios !== undefined &&
        (premios > usuarioPrivado.premios ||
          compartilhamento > usuarioPrivado.compartilhamento.saldo)
      ) {
        const ganho =
          (premios - usuarioPrivado.premios || 0) +
          (compartilhamento - usuarioPrivado.compartilhamento.saldo || 0);

        ToastAndroid.show(
          `🎉 Você ganhou R$${ganho.toFixed(2)}!`,
          ToastAndroid.LONG
        );
      }

      setUsuarioPrivado({
        compartilhamento: { saldo: compartilhamento, codigo: data.compartilhamento?.codigo || "" },
        premios,
        deposito,
      });

      setSaldo(total);
    });

    return unsub;
  }, [profile, usuarioPrivado]);

  /* 📤 Compartilhar código */
async function handleCompartilhar() {
  const codigo = usuarioPrivado.compartilhamento.codigo;
  if (!codigo) return;

  // 🔗 Link real do app + código do usuário
  const link = `https://meuapp.com/registrar?codigo=${codigo}`; // Substitua pelo link real do seu app

  try {
    await Share.share({
      message: `🎉 Ganhe cartelas grátis e aumente suas chances de ganhar!  
Use meu código **${codigo}** no app ou site: ${link}  

💥 Cada amigo que comprar usando meu código te dá mais chances de ganhar prêmios incríveis!  
🚀 Quanto mais você compartilhar, mais você ganha!`,
    });
  } catch {
    Alert.alert("Erro", "Não foi possível compartilhar o código.");
  }
}

  /* 💸 Sacar saldo */
  async function handleSacar() {
    if (saldo < 100) {
      Alert.alert("Saldo insuficiente", "Você precisa ter pelo menos R$100 para sacar.");
      return;
    }

    try {
      const sacarSaldo = httpsCallable(functions, "solicitarSaque");
      await sacarSaldo({ valor: saldo });

      Alert.alert(
        "Saque solicitado",
        `Você solicitou saque de R$${saldo.toFixed(2)}. Em breve será processado.`
      );
    } catch (err) {
      console.error(err);
      Alert.alert("Erro", "Não foi possível solicitar o saque.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      {/* 🔹 BOTÃO DE MENU */}
      <Pressable
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        style={{ padding: 16, marginTop: 20, marginLeft: 10, width: 50, borderRadius: 8 }}
      >
        <Text style={{ color: "#fff", fontSize: 22 }}>☰</Text>
      </Pressable>

      <ScrollView style={{ padding: 20 }}>
        {/* 👋 SAUDAÇÃO */}
        <Text style={{ color: "#fff", fontSize: 20 }}>
          Olá, {profile?.nome || "Usuário"} 👋
        </Text>

        {/* 💰 SALDO DISPONÍVEL */}
        <View
          style={{
            backgroundColor: "#020617",
            padding: 16,
            borderRadius: 14,
            marginTop: 16,
          }}
        >
          <Text style={{ color: "#38bdf8", fontSize: 18, fontWeight: "bold" }}>
            💳 Saldo disponível
          </Text>
          <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold", marginTop: 6 }}>
            R$ {saldo.toFixed(2)}
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
            Inclui prêmios, ganhos por compartilhamento e depósitos
          </Text>

          <View style={{ flexDirection: "row", marginTop: 12, justifyContent: "space-between" }}>
            <Pressable
              onPress={() => navigation.navigate("Depositar")}
              style={{ backgroundColor: "#16a34a", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold" }}>💵 Depositar</Text>
            </Pressable>

            {saldo >= 100 && (
              <Pressable
                onPress={handleSacar}
                style={{ backgroundColor: "#f97316", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 }}
              >
                <Text style={{ color: "#fff", fontWeight: "bold" }}>🏧 Sacar</Text>
              </Pressable>
            )}
          </View>
        </View>

   {/* 🔥 SHARE CARD (SEM IF, SEM ERRO) */}
        <ShareCard
  codigo={usuarioPrivado.compartilhamento.codigo}
  uso={usuarioPrivado.compartilhamento.uso || 0}
  onCompartilhar={handleCompartilhar}
/>
      </ScrollView>
    </View>
  );
}