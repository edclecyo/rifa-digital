import { useContext, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Share,
  Alert,
  ToastAndroid,
  Platform,
  Animated,
  Image,
  StyleSheet,
  FlatList,
} from "react-native";

import { AuthContext } from "../contexts/AuthContext";
import { db, functions } from "../services/firebase";
import { doc, onSnapshot, collection, query, where, limit, getDocs } from "firebase/firestore";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { httpsCallable } from "firebase/functions";
import { LinearGradient } from "expo-linear-gradient";

import RoletaDiaria from "../components/RoletaDiaria";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function HomePrincipal() {
  const { profile } = useContext(AuthContext);
  const navigation = useNavigation();
  const isAdmin = profile?.isAdmin === true;

  const [saldo, setSaldo] = useState(0);
  const [ganhadores, setGanhadores] = useState([]);
  const [cartelasDisponiveis, setCartelasDisponiveis] = useState(0);
  const [ranking, setRanking] = useState([]);
  const [rodadaAtual, setRodadaAtual] = useState(1);
  const [usuarioPrivado, setUsuarioPrivado] = useState({
    compartilhamento: { saldo: 0, codigo: "", uso: 0 },
    premios: 0,
    deposito: 0,
  });
  const [showMensagem20, setShowMensagem20] = useState(false);
  const [showRoleta, setShowRoleta] = useState(false);

  const prevRef = useRef({ premios: 0, compartilhamento: 0 });
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const animatedPercent = useRef(new Animated.Value(0)).current;

  const META_MINIMA_SORTEIO = 10000; // Valor referência para etapas do prêmio
  const PREMIO_ATUAL = 5000; // Valor final do prêmio

  const ETAPAS_PREMIOS = [
    { cartelas: 200, valor: 50 },
    { cartelas: 300, valor: 100 },
    { cartelas: 500, valor: 250 },
    { cartelas: 1000, valor: 500 },
    { cartelas: META_MINIMA_SORTEIO, valor: PREMIO_ATUAL },
  ];

  /* =================== ROLETA DIÁRIA =================== */
  useEffect(() => {
    async function verificarRoleta() {
      const lastSpin = await AsyncStorage.getItem("@roleta_lastSpin");
      const hoje = new Date().toDateString();
      if (lastSpin !== hoje) setShowRoleta(true);
    }
    verificarRoleta();
  }, []);

  /* =================== RODADA ATUAL =================== */
  useEffect(() => {
    const ref = doc(db, "StatusSorteio", "geral");
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) setRodadaAtual(snap.data().rodada || 1);
    });
  }, []);

  /* ================= USUÁRIO PRIVADO ================= */
  useEffect(() => {
    if (!profile?.uid || isAdmin) return;
    const ref = doc(db, "UsuariosPrivado", profile.uid);

    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const premios = typeof data.premios === "number" ? data.premios : Number(data.premios?.saldo ?? 0);
      const compartilhamento = Number(data.compartilhamento?.saldo ?? 0);
      const deposito = Number(data.saldo ?? 0);
      const total = premios + compartilhamento + deposito;
      const ganho = premios - prevRef.current.premios + (compartilhamento - prevRef.current.compartilhamento);

      if (ganho > 0) {
        const msg = `🎉 Você ganhou R$${ganho.toFixed(2)}!`;
        Platform.OS === "android" ? ToastAndroid.show(msg, ToastAndroid.LONG) : Alert.alert("Parabéns!", msg);
      }

      prevRef.current = { premios, compartilhamento };
      setUsuarioPrivado({
        compartilhamento: {
          saldo: compartilhamento,
          codigo: data.compartilhamento?.codigo || "",
          uso: Number(data.compartilhamento?.uso ?? 0),
        },
        premios,
        deposito,
      });

      setSaldo(Number.isFinite(total) ? total : 0);
    });
  }, [profile?.uid, isAdmin]);

  /* ================= CARTELAS EM TEMPO REAL (SÓ VENDIDAS) ================= */
const [percentFormatado, setPercentFormatado] = useState("0.00");

