import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { httpsCallable } from "firebase/functions";
import { functions } from "../services/firebase";

export default function LGPDModal({ visible, onAceito }) {
  const [loading, setLoading] = useState(false);
  const [scrollFinal, setScrollFinal] = useState(false);
  const scrollRef = useRef(null);

  
  /* ===============================
     🔄 RESET AO ABRIR MODAL
  =============================== */
  useEffect(() => {
    if (!visible) return;

    setScrollFinal(false);
    setLoading(false);

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: 0,
        animated: false,
      });
    });
  }, [visible]);

  /* ===============================
     ✅ ACEITAR LGPD
  =============================== */
  async function aceitarLgpd() {
  if (!scrollFinal || loading) {
    Alert.alert(
      "Atenção",
      "Você precisa ler todo o termo antes de aceitar."
    );
    return;
  }

  try {
    setLoading(true);

    const registrarAceite = httpsCallable(
      functions, // ✅ CORRETO
      "registrarAceiteLgpd"
    );

    const device = Platform?.OS || "unknown";

    await registrarAceite({
      origem: "app",
      device,
    });

    // 🔔 avisa o pai (Routes/AuthContext)
    if (typeof onAceito === "function") {
      onAceito(true);
    }
  } catch (err) {
    console.error("❌ Erro aceitar LGPD:", err);

    Alert.alert(
      "Erro",
      err?.message ||
        "Não foi possível registrar o aceite. Tente novamente."
    );
  } finally {
    setLoading(false);
  }
}
  /* ===============================
     📜 CONTROLE DE SCROLL
  =============================== */
  function handleScroll({ nativeEvent }) {
    const {
      layoutMeasurement,
      contentOffset,
      contentSize,
    } = nativeEvent;

    const chegouNoFim =
      layoutMeasurement.height + contentOffset.y >=
      contentSize.height - 20;

    if (chegouNoFim) {
      setScrollFinal(true);
    }
  }
if (!visible) return null;

return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>
            Termos de Uso e Política de Privacidade
          </Text>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            <Text style={styles.text}>
{`TERMO DE USO E POLÍTICA DE PRIVACIDADE – SISTEMA DE RIFA DIGITAL

Última atualização: 01/2026
Versão: 1.0

Ao utilizar este aplicativo, você declara que leu e concorda com todos os termos abaixo.

1. OBJETO
A plataforma tem como finalidade disponibilizar rifas digitais numeradas,
permitindo reserva, pagamento e sorteio de forma transparente.

2. REQUISITOS
É obrigatório ter 18 anos ou mais e fornecer informações verdadeiras.

3. DADOS COLETADOS
- Nome
- CPF
- E-mail
- Telefone
- Dados de pagamento (processados por terceiros)
- IP, dispositivo e logs de uso

4. FINALIDADE
Os dados são utilizados para:
- Identificação do usuário
- Processamento de pagamentos
- Prevenção de fraudes
- Cumprimento de obrigações legais

5. COMPARTILHAMENTO
Os dados poderão ser compartilhados apenas com:
- Processadores de pagamento
- Serviços de hospedagem
- Autoridades legais, quando exigido

6. SEGURANÇA
Adotamos medidas técnicas para proteger seus dados, incluindo criptografia
e controle de acesso.

7. DIREITOS DO USUÁRIO
Você pode solicitar acesso, correção, exclusão ou revogação do consentimento,
conforme a LGPD (Lei nº 13.709/2018).

8. CONSENTIMENTO
Ao aceitar este termo, você autoriza expressamente o tratamento dos seus dados.

9. BLOQUEIO
Sem o aceite deste termo, o uso do sistema será bloqueado.

10. LEGISLAÇÃO
Este termo é regido pelas leis da República Federativa do Brasil.

DECLARAÇÃO FINAL
Declaro que li integralmente este documento e concordo com seus termos.
`}
            </Text>
          </ScrollView>

          <Pressable
            style={[
              styles.button,
              (!scrollFinal || loading) &&
                styles.buttonDisabled,
            ]}
            onPress={aceitarLgpd}
            disabled={!scrollFinal || loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Registrando..." : "ACEITAR TERMOS"}
            </Text>
          </Pressable>

          {!scrollFinal && (
            <Text style={styles.hint}>
              Role até o final para liberar o botão
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ===============================
   🎨 STYLES
================================ */
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 16,
  },
  container: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    maxHeight: "85%",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  scroll: {
    marginBottom: 16,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    color: "#333",
  },
  button: {
    backgroundColor: "#1E90FF",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: {
    backgroundColor: "#999",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    textAlign: "center",
    color: "#666",
  },
});
