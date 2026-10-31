const fs = require('fs');
const { ESTADOS_IPVA } = require('./ipvaEstados');

// ---------------------------------------------------------------------------
// Integração com a InfoSimples — dois produtos diferentes, dois níveis de
// esforço/custo pra ativar:
//
// 1) SEFAZ/UF/IPVA — só pede o token da conta (sem credencial de terceiro).
//    Dá pra testar de graça: a InfoSimples dá ~R$100 de crédito ao criar
//    conta (https://api.infosimples.com/cadastro, sem cartão). Cobre 16
//    estados (ver datasource/ipvaEstados.js) e só traz IPVA — não inclui
//    multas de trânsito nem licenciamento (exceto MG, que também traz
//    licenciamento nesse mesmo produto gratuito).
//
// 2) DETRAN/GO Débitos — exige credencial de despachante credenciado no
//    Detran-GO (CPF + senha do sistema deles + certificado digital PKCS12),
//    além do token. Traz o pacote completo (IPVA + licenciamento + multas),
//    mas só existe pra Goiás — os demais estados usam sempre o produto 1.
//
// Se as credenciais de despachante estiverem configuradas E o estado for GO,
// usamos o produto completo (2). Senão, se o estado tiver um produto
// IPVA-only mapeado e o token estiver configurado, usamos o produto (1).
// Sem nenhum dos dois, fica tudo inativo e a aplicação cai no modo gratuito
// de redirecionamento pro portal oficial daquele estado.
// ---------------------------------------------------------------------------

const DEBITOS_API_URL_GO =
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

function estadoSuportado(estado) {
  return Boolean(ESTADOS_IPVA[estado]);
}

function portalOficialDoEstado(estado) {
  return ESTADOS_IPVA[estado]?.portalOficial || null;
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
  if (desc.includes('multa') || desc.includes('infra') || desc.includes('infração')) return 'Multa';
  if (desc.includes('seguro') || desc.includes('dpvat')) return 'Seguro';
  return 'IPVA';
}

function primeiroValorNumerico(obj, chaves) {
  for (const chave of chaves) {
    const bruto = obj[chave];
    if (bruto === undefined || bruto === null || bruto === '') continue;
    const numero = Number(bruto);
    if (!Number.isNaN(numero)) return numero;
    const textoNumerico = String(bruto).replace(/[^\d,.-]/g, '');
    const viaBRL = parseFloat(textoNumerico.replace(/\./g, '').replace(',', '.'));
    if (!Number.isNaN(viaBRL)) return viaBRL;
  }
  return 0;
}

function primeiroTextoValido(obj, chaves) {
  for (const chave of chaves) {
    if (obj[chave]) return obj[chave];
  }
  return null;
}

function comoLista(valor) {
  if (Array.isArray(valor)) return valor;
  if (valor && typeof valor === 'object') return Object.values(valor);
  return valor == null ? [] : [valor];
}

function itemDebito(tipo, descricao, origem, chavesValor, chavesVencimento = []) {
  const objeto = origem && typeof origem === 'object' ? origem : {};
  const valor = primeiroValorNumerico(objeto, chavesValor);
  if (valor <= 0) return null;
  return {
    tipo,
    descricao: primeiroTextoValido(objeto, ['descricao_popular', 'descricao', 'descricao_cota_unica', 'descricao_nf_goiania', 'nome']) || descricao,
    vencimento: formatarVencimentoParaISO(primeiroTextoValido(objeto, chavesVencimento)),
    valor,
    guia: primeiroTextoValido(objeto, ['codigo_barras', 'linha_digitavel', 'guia']) || null,
    boletoUrl: primeiroTextoValido(objeto, ['boleto_pdf_url', 'boleto_url']) || null,
  };
}

function coletarItensDeInfracoes(origem) {
  const itens = [];
  const categorias = origem && typeof origem === 'object' && !Array.isArray(origem)
    ? Object.entries(origem)
    : [['Infrações', origem]];

  for (const [categoria, valor] of categorias) {
    for (const linha of comoLista(valor)) {
      const item = itemDebito(
        'Multa',
        `Infração ${categoria}`,
        linha,
        ['normalizado_valor', 'valor', 'valor_a_pagar', 'valor_multa'],
        ['normalizado_data_vencimento', 'data_vencimento', 'vencimento', 'data'],
      );
      if (item) itens.push(item);
    }
  }
  return itens;
}

