/**
 * routes/auth.js
 *
 * Cadastro, login, logout e "quem sou eu" (usado pelo front pra saber se
 * está logado e mostrar o saldo de créditos no topo da página).
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

const FREE_TRIAL_CREDITS = Number(process.env.FREE_TRIAL_CREDITS || 3);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/signup', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  }
  if (db.getUserByEmail(email)) {
    return res.status(409).json({ erro: 'Já existe uma conta com esse e-mail.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = db.createUser({ email, passwordHash, creditosIniciais: FREE_TRIAL_CREDITS });

  req.session.userId = user.id;
  res.json({ email: user.email, credits: user.credits });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? db.getUserByEmail(email) : null;

  // mesma mensagem pra e-mail inexistente ou senha errada (não vaza qual dos dois)
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  }

  req.session.userId = user.id;
  res.json({ email: user.email, credits: user.credits });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ erro: 'Não autenticado.' });

  const user = db.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ erro: 'Não autenticado.' });

  res.json({ email: user.email, credits: user.credits });
});

module.exports = router;
