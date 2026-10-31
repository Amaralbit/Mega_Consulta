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
const btnGerarPa2 = document.getElementById('btn-gerar-pa2');
let ultimoResultado = null;

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
  ultimoResultado = dados;
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

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (caractere) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[caractere]);
}

function gerarPa2(dados) {
  const relatorio = window.open('', '_blank');
  if (!relatorio) {
    errorMessage.textContent = 'O navegador bloqueou a janela do PA2. Permita pop-ups para este site e tente novamente.';
    mostrarEstado('error');
    return;
  }

  const veiculo = dados.veiculo || {};
  const debitos = Array.isArray(dados.debitos) ? dados.debitos : [];
  const linhas = debitos.length
    ? debitos.map((debito) => {
      let guiaOficial = '';
      try {
        const destino = new URL(debito.boletoUrl || '');
        if (destino.protocol === 'https:') guiaOficial = `<a href="${escaparHtml(destino.href)}">Abrir guia oficial</a>`;
      } catch {}
      const linhaDigitavel = debito.guia ? `<small>Referência da guia: ${escaparHtml(debito.guia)}</small>` : '';
      return `
      <tr>
        <td><span class="tipo">${escaparHtml(debito.tipo || 'Débito')}</span></td>
        <td>${escaparHtml(debito.descricao || '—')}<br>${linhaDigitavel} ${guiaOficial}</td>
        <td>${escaparHtml(debito.vencimento ? formatarData(debito.vencimento) : '—')}</td>
        <td class="valor">${escaparHtml(formatarMoeda(debito.valor))}</td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="4" class="sem-debitos">Nenhum débito foi retornado nesta consulta.</td></tr>';

  const camposVeiculo = [
    ['Proprietário / usuário', veiculo.proprietario || dados.proprietario],
    ['CPF / CNPJ', dados.documento], ['Marca / modelo', veiculo.marcaModelo], ['Ano', veiculo.ano], ['Cor', veiculo.cor],
    ['Município', veiculo.municipio], ['Chassi', veiculo.chassi], ['Situação', veiculo.situacao],
  ].filter(([, valor]) => valor);
  const total = Number(dados.total ?? debitos.reduce((soma, debito) => soma + Number(debito.valor || 0), 0));
  const dataConsulta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const avisoEscopo = dados.escopo === 'ipva'
    ? '<p class="aviso">Consulta limitada a IPVA. Este PA2 não representa multas ou licenciamento que não tenham sido retornados pela fonte.</p>'
    : '';
  const aviso = dados.aviso ? `<p class="aviso">${escaparHtml(dados.aviso)}</p>` : '';

  relatorio.document.open();
  relatorio.document.write(`<!doctype html>
    <html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>PA2-${escaparHtml(dados.placa || 'veiculo')}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #20252c; font: 12px Arial, Helvetica, sans-serif; }
      .toolbar { display:flex; justify-content:flex-end; margin:0 0 16px; }
      .toolbar button { border:0; border-radius:6px; padding:11px 18px; color:#fff; background:#a61920; font-weight:700; cursor:pointer; }
      header { display:flex; align-items:flex-start; justify-content:space-between; border-bottom:3px solid #a61920; padding:0 0 12px; }
      .marca { color:#a61920; font-size:12px; font-weight:700; letter-spacing:1.4px; text-transform:uppercase; }
      h1 { margin:6px 0 3px; font-size:21px; }
      .sub { margin:0; color:#66717c; }
      .codigo { text-align:right; color:#66717c; font-size:10px; line-height:1.6; }
      section { margin-top:18px; }
      h2 { margin:0 0 9px; font-size:12px; letter-spacing:.5px; text-transform:uppercase; }
      .veiculo { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
      .campo { min-height:47px; padding:8px 10px; border:1px solid #dce0e5; border-radius:5px; }
      .campo b { display:block; margin-bottom:4px; color:#68727d; font-size:9px; text-transform:uppercase; }
      .placa { font-size:16px; font-weight:800; letter-spacing:1px; }
      table { width:100%; border-collapse:collapse; }
      th { padding:8px 7px; color:#fff; background:#252b32; text-align:left; font-size:9px; text-transform:uppercase; }
      td { padding:8px 7px; border-bottom:1px solid #e2e5e9; vertical-align:top; }
      td.valor { text-align:right; white-space:nowrap; font-weight:700; }
      .tipo { color:#a61920; font-size:9px; font-weight:700; text-transform:uppercase; }
      small { color:#66717c; font-size:9px; }
      a { color:#165da8; font-size:10px; font-weight:700; }
      .sem-debitos { padding:16px; color:#66717c; text-align:center; }
      .total { display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding:12px; background:#f3f4f6; font-size:14px; font-weight:800; }
      .aviso { margin:10px 0 0; padding:9px 10px; border:1px solid #e7d899; background:#fff9df; color:#655300; line-height:1.45; }
      footer { margin-top:24px; padding-top:9px; border-top:1px solid #dce0e5; color:#66717c; font-size:9px; line-height:1.5; }
      @media print { .toolbar { display:none; } body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } tr { break-inside:avoid; } }
    </style></head><body>
    <div class="toolbar"><button onclick="window.print()">Salvar / imprimir PA2</button></div>
    <header><div><div class="marca">Mega Despachante Soft</div><h1>PA2 · Pesquisa de débitos veiculares</h1><p class="sub">Relatório informativo da consulta do veículo</p></div>
    <div class="codigo"><b>PA2-${escaparHtml(dados.placa || '')}</b><br>Emitido em ${escaparHtml(dataConsulta)}<br>UF: ${escaparHtml(dados.estado || 'GO')}</div></header>
    <section><h2>Identificação do veículo</h2><div class="veiculo">
      <div class="campo"><b>Placa</b><span class="placa">${escaparHtml(dados.placa || '—')}</span></div>
      <div class="campo"><b>RENAVAM</b>${escaparHtml(dados.renavam || '—')}</div>
      ${camposVeiculo.map(([titulo, valor]) => `<div class="campo"><b>${escaparHtml(titulo)}</b>${escaparHtml(valor)}</div>`).join('')}
    </div></section>
    <section><h2>Débitos localizados</h2><table><thead><tr><th>Tipo</th><th>Descrição</th><th>Vencimento</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhas}</tbody></table>
    <div class="total"><span>Total informado nesta consulta</span><span>${escaparHtml(formatarMoeda(total))}</span></div></section>
    ${avisoEscopo}${aviso}
    <footer>Fonte consultada: ${escaparHtml(dados.fonte || 'consulta autorizada')} · Resultado sujeito a atualização pelo órgão responsável. Este relatório é informativo e não substitui extratos, guias de pagamento nem documento oficial do órgão consultado. Confirme os valores e a situação do veículo nos canais oficiais antes de efetuar qualquer pagamento.</footer>
    </body></html>`);
  relatorio.document.close();
  relatorio.focus();
  window.setTimeout(() => relatorio.print(), 300);
}

btnGerarPa2?.addEventListener('click', () => {
  if (ultimoResultado) gerarPa2(ultimoResultado);
});

// Tenta consulta real via backend (só existe quando rodando com `node
// server.js` E com a InfoSimples configurada no .env). Em qualquer outra
// situação — GitHub Pages estático, backend fora do ar, não configurado —
// cai automaticamente no modo gratuito de redirecionamento.
async function tentarConsultaReal({ estado, placa, renavam, documento }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const resp = await fetch('/api/consulta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, placa, renavam, documento }),
      signal: controller.signal,
    });
    const dados = await resp.json();
    if (!resp.ok) return { erro: dados.erro || 'A consulta não foi concluída.' };
    return dados;
  } catch (err) {
    return null; // sem backend disponível (ex.: GitHub Pages) — segue o fluxo gratuito
  } finally {
    clearTimeout(timeout);
  }
}

// Chuva de código decorativa no fundo — colunas de caracteres alternando
// entre caindo (cima→baixo) e subindo (baixo→cima), nas cores do site.
function iniciarChuvaDeCodigo() {
  const container = document.getElementById('bg-rain');
  if (!container) return;

  const CARACTERES = '01{}[]<>/=;#MEGA';
  const CORES = ['var(--red)', 'var(--ink)'];
  const TOTAL_COLUNAS = 26;

  function textoAleatorio(tamanho) {
    let texto = '';
    for (let i = 0; i < tamanho; i++) {
      texto += CARACTERES[Math.floor(Math.random() * CARACTERES.length)] + '\n';
    }
    return texto;
  }

  for (let i = 0; i < TOTAL_COLUNAS; i++) {
    const col = document.createElement('div');
    col.className = 'rain-col';
    col.textContent = textoAleatorio(16 + Math.floor(Math.random() * 14));
    col.style.left = `${(i / TOTAL_COLUNAS) * 100}%`;
    col.style.color = CORES[i % 2];
    col.style.opacity = (0.08 + Math.random() * 0.1).toFixed(2);

    const caindo = i % 2 === 0;
    const duracao = 9 + Math.random() * 10;
    const atraso = -Math.random() * duracao; // começa "no meio" do ciclo, não tudo sincronizado
    col.style.animation = `${caindo ? 'rain-fall' : 'rain-rise'} ${duracao}s linear ${atraso}s infinite`;

    container.appendChild(col);
  }
}

iniciarChuvaDeCodigo();

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
    dados.documento = documento;
    renderResultados(dados);
    mostrarEstado('results');
  } else if (dados?.erro) {
    errorMessage.textContent = dados.erro;
    mostrarEstado('error');
  } else {
    mostrarRedirect(placa, renavam, dados?.portalOficialUrl || portalOficialDoEstado(estado));
  }
});
