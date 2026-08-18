// ---------------------------------------------------------------------------
// Um produto "SEFAZ/UF/IPVA" (ou equivalente) da InfoSimples por estado —
// todos só exigem o token da conta (sem credencial de despachante), no mesmo
// espírito do produto GO já usado em datasource/consultaVeiculo.js.
//
// Cada estado tem parâmetros e formato de resposta PRÓPRIOS (confirmado
// consultando a documentação pública de cada produto, campo por campo — não
// é o mesmo schema replicado com a UF trocada). `params()` monta o corpo da
// consulta a partir do que o usuário digitou; `linhas()` extrai, da resposta
// bruta, a lista de "coisas que parecem um débito" nesse formato específico.
// Um finalizador único (ver consultaVeiculo.js) normaliza essas linhas pro
// formato comum {tipo, descricao, vencimento, valor, guia, boletoUrl},
// tentando várias chaves candidatas (a InfoSimples usa muitos nomes
// `normalizado_*` parecidos entre produtos, mas não idênticos).
//
// Confiança desigual entre estados: GO e DF foram validados com chamada real
// (200/612 — a consulta rodou de verdade). Os demais foram montados a partir
// da documentação pública (não testados com dado real desse estado) — como
// qualquer erro aqui cai automaticamente no modo gratuito de redirecionamento
// (ver consultarVeiculo em consultaVeiculo.js), o pior cenário de um estado
// mal mapeado é continuar redirecionando, igual ao comportamento anterior.
//
// PE (Pernambuco) foi propositalmente deixado de fora: o único produto de
// débitos/guias de lá exige credencial de despachante (login_cpf, login_senha,
// pkcs12_cert), não é token-only.
// ---------------------------------------------------------------------------

const BASE = 'https://api.infosimples.com/api/v2/consultas';

function docTipo(documento) {
  const d = String(documento || '').replace(/\D/g, '');
  if (d.length === 14) return { cnpj: d };
  if (d.length === 11) return { cpf: d };
  return {};
}

const anoAtual = () => String(new Date().getFullYear());

