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
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  limit,
  getDocs,
} from "firebase/firestore";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { httpsCallable } from "firebase/functions";
import { LinearGradient } from "expo-linear-gradient";

export default function HomePrincipal() {
  const { profile } = useContext(AuthContext);
  const navigation = useNavigation();
  const isAdmin = profile?.isAdmin === true;

  const [saldo, setSaldo] = useState(0);
  const [cartelasDisponiveis, setCartelasDisponiveis] = useState(0);
  const [ranking, setRanking] = useState([]);
  const [rodadaAtual, setRodadaAtual] = useState(1);
  const [usuarioPrivado, setUsuarioPrivado] = useState({
    compartilhamento: { saldo: 0, codigo: "", uso: 0 },
    premios: 0,
    deposito: 0,
  });
  const [showMensagem20, setShowMensagem20] = useState(false);

  const prevRef = useRef({ premios: 0, compartilhamento: 0 });
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const animatedPercent = useRef(new Animated.Value(0)).current;
  const shareProgressWidth = useRef(new Animated.Value(0)).current;

  const META_MINIMA_SORTEIO = 4000;
  const PREMIO_ATUAL = 5000;

  // Meta de compartilhamento
  const META_COMPARTILHAR_REAIS = 1000; // R$1000
  const META_COMPARTILHAR_CARTELAS = 50; // Cartelas extras que o usuário pode ganhar
  const REAIS_POR_COMPRA = 0.25; // R$ por amigo que comprar

  /* ================= RODADA ================= */
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

      // Atualiza barra de compartilhamento
      const progresso = Math.min(
        (compartilhamento * REAIS_POR_COMPRA) / META_COMPARTILHAR_REAIS,
        1
      );
      Animated.timing(shareProgressWidth, {
        toValue: progresso,
        duration: 600,
        useNativeDriver: false,
      }).start();
    });
  }, [profile?.uid, isAdmin]);

  /* ================= CARTELAS EM TEMPO REAL ================= */
  useEffect(() => {
    if (isAdmin || !rodadaAtual) return;

    const q = query(
      collection(db, "Cartelas"),
      where("rodada", "==", rodadaAtual),
      where("status", "==", "disponivel")
    );

    return onSnapshot(q, (snap) => {
      const quantidade = snap.size;
      setCartelasDisponiveis(quantidade);
      setShowMensagem20(META_MINIMA_SORTEIO - quantidade === 20);

      const percent = quantidade / META_MINIMA_SORTEIO;

      Animated.timing(animatedWidth, {
        toValue: Math.min(percent, 1),
        duration: 600,
        useNativeDriver: false,
      }).start();

      animatedPercent.setValue(percent * 100);
    });
  }, [rodadaAtual, isAdmin]);

  /* ================= RANKING ================= */
  useEffect(() => {
    if (isAdmin) return;

    async function carregarRanking() {
      const snap = await getDocs(query(collection(db, "UsuariosPrivado"), limit(20)));
      const lista = snap.docs
        .map((d) => {
          const data = d.data();
          const premios = Number(data.premios ?? data.premios?.saldo ?? 0);
          const compartilhamento = Number(data.compartilhamento?.saldo ?? 0);
          return {
            uid: d.id,
            nome: data.nome || "Usuário",
            foto: data.foto || null,
            total: premios + compartilhamento,
          };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      setRanking(lista);
    }

    carregarRanking();
  }, [isAdmin]);

  /* ================= COMPARTILHAR ================= */
  async function handleCompartilhar() {
    const codigo = usuarioPrivado.compartilhamento.codigo;
    if (!codigo) return;

    const link = `https://rifa-digital-f6425.web.app/ref?code=${codigo}`;
    const message = `🚀 Compartilhe com seus amigos e cada amigo que comprar através do seu link te dá R$0,25 + cartelas grátis! Quanto mais compartilhar, maior seu potencial de renda! \nUse meu código: ${codigo}\n${link}`;

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
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      {/* MENU */}
      <Pressable onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={{ padding: 16, marginTop: 20 }}>
        <Text style={{ color: "#fff", fontSize: 22 }}>☰</Text>
      </Pressable>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* SAUDAÇÃO */}
        <Text style={{ color: "#fff", fontSize: 20 }}>Olá, {profile?.nome || "Usuário"} 👋</Text>

        {/* RANKING HORIZONTAL */}
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: "#facc15", fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>
            🏆 Últimos Ganhos
          </Text>

          <FlatList
            data={ranking}
            keyExtractor={(item) => item.uid}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 10 }}
            renderItem={({ item, index }) => {
              const anim = new Animated.Value(0);
              Animated.timing(anim, { toValue: 1, duration: 500, delay: index * 150, useNativeDriver: true }).start();

              return (
                <Animated.View
                  style={[
                    styles.cardHorizontal,
                    {
                      opacity: anim,
                      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                    },
                  ]}
                >
                  <View style={styles.avatarHorizontal}>
                    {item.foto ? (
                      <Image source={{ uri: item.foto }} style={styles.avatarHorizontal} resizeMode="cover" />
                    ) : (
                      <Text style={{ color: "#fff", fontWeight: "bold" }}>{item.nome[0] || "U"}</Text>
                    )}
                  </View>
                  <Text style={styles.nomeHorizontal}>{item.nome}</Text>
                  <Text style={styles.ganhoHorizontal}>🎉 R$ {item.total.toFixed(2)}</Text>
                </Animated.View>
              );
            }}
          />
        </View>

        {/* SALDO */}
        <View style={{ backgroundColor: "#020617", padding: 16, borderRadius: 14, marginTop: 16 }}>
          <Text style={{ color: "#38bdf8", fontSize: 18, fontWeight: "bold" }}>💳 Saldo disponível</Text>
          <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold", marginTop: 6 }}>R$ {saldo.toFixed(2)}</Text>
          <View style={{ flexDirection: "row", marginTop: 12 }}>
            <Pressable
              onPress={() => navigation.navigate("Depositar")}
              style={{ backgroundColor: "#16a34a", padding: 12, borderRadius: 12, marginRight: 8 }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold" }}>💵 Depositar</Text>
            </Pressable>
            {saldo >= 100 && (
              <Pressable
                onPress={handleSacar}
                style={{ backgroundColor: "#f97316", padding: 12, borderRadius: 12 }}
              >
                <Text style={{ color: "#fff", fontWeight: "bold" }}>🏧 Sacar</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* PRÊMIO */}
        <View style={{ backgroundColor: "#1f2937", padding: 16, borderRadius: 14, marginTop: 16, borderWidth: 2, borderColor: "#f59e0b" }}>
          <Text style={{ color: "#f59e0b", fontSize: 28, fontWeight: "bold", textAlign: "center" }}>
            🎉 PRÊMIO R$ {PREMIO_ATUAL} 🎉
          </Text>

          {showMensagem20 && <Text style={{ color: "#fff", textAlign: "center", marginTop: 6 }}>Faltam 20 cartelas!</Text>}

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

          <Animated.Text style={{ color: "#fff", textAlign: "center", marginTop: 4, fontWeight: "bold" }}>
            {animatedPercent.interpolate({
              inputRange: [0, 100],
              outputRange: ["0%", `${Math.round(cartelasDisponiveis / META_MINIMA_SORTEIO * 100)}%`],
            })}
          </Animated.Text>
        </View>

        {/* CARTELAS */}
        <View style={{ backgroundColor: "#1e293b", padding: 16, borderRadius: 14, marginTop: 16 }}>
          <Text style={{ color: "#facc15", fontSize: 18, fontWeight: "bold" }}>🎟️ Cartelas disponíveis</Text>
          <Text style={{ color: "#fff", fontSize: 22, marginVertical: 8 }}>{cartelasDisponiveis}</Text>
          <Pressable
            onPress={() => navigation.navigate("EscolherCartelas")}
            style={{ backgroundColor: "#3b82f6", padding: 12, borderRadius: 12 }}
          >
            <Text style={{ color: "#fff", fontWeight: "bold", textAlign: "center" }}>🛒 Comprar Cartela</Text>
          </Pressable>
        </View>

        {/* SORTEIO */}
        <Pressable
          onPress={() => navigation.navigate("Sorteio")}
          style={{ backgroundColor: "#f59e0b", padding: 14, borderRadius: 12, marginTop: 16 }}
        >
          <Text style={{ color: "#000", fontWeight: "bold", textAlign: "center" }}>🎰 Ver Sorteio Ao Vivo</Text>
        </Pressable>

        {/* COMPARTILHAR – BARRA DE PROGRESSO META */}
        <View style={{ marginTop: 20, padding: 16, borderRadius: 14, backgroundColor: "#1f2937", borderWidth: 2, borderColor: "#f59e0b" }}>
          <Text style={{ color: "#f59e0b", fontSize: 22, fontWeight: "bold", textAlign: "center" }}>
            🚀 Ganhe R$1000 + Cartelas Extras!
          </Text>
          <Text style={{ color: "#fff", fontSize: 16, textAlign: "center", marginTop: 6 }}>
            Compartilhe com seus amigos e cada amigo que comprar te aproxima da meta!
          </Text>

          <Pressable
            onPress={handleCompartilhar}
            style={{
              marginTop: 16,
              backgroundColor: "#f59e0b",
              padding: 14,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#000", fontWeight: "bold", fontSize: 16 }}>📤 Compartilhar agora</Text>
          </Pressable>

          {/* Barra de progresso de compartilhamento */}
          <View style={{ marginTop: 16, height: 20, borderRadius: 12, overflow: "hidden", backgroundColor: "#374151" }}>
            <Animated.View
              style={{
                height: "100%",
                width: shareProgressWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                backgroundColor: "#34d399",
              }}
            />
          </View>
          <Text style={{ color: "#fff", fontSize: 14, textAlign: "center", marginTop: 4 }}>
            {`Progresso: R$${(usuarioPrivado.compartilhamento.uso * REAIS_POR_COMPRA).toFixed(2)} de R$${META_COMPARTILHAR_REAIS} + ${Math.min(usuarioPrivado.compartilhamento.uso, META_COMPARTILHAR_CARTELAS)} cartelas extras`}
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