// O produto DETRAN/GO Débitos atual retorna um resumo em `debitos_veiculo`,
// além de listas separadas para dívida ativa, infrações e outros débitos.
// Mantemos compatibilidade com os nomes antigos `debitos` e `guias`.
function itensParaDebitos(dados) {
  const brutoResumo = dados.debitos_veiculo || dados.resumo_debitos || {};
  const resumo = Array.isArray(brutoResumo) ? (brutoResumo[0] || {}) : brutoResumo;
  const itens = [];
  const ipva = itemDebito(
    'IPVA',
    resumo.descricao_cota_unica || resumo.descricao_popular || 'IPVA',
    resumo,
    ['normalizado_ipva_valor', 'ipva_valor', 'normalizado_valor_original_ipva', 'nomralizado_valor_original_ipva', 'valor_original_ipva'],
    ['normalizado_data_vencimento', 'data_vencimento'],
  );
  if (ipva) itens.push(ipva);

  const licenciamento = itemDebito(
    'Licenciamento',
    'Licenciamento anual',
    resumo,
    ['normalizado_licenciamento', 'licenciamento'],
    ['normalizado_data_vencimento', 'data_vencimento'],
  );
  if (licenciamento) itens.push(licenciamento);

  const seguro = itemDebito(
    'Seguro',
    'Seguro obrigatório',
    resumo,
    ['normalizado_seguro_obrigatorio', 'seguro_obrigatorio'],
    ['normalizado_data_vencimento', 'data_vencimento'],
  );
  if (seguro) itens.push(seguro);

  const infracoes = dados.infracoes ?? resumo.infracoes;
  const multas = coletarItensDeInfracoes(infracoes);
  if (multas.length) {
    itens.push(...multas);
  } else {
    const totalInfracoes = primeiroValorNumerico(resumo, ['normalizado_infracoes']);
    if (totalInfracoes > 0) itens.push({ tipo: 'Multa', descricao: 'Total de infrações', vencimento: null, valor: totalInfracoes, guia: null, boletoUrl: null });
  }

  for (const linha of comoLista(dados.divida_ativa)) {
    const item = itemDebito('Dívida ativa', 'Dívida ativa', linha,
      ['normalizado_valor', 'valor', 'normalizado_valor_total', 'valor_total'],
      ['normalizado_data_vencimento', 'data_vencimento', 'vencimento', 'data']);
    if (item) itens.push(item);
  }

  for (const linha of comoLista(dados.outros_debitos)) {
    const item = itemDebito(classificarTipo(linha?.descricao || linha?.status || 'Outros débitos'),
      linha?.descricao || linha?.status || 'Outros débitos', linha,
      ['normalizado_valor', 'valor'], ['data', 'data_vencimento', 'vencimento']);
    if (item) itens.push(item);
  }

  const legado = comoLista(dados.debitos || dados.guias);
  if (itens.length === 0 && legado.length) {
    for (const linha of legado) {
      const item = itemDebito(classificarTipo(linha?.descricao), linha?.descricao || `Débito ${linha?.exercicio || ''}`.trim(), linha,
        ['normalizado_valor', 'valor'], ['normalizado_data_vencimento', 'data_vencimento', 'vencimento']);
      if (item) itens.push(item);
    }
  }

  const totalInformado = primeiroValorNumerico(dados, ['normalizado_total', 'total']) ||
    primeiroValorNumerico(resumo, ['normalizado_valor_total', 'valor_total']);
  const totalMapeado = Number(itens.reduce((soma, item) => soma + item.valor, 0).toFixed(2));
  if (totalInformado > totalMapeado + 0.01) {
    itens.push({
      tipo: 'Outros débitos',
      descricao: 'Demais débitos incluídos no total informado pela consulta',
      vencimento: null,
      valor: Number((totalInformado - totalMapeado).toFixed(2)),
      guia: null,
      boletoUrl: null,
    });
  }
  return itens;
}

