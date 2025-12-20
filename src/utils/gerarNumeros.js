// Gera lista de números de 6 dígitos
export function gerarNumeros(qtd) {
  const numeros = [];
  const usados = new Set();

  while (numeros.length < qtd) {
    const n = Math.floor(Math.random() * 1000000); // 0 a 999999
    const formatado = String(n).padStart(6, '0');

    if (!usados.has(formatado)) {
      usados.add(formatado);
      numeros.push(formatado);
    }
  }

  return numeros;
}
