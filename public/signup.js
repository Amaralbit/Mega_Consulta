const form = document.getElementById('form-signup');
const erroEl = document.getElementById('erro');
const btnCriar = document.getElementById('btn-criar');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  erroEl.classList.add('hidden');
  btnCriar.disabled = true;

  try {
    const resp = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email.value.trim(),
        password: form.password.value,
      }),
    });

    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || 'Não foi possível criar a conta.');

    window.location.href = '/';
  } catch (err) {
    erroEl.textContent = err.message;
    erroEl.classList.remove('hidden');
  } finally {
    btnCriar.disabled = false;
  }
});
