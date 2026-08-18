const form = document.getElementById('form-consulta');
const estadoInput = document.getElementById('estado');
const placaInput = document.getElementById('placa');
const renavamInput = document.getElementById('renavam');
const documentoInput = document.getElementById('documento');
const plateBody = document.getElementById('plate-body');

const emptyState = document.getElementById('empty-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const loadingState = document.getElementById('loading-state');
const resultsState = document.getElementById('results-state');
const redirectState = document.getElementById('redirect-state');

const redirectSubtitle = document.getElementById('redirect-subtitle');
const copyPlacaVal = document.getElementById('copy-placa-val');
const copyRenavamVal = document.getElementById('copy-renavam-val');
const linkPortalOficial = document.getElementById('link-portal-oficial');

const resultsTitle = document.getElementById('results-title');
const resultsSubtitle = document.getElementById('results-subtitle');
const resultsTotalValue = document.getElementById('results-total-value');
const debitosList = document.getElementById('debitos-list');
const resultsAviso = document.getElementById('results-aviso');

// URL oficial de cada estado onde o cidadão consulta débitos (IPVA,
// licenciamento, multas) do veículo. Muitos são SPAs protegidas por
// reCAPTCHA — não automatizamos isso, só levamos o usuário até lá com os
// dados prontos pra copiar. Espelha datasource/ipvaEstados.js — usado quando
// não há backend disponível pra responder (ex.: GitHub Pages estático), já
// que aí ninguém devolve o `portalOficialUrl` calculado no servidor.
const PORTAIS_OFICIAIS = {
  GO: 'https://www.detran.go.gov.br/psw/',
  AL: 'https://ipvaonline.sefaz.al.gov.br/index.php',
  AM: 'http://online.sefaz.am.gov.br/ipva/ipva.asp',
  BA: 'https://servicos.sefaz.ba.gov.br/sistemas/IPVAA/Modulos/IPVAA/valor_ipva.aspx',
  CE: 'https://ipva.sefaz.ce.gov.br/#/impostos/emitir-dae',
  DF: 'https://ww1.receita.fazenda.df.gov.br/emissao-segunda-via/ipva',
  MG: 'https://buscar-renavam-ipva-digital.fazenda.mg.gov.br/buscar-renavam/',
  MS: 'https://servicos.efazenda.ms.gov.br/ipvapublico/Home',
  MT: 'https://www.sefaz.mt.gov.br/ipva/emissaoguia/emitir',
  PA: 'https://app.sefa.pa.gov.br/servicos-ipva/debitos/initPesquisaVeiculos.action',
  PB: 'https://www.sefaz.pb.gov.br/servirtual/ipva/consultar-debitos',
  PI: 'http://webas.sefaz.pi.gov.br/darweb/faces/views/ipva/ipva.xhtml',
  PR: 'https://www.contribuinte.fazenda.pr.gov.br/ipva/faces/home',
  RJ: 'https://darj-ipva-web.fazenda.rj.gov.br/darj-ipva-web/#/',
  RO: 'https://ipva.sefin.ro.gov.br/',
  TO: 'http://www.sefaz2.to.gov.br/ipva/dare.php',
};

function portalOficialDoEstado(estado) {
  return PORTAIS_OFICIAIS[estado] || `https://www.google.com/search?q=sefaz+${estado}+ipva+consulta+d%C3%A9bitos`;
}

function normalizarPlaca(placa) {
  return String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizarRenavam(renavam) {
  return String(renavam || '').replace(/\D/g, '');
}

function placaValida(placa) {
  // Aceita formato antigo (AAA9999) e Mercosul (AAA9A99)
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa);
}

function renavamValido(renavam) {
  return renavam.length >= 9 && renavam.length <= 11;
}

function mostrarEstado(nome) {
  emptyState.classList.add('hidden');
  errorState.classList.add('hidden');
  loadingState.classList.add('hidden');
  resultsState.classList.add('hidden');
  redirectState.classList.add('hidden');

  const estados = {
    empty: emptyState,
    error: errorState,
    loading: loadingState,
    results: resultsState,
    redirect: redirectState,
  };
  estados[nome].classList.remove('hidden');
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

function renderResultados(dados) {
  resultsSubtitle.textContent = `Placa ${dados.placa} · Renavam ${dados.renavam}`;
  resultsTotalValue.textContent = formatarMoeda(dados.total);

  const semPendencia = dados.debitos.length === 0;
  resultsTitle.textContent = semPendencia ? 'Nenhuma pendência encontrada' : 'Débitos encontrados';

  if (dados.aviso) {
    resultsAviso.textContent = `⚠️ ${dados.aviso}`;
    resultsAviso.classList.remove('hidden');
  } else {
    resultsAviso.classList.add('hidden');
  }

  debitosList.innerHTML = '';

  if (semPendencia) {
    const li = document.createElement('li');
    li.className = 'debito-item debito-vazio';
    li.textContent = '🎉 Não encontramos débito em aberto para esse veículo nesta consulta.';
    debitosList.appendChild(li);
    return;
  }

  dados.debitos.forEach((debito) => {
    const li = document.createElement('li');
    li.className = 'debito-item';
    li.innerHTML = `
      <div class="debito-info">
        <span class="debito-tipo">${debito.tipo}</span>
        <div class="debito-descricao">${debito.descricao}</div>
        <div class="debito-vencimento">${debito.vencimento ? `Vencimento: ${formatarData(debito.vencimento)}` : ''}</div>
      </div>
      <div class="debito-valor">${formatarMoeda(debito.valor)}</div>
    `;
    debitosList.appendChild(li);
  });
}

// Tenta consulta real via backend (só existe quando rodando com `node
// server.js` E com a InfoSimples configurada no .env). Em qualquer outra
// situação — GitHub Pages estático, backend fora do ar, não configurado —
// cai automaticamente no modo gratuito de redirecionamento.
async function tentarConsultaReal({ estado, placa, renavam, documento }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const resp = await fetch('/api/consulta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, placa, renavam, documento }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    return null; // sem backend disponível (ex.: GitHub Pages) — segue o fluxo gratuito
  } finally {
    clearTimeout(timeout);
  }
}

placaInput.addEventListener('input', () => {
  const valor = normalizarPlaca(placaInput.value);
  placaInput.value = valor;
  plateBody.textContent = valor || 'SDM2J30';
});

renavamInput.addEventListener('input', () => {
  renavamInput.value = normalizarRenavam(renavamInput.value);
});

function configurarBotaoCopia(btnId, valId) {
  const btn = document.getElementById(btnId);
  const valEl = document.getElementById(valId);
  if (!btn || !valEl) return;

  btn.addEventListener('click', () => {
    const texto = valEl.textContent;
    navigator.clipboard.writeText(texto).then(() => {
      const originalText = btn.textContent;
      btn.textContent = 'Copiado!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
      }, 1500);
    }).catch((err) => {
      console.error('Erro ao copiar texto:', err);
    });
  });
}

