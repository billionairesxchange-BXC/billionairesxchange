require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const app = express();
const PORT = 3000;

// Serve static files (your index.html and chart.js)
app.use(express.static(__dirname));

// Example REST endpoint for current price
app.get('/api/price/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

// WebSocket server to stream live data
const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Default pair
  let pair = 'btcusdt';
  let socket = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@trade`);

  socket.on('message', (data) => {
    const trade = JSON.parse(data);
    ws.send(JSON.stringify({ price: trade.p, quantity: trade.q }));
  });

  ws.on('message', (msg) => {
    // Allow frontend to change pair dynamically
    const { newPair } = JSON.parse(msg);
    if (newPair) {
      socket.close();
      pair = newPair.toLowerCase();
      socket = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@trade`);
      socket.on('message', (data) => {
        const trade = JSON.parse(data);
        ws.send(JSON.stringify({ price: trade.p, quantity: trade.q }));
      });
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    socket.close();
  });
});
require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET;

// Helper: sign query string
function signQuery(queryString) {
  return crypto.createHmac('sha256', BINANCE_API_SECRET)
               .update(queryString)
               .digest('hex');
}

// Place order endpoint
app.post('/api/order', async (req, res) => {
  const { symbol, side, type, quantity, price } = req.body;

  try {
    const timestamp = Date.now();
    let queryString = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;

    if (price) {
      queryString += `&price=${price}`;
    }

    const signature = signQuery(queryString);

    const response = await axios.post(
      'https://api.binance.com/api/v3/order',
      null,
      {
        params: { ...req.body, timestamp, signature },
        headers: { 'X-MBX-APIKEY': BINANCE_API_KEY }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Example: get account info
app.get('/api/account', async (req, res) => {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = signQuery(queryString);

    const response = await axios.get(
      'https://api.binance.com/api/v3/account',
      {
        params: { timestamp, signature },
        headers: { 'X-MBX-APIKEY': BINANCE_API_KEY }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));