useEffect(() => {
  if (isAdmin || !rodadaAtual) return;

  const q = query(
    collection(db, "Cartelas"),
    where("rodada", "==", rodadaAtual),
    where("status", "==", "vendida")
  );

  const cartelasMax = 12500; // limite total

  return onSnapshot(q, (snap) => {
    const quantidadeVendida = snap.size;

    // cálculo exato da porcentagem
    const percent = (quantidadeVendida / cartelasMax) * 100;
    const arredondado = percent.toFixed(2); // 2 casas decimais, mostra 0.01%, 0.02% ...

    setPercentFormatado(arredondado);

    // animação da barra
    Animated.timing(animatedWidth, {
      toValue: quantidadeVendida / cartelasMax,
      duration: 600,
      useNativeDriver: false,
    }).start();

    setShowMensagem20(cartelasMax - quantidadeVendida <= 20);
  });
}, [rodadaAtual, isAdmin]);

  /* ================= GANHADORES ================= */
  useEffect(() => {
    if (isAdmin) return;

    const q = query(
      collection(db, "Ganhadores"),
      where("rodada", "==", rodadaAtual),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const lista = snap.docs.map((d) => ({
        id: d.id,
        nome: d.data().nome || "Usuário",
        valor: Number(d.data().valor || 0),
        foto: d.data().foto || null,
      }));

      setGanhadores(lista);
    });

    return unsubscribe;
  }, [rodadaAtual, isAdmin]);

  /* ================= COMPARTILHAR ================= */
  async function handleCompartilhar() {
    const codigo = usuarioPrivado.compartilhamento.codigo;
    if (!codigo) return;

    const link = `https://rifa-digital-f6425.web.app/ref?code=${codigo}`;
    const message = `🚀 Ganhe cartelas grátis e dinheiro! Use meu código ${codigo} e receba recompensas sempre que alguém comprar!\n${link}`;

    try {
      await Share.share({ message });
      Platform.OS === "android" ? ToastAndroid.show("Link compartilhado!", ToastAndroid.SHORT) : Alert.alert("Sucesso", "Link compartilhado!");
    } catch {
      Alert.alert("Erro", "Falha ao compartilhar.");
    }
  }

  /* ================= SACAR ================= */
  async function handleSacar() {
    if (saldo < 100) {
      Alert.alert("Saldo insuficiente", "Mínimo para saque: R$100");
      return;
    }

    try {
      const call = httpsCallable(functions, "solicitarSaque");
      await call({ valor: saldo });
      Alert.alert("Saque solicitado", `R$ ${saldo.toFixed(2)}`);
    } catch (e) {
      Alert.alert("Erro", e?.message || "Falha ao sacar.");
    }
  }

  /* ================= GRADIENTE ================= */
  function getGradientColors(cartelas) {
    if (cartelas <= 200) return ["#f87171", "#f87171"];
    if (cartelas <= 500) return ["#34d399", "#059669"];
    if (cartelas <= 1000) return ["#60a5fa", "#3b82f6"];
    if (cartelas <= 3999) return ["#e5e7eb", "#d1d5db"];
    return ["#fbbf24", "#f59e0b"];
  }

  /* ================= UI ================= */
  return (
   <View style={{ flex: 1, backgroundColor: "#0f172a", padding: 20}}>
  {/* ================= TOP BAR ================= */}
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
    }}
  >
    <Pressable
      onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
      style={{ padding: 8 }}
    >
      <Text style={{ color: "#fff", fontSize: 22 }}>☰</Text>
    </Pressable>

    <Text
      style={{
        color: "#fff",
        fontSize: 18,
        fontWeight: "bold",
        marginLeft: 10,
        flex: 1,
      }}
      numberOfLines={1}
    >
      Olá, {profile?.nome || "Usuário"} 👋
    </Text>
  </View>

  <ScrollView contentContainerStyle={{ paddingBottom: 35 }}>
    {/* ================= CARD SALDO ================= */}
    <View
      style={{
        backgroundColor: "#1e293b",
        padding: 18,
        borderRadius: 18,
        marginBottom: 15,
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {/* SALDO */}
        <View>
          <Text
            style={{
              color: "#bfcad9",
              fontSize: 16,
              marginBottom: 6,
            }}
          >
            💳 Saldo disponível
          </Text>

          <View
            style={{
              backgroundColor: "#000",
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderRadius: 12,
              minWidth: 120,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#f0f5f7",
                fontSize: 20,
                fontWeight: "bold",
              }}
            >
              R$ {(Number(saldo) || 0).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* BOTÕES */}
        <View style={{ alignItems: "flex-end" }}>
          <Pressable
            onPress={() => navigation.navigate("Depositar")}
            style={{
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 8,
            }}
          >
            <LinearGradient
              colors={["#3b82f6", "#06b6d4"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                paddingVertical: 9,
                paddingHorizontal: 18,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold" }}>
                💵 Depositar
              </Text>
            </LinearGradient>
          </Pressable>

          {(Number(saldo) || 0) >= 100 && (
            <Pressable
              onPress={handleSacar}
              style={{
                backgroundColor: "#f97316",
                paddingVertical: 9,
                paddingHorizontal: 18,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold" }}>
                🏧 Sacar
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>

          {/* GANHADORES */}
<View style={{ marginTop: 20 }}>
  <Text
    style={{
      color: "#facc15",
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 10,
    }}
  >
    🏆 Últimos Ganhadores
  </Text>

  {ganhadores.length === 0 ? (
    <View
      style={{
        backgroundColor: "#1f2937",
        padding: 18,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#374151",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: "#fff",
          fontSize: 16,
          fontWeight: "bold",
          marginBottom: 6,
        }}
      >
        Nenhum ganhador ainda
      </Text>

      <Text style={{ color: "#9ca3af", textAlign: "center" }}>
        O primeiro prêmio está cada vez mais perto!
      </Text>

      <Text style={{ color: "#9ca3af", textAlign: "center", marginTop: 4 }}>
        Compre sua cartela e seja o primeiro vencedor 🎉
      </Text>
    </View>
  ) : (
    <FlatList
      data={ganhadores}
      keyExtractor={(item) => item.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingRight: 10, marginTop: 6 }}
      renderItem={({ item }) => (
        <View
          style={{
            width: 130,
            backgroundColor: "#1f2937",
            borderRadius: 16,
            marginRight: 12,
            padding: 14,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#facc15",
          }}
        >
          {/* Avatar */}
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: "#374151",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            {item.foto ? (
              <Image
                source={{ uri: item.foto }}
                style={{ width: 60, height: 60, borderRadius: 30 }}
              />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 18 }}>
                {item.nome?.[0] || "U"}
              </Text>
            )}
          </View>

          {/* Nome */}
          <Text
            style={{
              color: "#fff",
              fontWeight: "bold",
              fontSize: 14,
              textAlign: "center",
            }}
            numberOfLines={1}
          >
            {item.nome}
          </Text>

          {/* Valor */}
          <Text
            style={{
              color: "#34d399",
              fontWeight: "bold",
              marginTop: 4,
              fontSize: 15,
            }}
          >
            🎉 R$ {Number(item.valor || 0).toFixed(2)}
          </Text>
        </View>
      )}
    />
  )}
</View>
        {/* ROLETA DIÁRIA */}
        <RoletaDiaria
          visible={showRoleta}
          onClose={() => setShowRoleta(false)}
          onPremio={(premio) => {
            if (premio.tipo === "cartela") setCartelasDisponiveis(prev => prev + premio.valor);
            if (premio.tipo === "dinheiro") setSaldo(prev => prev + premio.valor);
          }}
        />

        {/* PRÊMIO */}
        <View style={{ backgroundColor: "#1f2937", padding: 16, borderRadius: 14, marginTop: 16, borderWidth: 2, borderColor: "#f59e0b" }}>
          <Text style={{ color: "#f59e0b", fontSize: 28, fontWeight: "bold", textAlign: "center" }}>
            🎉 PRÊMIO R$ {PREMIO_ATUAL} 🎉
          </Text>

          {/* ETAPAS DO PRÊMIO */}
          <View style={{ marginTop: 12 }}>
            {ETAPAS_PREMIOS.map((etapa, index) => {
              const restanteEtapa = Math.max(etapa.cartelas - (12500 - cartelasDisponiveis), 0);
              if (restanteEtapa > 0 && restanteEtapa <= 20) {
                return (
                  <Text key={index} style={{ color: "#fff", fontSize: 14, textAlign: "center", marginVertical: 2 }}>
                    {`⚡ Faltam ${restanteEtapa} cartelas para concorrer a R$${etapa.valor}`}
                  </Text>
                );
              }
              return null;
            })}
          </View>

          <View style={{ marginTop: 10, height: 22, borderRadius: 12, overflow: "hidden", backgroundColor: "#374151" }}>
  <Animated.View
    style={{
      height: "100%",
      width: animatedWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
    }}
  >
    <LinearGradient colors={getGradientColors(cartelasDisponiveis)} style={{ flex: 1 }} />
  </Animated.View>
</View>

<Text
  style={{
    color: "#fff",
    textAlign: "center",
    marginTop: 4,
    fontWeight: "bold",
  }}
>
  {percentFormatado}%
</Text>
        </View>

        <View style={{ backgroundColor: "#1e293b", padding: 20, borderRadius: 14, marginTop: 16, alignItems: "center" }}>
  <Text style={{ color: "#facc15", fontSize: 22, fontWeight: "bold", textAlign: "center" }}>
    🎟️ Participe do sorteio agora!
  </Text>
  <Text style={{ color: "#fff", fontSize: 16, textAlign: "center", marginTop: 8 }}>
    Adquira sua cartela e concorra aos prêmios incríveis que estão te esperando!
  </Text>

  <Pressable
    onPress={() => navigation.navigate("EscolherCartelas")}
    style={{
      marginTop: 16,
      backgroundColor: "#3b82f6",
      paddingVertical: 16,
      paddingHorizontal: 60,
      borderRadius: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    }}
  >
    <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 20, textAlign: "center" }}>
      🛒 Comprar Cartela
    </Text>
  </Pressable>
</View>

        {/* COMPARTILHAR */}
        <View style={{ marginTop: 20, padding: 16, borderRadius: 14, backgroundColor: "#1f2937", borderWidth: 2, borderColor: "#f59e0b" }}>
          <Text style={{ color: "#f59e0b", fontSize: 22, fontWeight: "bold", textAlign: "center" }}>
            🚀 Ganhe sem gastar nada!
          </Text>
          <Text style={{ color: "#fff", fontSize: 16, textAlign: "center", marginTop: 6 }}>
            Compartilhe com seus amigos e cada amigo que comprar através do seu link te dá:
          </Text>

          <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 12 }}>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: "#34d399", fontSize: 28, fontWeight: "bold" }}>🎟️</Text>
              <Text style={{ color: "#fff", fontSize: 14 }}>Cartelas grátis</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: "#facc15", fontSize: 28, fontWeight: "bold" }}>💸</Text>
              <Text style={{ color: "#fff", fontSize: 14 }}>R$0,25 por compra</Text>
            </View>
          </View>

          <Text style={{ color: "#fff", fontSize: 14, textAlign: "center", marginTop: 12, fontWeight: "bold" }}>
            ⚡ Quanto mais você compartilhar, maior seu potencial de ganhar até R$500!
          </Text>

          <Pressable
            onPress={handleCompartilhar}
            style={{ marginTop: 16, backgroundColor: "#f59e0b", padding: 14, borderRadius: 12, alignItems: "center" }}
          >
            <Text style={{ color: "#000", fontWeight: "bold", fontSize: 16 }}>📤 Compartilhar agora</Text>
          </Pressable>

          <View style={{ marginTop: 16, height: 20, borderRadius: 12, overflow: "hidden", backgroundColor: "#374151" }}>
            <Animated.View
              style={{
                height: "100%",
                width: animatedWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                backgroundColor: "#34d399",
              }}
            />
          </View>
          <Text style={{ color: "#fff", fontSize: 14, textAlign: "center", marginTop: 4 }}>
            {`Já compraram: ${usuarioPrivado.compartilhamento.uso} amigos`}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  cardHorizontal: {
    width: 120,
    height: 160,
    backgroundColor: "#1f2937",
    borderRadius: 16,
    marginRight: 12,
    padding: 12,
    justifyContent: "flex-start",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarHorizontal: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  nomeHorizontal: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
    textAlign: "center",
  },
  ganhoHorizontal: {
    color: "#34d399",
    fontWeight: "bold",
    marginTop: 4,
    textAlign: "center",
  },
});