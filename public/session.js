/**
 * public/session.js
 *
 * Compartilhado por index.html e conta.html: busca o usuário logado e
 * preenche a barra de topo (e-mail, créditos, sair). As duas páginas já são
 * protegidas no servidor (requireAuth), então um 401 aqui normalmente
 * significa que a sessão expirou entre uma navegação e outra.
 */

async function carregarSessao() {
  const resp = await fetch('/api/auth/me');
  if (!resp.ok) {
    window.location.href = '/login.html';
    return null;
  }
  const usuario = await resp.json();
  renderUserBar(usuario);
  return usuario;
}

function renderUserBar(usuario) {
  const bar = document.getElementById('user-bar');
  if (!bar) return;

  const contaLink = window.location.pathname === '/conta.html' ? '' : '<a href="/conta.html">Minha conta</a>';

  bar.innerHTML = `
    <span>${usuario.email}</span>
    <span class="credits-badge" id="credits-badge">${usuario.credits} crédito${usuario.credits === 1 ? '' : 's'}</span>
    ${contaLink}
    <button type="button" class="btn-sair" id="btn-sair">Sair</button>
  `;

  document.getElementById('btn-sair').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
}

function atualizarBadgeCreditos(creditos) {
  const badge = document.getElementById('credits-badge');
  if (badge) badge.textContent = `${creditos} crédito${creditos === 1 ? '' : 's'}`;
}
