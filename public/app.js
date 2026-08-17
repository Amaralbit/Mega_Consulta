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
const redirectState = document.getElementById('redirect-state');

const resultsTitle = document.getElementById('results-title');
const resultsSubtitle = document.getElementById('results-subtitle');
const resultsTotalValue = document.getElementById('results-total-value');
const debitosList = document.getElementById('debitos-list');
const btnGerarLink = document.getElementById('btn-gerar-link');

const redirectSubtitle = document.getElementById('redirect-subtitle');
const copyPlacaVal = document.getElementById('copy-placa-val');
const copyRenavamVal = document.getElementById('copy-renavam-val');

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

// mantém a placa em maiúsculas + atualiza o preview visual da plaquinha
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
  redirectState.classList.add('hidden');

  const estados = {
    empty: emptyState,
    loading: loadingState,
    error: errorState,
    results: resultsState,
    redirect: redirectState
  };
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

  // desabilitado de propósito nesta versão: a geração de link de pagamento
  // ainda não foi implementada (próxima etapa do projeto)
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
    const resp = await fetch('/api/consulta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (resp.status === 401) {
      window.location.href = '/login.html';
      return;
    }

    const dados = await resp.json();

    if (!resp.ok) {
      if (resp.status === 402) {
        errorMessage.innerHTML = `${dados.erro} <a href="/conta.html">Comprar créditos</a>`;
        mostrarEstado('error');
        return;
      }
      throw new Error(dados.erro || 'Falha ao consultar.');
    }

    if (dados.redirecionar) {
      redirectSubtitle.textContent = `Placa ${dados.placa} · Renavam ${dados.renavam}`;
      copyPlacaVal.textContent = dados.placa;
      copyRenavamVal.textContent = dados.renavam;
      
      const linkSefaz = document.getElementById('link-sefaz');
      if (linkSefaz) {
        linkSefaz.href = `https://sistemas.sefaz.go.gov.br/snc/publico/ipva/form?documento=${dados.placa}&renavan=${dados.renavam}`;
      }
      
      mostrarEstado('redirect');
    } else {
      renderResultados(dados);
      mostrarEstado('results');
      if (typeof atualizarBadgeCreditos === 'function' && dados.creditosRestantes !== undefined) {
        atualizarBadgeCreditos(dados.creditosRestantes);
      }
    }
  } catch (err) {
    errorMessage.textContent = err.message || 'Não foi possível concluir a consulta.';
    mostrarEstado('error');
  } finally {
    submitButton.disabled = false;
  }
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
    }).catch(err => {
      console.error('Erro ao copiar texto:', err);
    });
  });
}

configurarBotaoCopia('btn-copy-placa', 'copy-placa-val');
configurarBotaoCopia('btn-copy-renavam', 'copy-renavam-val');

atualizarPreviewPlaca();
carregarSessao();
