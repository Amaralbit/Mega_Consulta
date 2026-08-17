const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// URL oficial do Detran-GO onde o cidadão consulta débitos (IPVA, licenciamento,
// multas) do veículo. É uma SPA protegida por reCAPTCHA — não dá (nem devemos)
// automatizar isso, então este backend só valida/normaliza os dados que o
// usuário já digitou e devolve prontos pra ele copiar no portal oficial.
const PORTAL_OFICIAL_URL = 'https://www.detran.go.gov.br/psw/';

function normalizarPlaca(placa) {
  return String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizarRenavam(renavam) {
  return String(renavam || '').replace(/\D/g, '');
}

function placaValida(placa) {
  // Aceita formato antigo (AAA9999) e Mercosul (AAA9A99)
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa);
}

function renavamValido(renavam) {
  return renavam.length >= 9 && renavam.length <= 11;
}

app.post('/api/preparar-consulta', (req, res) => {
  const { estado, placa, renavam, documento } = req.body || {};

  const placaNormalizada = normalizarPlaca(placa);
  const renavamNormalizado = normalizarRenavam(renavam);

  if (estado !== 'GO') {
    return res.status(400).json({ erro: 'Por enquanto só oferecemos suporte a veículos emplacados em Goiás (GO).' });
  }
  if (!placaValida(placaNormalizada)) {
    return res.status(400).json({ erro: 'Placa inválida. Use o formato ABC1234 ou ABC1D23.' });
  }
  if (!renavamValido(renavamNormalizado)) {
    return res.status(400).json({ erro: 'Renavam inválido. Deve ter entre 9 e 11 dígitos.' });
  }

  res.json({
    estado,
    placa: placaNormalizada,
    renavam: renavamNormalizado,
    documento: documento ? String(documento).replace(/\D/g, '') : '',
    portalOficialUrl: PORTAL_OFICIAL_URL,
  });
});

app.listen(PORT, () => {
  console.log(`Mega Consultas rodando em http://localhost:${PORT}`);
});
