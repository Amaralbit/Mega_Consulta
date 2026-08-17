/**
 * datasource/consultaVeiculo.js
 *
 * ESTE é o único lugar que precisa mudar quando a fonte de dados real entrar
 * (ex.: InfoSimples, outro bureau, ou uma integração autenticada de despachante).
 *
 * Hoje: retorna dados MOCKADOS, gerados de forma pseudo-aleatória mas
 * determinística a partir da placa, só para o front-end ter algo realista
 * pra renderizar durante os testes de UX.
 *
 * Contrato esperado da função (mantenha esse formato ao trocar por dados reais):
 *
 *   consultarVeiculo({ estado, placa, renavam, documento }) -> Promise<{
 *     placa: string,
 *     renavam: string,
 *     debitos: Array<{
 *       tipo: 'IPVA' | 'Licenciamento' | 'Multa' | 'Outros',
 *       descricao: string,
 *       vencimento: string,      // 'YYYY-MM-DD'
 *       valor: number,           // em reais
 *       guia: string             // identificador da guia/DAE (quando existir)
 *     }>,
 *     total: number
 *   }>
 */

// hash simples só para os valores mockados variarem de forma estável por placa
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function proximaData(diasAPartirDeHoje) {
  const d = new Date();
  d.setDate(d.getDate() + diasAPartirDeHoje);
  return d.toISOString().slice(0, 10);
}

function gerarDebitosMock(placaNormalizada, seed) {
  const debitos = [];

  // IPVA - parcela em aberto
  debitos.push({
    tipo: 'IPVA',
    descricao: `IPVA ${new Date().getFullYear()} - cota única`,
    vencimento: proximaData(-(seed % 40) - 5),
    valor: 480 + (seed % 900),
    guia: `DAE-${seed % 100000}`,
  });

  // Licenciamento
  debitos.push({
    tipo: 'Licenciamento',
    descricao: `Licenciamento anual ${new Date().getFullYear()}`,
    vencimento: proximaData(-(seed % 20) - 2),
    valor: 148.71,
    guia: `DAE-${(seed + 7) % 100000}`,
  });

  // 0 a 2 multas, dependendo do hash da placa
  const qtdMultas = seed % 3;
  const infracoes = [
    'Avançar sinal vermelho',
    'Excesso de velocidade até 20%',
    'Estacionar em local proibido',
    'Não uso do cinto de segurança',
  ];
  for (let i = 0; i < qtdMultas; i++) {
    const idx = (seed + i * 13) % infracoes.length;
    debitos.push({
      tipo: 'Multa',
      descricao: infracoes[idx],
      vencimento: proximaData(-(seed % 60) - i * 5),
      valor: 130.16 + (i * 88.38),
      guia: `AIT-${(seed + i * 31) % 900000}`,
    });
  }

  return debitos;
}

async function consultarVeiculo({ estado, placa, renavam, documento }) {
  // simula latência de uma consulta real (RPA costuma levar segundos, não ms)
  await new Promise((resolve) => setTimeout(resolve, 700 + Math.random() * 500));

  const placaNormalizada = String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const seed = hashString(placaNormalizada + String(renavam || ''));

  const debitos = gerarDebitosMock(placaNormalizada, seed);
  const total = debitos.reduce((acc, d) => acc + d.valor, 0);

  return {
    estado,
    placa: placaNormalizada,
    renavam,
    debitos,
    total: Number(total.toFixed(2)),
    fonte: 'mock', // marcador só pra ficar óbvio no JSON que isso não é dado real ainda
  };
}

module.exports = { consultarVeiculo };