// Usado pelos produtos IPVA-only de cada estado (datasource/ipvaEstados.js).
// Cada estado tem nomes de campo próprios — em vez de um mapeamento fixo por
// estado, tenta uma lista de chaves candidatas (a InfoSimples reusa padrões
// como `normalizado_valor_total`/`normalizado_valor` entre produtos, mas não
// sempre os mesmos) e ignora linhas sem nenhum valor reconhecível.
const CANDIDATOS_DESCRICAO = ['descricao', 'titulo', 'nome', 'historico', 'imposto'];
const CANDIDATOS_VENCIMENTO = ['vencimento', 'data_vencimento', 'data_limite_pagamento'];
const CANDIDATOS_VALOR = [
  'normalizado_valor_total',
  'normalizado_total_pagar',
  'normalizado_valor_a_pagar',
  'normalizado_valor',
  'normalizado_ipva_total',
  'normalizado_cota_unica_com_desconto',
  'normalizado_cota_unica',
  'normalizado_total',
  'valor_total',
  'total_pagar',
  'valor_a_pagar',
  'total',
  'valor',
  'ipva_total',
  'cota_unica',
];
const CANDIDATOS_GUIA = ['codigo_barras', 'boleto_linha_digitavel', 'numero_guia', 'numero_documento'];
const CANDIDATOS_BOLETO_URL = ['boleto_pdf_url', 'url_guia', 'guia_pdf_url', 'comprovante_url'];

function linhaParaDebito(linha, exercicioFallback) {
  const valor = primeiroValorNumerico(linha, CANDIDATOS_VALOR);
  const descricao =
    primeiroTextoValido(linha, CANDIDATOS_DESCRICAO) ||
    `IPVA ${linha.exercicio || linha.ano || exercicioFallback || ''}`.trim();
  return {
    tipo: classificarTipo(descricao),
    descricao,
    vencimento: formatarVencimentoParaISO(primeiroTextoValido(linha, CANDIDATOS_VENCIMENTO)),
    valor,
    guia: primeiroTextoValido(linha, CANDIDATOS_GUIA),
    boletoUrl: primeiroTextoValido(linha, CANDIDATOS_BOLETO_URL),
  };
}

function linhasParaDebitos(linhas) {
  return linhas.map((linha) => linhaParaDebito(linha)).filter((debito) => debito.valor > 0);
}

// Código que a InfoSimples usa quando a automação rodou certinho mas não
// achou nenhum débito pra placa/renavam informados — isso NÃO é uma falha
// (a consulta real aconteceu e até consome crédito); é um resultado válido
// de "zero pendências". Tratar como erro esconderia do usuário que a busca
// real funcionou.
const CODE_SEM_DEBITO = 612;

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
  if (json.code === CODE_SEM_DEBITO) {
    return null; // consulta rodou, só não achou débito — não é erro
  }
  if (json.code !== 200) {
    throw new Error(json.code_message || 'Erro desconhecido retornado pela InfoSimples.');
  }

  const dados = json.data && json.data[0];
  if (!dados) {
    throw new Error('Nenhum dado retornado pela InfoSimples para este veículo.');
  }
  return dados;
}

