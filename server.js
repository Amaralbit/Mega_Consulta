const express = require('express');
const path = require('path');
const { consultarVeiculo } = require('./datasource/consultaVeiculo');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/consulta', async (req, res) => {
  const { estado, placa, renavam, documento } = req.body || {};

  if (!estado || !placa || !renavam) {
    return res.status(400).json({
      erro: 'Informe estado, placa e renavam para consultar.',
    });
  }

  try {
    const resultado = await consultarVeiculo({ estado, placa, renavam, documento });
    res.json(resultado);
  } catch (err) {
    console.error('Erro ao consultar veiculo:', err);
    res.status(502).json({
      erro: 'Não foi possível concluir a consulta agora. Tente novamente em instantes.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Mega Consultas rodando em http://localhost:${PORT}`);
  console.log('Fonte de dados atual: MOCK (datasource/consultaVeiculo.js)');
});
