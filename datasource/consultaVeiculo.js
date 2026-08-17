const fs = require('fs');

// ---------------------------------------------------------------------------
// Integração real com a InfoSimples (produto "DETRAN/GO Débitos").
//
// IMPORTANTE — leia antes de ativar:
// Esse produto exige credencial de DESPACHANTE credenciado no Detran-GO
// (CPF + senha do sistema deles + certificado digital PKCS12), não apenas
// uma chave de API simples. Sem essas 4 credenciais preenchidas no .env,
// este módulo fica INATIVO de propósito e a aplicação usa o modo gratuito
// de redirecionamento (ver server.js e docs/app.js).
//
// A URL/parâmetros exatos abaixo são o padrão documentado publicamente pela
// InfoSimples para esse produto (login_cpf, login_senha, pkcs12_cert,
// pkcs12_pass, placa, renavam, token da conta) — mas NÃO foram testados
// contra uma conta real. Confirme no painel da sua conta InfoSimples
// (https://api.infosimples.com/) a URL exata do endpoint e o formato
// esperado do certificado antes de contar com isso em produção.
// ---------------------------------------------------------------------------

const INFOSIMPLES_API_URL =
  process.env.INFOSIMPLES_API_URL || 'https://api.infosimples.com/api/v2/consultas/detran/go/debitos';

function estaConfigurado() {
  return Boolean(
    process.env.INFOSIMPLES_TOKEN &&
    process.env.INFOSIMPLES_LOGIN_CPF &&
    process.env.INFOSIMPLES_LOGIN_SENHA &&
    process.env.INFOSIMPLES_PKCS12_CERT_PATH &&
    process.env.INFOSIMPLES_PKCS12_PASS
  );
}

function certificadoBase64() {
  const caminho = process.env.INFOSIMPLES_PKCS12_CERT_PATH;
  const buffer = fs.readFileSync(caminho); // deixa o erro estourar se o arquivo não existir
  return buffer.toString('base64');
}

function formatarVencimentoParaISO(dataString) {
  if (!dataString) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataString)) return dataString;
  const partes = String(dataString).split('/');
  if (partes.length === 3) {
    const [dia, mes, ano] = partes;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  return dataString;
}

function classificarTipo(descricao) {
  const desc = String(descricao || '').toLowerCase();
  if (desc.includes('licenciamento') || desc.includes('taxa')) return 'Licenciamento';
  if (desc.includes('multa') || desc.includes('infra')) return 'Multa';
  return 'IPVA';
}

function normalizarValor(item) {
  if (item.normalizado_valor !== undefined) return Number(item.normalizado_valor) || 0;
  if (item.valor !== undefined) {
    return parseFloat(String(item.valor).replace(/\./g, '').replace(',', '.')) || 0;
  }
  return 0;
}

async function consultarNaInfoSimples({ placa, renavam }) {
  const body = new URLSearchParams({
    token: process.env.INFOSIMPLES_TOKEN,
    login_cpf: process.env.INFOSIMPLES_LOGIN_CPF,
    login_senha: process.env.INFOSIMPLES_LOGIN_SENHA,
    pkcs12_cert: certificadoBase64(),
    pkcs12_pass: process.env.INFOSIMPLES_PKCS12_PASS,
    placa,
    renavam,
  });

  const resposta = await fetch(INFOSIMPLES_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!resposta.ok) {
    throw new Error(`InfoSimples retornou HTTP ${resposta.status}`);
  }

  const json = await resposta.json();
  if (json.code !== 200) {
    throw new Error(json.code_message || 'Erro desconhecido retornado pela InfoSimples.');
  }

  const dados = json.data && json.data[0];
  if (!dados) {
    throw new Error('Nenhum dado retornado pela InfoSimples para este veículo.');
  }

  const itens = dados.debitos || dados.guias || [];
  const debitos = itens.map((item) => ({
    tipo: classificarTipo(item.descricao),
    descricao: item.descricao || `Débito ${item.exercicio || ''}`.trim(),
    vencimento: formatarVencimentoParaISO(item.vencimento),
    valor: normalizarValor(item),
    guia: item.codigo_barras || item.guia || null,
    boletoUrl: item.boleto_pdf_url || null,
  }));

  const total = Number(debitos.reduce((acc, d) => acc + d.valor, 0).toFixed(2));

  return { debitos, total };
}

/**
 * Consulta débitos de um veículo.
 *
 * Retorna { configurado: false } quando as credenciais da InfoSimples não
 * estão definidas no .env — quem chama deve, nesse caso, cair no fluxo
 * gratuito de redirecionamento pro portal oficial.
 */
async function consultarVeiculo({ estado, placa, renavam }) {
  if (estado !== 'GO' || !estaConfigurado()) {
    return { configurado: false };
  }

  const { debitos, total } = await consultarNaInfoSimples({ placa, renavam });

  return {
    configurado: true,
    estado,
    placa,
    renavam,
    debitos,
    total,
    fonte: 'infosimples',
  };
}

module.exports = { consultarVeiculo, estaConfigurado };
