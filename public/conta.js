const saldoValorEl = document.getElementById('saldo-valor');
const pacotesGridEl = document.getElementById('pacotes-grid');
const historicoBodyEl = document.getElementById('historico-body');
const erroCompraEl = document.getElementById('erro-compra');
const avisoCanceladaEl = document.getElementById('aviso-cancelada');

function formatarMoeda(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataHora(isoDate) {
  return new Date(isoDate.replace(' ', 'T') + 'Z').toLocaleString('pt-BR');
}

const MOTIVOS = {
  consulta: 'Consulta de veículo',
  compra_stripe: 'Compra de créditos',
  estorno_falha_consulta: 'Estorno (falha na consulta)',
};

async function carregarSaldo() {
  const usuario = await carregarSessao();
  if (usuario) saldoValorEl.textContent = usuario.credits;
}

async function carregarPacotes() {
  const resp = await fetch('/api/billing/pacotes');
  const { pacotes } = await resp.json();

  pacotesGridEl.innerHTML = pacotes
    .map(
      (p) => `
    <div class="pacote-card">
      <div class="pacote-label">${p.label}</div>
      <div class="pacote-preco">${formatarMoeda(p.valorCentavos)}</div>
      <button type="button" data-pacote="${p.id}">Comprar</button>
    </div>
  `
    )
    .join('');

  pacotesGridEl.querySelectorAll('button[data-pacote]').forEach((btn) => {
    btn.addEventListener('click', () => comprarPacote(btn.dataset.pacote, btn));
  });
}

async function comprarPacote(pacoteId, btn) {
  erroCompraEl.classList.add('hidden');
  btn.disabled = true;

  try {
    const resp = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pacoteId }),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || 'Não foi possível iniciar a compra.');

    window.location.href = dados.url; // redireciona pro Checkout da Stripe
  } catch (err) {
    erroCompraEl.textContent = err.message;
    erroCompraEl.classList.remove('hidden');
    btn.disabled = false;
  }
}

async function carregarHistorico() {
  const resp = await fetch('/api/billing/historico');
  const { transacoes } = await resp.json();

  if (!transacoes.length) {
    historicoBodyEl.innerHTML = '<tr><td colspan="3" class="subtitle">Nenhuma movimentação ainda.</td></tr>';
    return;
  }

  historicoBodyEl.innerHTML = transacoes
    .map((t) => {
      const positivo = t.delta > 0;
      return `
      <tr>
        <td>${formatarDataHora(t.created_at)}</td>
        <td class="${positivo ? 'delta-positivo' : 'delta-negativo'}">${positivo ? '+' : ''}${t.delta}</td>
        <td>${MOTIVOS[t.motivo] || t.motivo}</td>
      </tr>
    `;
    })
    .join('');
}

// feedback de volta do Stripe Checkout (?compra=ok / ?compra=cancelada)
const params = new URLSearchParams(window.location.search);
if (params.get('compra') === 'cancelada') {
  avisoCanceladaEl.classList.remove('hidden');
}

carregarSaldo();
carregarPacotes();
carregarHistorico();
