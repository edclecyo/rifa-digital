import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Platform } from 'react-native';

export async function registrarPushToken(uid) {
  try {
    // ⚠️ Push só funciona em device físico
    if (Platform.OS === 'android') {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('❌ Permissão de push negada');
        return;
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data;

      console.log('✅ Expo Push Token:', token);

      await setDoc(
        doc(db, 'Usuarios', uid),
        {
          expoPushToken: token,
          pushAtivo: true,
          atualizadoEm: new Date(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error('🔥 Erro ao registrar push token:', err);
  }
}
