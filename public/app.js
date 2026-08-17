const form = document.getElementById('form-consulta');
const estadoInput = document.getElementById('estado');
const placaInput = document.getElementById('placa');
const renavamInput = document.getElementById('renavam');
const documentoInput = document.getElementById('documento');
const plateBody = document.getElementById('plate-body');

const emptyState = document.getElementById('empty-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const redirectState = document.getElementById('redirect-state');

const redirectSubtitle = document.getElementById('redirect-subtitle');
const copyPlacaVal = document.getElementById('copy-placa-val');
const copyRenavamVal = document.getElementById('copy-renavam-val');
const linkPortalOficial = document.getElementById('link-portal-oficial');

function mostrarEstado(nome) {
  emptyState.classList.add('hidden');
  errorState.classList.add('hidden');
  redirectState.classList.add('hidden');

  const estados = { empty: emptyState, error: errorState, redirect: redirectState };
  estados[nome].classList.remove('hidden');
}

placaInput.addEventListener('input', () => {
  const valor = placaInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  placaInput.value = valor;
  plateBody.textContent = valor || 'SDM2J30';
});

renavamInput.addEventListener('input', () => {
  renavamInput.value = renavamInput.value.replace(/\D/g, '');
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    estado: estadoInput.value,
    placa: placaInput.value,
    renavam: renavamInput.value,
    documento: documentoInput.value,
  };

  try {
    const resp = await fetch('/api/preparar-consulta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const dados = await resp.json();

    if (!resp.ok) {
      throw new Error(dados.erro || 'Não foi possível preparar a consulta.');
    }

    redirectSubtitle.textContent = `Placa ${dados.placa} · Renavam ${dados.renavam}`;
    copyPlacaVal.textContent = dados.placa;
    copyRenavamVal.textContent = dados.renavam;
    linkPortalOficial.href = dados.portalOficialUrl;

    mostrarEstado('redirect');
  } catch (err) {
    errorMessage.textContent = err.message || 'Não foi possível preparar a consulta.';
    mostrarEstado('error');
  }
});
