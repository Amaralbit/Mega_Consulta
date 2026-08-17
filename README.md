# Mega Consultas — Pendências Veiculares (GO)

Protótipo de teste: consulta de pendências veiculares (IPVA, licenciamento, multas)
para veículos de Goiás. **Os dados exibidos são mockados** — não há integração real
com Detran-GO/Sefaz-GO ainda (motivo: o portal oficial usa reCAPTCHA v2/v3, então não
dá pra automatizar sem uma credencial de despachante autorizada ou um provedor de
dados como a InfoSimples).

Este repositório tem duas versões da mesma interface, propositalmente separadas:

## 1. Versão com backend (`server.js` + `public/`)

A versão "de verdade" do projeto — pensada pra receber uma integração de dados real
no futuro. O front-end (`public/`) chama `POST /api/consulta` num backend Express
(`server.js`), que por sua vez delega para `datasource/consultaVeiculo.js`.

**`datasource/consultaVeiculo.js` é o único arquivo que precisa mudar** quando entrar
uma fonte de dados real — hoje ele só gera débitos fictícios.

Essa versão já é um SaaS mínimo: tem cadastro/login, saldo de créditos (1 crédito =
1 consulta) e compra de créditos via Stripe Checkout. Cada usuário novo ganha alguns
créditos grátis (`FREE_TRIAL_CREDITS`) pra testar sem pagar.

Rodar localmente:

```bash
npm install
cp .env.example .env   # edite os valores, veja detalhes abaixo
npm start
# abre em http://localhost:3000 — vai pedir login/cadastro
```

Requer **Node 22.5+** (usa o módulo nativo `node:sqlite` pra guardar usuários e
créditos em `data/mega.db` — sem instalar banco nenhum à parte; o aviso
`ExperimentalWarning: SQLite...` no console é esperado).

### Autenticação e créditos

- `db/index.js` — usuários, saldo de créditos e histórico (SQLite local).
- `middleware/auth.js` — protege páginas (`/`, `/conta.html`) e rotas de API.
- `routes/auth.js` — `/api/auth/signup`, `/login`, `/logout`, `/me`.
- `routes/billing.js` — pacotes de crédito, Stripe Checkout e o webhook que
  confirma o pagamento antes de creditar (nunca no redirect de sucesso, que o
  usuário pode manipular).
- `/api/consulta` agora exige login e debita 1 crédito por consulta (devolvido
  automaticamente se a consulta falhar).

Sessão usa a `MemoryStore` padrão do `express-session` — ótima pra rodar local,
mas os logins somem se reiniciar o processo, e não funciona com múltiplas
instâncias. Antes de ir pra produção, trocar por um store persistente (Redis,
`connect-sqlite3` etc.) e definir um `SESSION_SECRET` forte.

### Habilitar cobrança (Stripe)

Sem `STRIPE_SECRET_KEY` no `.env`, a compra de créditos fica desabilitada (a
página de conta mostra o motivo) — o resto do app funciona normalmente com os
créditos grátis do cadastro.

Pra testar pagamento de verdade (modo teste da Stripe):

1. Pegue as chaves de teste em https://dashboard.stripe.com/test/apikeys e
   coloque `STRIPE_SECRET_KEY` no `.env`.
2. Instale a [Stripe CLI](https://stripe.com/docs/stripe-cli) e rode:
   ```bash
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```
   Isso imprime um `whsec_...` — coloque em `STRIPE_WEBHOOK_SECRET` no `.env`.
3. Reinicie `npm start` e compre um pacote em `/conta.html` usando um
   [cartão de teste da Stripe](https://stripe.com/docs/testing) (ex.:
   `4242 4242 4242 4242`).

## 2. Versão estática (`docs/`) — demo publicado no GitHub Pages

Cópia da mesma UI, mas sem depender de backend nenhum: a lógica de mock roda direto
no navegador (`docs/app.js`). Existe só porque o GitHub Pages não executa Node/Express
— serve apenas arquivos estáticos.

⚠️ **Essa versão estática não deve virar a versão "real" do produto.** No dia em que
a consulta passar a usar dados verdadeiros, qualquer credencial/certificado/chave de
API precisa ficar no servidor (como em `server.js`), nunca em JS que roda no navegador
de um site público — senão qualquer visitante consegue ver a credencial no código-fonte
da página.

Demo: https://amaralbit.github.io/Mega_Consulta/
