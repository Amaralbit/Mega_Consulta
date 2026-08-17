# Mega Consultas

Assistente **gratuito** para consulta de pendências de veículos emplacados em Goiás (IPVA, licenciamento, multas).

## Como funciona

O usuário informa Estado + Placa + Renavam (e opcionalmente CPF/CNPJ). O sistema valida e normaliza esses dados
e leva o usuário direto ao **portal oficial do Detran-GO**, com a placa e o renavam prontos pra copiar e colar.

## Por que não busca os débitos automaticamente?

O portal oficial (`detran.go.gov.br/psw`) é uma SPA protegida por **Google reCAPTCHA v2/v3**. Não existe hoje uma
API pública e gratuita para consultar débitos veiculares de Goiás — os provedores privados que oferecem isso
(ex.: InfoSimples) exigem credencial de despachante autorizado (login + senha + certificado digital) e cobram por
consulta, porque mantêm infraestrutura de automação com credencial real, não porque "furam" o captcha.

Contornar o captcha do governo para automatizar isso não é uma linha que este projeto cruza — nem grátis, nem
pago. Por isso o produto atual é um **assistente/atalho**, não um scraper: 100% gratuito, 100% legal, sem risco
de bloqueio ou de violar termos de uso.

### Caminhos futuros, se fizer sentido

- **Credenciamento como despachante** junto ao Detran-GO (certificado digital PKCS12) — permite acesso legítimo e
  automatizável, mas tem burocracia e custo de credenciamento.
- **Integração paga** com um provedor como InfoSimples, usando a credencial acima — aí sim dá pra mostrar os
  débitos dentro do próprio site, mas deixa de ser gratuito.

## Rodar localmente

```bash
npm install
npm start
```

Abre em `http://localhost:3000`.

## Stack

Node.js + Express (apenas para servir a página e validar os dados) + HTML/CSS/JS puro no front-end. Sem
banco de dados, sem login, sem cobrança — não há nada para pagar ou manter.
