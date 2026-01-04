import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function AdminPromocaoHome() {
  const [titulo, setTitulo] = useState('');
  const [valorCartela, setValorCartela] = useState('');
  const [valorPremio, setValorPremio] = useState('');
  const [cta, setCta] = useState('');
  const [encerraEm, setEncerraEm] = useState('');
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    const carregar = async () => {
      try {
        const snap = await getDoc(doc(db, 'Promocoes', 'home'));

        if (snap.exists()) {
          const d = snap.data();
          setTitulo(d.titulo || '');
          setValorCartela(String(d.valorCartela || ''));
          setValorPremio(String(d.valorPremio || ''));
          setCta(d.cta || '');
          setAtivo(d.ativo ?? true);

          if (d.encerraEm?.toDate) {
            const dt = d.encerraEm.toDate();
            const formatada =
              `${String(dt.getDate()).padStart(2, '0')}/` +
              `${String(dt.getMonth() + 1).padStart(2, '0')}/` +
              `${dt.getFullYear()} - ` +
              `${String(dt.getHours()).padStart(2, '0')}:` +
              `${String(dt.getMinutes()).padStart(2, '0')}`;

            setEncerraEm(formatada);
          }
        }
      } catch (e) {
        console.log('Erro ao carregar promo:', e);
      }
    };

    carregar();
  }, []);

  function parseDataBR(valor) {
    // Esperado: DD/MM/AAAA - HH:mm
    const match = valor.match(
      /^(\d{2})\/(\d{2})\/(\d{4})\s-\s(\d{2}):(\d{2})$/
    );

    if (!match) return null;

    const [, dd, mm, yyyy, hh, min] = match;

    return new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min)
    );
  }

  async function salvar() {
    if (!titulo || !valorCartela || !valorPremio) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios');
      return;
    }

    let dataEncerramento = null;

    if (encerraEm) {
      dataEncerramento = parseDataBR(encerraEm);

      if (!dataEncerramento || isNaN(dataEncerramento.getTime())) {
        Alert.alert(
          'Erro',
          'Data inválida. Use: DD/MM/AAAA - HH:mm'
        );
        return;
      }
    }

    try {
      await setDoc(
        doc(db, 'Promocoes', 'home'),
        {
          titulo,
          valorCartela: Number(valorCartela),
          valorPremio: Number(valorPremio),
          cta,
          ativo: true,
          encerraEm: dataEncerramento,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      Alert.alert('Sucesso', 'Promoção salva com sucesso 🚀');
    } catch (e) {
      console.log('Erro ao salvar promoção:', e);
      Alert.alert(
        'Erro',
        'Não foi possível salvar a promoção'
      );
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#020617', padding: 20 }}>
      <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 20 }}>
        🎯 Promoção Home
      </Text>

      <TextInput
        placeholder="Título"
        placeholderTextColor="#94a3b8"
        value={titulo}
        onChangeText={setTitulo}
        style={input}
      />

      <TextInput
        placeholder="Valor da cartela"
        keyboardType="numeric"
        placeholderTextColor="#94a3b8"
        value={valorCartela}
        onChangeText={setValorCartela}
        style={input}
      />

      <TextInput
        placeholder="Valor do prêmio"
        keyboardType="numeric"
        placeholderTextColor="#94a3b8"
        value={valorPremio}
        onChangeText={setValorPremio}
        style={input}
      />

      <TextInput
        placeholder="Texto do botão (CTA)"
        placeholderTextColor="#94a3b8"
        value={cta}
        onChangeText={setCta}
        style={input}
      />

      <TextInput
        placeholder="Encerramento (DD/MM/AAAA - HH:mm)"
        placeholderTextColor="#94a3b8"
        value={encerraEm}
        onChangeText={setEncerraEm}
        style={input}
      />

      <Pressable
        onPress={salvar}
        style={{
          marginTop: 20,
          backgroundColor: '#22c55e',
          padding: 16,
          borderRadius: 14,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#020617', fontSize: 16, fontWeight: 'bold' }}>
          Salvar Promoção
        </Text>
      </Pressable>
    </View>
  );
}

const input = {
  backgroundColor: '#0f172a',
  color: '#fff',
  borderRadius: 12,
  padding: 14,
  marginBottom: 12,
};
