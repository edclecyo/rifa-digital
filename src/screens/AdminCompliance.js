import { View, Text, Pressable, Alert } from "react-native";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../services/firebase";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

export default function AdminCompliance() {
  const functions = getFunctions(app, "us-central1");
  const gerarPdf = httpsCallable(functions, "gerarPdfLegal");

  async function baixarPdf() {
    try {
      const res = await gerarPdf();
      const base64 = res.data.base64;

      const fileUri = FileSystem.documentDirectory + "termo-lgpd.pdf";

      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(fileUri);
    } catch (err) {
      console.error(err);
      Alert.alert("Erro", err.message || "Falha ao gerar PDF");
    }
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold" }}>
        📄 Documentos Legais
      </Text>

      <Pressable
        onPress={baixarPdf}
        style={{
          backgroundColor: "#2563eb",
          padding: 16,
          marginTop: 20,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: "#fff", textAlign: "center" }}>
          Gerar Termo LGPD (PDF)
        </Text>
      </Pressable>
    </View>
  );
}
