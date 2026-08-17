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

function formatarVencimentoParaISO(dataString) {
  if (!dataString) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataString)) return dataString;
  const parts = String(dataString).split('/');
  if (parts.length === 3) {
    const [dia, mes, ano] = parts;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  return dataString;
}

async function consultarVeiculo({ estado, placa, renavam, documento }) {
  const placaNormalizada = String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const renavamNormalizado = String(renavam || '').replace(/\D/g, '');

  const token = process.env.INFOSIMPLES_TOKEN;

  if (token) {
    console.log(`[Consulta] Iniciando consulta real na InfoSimples (SEFAZ-GO) para Placa: ${placaNormalizada}, Renavam: ${renavamNormalizado}`);
    
    const params = new URLSearchParams({
      token: token,
      placa: placaNormalizada,
      renavam: renavamNormalizado
    });

    try {
      const response = await fetch(`https://api.infosimples.com/api/v1/consultas/sefaz/go/ipva?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Erro na chamada da API InfoSimples: Status ${response.status}`);
      }

      const resJson = await response.json();
      
      if (resJson.code !== 200) {
        throw new Error(resJson.code_message || 'Erro desconhecido retornado pela API da InfoSimples.');
      }

      const dataObj = resJson.data && resJson.data[0];
      if (!dataObj) {
        throw new Error('Nenhum dado retornado para este veículo no portal da SEFAZ.');
      }

      const guias = dataObj.guias || [];
      
      // Filtra apenas guias não pagas, se houver indicador de situação
      const guiasFiltradas = guias.filter(g => {
        if (g.situacao) {
          const sit = String(g.situacao).toLowerCase();
          return !sit.includes('pago') && !sit.includes('quitado') && !sit.includes('baixado');
        }
        return true;
      });

      const debitos = guiasFiltradas.map(g => {
        const desc = String(g.descricao || '').toLowerCase();
        let tipo = 'IPVA';
        if (desc.includes('licenciamento') || desc.includes('taxa')) {
          tipo = 'Licenciamento';
        } else if (desc.includes('multa') || desc.includes('infracao')) {
          tipo = 'Multa';
        }

        const parcelamentoLabel = g.parcelamento || g.parcela || '';
        const descricaoCompleta = g.descricao 
          ? g.descricao 
          : `IPVA ${g.exercicio || new Date().getFullYear()}${parcelamentoLabel ? ' - ' + parcelamentoLabel : ''}`;

        let valorNum = 0;
        if (g.normalizado_valor !== undefined) {
          valorNum = Number(g.normalizado_valor);
        } else if (g.valor !== undefined) {
          valorNum = parseFloat(String(g.valor).replace(/\./g, '').replace(',', '.')) || 0;
        }

        return {
          tipo,
          descricao: descricaoCompleta,
          vencimento: formatarVencimentoParaISO(g.vencimento),
          valor: valorNum,
          guia: g.codigo_barras || g.guia || 'Não informada'
        };
      });

      const total = debitos.reduce((acc, d) => acc + d.valor, 0);

      return {
        estado,
        placa: placaNormalizada,
        renavam: renavamNormalizado,
        debitos,
        total: Number(total.toFixed(2)),
        fonte: 'infosimples'
      };
    } catch (err) {
      console.error('[Consulta] Erro ao integrar com InfoSimples:', err);
      throw err;
    }
  }

  // Fallback para dados Mockados caso não exista Token
  console.log(`[Consulta] Sem token InfoSimples configurado. Retornando dados simulados (mock) para Placa: ${placaNormalizada}`);
  
  // simula latência de uma consulta real
  await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 400));

  const seed = hashString(placaNormalizada + String(renavamNormalizado));
  const debitos = gerarDebitosMock(placaNormalizada, seed);
  const total = debitos.reduce((acc, d) => acc + d.valor, 0);

  return {
    estado,
    placa: placaNormalizada,
    renavam: renavamNormalizado,
    debitos,
    total: Number(total.toFixed(2)),
    fonte: 'mock',
  };
}

module.exports = { consultarVeiculo };
