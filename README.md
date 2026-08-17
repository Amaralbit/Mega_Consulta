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

Rodar localmente:

```bash
npm install
npm start
# abre em http://localhost:3000
```

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
