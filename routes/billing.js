/**
 * routes/billing.js
 *
 * Compra de créditos via Stripe Checkout.
 *
 * Fluxo:
 *  1. front pede POST /api/billing/checkout com o id do pacote
 *  2. criamos uma Checkout Session na Stripe (modo "payment", preço criado
 *     na hora com price_data — não precisa cadastrar produto no dashboard)
 *  3. usuário paga na página hospedada da própria Stripe
 *  4. Stripe chama nosso webhook (/api/billing/webhook) confirmando o pagamento
 *  5. só AÍ creditamos o saldo — nunca no redirect de sucesso, que o usuário
 *     pode manipular/pular
 *
 * Em modo de teste (sem STRIPE_SECRET_KEY configurada), o checkout fica
 * desabilitado e a rota devolve um erro explicando o que falta configurar,
 * pra não quebrar o resto do protótipo.
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

// pacotes de crédito oferecidos — ajuste preço/quantidade à vontade
const PACOTES = [
  { id: 'avulsa', label: '1 consulta', creditos: 1, valorCentavos: 490 },
  { id: 'pacote10', label: '10 consultas', creditos: 10, valorCentavos: 3990 },
  { id: 'pacote50', label: '50 consultas', creditos: 50, valorCentavos: 14990 },
];

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // require só quando necessário — evita erro se a lib não tiver sido instalada
  const Stripe = require('stripe');
  return new Stripe(key);
}

router.get('/pacotes', (req, res) => {
  res.json({ pacotes: PACOTES });
});

router.post('/checkout', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({
      erro:
        'Cobrança ainda não configurada neste ambiente. Defina STRIPE_SECRET_KEY no .env (veja .env.example).',
    });
  }

  const { pacoteId } = req.body || {};
  const pacote = PACOTES.find((p) => p.id === pacoteId);
  if (!pacote) {
    return res.status(400).json({ erro: 'Pacote de créditos inválido.' });
  }

  try {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: pacote.valorCentavos,
            product_data: { name: `Mega Consultas — ${pacote.label}` },
          },
        },
      ],
      metadata: {
        userId: String(req.session.userId),
        pacoteId: pacote.id,
        creditos: String(pacote.creditos),
      },
      success_url: `${baseUrl}/conta.html?compra=ok`,
      cancel_url: `${baseUrl}/conta.html?compra=cancelada`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Erro ao criar checkout Stripe:', err);
    res.status(502).json({ erro: 'Não foi possível iniciar o pagamento agora.' });
  }
});

router.get('/historico', (req, res) => {
  res.json({ transacoes: db.listarTransacoes(req.session.userId) });
});

// handler do webhook — exportado à parte porque precisa ser montado com o
// body "cru" (raw), ANTES do express.json() global (ver server.js)
async function webhookHandler(req, res) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    console.error('Webhook Stripe recebido, mas STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET não configurados.');
    return res.status(503).end();
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    console.error('Assinatura de webhook Stripe inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, creditos } = session.metadata || {};

    if (userId && creditos && !db.checkoutJaProcessado(session.id)) {
      db.addCredits(Number(userId), Number(creditos), 'compra_stripe', session.id);
    }
  }

  res.json({ received: true });
}

module.exports = { router, webhookHandler, PACOTES };
