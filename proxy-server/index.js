const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

const apiProxy = createProxyMiddleware({
  target: 'http://openapi.seoul.go.kr:8088',
  changeOrigin: true,
  secure: false,
  logLevel: 'debug',
  onError: (err, req, res) => {
    console.error('프록시 에러:', err);
    res.status(500).json({ error: 'Proxy error', message: err.message });
  },
});

app.use('/api', apiProxy);

app.listen(PORT, () => {
  console.log(`포트 ${PORT}에서 실행 중`);
});
