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

// URL oficial do Detran-GO onde o cidadão consulta débitos (IPVA, licenciamento,
// multas) do veículo. É uma SPA protegida por reCAPTCHA — não automatizamos isso,
// só levamos o usuário até lá com os dados prontos pra copiar.
const PORTAL_OFICIAL_URL = 'https://www.detran.go.gov.br/psw/';

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
  redirectState.classList.add('hidden');

  const estados = { empty: emptyState, error: errorState, redirect: redirectState };
  estados[nome].classList.remove('hidden');
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

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const estado = estadoInput.value;
  const placa = normalizarPlaca(placaInput.value);
  const renavam = normalizarRenavam(renavamInput.value);

  if (estado !== 'GO') {
    errorMessage.textContent = 'Por enquanto só oferecemos suporte a veículos emplacados em Goiás (GO).';
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

  redirectSubtitle.textContent = `Placa ${placa} · Renavam ${renavam}`;
  copyPlacaVal.textContent = placa;
  copyRenavamVal.textContent = renavam;
  linkPortalOficial.href = PORTAL_OFICIAL_URL;

  mostrarEstado('redirect');
});
