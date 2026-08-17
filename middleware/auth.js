/**
 * middleware/auth.js
 *
 * requireAuth: protege rotas de página e de API.
 * - Para chamadas de API (fetch, sem navegação), responde 401 em JSON.
 * - Para navegação direta no navegador, redireciona pra /login.html.
 */

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();

  // usa originalUrl (não req.path): dentro de um router montado em /api/billing,
  // req.path já vem relativo ao mount point (ex.: "/pacotes"), então o
  // startsWith('/api/') sempre falharia lá dentro
  const wantsJson =
    req.originalUrl.startsWith('/api/') || req.get('accept')?.includes('application/json');

  if (wantsJson) {
    return res.status(401).json({ erro: 'Faça login para continuar.' });
  }
  return res.redirect('/login.html');
}

module.exports = { requireAuth };
