import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyDUga-GB_sOvvZd9kfwQGybx5I24kqLLgY',
  authDomain: 'rifa-digital-f6425.firebaseapp.com',
  projectId: 'rifa-digital-f6425',
  storageBucket: 'rifa-digital-f6425.appspot.com',
  messagingSenderId: '763080965700',
  appId: '1:763080965700:web:759c59dbc8e6a0e2080611',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Auth com persistência AsyncStorage
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Firestore
export const db = getFirestore(app);

// Cloud Functions
export const functions = getFunctions(app, 'southamerica-east1');

export default app;
