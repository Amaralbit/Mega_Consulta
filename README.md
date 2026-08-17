# Mega Consultas

Consulta de pendências de veículos emplacados em Goiás (IPVA, licenciamento, multas). Funciona em dois modos,
e escolhe automaticamente qual usar:

- **Modo gratuito (padrão, hoje é o que está no ar):** o usuário informa Estado + Placa + Renavam, o sistema
  valida e leva ele direto ao **portal oficial do Detran-GO**, com os dados prontos pra copiar e colar.
- **Modo real (preparado, ainda não ativado):** se a InfoSimples estiver configurada (ver abaixo), o mesmo
  formulário mostra os débitos de verdade — IPVA, licenciamento e multas com valores — dentro do próprio site.

Não há chave nem interruptor manual pra escolher o modo: o front-end (`docs/app.js`) tenta consultar o backend
(`POST /api/consulta`) e, se ele não existir, não responder, ou não estiver configurado, cai sozinho no modo
gratuito. Isso também é por que o **GitHub Pages continua 100% grátis mesmo depois desta preparação** — lá não
tem backend nenhum rodando, então a chamada falha e o site se comporta exatamente como antes.

## Por que os débitos não vêm de graça por padrão?

O portal oficial (`detran.go.gov.br/psw`) é uma SPA protegida por **Google reCAPTCHA v2/v3**. Não existe hoje uma
API pública e gratuita para consultar débitos veiculares de Goiás — furar esse captcha não é uma linha que este
projeto cruza, nem grátis nem pago.

O jeito legítimo de ter os dados reais é usar um provedor pago que já tem credencial de despachante autorizado
(login + senha do Detran-GO + certificado digital PKCS12) — é isso que o modo real, já preparado, espera.

## Ativando o modo real (InfoSimples)

1. Contrate o produto **DETRAN/GO Débitos** na InfoSimples (https://infosimples.com/consultas/detran-go-debitos/)
   — exige credencial de despachante credenciado no Detran-GO (CPF + senha + certificado digital `.pfx`).
2. Copie `.env.example` para `.env` e preencha as 5 variáveis `INFOSIMPLES_*`.
3. Salve o arquivo `.pfx` do certificado em `certs/` (a pasta já está no `.gitignore` — nunca vai pro Git).
4. **Confirme a URL exata do endpoint e o formato esperado do certificado no painel da sua conta antes de usar
   em produção** — os valores padrão em `datasource/consultaVeiculo.js` são o padrão documentado publicamente
   pela InfoSimples, mas não foram testados contra uma conta real.
5. Rode com `npm start` — a partir daí, toda consulta válida busca dados reais em vez de redirecionar.
6. Isso só funciona em algo que rode `server.js` de verdade (local, ou um host Node como Render/Vercel/Railway).
   **GitHub Pages não roda backend**, então lá o site continua no modo gratuito mesmo com o `.env` configurado
   em outro lugar.

## Rodar localmente

```bash
npm install
npm start
```

Abre em `http://localhost:3000`.

## Deploy (GitHub Pages — modo gratuito)

A pasta `docs/` é publicada estática pelo **GitHub Pages**, direto da branch `main`:

👉 https://amaralbit.github.io/Mega_Consulta/

Qualquer push na `main` que altere `docs/` atualiza o site publicado automaticamente (pode levar 1–2 minutos).
Como não há backend no GitHub Pages, o modo real (InfoSimples) nunca é ativado lá — pra usá-lo em produção seria
necessário hospedar `server.js` em outro lugar.

## Stack

- `docs/` — front-end (HTML/CSS/JS puro), publicado no GitHub Pages e também servido localmente pelo `server.js`.
- `server.js` — Express; serve `docs/` como estático e expõe `POST /api/consulta`, que decide entre o modo real
  e o modo gratuito.
- `datasource/consultaVeiculo.js` — único módulo com a integração InfoSimples; inativo até as credenciais
  estarem configuradas.

Sem banco de dados, sem login, sem cobrança do usuário final — não há nada pra pagar ou manter além da
consulta em si, quando/se o modo real for ativado.