configurarBotaoCopia('btn-copy-placa', 'copy-placa-val');
configurarBotaoCopia('btn-copy-renavam', 'copy-renavam-val');

function mostrarRedirect(placa, renavam, portalOficialUrl) {
  redirectSubtitle.textContent = `Placa ${placa} · Renavam ${renavam}`;
  copyPlacaVal.textContent = placa;
  copyRenavamVal.textContent = renavam;
  linkPortalOficial.href = portalOficialUrl;
  mostrarEstado('redirect');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const estado = estadoInput.value;
  const placa = normalizarPlaca(placaInput.value);
  const renavam = normalizarRenavam(renavamInput.value);
  const documento = documentoInput.value;

  if (!estado) {
    errorMessage.textContent = 'Selecione o estado do veículo.';
    mostrarEstado('error');
    return;
  }
  if (!placa) {
    errorMessage.textContent = 'Digite a placa do veículo.';
    mostrarEstado('error');
    placaInput.focus();
    return;
  }
  if (!placaValida(placa)) {
    errorMessage.textContent = 'Placa inválida. Use o formato ABC1234 ou ABC1D23.';
    mostrarEstado('error');
    placaInput.focus();
    return;
  }
  if (!renavam) {
    errorMessage.textContent = 'Digite o renavam do veículo.';
    mostrarEstado('error');
    renavamInput.focus();
    return;
  }
  if (!renavamValido(renavam)) {
    errorMessage.textContent = 'Renavam inválido. Deve ter entre 9 e 11 dígitos.';
    mostrarEstado('error');
    renavamInput.focus();
    return;
  }

  mostrarEstado('loading');
  const dados = await tentarConsultaReal({ estado, placa, renavam, documento });

  if (dados && dados.debitos) {
    renderResultados(dados);
    mostrarEstado('results');
  } else {
    mostrarRedirect(placa, renavam, dados?.portalOficialUrl || portalOficialDoEstado(estado));
  }
});
