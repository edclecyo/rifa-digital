import { View, Text, Pressable, Alert } from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../services/firebase';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export default function AdminCompliance() {
  // ⚠️ Mesma região das Cloud Functions
  const functions = getFunctions(app, 'southamerica-east1');
  const gerarPdfLegal = httpsCallable(functions, 'gerarPdfLegal');

  async function baixarPdf() {
    try {
      const res = await gerarPdfLegal();

      if (!res?.data?.base64) {
        throw new Error('PDF inválido');
      }

      const base64 = res.data.base64;
      const nomeArquivo =
        res.data.nomeArquivo ||
        `termo-lgpd-${Date.now()}.pdf`;

      const fileUri = FileSystem.documentDirectory + nomeArquivo;

      // 🧾 Salva PDF localmente
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 📤 Compartilhamento seguro
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          'PDF gerado',
          `Arquivo salvo em:\n${fileUri}`
        );
        return;
      }

      await Sharing.shareAsync(fileUri);

    } catch (err) {
      console.error('❌ Erro gerar PDF:', err);

      let msg = 'Falha ao gerar documento legal.';

      if (err?.code === 'unauthenticated') {
        msg = 'Usuário não autenticado.';
      } else if (err?.code === 'failed-precondition') {
        msg = 'LGPD ainda não foi aceita.';
      } else if (err?.message) {
        msg = err.message;
      }

      Alert.alert('Erro', msg);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: '#f9fafb' }}>
      <Text
        style={{
          fontSize: 20,
          fontWeight: '700',
          marginBottom: 20,
        }}
      >
        📄 Documentos Legais
      </Text>

      <Pressable
        onPress={baixarPdf}
        style={{
          backgroundColor: '#2563eb',
          padding: 16,
          borderRadius: 12,
        }}
      >
        <Text
          style={{
            color: '#fff',
            textAlign: 'center',
            fontWeight: '600',
            fontSize: 16,
          }}
        >
          Gerar Termo LGPD (PDF)
        </Text>
      </Pressable>
    </View>
  );
}
