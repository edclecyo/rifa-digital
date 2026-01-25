import { useContext } from "react";
import { AuthContext } from "../contexts/AuthContext";

export default function useRequireLgpd() {
  const {
    lgpdPendente,
    loading,
    LGPDModal,
  } = useContext(AuthContext);

  // 🔒 Bloqueia ações enquanto LGPD não foi aceito
  function protegerAcao(callback) {
    if (lgpdPendente) {
      alert("Você precisa aceitar os termos de uso para continuar.");
      return;
    }
    callback();
  }

  return {
    mostrarModalLgpd: lgpdPendente === true,
    loading,
    LGPDModal,
    protegerAcao,
  };
}
