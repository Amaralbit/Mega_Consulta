const fs = require('fs');

// ---------------------------------------------------------------------------
// Integração com a InfoSimples — dois produtos diferentes, dois níveis de
// esforço/custo pra ativar:
//
// 1) SEFAZ/GO/IPVA — só pede o token da conta (sem credencial de terceiro).
//    Dá pra testar de graça: a InfoSimples dá ~R$100 de crédito ao criar
//    conta (https://api.infosimples.com/cadastro, sem cartão). Só traz
//    dados de IPVA — não inclui multas de trânsito nem licenciamento.
//
// 2) DETRAN/GO Débitos — exige credencial de despachante credenciado no
//    Detran-GO (CPF + senha do sistema deles + certificado digital PKCS12),
//    além do token. Traz o pacote completo (IPVA + licenciamento + multas),
//    mas não tem como testar sem ter (ou conseguir) essa credencial — o
//    crédito grátis da InfoSimples não resolve essa parte.
//
// Se as credenciais de despachante estiverem configuradas, usamos o produto
// completo (2). Senão, se pelo menos o token estiver configurado, usamos o
// produto de teste (1). Sem nenhum dos dois, fica tudo inativo e a
// aplicação cai no modo gratuito de redirecionamento.
//
// URLs e nomes de parâmetro abaixo são os documentados publicamente pela
// InfoSimples. A URL do IPVA (abaixo) já foi validada com uma chamada real
// (token inválido de propósito, sem gastar crédito) — o endpoint respondeu
// no formato esperado ({code, code_message}), confirmando URL e contrato de
// erro. A URL do produto completo (DÉBITOS) ainda não foi testada contra
// uma conta real — confirme no painel da sua conta antes de usar em
// produção.
// ---------------------------------------------------------------------------

const IPVA_API_URL =
  process.env.INFOSIMPLES_IPVA_API_URL || 'https://api.infosimples.com/api/v2/consultas/sefaz/go/ipva';
const DEBITOS_API_URL =
  process.env.INFOSIMPLES_API_URL || 'https://api.infosimples.com/api/v2/consultas/detran/go/debitos';

function despachanteConfigurado() {
  return Boolean(
    process.env.INFOSIMPLES_TOKEN &&
    process.env.INFOSIMPLES_LOGIN_CPF &&
    process.env.INFOSIMPLES_LOGIN_SENHA &&
    process.env.INFOSIMPLES_PKCS12_CERT_PATH &&
    process.env.INFOSIMPLES_PKCS12_PASS
  );
}

function ipvaConfigurado() {
  return Boolean(process.env.INFOSIMPLES_TOKEN);
}

function estaConfigurado() {
  return despachanteConfigurado() || ipvaConfigurado();
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

function itensParaDebitos(itens) {
  return itens.map((item) => ({
    tipo: classificarTipo(item.descricao),
    descricao: item.descricao || `Débito ${item.exercicio || ''}`.trim(),
    vencimento: formatarVencimentoParaISO(item.vencimento),
    valor: normalizarValor(item),
    guia: item.codigo_barras || item.guia || null,
    boletoUrl: item.boleto_pdf_url || null,
  }));
}

async function chamarInfoSimples(url, params) {
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
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
  return dados;
}

async function consultarDebitosCompleto({ placa, renavam }) {
  const dados = await chamarInfoSimples(DEBITOS_API_URL, {
    token: process.env.INFOSIMPLES_TOKEN,
    login_cpf: process.env.INFOSIMPLES_LOGIN_CPF,
    login_senha: process.env.INFOSIMPLES_LOGIN_SENHA,
    pkcs12_cert: certificadoBase64(),
    pkcs12_pass: process.env.INFOSIMPLES_PKCS12_PASS,
    placa,
    renavam,
  });

  const debitos = itensParaDebitos(dados.debitos || dados.guias || []);
  return { debitos, escopo: 'completo' };
}

async function consultarApenasIpva({ placa, renavam }) {
  const dados = await chamarInfoSimples(IPVA_API_URL, {
    token: process.env.INFOSIMPLES_TOKEN,
    placa,
    renavam,
  });

  const debitos = itensParaDebitos(dados.guias || dados.debitos || []);
  return {
    debitos,
    escopo: 'ipva',
    aviso: 'Este teste traz só o IPVA. Multas de trânsito e licenciamento exigem o produto completo (com credencial de despachante).',
  };
}

/**
 * Consulta débitos de um veículo.
 *
 * Retorna { configurado: false } quando nenhuma credencial da InfoSimples
 * está definida no .env — quem chama deve, nesse caso, cair no fluxo
 * gratuito de redirecionamento pro portal oficial.
 */
async function consultarVeiculo({ estado, placa, renavam }) {
  if (estado !== 'GO' || !estaConfigurado()) {
    return { configurado: false };
  }

  const { debitos, escopo, aviso } = despachanteConfigurado()
    ? await consultarDebitosCompleto({ placa, renavam })
    : await consultarApenasIpva({ placa, renavam });

  const total = Number(debitos.reduce((acc, d) => acc + d.valor, 0).toFixed(2));

  return {
    configurado: true,
    estado,
    placa,
    renavam,
    debitos,
    total,
    escopo,
    aviso,
    fonte: 'infosimples',
  };
}

module.exports = { consultarVeiculo, estaConfigurado, despachanteConfigurado, ipvaConfigurado };
