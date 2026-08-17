const form = document.getElementById('form-login');
const erroEl = document.getElementById('erro');
const btnEntrar = document.getElementById('btn-entrar');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  erroEl.classList.add('hidden');
  btnEntrar.disabled = true;

  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email.value.trim(),
        password: form.password.value,
      }),
    });

    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || 'Não foi possível entrar.');

    window.location.href = '/';
  } catch (err) {
    erroEl.textContent = err.message;
    erroEl.classList.remove('hidden');
  } finally {
    btnEntrar.disabled = false;
  }
});
