import { useContext, useCallback } from "react";
import { Alert } from "react-native";
import { AuthContext } from "../contexts/AuthContext";

export default function useRequireLgpd() {
  const {
    lgpdPendente,
    loading,
    LGPDModal,
  } = useContext(AuthContext);

  // 🔒 Bloqueia ações enquanto LGPD não foi aceito
  const protegerAcao = useCallback(
    (callback) => {
      if (lgpdPendente) {
        Alert.alert(
          "Atenção",
          "Você precisa aceitar os termos de uso para continuar."
        );
        return;
      }

      if (typeof callback === "function") {
        callback();
      }
    },
    [lgpdPendente]
  );

  return {
    mostrarModalLgpd: lgpdPendente === true,
    loading,
    LGPDModal,
    protegerAcao,
  };
}
