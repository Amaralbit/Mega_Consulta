// Carrega o .env pro process.env antes de qualquer coisa que dependa dele
// (nativo do Node — sem precisar da dependência `dotenv`). Se o arquivo não
// existir (ex: produção configurando as variáveis direto no host), ignora.
try {
  process.loadEnvFile();
} catch {
  // .env ausente é normal em produção — as variáveis vêm do host nesse caso.
}

const express = require('express');
const path = require('path');
const { consultarVeiculo } = require('./datasource/consultaVeiculo');

const app = express();
const PORT = process.env.PORT || 3000;

// A validação de formato de placa/renavam roda no navegador (docs/app.js).
// Este backend só existe pra, opcionalmente, plugar a consulta real via
// InfoSimples quando configurada (ver datasource/consultaVeiculo.js). A
// mesma pasta docs/ é publicada estática no GitHub Pages — lá esta rota
// simplesmente não existe, então o front-end cai sozinho no modo gratuito
// de redirecionamento. Rodando com `node server.js`, o comportamento é
// idêntico até você preencher as credenciais da InfoSimples no .env.
const PORTAL_OFICIAL_URL = 'https://www.detran.go.gov.br/psw/';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'docs')));

function normalizarPlaca(placa) {
  return String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizarRenavam(renavam) {
  return String(renavam || '').replace(/\D/g, '');
}

app.post('/api/consulta', async (req, res) => {
  const estado = req.body?.estado;
  const placa = normalizarPlaca(req.body?.placa);
  const renavam = normalizarRenavam(req.body?.renavam);

  try {
    const resultado = await consultarVeiculo({ estado, placa, renavam });

    if (!resultado.configurado) {
      return res.json({ redirecionar: true, estado, placa, renavam, portalOficialUrl: PORTAL_OFICIAL_URL });
    }

    res.json(resultado);
  } catch (err) {
    console.error('[Consulta] Erro ao consultar InfoSimples:', err);
    // Mesmo com credencial configurada, se a consulta real falhar (fora do
    // ar, certificado vencido etc.) caímos no modo gratuito em vez de
    // quebrar a experiência do usuário.
    res.json({ redirecionar: true, estado, placa, renavam, portalOficialUrl: PORTAL_OFICIAL_URL });
  }
});

app.listen(PORT, () => {
  console.log(`Mega Consultas rodando em http://localhost:${PORT}`);
});
