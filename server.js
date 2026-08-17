const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Site 100% estático (a validação de placa/renavam roda no navegador, em
// docs/app.js) — este servidor só existe pra facilitar rodar localmente com
// `npm start`. A mesma pasta docs/ é publicada no GitHub Pages.
app.use(express.static(path.join(__dirname, 'docs')));

app.listen(PORT, () => {
  console.log(`Mega Consultas rodando em http://localhost:${PORT}`);
});
