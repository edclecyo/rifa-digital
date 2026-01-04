import { View, Text, Pressable, ScrollView, Share, Animated, Dimensions, Modal } from 'react-native';
import { useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import * as Notifications from 'expo-notifications';
import { db } from '../services/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import PromoBanner from '../components/PromoBanner';
import ConfettiCannon from 'react-native-confetti-cannon';

/* 🔔 Config obrigatória */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Metas de prêmio (em cartelas vendidas)
const META_PREMIO_100 = 100;
const META_PREMIO_500 = 500;
const META_PREMIO_1000 = 1000;

export default function HomeUser() {
  const { user, profile } = useContext(AuthContext);
  const navigation = useNavigation();

  const [cartelasVendidas, setCartelasVendidas] = useState(0);
  const [faltamCartelas, setFaltamCartelas] = useState(0);
  const [sorteioLiberado, setSorteioLiberado] = useState(false);
  const [nivelAtual, setNivelAtual] = useState('vermelho');
  const [proximoNivel, setProximoNivel] = useState(null);
  const [progressoPercentual, setProgressoPercentual] = useState(0);

  const [codigoIndicacao, setCodigoIndicacao] = useState('');
  const [saldoIndicacoes, setSaldoIndicacoes] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalTexto, setModalTexto] = useState('');

  const [barraLayout, setBarraLayout] = useState({ y: 0, height: 0 });

  const progressAnim = useRef(new Animated.Value(0)).current;
  const brilhoAnim = useRef(new Animated.Value(0)).current;
  const telaAltura = Dimensions.get('window').height;

  // Confetes por nível
  const [showConfete100, setShowConfete100] = useState(false);
  const [showConfete500, setShowConfete500] = useState(false);
  const [showConfete1000, setShowConfete1000] = useState(false);

const premioAnim = useRef(new Animated.Value(0)).current;
const premioPulse = useRef(new Animated.Value(1)).current;

    // Atualiza progresso, próximo nível e faltam cartelas
  useEffect(() => {
    let progresso = 100;
    let proximo = null;
    let faltam = 0;
    let metaAtual = 0;

    if (cartelasVendidas < META_PREMIO_100) {
      progresso = (cartelasVendidas / META_PREMIO_100) * 100;
      proximo = 'R$100';
      faltam = META_PREMIO_100 - cartelasVendidas;
      metaAtual = 0;
    } 
    else if (cartelasVendidas < META_PREMIO_500) {
      progresso =
        ((cartelasVendidas - META_PREMIO_100) /
          (META_PREMIO_500 - META_PREMIO_100)) *
        100;
      proximo = 'R$500';
      faltam = META_PREMIO_500 - cartelasVendidas;
      metaAtual = META_PREMIO_100;
    } 
    else if (cartelasVendidas < META_PREMIO_1000) {
      progresso =
        ((cartelasVendidas - META_PREMIO_500) /
          (META_PREMIO_1000 - META_PREMIO_500)) *
        100;
      proximo = 'R$1000';
      faltam = META_PREMIO_1000 - cartelasVendidas;
      metaAtual = META_PREMIO_500;
    } 
    else {
      progresso = 100;
      proximo = null;
      faltam = 0;
      metaAtual = META_PREMIO_1000;
    }

    setProgressoPercentual(Math.min(100, Math.floor(progresso)));
    setProximoNivel(proximo);
    setFaltamCartelas(faltam);
    setSorteioLiberado(faltam === 0);

    // Define nível visual
    const nivel =
      cartelasVendidas >= META_PREMIO_1000
        ? 'dourado'
        : cartelasVendidas >= META_PREMIO_500
        ? 'verde'
        : 'vermelho';

    setNivelAtual(nivel);

    /* 🎉 CONFETES — DISPARA SÓ UMA VEZ POR META */
    if (cartelasVendidas >= META_PREMIO_100 && ultimaMetaRef.current < META_PREMIO_100) {
      setShowConfete100(true);
      ultimaMetaRef.current = META_PREMIO_100;
    }

    if (cartelasVendidas >= META_PREMIO_500 && ultimaMetaRef.current < META_PREMIO_500) {
      setShowConfete500(true);
      ultimaMetaRef.current = META_PREMIO_500;
    }

    if (cartelasVendidas >= META_PREMIO_1000 && ultimaMetaRef.current < META_PREMIO_1000) {
      setShowConfete1000(true);
      ultimaMetaRef.current = META_PREMIO_1000;
    }
  }, [cartelasVendidas]);

useEffect(() => {
  if (!sorteioLiberado) return;

  // Entrada estilo jackpot
  Animated.sequence([
    Animated.timing(premioAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }),
  ]).start();

  // Pulsação infinita (cassino)
  Animated.loop(
    Animated.sequence([
      Animated.timing(premioPulse, {
        toValue: 1.1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(premioPulse, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
    ])
  ).start();
}, [sorteioLiberado]);

  /* 🔐 GERA CÓDIGO ÚNICO */
  function gerarCodigo(uid) {
    return uid.substring(0, 6).toUpperCase();
  }

  /* 🔹 Carrega código de indicação */
  useEffect(() => {
    if (!user?.uid) return;

    const ref = doc(db, 'Indicacoes', user.uid);
    const unsubIndicacao = onSnapshot(ref, async (snap) => {
      if (!snap.exists()) {
        const codigo = gerarCodigo(user.uid);
        await setDoc(ref, { userId: user.uid, codigo, saldo: 0, totalIndicados: 0 });
        setCodigoIndicacao(codigo);
        setSaldoIndicacoes(0);
      } else {
        const data = snap.data();
        setCodigoIndicacao(data.codigo);
        setSaldoIndicacoes(data.saldo || 0);
      }
    });

    return () => unsubIndicacao();
  }, [user?.uid]);

  /* 📤 Compartilhar código */
  async function compartilharCodigo() {
    try {
      await Share.share({
        message: `🎟️ Ganhe dinheiro com a Rifa Digital!\n\nUse meu código: ${codigoIndicacao}\nCadastre-se, compre sua rifa e concorra!\n\n👉 https://seudominio.com/cadastro?ref=${codigoIndicacao}`,
      });
    } catch (error) {
      console.log(error);
    }
  }

  /* 🔥 CARREGA STATUS DO SORTEIO */
  useEffect(() => {
    if (!user?.uid) return;

    const ref = doc(db, 'StatusSorteio', 'geral');

    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      setCartelasVendidas(data.cartelasVendidas ?? 0);
    });

    return unsub;
  }, [user?.uid]);

  /* 🔹 ANIMAÇÃO DA BARRA DE PRÊMIOS */
  useEffect(() => {
    const perc = progressoPercentual / 100;

    Animated.timing(progressAnim, {
      toValue: Math.min(perc, 1),
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progressoPercentual]);

  /* Brilho animado */
  const alertaFinal = !sorteioLiberado && faltamCartelas <= 10;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(brilhoAnim, { toValue: 1, duration: alertaFinal ? 400 : 1200, useNativeDriver: false }),
        Animated.timing(brilhoAnim, { toValue: 0, duration: alertaFinal ? 400 : 1200, useNativeDriver: false }),
      ])
    ).start();
  }, [alertaFinal]);

  /* MODAL CLICK BARRA */
  const onBarPress = (event) => {
    if (!barraLayout.height) return;
    const touchY = event.nativeEvent.pageY;
    const relativeY = touchY - barraLayout.y;
    const yInvertido = barraLayout.height - relativeY;
    let texto = '';

    const alturaTotal = telaAltura / 2;
    const alturaVermelha = (META_PREMIO_100 / META_PREMIO_1000) * alturaTotal;
    const alturaVerde = ((META_PREMIO_500 - META_PREMIO_100) / META_PREMIO_1000) * alturaTotal;

    if (yInvertido <= alturaVermelha) texto = `🔴 Prêmio R$100`;
    else if (yInvertido <= alturaVermelha + alturaVerde) texto = `🟢 Prêmio R$500`;
    else texto = `🟡 Prêmio R$1000`;

    setModalTexto(texto);
    setModalVisible(true);
  };

  const abrirInbox = () => navigation.navigate('InboxNotificacoes');

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#0f172a' }}>
      <ScrollView style={{ flex: 1 }}>
        <View style={{ padding: 20 }}>
          {/* HEADER */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Pressable onPress={() => navigation.openDrawer()}><Text style={{ color: '#fff', fontSize: 26 }}>☰</Text></Pressable>
            <Text style={{ fontSize: 16, color: '#cbd5f5' }}>Olá, {profile?.nome || user?.displayName || 'Usuário'}</Text>
            <Pressable onPress={abrirInbox}><Text style={{ fontSize: 26, color: '#fff' }}>🔔</Text></Pressable>
          </View>

          {/* Promo Banner */}
          <PromoBanner nivelAtual={nivelAtual} onPress={() => navigation.navigate('EscolherCartelas')} />

          {/* Próximo nível */}
          {proximoNivel && (
            <View style={{ backgroundColor: '#020617', padding: 14, borderRadius: 14, marginBottom: 20, borderWidth: 1, borderColor: '#334155' }}>
              <Text style={{ color: '#facc15', fontWeight: 'bold', fontSize: 15 }}>💰 Próximo prêmio: {proximoNivel}</Text>
              <Text
                style={{
                  color: faltamCartelas === 0 ? '#22c55e' : '#cbd5f5',
                  marginTop: 4,
                  fontWeight: faltamCartelas === 0 ? 'bold' : 'normal',
                  fontSize: faltamCartelas === 0 ? 16 : 14,
                }}
              >
                {faltamCartelas === 0
                  ? '🎉 Sorteio liberado! Boa sorte!'
                  : `🎟️ Faltam ${faltamCartelas} cartela${faltamCartelas !== 1 ? 's' : ''} para o sorteio acontecer 🚀`}
              </Text>
              <Text style={{ color: '#22c55e', marginTop: 2, fontWeight: 'bold' }}>📊 Progresso: {progressoPercentual}%</Text>
            </View>
          )}
{sorteioLiberado && (
  <Animated.View
    style={{
      marginBottom: 20,
      padding: 22,
      borderRadius: 18,
      alignItems: 'center',
      backgroundColor:
        nivelAtual === 'dourado'
          ? '#78350f'
          : nivelAtual === 'verde'
          ? '#064e3b'
          : '#7f1d1d',
      borderWidth: 2,
      borderColor:
        nivelAtual === 'dourado'
          ? '#facc15'
          : nivelAtual === 'verde'
          ? '#22c55e'
          : '#ef4444',
      transform: [
        {
          scale: premioAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 1],
          }),
        },
        { scale: premioPulse },
      ],
      shadowColor: '#facc15',
      shadowOpacity: 0.9,
      shadowRadius: 20,
      elevation: 12,
    }}
  >
  
    <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#facc15' }}>
      🎰 PRÊMIO LIBERADO!
    </Text>

    <Text style={{ marginTop: 6, color: '#e5e7eb', fontSize: 15 }}>
      Boa sorte no sorteio 🍀
    </Text>

    <Text style={{ marginTop: 10, fontSize: 22, fontWeight: 'bold', color: '#22c55e' }}>
      {nivelAtual === 'dourado'
        ? '💰 R$ 1.000'
        : nivelAtual === 'verde'
        ? '💵 R$ 500'
        : '💸 R$ 100'}
    </Text>
  </Animated.View>
)}

          {/* Código de indicação */}
          <View style={{ backgroundColor: '#020617', padding: 20, borderRadius: 16, marginBottom: 20 }}>
            <Text style={{ color: '#38bdf8', fontSize: 16, fontWeight: 'bold' }}>💸 Ganhe R$0,25 por indicação</Text>
            <Text style={{ color: '#e5e7eb', marginTop: 8 }}>Seu código:</Text>
            <Text style={{ color: '#22c55e', fontSize: 22, fontWeight: 'bold' }}>{codigoIndicacao}</Text>
            <Text style={{ color: '#facc15', marginTop: 8 }}>Saldo acumulado: R$ {saldoIndicacoes.toFixed(2)}</Text>
            <Pressable
              onPress={compartilharCodigo}
              style={{ backgroundColor: '#2563eb', padding: 14, borderRadius: 12, marginTop: 12, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>📤 Compartilhar Código</Text>
            </Pressable>
        
		</View>

          {/* Botões */}
          <View style={{ marginTop: 30 }}>
            <Pressable
              onPress={() => navigation.navigate('EscolherCartelas')}
              style={{ backgroundColor: '#2563eb', padding: 22, borderRadius: 16, marginBottom: 20 }}
            >
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>Comprar Cartelas</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('RankingPublico')}
              style={{ backgroundColor: '#f59e0b', padding: 22, borderRadius: 16, marginBottom: 20 }}
            >
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>🏆 Ranking Geral</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('MinhasCartelas')}
              style={{ backgroundColor: '#16a34a', padding: 22, borderRadius: 16 }}
            >
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>Minhas Cartelas</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Barra de prêmios com cores animadas */}
      <Pressable
        onPress={onBarPress}
        onLayout={(event) => setBarraLayout(event.nativeEvent.layout)}
        style={{
          width: 30,
          height: telaAltura / 2,
          marginRight: 10,
          marginTop: telaAltura / 4,
          overflow: 'hidden',
          backgroundColor: '#334155',
          borderRadius: 0,
        }}
      >
        {/* R$100 */}
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 0,
            width: '100%',
            height: (META_PREMIO_100 / META_PREMIO_1000) * (telaAltura / 2),
            backgroundColor: 'red',
            opacity: progressAnim.interpolate({
              inputRange: [0, META_PREMIO_100 / META_PREMIO_1000],
              outputRange: [0.05, 1],
              extrapolate: 'clamp',
            }),
          }}
        />

        {/* R$500 */}
        <Animated.View
          style={{
            position: 'absolute',
            bottom: (META_PREMIO_100 / META_PREMIO_1000) * (telaAltura / 2),
            width: '100%',
            height: ((META_PREMIO_500 - META_PREMIO_100) / META_PREMIO_1000) * (telaAltura / 2),
            backgroundColor: 'green',
            opacity: progressAnim.interpolate({
              inputRange: [META_PREMIO_100 / META_PREMIO_1000, META_PREMIO_500 / META_PREMIO_1000],
              outputRange: [0.05, 1],
              extrapolate: 'clamp',
            }),
          }}
        />

        {/* R$1000 */}
        <Animated.View
          style={{
            position: 'absolute',
            bottom: (META_PREMIO_500 / META_PREMIO_1000) * (telaAltura / 2),
            width: '100%',
            height: ((META_PREMIO_1000 - META_PREMIO_500) / META_PREMIO_1000) * (telaAltura / 2),
            backgroundColor: 'gold',
            opacity: progressAnim.interpolate({
              inputRange: [META_PREMIO_500 / META_PREMIO_1000, 1],
              outputRange: [0.05, 1],
              extrapolate: 'clamp',
            }),
          }}
        />

        {/* Brilho animado */}
        <Animated.View
          style={{
            position: 'absolute',
            bottom: brilhoAnim.interpolate({ inputRange: [0, 1], outputRange: [-telaAltura * 0.3, telaAltura * 0.3] }),
            width: '100%',
            height: 10,
            backgroundColor: 'rgba(255,255,255,0.3)',
          }}
        />
      </Pressable>

      {/* Confetes */}
      {showConfete100 && <ConfettiCannon count={50} origin={{ x: -10, y: 0 }} fadeOut autoStart onAnimationEnd={() => setShowConfete100(false)} colors={['#ff0000']} />}
      {showConfete500 && <ConfettiCannon count={80} origin={{ x: -10, y: 0 }} fadeOut autoStart onAnimationEnd={() => setShowConfete500(false)} colors={['#00ff00']} />}
      {showConfete1000 && <ConfettiCannon count={120} origin={{ x: -10, y: 0 }} fadeOut autoStart onAnimationEnd={() => setShowConfete1000(false)} colors={['#ffd700']} />}

      {/* MODAL */}
      <Modal transparent visible={modalVisible} animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#1e293b', padding: 20, borderRadius: 16, width: 220, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>{modalTexto}</Text>
            <Pressable
              onPress={() => setModalVisible(false)}
              style={{ backgroundColor: '#2563eb', padding: 10, borderRadius: 12, width: '100%', alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Fechar</Text>
            </Pressable>
		 
		 </View>
		  
        </View>
      </Modal>
	 
    </View>
	
  );
}
