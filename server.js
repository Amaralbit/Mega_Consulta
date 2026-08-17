require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const db = require('./db');
const { requireAuth } = require('./middleware/auth');
const { consultarVeiculo } = require('./datasource/consultaVeiculo');
const authRoutes = require('./routes/auth');
const { router: billingRoutes, webhookHandler } = require('./routes/billing');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET) {
  console.warn(
    '⚠ SESSION_SECRET não definido no .env — usando um valor de desenvolvimento. ' +
      'Defina um valor forte antes de colocar isso em produção.'
  );
}

app.set('trust proxy', 1);

// o webhook da Stripe precisa do corpo "cru" (raw) pra validar a assinatura,
// então essa rota é registrada ANTES do express.json() global, com seu
// próprio parser — se ficasse depois, o corpo já teria sido parseado como
// JSON e a verificação de assinatura falharia sempre.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-troque-isso-em-producao',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
    },
    // Observação: isso usa a MemoryStore padrão do express-session — ótima
    // pra rodar localmente/protótipo, mas some ao reiniciar o processo e não
    // funciona com múltiplas instâncias. Antes de produção, trocar por um
    // store persistente (ex.: connect-sqlite3, Redis).
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/billing', requireAuth, billingRoutes);

// páginas que exigem login (consulta e conta/créditos) — intercepta antes
// do static servir o arquivo livremente
app.get(['/', '/index.html'], requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/conta.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'conta.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/consulta', requireAuth, async (req, res) => {
  const { estado, placa, renavam, documento } = req.body || {};

  if (!estado || !placa || !renavam) {
    return res.status(400).json({
      erro: 'Informe estado, placa e renavam para consultar.',
    });
  }

  try {
    db.debitarCredito(req.session.userId, 'consulta');
  } catch (err) {
    if (err.code === 'SEM_CREDITOS') {
      return res.status(402).json({
        erro: 'Você não tem créditos suficientes. Compre mais créditos para continuar.',
      });
    }
    console.error('Erro ao debitar crédito:', err);
    return res.status(500).json({ erro: 'Erro interno ao processar a consulta.' });
  }

  try {
    const resultado = await consultarVeiculo({ estado, placa, renavam, documento });

    db.registrarConsulta({
      userId: req.session.userId,
      estado: resultado.estado,
      placa: resultado.placa,
      renavam: resultado.renavam,
      total: resultado.total,
      fonte: resultado.fonte,
    });

    const user = db.getUserById(req.session.userId);
    res.json({ ...resultado, creditosRestantes: user.credits });
  } catch (err) {
    // consulta falhou depois de já ter debitado o crédito: devolve o crédito
    db.addCredits(req.session.userId, 1, 'estorno_falha_consulta');
    console.error('Erro ao consultar veiculo:', err);
    res.status(502).json({
      erro: 'Não foi possível concluir a consulta agora. Tente novamente em instantes.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Mega Consultas rodando em http://localhost:${PORT}`);
  console.log('Fonte de dados atual: MOCK (datasource/consultaVeiculo.js)');
  console.log(
    process.env.STRIPE_SECRET_KEY
      ? 'Cobrança Stripe: configurada'
      : 'Cobrança Stripe: NÃO configurada (defina STRIPE_SECRET_KEY no .env para habilitar)'
  );
});
