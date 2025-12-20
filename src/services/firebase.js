import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDUga-GB_sOvvZd9kfwQGybx5I24kqLLgY',
  authDomain: 'rifa-digital-f6425.firebaseapp.com',
  projectId: 'rifa-digital-f6425',
  storageBucket: 'rifa-digital-f6425.firebasestorage.app',
  messagingSenderId: '763080965700',
  appId: '1:763080965700:web:759c59dbc8e6a0e2080611',
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