async function consultarDebitosCompletoGO({ placa, renavam }) {
  const dados = await chamarInfoSimples(DEBITOS_API_URL_GO, {
    token: process.env.INFOSIMPLES_TOKEN,
    login_cpf: process.env.INFOSIMPLES_LOGIN_CPF,
    login_senha: process.env.INFOSIMPLES_LOGIN_SENHA,
    pkcs12_cert: certificadoBase64(),
    pkcs12_pass: process.env.INFOSIMPLES_PKCS12_PASS,
    placa,
    renavam,
  });

  const debitos = dados ? itensParaDebitos(dados) : [];
  const resumoBruto = dados?.debitos_veiculo || {};
  const resumo = Array.isArray(resumoBruto) ? (resumoBruto[0] || {}) : resumoBruto;
  const temCampoLicenciamento = Object.prototype.hasOwnProperty.call(resumo, 'normalizado_licenciamento') ||
    Object.prototype.hasOwnProperty.call(resumo, 'licenciamento');
  const dadosVeiculo = dados?.veiculo || dados?.dados_veiculo || {};
  const veiculo = dados ? {
    marcaModelo: primeiroTextoValido(dados, ['marca_modelo', 'marca_modelo_veiculo', 'descricao_veiculo']) || primeiroTextoValido(dadosVeiculo, ['marca_modelo', 'marca_modelo_veiculo', 'descricao_veiculo']) || null,
    ano: primeiroTextoValido(dados, ['ano_modelo', 'ano_fabricacao', 'ano']) || primeiroTextoValido(dadosVeiculo, ['ano_modelo', 'ano_fabricacao', 'ano']) || null,
    cor: primeiroTextoValido(dados, ['cor']) || primeiroTextoValido(dadosVeiculo, ['cor']) || null,
    chassi: primeiroTextoValido(dados, ['chassi']) || primeiroTextoValido(dadosVeiculo, ['chassi']) || null,
    proprietario: primeiroTextoValido(dados, ['proprietario', 'nome_proprietario', 'proprietario_nome']) || primeiroTextoValido(dadosVeiculo, ['proprietario', 'nome_proprietario', 'proprietario_nome']) || null,
    municipio: primeiroTextoValido(dados, ['municipio', 'cidade_uf', 'cidade']) || primeiroTextoValido(dadosVeiculo, ['municipio', 'cidade_uf', 'cidade']) || null,
    situacao: primeiroTextoValido(resumo, ['situacao']) || primeiroTextoValido(dados, ['situacao', 'status']) || null,
  } : null;
  return {
    debitos,
    escopo: 'completo',
    veiculo,
    aviso: !temCampoLicenciamento
      ? 'A consulta não informou o campo de licenciamento; não estimamos esse valor.'
      : '',
  };
}

async function consultarIpvaEstado(estado, { placa, renavam, documento }) {
  const config = ESTADOS_IPVA[estado];
  const dados = await chamarInfoSimples(config.url, {
    token: process.env.INFOSIMPLES_TOKEN,
    ...config.params({ placa, renavam, documento }),
  });

  const debitos = dados ? linhasParaDebitos(config.linhas(dados)) : [];
  const trazLicenciamento = estado === 'MG';
  return {
    debitos,
    escopo: 'ipva',
    aviso: trazLicenciamento
      ? 'Este teste traz IPVA e licenciamento. Multas de trânsito exigem um produto pago à parte.'
      : 'Este teste traz só o IPVA. Multas de trânsito e licenciamento exigem um produto pago à parte (com credencial de despachante, onde disponível).',
    veiculo: dados?.veiculo || null,
  };
}

/**
 * Consulta débitos de um veículo.
 *
 * Retorna { configurado: false } quando o estado não tem produto IPVA
 * mapeado ou nenhuma credencial da InfoSimples está definida no .env — quem
 * chama deve, nesse caso, cair no fluxo gratuito de redirecionamento pro
 * portal oficial (ver portalOficialDoEstado).
 */
async function consultarVeiculo({ estado, placa, renavam, documento }) {
  if (!estaConfigurado() || !(estadoSuportado(estado) || (estado === 'GO' && despachanteConfigurado()))) {
    return { configurado: false };
  }

  const { debitos, escopo, aviso, veiculo } =
    estado === 'GO' && despachanteConfigurado()
      ? await consultarDebitosCompletoGO({ placa, renavam })
      : await consultarIpvaEstado(estado, { placa, renavam, documento });

  const total = Number(debitos.reduce((acc, d) => acc + d.valor, 0).toFixed(2));

  return {
    configurado: true,
    estado,
    placa,
    renavam,
    veiculo: veiculo || null,
    debitos,
    total,
    escopo,
    aviso,
    fonte: 'infosimples',
  };
}

module.exports = {
  consultarVeiculo,
  estaConfigurado,
  despachanteConfigurado,
  ipvaConfigurado,
  estadoSuportado,
  portalOficialDoEstado,
};
