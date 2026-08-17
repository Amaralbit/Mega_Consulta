/**
 * docs/app.js
 *
 * Versão ESTÁTICA para o GitHub Pages: a mesma lógica de mock que em
 * produção fica em datasource/consultaVeiculo.js (rodando no servidor
 * Node) foi portada aqui pra rodar direto no navegador, já que o
 * GitHub Pages não executa backend nenhum.
 *
 * Quando entrar uma integração real, ESTE arquivo (a versão do GitHub
 * Pages) deixa de fazer sentido como está — dado real não pode ser
 * gerado/consultado no navegador do usuário. Nesse ponto o demo
 * público teria que apontar pra um backend de verdade, ou deixar de
 * existir como site estático.
 */

// ---- lógica de mock (espelha datasource/consultaVeiculo.js) ----

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

function gerarDebitosMock(seed) {
  const debitos = [];

  debitos.push({
    tipo: 'IPVA',
    descricao: `IPVA ${new Date().getFullYear()} - cota única`,
    vencimento: proximaData(-(seed % 40) - 5),
    valor: 480 + (seed % 900),
    guia: `DAE-${seed % 100000}`,
  });

  debitos.push({
    tipo: 'Licenciamento',
    descricao: `Licenciamento anual ${new Date().getFullYear()}`,
    vencimento: proximaData(-(seed % 20) - 2),
    valor: 148.71,
    guia: `DAE-${(seed + 7) % 100000}`,
  });

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

async function consultarVeiculoMock({ estado, placa, renavam }) {
  // simula a latência de uma consulta real (o backend Node faz o mesmo)
  await new Promise((resolve) => setTimeout(resolve, 700 + Math.random() * 500));

  const placaNormalizada = String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const seed = hashString(placaNormalizada + String(renavam || ''));
  const debitos = gerarDebitosMock(seed);
  const total = debitos.reduce((acc, d) => acc + d.valor, 0);

  return {
    estado,
    placa: placaNormalizada,
    renavam,
    debitos,
    total: Number(total.toFixed(2)),
    fonte: 'mock',
  };
}

// ---- UI (idêntica à versão com backend) ----

const form = document.getElementById('form-consulta');
const placaInput = document.getElementById('placa');
const renavamInput = document.getElementById('renavam');
const documentoInput = document.getElementById('documento');
const estadoSelect = document.getElementById('estado');

const plateNumberEl = document.getElementById('plate-number');

const emptyState = document.getElementById('empty-state');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const resultsState = document.getElementById('results-state');

const resultsTitle = document.getElementById('results-title');
const resultsSubtitle = document.getElementById('results-subtitle');
const resultsTotalValue = document.getElementById('results-total-value');
const debitosList = document.getElementById('debitos-list');
const btnGerarLink = document.getElementById('btn-gerar-link');

const submitButton = form.querySelector('.btn-buscar');

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(isoDate) {
  const [ano, mes, dia] = isoDate.split('-');
  return `${dia}/${mes}/${ano}`;
}

function normalizarPlaca(valor) {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

placaInput.addEventListener('input', () => {
  const cursor = placaInput.selectionStart;
  placaInput.value = normalizarPlaca(placaInput.value);
  placaInput.setSelectionRange(cursor, cursor);
  atualizarPreviewPlaca();
});

renavamInput.addEventListener('input', () => {
  renavamInput.value = renavamInput.value.replace(/\D/g, '').slice(0, 11);
});

function atualizarPreviewPlaca() {
  const valor = placaInput.value;
  plateNumberEl.textContent = valor.length ? valor : 'AAA0A00';
}

function mostrarEstado(nome) {
  emptyState.classList.add('hidden');
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
  resultsState.classList.add('hidden');

  const estados = { empty: emptyState, loading: loadingState, error: errorState, results: resultsState };
  estados[nome].classList.remove('hidden');
}

function renderResultados(dados) {
  resultsSubtitle.textContent = `Placa ${dados.placa} · Renavam ${dados.renavam}`;
  resultsTotalValue.textContent = formatarMoeda(dados.total);

  if (!dados.debitos.length) {
    resultsTitle.textContent = 'Nenhum débito encontrado';
    debitosList.innerHTML = '';
    btnGerarLink.disabled = true;
    return;
  }

  resultsTitle.textContent = 'Débitos encontrados';
  debitosList.innerHTML = dados.debitos.map((d) => `
    <li class="debito-item">
      <div class="debito-info">
        <span class="debito-tipo">${d.tipo}</span>
        <span class="debito-descricao">${d.descricao}</span>
        <span class="debito-meta">Vencimento ${formatarData(d.vencimento)} · Guia ${d.guia}</span>
      </div>
      <span class="debito-valor">${formatarMoeda(d.valor)}</span>
    </li>
  `).join('');

  btnGerarLink.disabled = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    estado: estadoSelect.value,
    placa: placaInput.value.trim(),
    renavam: renavamInput.value.trim(),
    documento: documentoInput.value.trim() || undefined,
  };

  if (!payload.placa || !payload.renavam) {
    mostrarEstado('error');
    errorMessage.textContent = 'Preencha placa e renavam para consultar.';
    return;
  }

  submitButton.disabled = true;
  mostrarEstado('loading');

  try {
    const dados = await consultarVeiculoMock(payload);
    renderResultados(dados);
    mostrarEstado('results');
  } catch (err) {
    errorMessage.textContent = err.message || 'Não foi possível concluir a consulta.';
    mostrarEstado('error');
  } finally {
    submitButton.disabled = false;
  }
});

atualizarPreviewPlaca();
