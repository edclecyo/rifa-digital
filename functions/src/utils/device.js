// src/utils/device.js
import * as Application from 'expo-application';
import { Platform } from 'react-native';

export function getDeviceId() {
  if (Platform.OS === 'android') {
    return Application.getAndroidId(); // ✅ seguro e estável
  }

  return `${Application.applicationId}_ios`;
}