const ESTADOS_IPVA = {
  GO: {
    url: `${BASE}/sefaz/go/ipva`,
    portalOficial: 'https://www.detran.go.gov.br/psw/',
    params: ({ placa, renavam }) => ({ placa, renavam }),
    linhas: (d) => d.guias || d.debitos || [],
  },
  AL: {
    url: `${BASE}/sefaz/al/ipva`,
    portalOficial: 'https://ipvaonline.sefaz.al.gov.br/index.php',
    params: ({ placa, renavam }) => ({ placa, renavam }),
    // Resposta é um registro único do exercício atual, não uma lista.
    linhas: (d) => (Number(d.normalizado_ipva_total ?? d.ipva_total) > 0 ? [d] : []),
  },
  AM: {
    url: `${BASE}/sefaz/am/ipva`,
    portalOficial: 'http://online.sefaz.am.gov.br/ipva/ipva.asp',
    params: ({ renavam }) => ({ renavam }),
    linhas: (d) => d.debitos || [],
  },
  BA: {
    url: `${BASE}/sefaz/ba/ipva`,
    portalOficial: 'https://servicos.sefaz.ba.gov.br/sistemas/IPVAA/Modulos/IPVAA/valor_ipva.aspx',
    params: ({ renavam }) => ({ renavam }),
    linhas: (d) => [
      ...(d.exercicio_corrente ? [d.exercicio_corrente] : []),
      ...(Array.isArray(d.exercicios_anteriores) ? d.exercicios_anteriores : d.exercicios_anteriores ? [d.exercicios_anteriores] : []),
    ],
  },
  CE: {
    url: `${BASE}/sefaz/ce/ipva`,
    portalOficial: 'https://ipva.sefaz.ce.gov.br/#/impostos/emitir-dae',
    params: ({ placa, renavam }) => ({ placa, renavam }),
    linhas: (d) => [...(d.debitos_ipva || []), ...(d.debitos_ipva_anteriores || [])],
  },
  DF: {
    url: `${BASE}/sefaz/df/ipva`,
    portalOficial: 'https://ww1.receita.fazenda.df.gov.br/emissao-segunda-via/ipva',
    params: ({ renavam }) => ({ renavam, anos_anteriores: '0' }),
    linhas: (d) => d.debitos || [],
  },
  MG: {
    url: `${BASE}/detran/mg/ipva`,
    portalOficial: 'https://buscar-renavam-ipva-digital.fazenda.mg.gov.br/buscar-renavam/',
    params: ({ renavam }) => ({ renavam, ano: anoAtual() }),
    // Sem lista — campos soltos por parcela + cota única + licenciamento.
    // É o único produto IPVA-only que também traz licenciamento.
    linhas: (d) => {
      const linhas = [];
      if (Number(d.normalizado_ipva_cota_unica) > 0) {
        linhas.push({
          descricao: 'IPVA — cota única',
          normalizado_valor: d.normalizado_ipva_cota_unica,
          vencimento: d.ipva_cota_unica_vencimento,
          codigo_barras: d.ipva_cota_unica_codigo_barras,
        });
      }
      [1, 2, 3].forEach((n) => {
        const valor = d[`normalizado_ipva_${n}_parcela`];
        if (Number(valor) > 0) {
          linhas.push({
            descricao: `IPVA — ${n}ª parcela`,
            normalizado_valor: valor,
            vencimento: d[`ipva_${n}_parcela_vencimento`],
            codigo_barras: d[`ipva_${n}_parcela_codigo_barras`],
          });
        }
      });
      if (Number(d.normalizado_licenciamento) > 0) {
        linhas.push({
          descricao: 'Licenciamento',
          normalizado_valor: d.normalizado_licenciamento,
          vencimento: d.licenciamento_vencimento,
          codigo_barras: d.licenciamento_codigo_barras,
        });
      }
      return linhas;
    },
  },
  MS: {
    url: `${BASE}/sefaz/ms/ipva`,
    portalOficial: 'https://servicos.efazenda.ms.gov.br/ipvapublico/Home',
    params: ({ placa, renavam }) => ({ placa, renavam, numero_parcela: '1' }),
    linhas: (d) => d.parcelas || [],
  },
  MT: {
    url: `${BASE}/sefaz/mt/ipva`,
    portalOficial: 'https://www.sefaz.mt.gov.br/ipva/emissaoguia/emitir',
    params: ({ renavam, documento }) => ({ renavam, ...docTipo(documento) }),
    linhas: (d) => (d.ipva && Number(d.ipva.total) > 0 ? [d.ipva] : []),
  },
  PA: {
    url: `${BASE}/sefaz/pa/ipva`,
    portalOficial: 'https://app.sefa.pa.gov.br/servicos-ipva/debitos/initPesquisaVeiculos.action',
    params: ({ placa, renavam, documento }) => ({ placa, renavam, ...docTipo(documento) }),
    linhas: (d) =>
      d.dados_veiculo && Number(d.dados_veiculo.normalizado_valor_total ?? d.dados_veiculo.valor_total) > 0
        ? [d.dados_veiculo]
        : [],
  },
  PB: {
    url: `${BASE}/sefaz/pb/ipva`,
    portalOficial: 'https://www.sefaz.pb.gov.br/servirtual/ipva/consultar-debitos',
    params: ({ placa, renavam, documento }) => ({ placa, renavam, ...docTipo(documento) }),
    linhas: (d) => d.ipva || [],
  },
  PI: {
    url: `${BASE}/sefaz/pi/ipva`,
    portalOficial: 'http://webas.sefaz.pi.gov.br/darweb/faces/views/ipva/ipva.xhtml',
    params: ({ renavam, documento }) => ({ renavam, ...docTipo(documento), tipo_cotas: 'todas' }),
    linhas: (d) => d.ipva || [],
  },
  PR: {
    url: `${BASE}/sefaz/pr/ipva`,
    portalOficial: 'https://www.contribuinte.fazenda.pr.gov.br/ipva/faces/home',
    params: ({ renavam }) => ({ renavam }),
    linhas: (d) => [
      ...(d.cota_unica_ipva ? [d.cota_unica_ipva] : []),
      ...(d.ipva_exercicios_anteriores || []),
      ...(d.parcelas_ipva || []),
    ],
  },
  RJ: {
    url: `${BASE}/sefaz/rj/ipva/darj`,
    portalOficial: 'https://darj-ipva-web.fazenda.rj.gov.br/darj-ipva-web/#/',
    params: ({ renavam }) => ({ renavam, ano: anoAtual() }),
    linhas: (d) => d.cotas || [],
  },
  RO: {
    url: `${BASE}/sefaz/ro/ipva`,
    portalOficial: 'https://ipva.sefin.ro.gov.br/',
    params: ({ renavam }) => ({ renavam }),
    linhas: (d) => [...(d.ipva || []), ...(d.divida_ativa || [])],
  },
  TO: {
    url: `${BASE}/sefaz/to/ipva`,
    portalOficial: 'http://www.sefaz2.to.gov.br/ipva/dare.php',
    params: ({ placa, renavam, documento }) => ({ placa, renavam, ...docTipo(documento) }),
    linhas: (d) => d.pagamentos || [],
  },
};

module.exports = { ESTADOS_IPVA };
