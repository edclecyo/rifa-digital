import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useState, useContext } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { AuthContext } from '../contexts/AuthContext';

export default function Register({ navigation }) {
  const { loading: authLoading } = useContext(AuthContext);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [aceitouLGPD, setAceitouLGPD] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!nome || !email || !senha) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos.');
      return;
    }

    if (senha.length < 6) {
      Alert.alert('Erro', 'Senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (!aceitouLGPD) {
      Alert.alert('Obrigatório', 'Você precisa aceitar a Política de Privacidade (LGPD).');
      return;
    }

    try {
      setLoading(true);

      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      const uid = cred.user.uid;

      // Perfil público
      await setDoc(doc(db, 'Usuarios', uid), {
        nome: nome.trim(),
        email,
        criadoEm: serverTimestamp(),
      }, { merge: true });

      // Dados privados + LGPD
      await setDoc(doc(db, 'UsuariosPrivado', uid), {
        saldo: 0,
        kycNivel: 0,
        bloqueado: false,
        consentimentoLGPD: {
          aceito: true,
          versao: '2026-01',
          aceitoEm: serverTimestamp(),
          origem: 'app',
        },
      }, { merge: true });

      Alert.alert('Sucesso', 'Conta criada com sucesso!');
      navigation.navigate('Login');

    } catch (e) {
      console.error('❌ Erro cadastro:', e);
      Alert.alert('Erro', e.message || 'Ocorreu um erro ao criar sua conta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#f9fafb' }}>
      <Text style={{ fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 }}>
        Criar Conta
      </Text>

      <TextInput
        placeholder="Nome"
        value={nome}
        onChangeText={setNome}
        style={styles.input}
      />

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />

      <TextInput
        placeholder="Senha"
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
        style={styles.input}
      />

      {/* ✅ Checkbox LGPD */}
      <Pressable
        onPress={() => setAceitouLGPD(!aceitouLGPD)}
        style={styles.checkboxContainer}
      >
        <View style={[styles.checkbox, aceitouLGPD && styles.checkboxChecked]} />
        <Text style={{ flex: 1 }}>
          Li e aceito os Termos de Uso e a Política de Privacidade (LGPD)
        </Text>
      </Pressable>

      <Pressable
        onPress={handleRegister}
        disabled={loading || authLoading}
        style={[styles.button, (loading || authLoading) && { opacity: 0.6 }]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Cadastrar</Text>
        )}
      </Pressable>

      <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: 16 }}>
        <Text style={{ textAlign: 'center', color: '#2563eb' }}>Já tem conta? Entrar</Text>
      </Pressable>
    </View>
  );
}

const styles = {
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#22c55e',
    backgroundColor: 'transparent',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#22c55e',
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
};
