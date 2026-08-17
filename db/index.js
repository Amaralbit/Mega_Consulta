/**
 * db/index.js
 *
 * Camada de dados do SaaS (usuários, créditos, histórico de consultas).
 * Usa o módulo nativo `node:sqlite` (Node >= 22) — sem dependência externa,
 * sem passo de compilação nativa. Ainda é experimental no Node, então o aviso
 * "ExperimentalWarning: SQLite..." no console é esperado e inofensivo.
 *
 * Banco fica em data/mega.db (arquivo local, ignorado no git).
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'mega.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    delta INTEGER NOT NULL,
    motivo TEXT NOT NULL,
    stripe_session_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS consultas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    estado TEXT,
    placa TEXT,
    renavam TEXT,
    total REAL,
    fonte TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ---------- usuários ----------

function createUser({ email, passwordHash, creditosIniciais }) {
  const stmt = db.prepare(
    'INSERT INTO users (email, password_hash, credits) VALUES (?, ?, ?)'
  );
  const info = stmt.run(email.toLowerCase().trim(), passwordHash, creditosIniciais);
  return getUserById(Number(info.lastInsertRowid));
}

function getUserByEmail(email) {
  return db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase().trim());
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// ---------- créditos ----------

// soma créditos (compra aprovada, bônus, etc.) e registra no extrato
function addCredits(userId, delta, motivo, stripeSessionId = null) {
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(delta, userId);
    db.prepare(
      'INSERT INTO credit_transactions (user_id, delta, motivo, stripe_session_id) VALUES (?, ?, ?, ?)'
    ).run(userId, delta, motivo, stripeSessionId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return getUserById(userId);
}

// desconta 1 crédito de forma atômica; lança 'SEM_CREDITOS' se não houver saldo
function debitarCredito(userId, motivo) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
    if (!user || user.credits < 1) {
      db.exec('ROLLBACK');
      const err = new Error('SEM_CREDITOS');
      err.code = 'SEM_CREDITOS';
      throw err;
    }
    db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ?').run(userId);
    db.prepare(
      'INSERT INTO credit_transactions (user_id, delta, motivo) VALUES (?, -1, ?)'
    ).run(userId, motivo);
    db.exec('COMMIT');
  } catch (err) {
    if (err.code !== 'SEM_CREDITOS') db.exec('ROLLBACK');
    throw err;
  }
}

function listarTransacoes(userId, limite = 50) {
  return db
    .prepare(
      'SELECT delta, motivo, created_at FROM credit_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?'
    )
    .all(userId, limite);
}

// já pago (evita creditar duas vezes o mesmo checkout, ex.: webhook repetido)
function checkoutJaProcessado(stripeSessionId) {
  const row = db
    .prepare('SELECT id FROM credit_transactions WHERE stripe_session_id = ?')
    .get(stripeSessionId);
  return Boolean(row);
}

// ---------- consultas (histórico/auditoria) ----------

function registrarConsulta({ userId, estado, placa, renavam, total, fonte }) {
  db.prepare(
    'INSERT INTO consultas (user_id, estado, placa, renavam, total, fonte) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, estado, placa, renavam, total, fonte);
}

function listarConsultas(userId, limite = 50) {
  return db
    .prepare(
      'SELECT estado, placa, renavam, total, fonte, created_at FROM consultas WHERE user_id = ? ORDER BY id DESC LIMIT ?'
    )
    .all(userId, limite);
}

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  addCredits,
  debitarCredito,
  listarTransacoes,
  checkoutJaProcessado,
  registrarConsulta,
  listarConsultas,
};
