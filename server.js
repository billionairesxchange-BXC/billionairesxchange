require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(express.json({ limit: '400kb' }));
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');

  const origin = req.get('Origin');
  if (!origin || process.env.NODE_ENV !== 'production') return next();
  if (!allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'This website origin is not allowed.' });
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
if (process.env.NODE_ENV !== 'production') app.use(express.static(__dirname));

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET;
const BINANCE_ALLOWED_UIDS = new Set(
  (process.env.BINANCE_ALLOWED_UIDS || '')
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean)
);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

app.post('/api/card-request-email', async (req, res) => {
  if (!FIREBASE_WEB_API_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return res.status(503).json({ error: 'Card request email is not configured on the server.' });
  }

  const authorization = req.get('authorization') || '';
  const idToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) return res.status(401).json({ error: 'Sign in to send a card request.' });

  let firebaseAccount;
  try {
    const accountResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      { idToken },
      { timeout: 10000 }
    );
    firebaseAccount = accountResponse.data.users?.[0];
  } catch (error) {
    if (error.response?.status === 400) {
      return res.status(401).json({ error: 'Your sign-in session is invalid or expired. Sign in again.' });
    }
    console.error('Firebase token verification failed for card request email:', error.message);
    return res.status(502).json({ error: 'Could not verify your account. Try again later.' });
  }

  if (!firebaseAccount?.localId) {
    return res.status(401).json({ error: 'Your signed-in account could not be verified.' });
  }

  const { material, cardStyle, styleId, engravingText, designNote, designImageData } = req.body || {};
  const allowedStyles = {
    'black-platinum': { material: 'Metal', cardStyle: 'Black Platinum' },
    'bronze-day-to-day': { material: 'Metal', cardStyle: 'Bronze Day to Day' },
    'white-plastic-regular': { material: 'Plastic', cardStyle: 'White Regular' }
  };
  const style = allowedStyles[styleId];
  if (!style || material !== style.material || cardStyle !== style.cardStyle) {
    return res.status(400).json({ error: 'Choose a valid card design before sending your request.' });
  }
  if (typeof engravingText !== 'string' || !engravingText.trim() || engravingText.trim().length > 20) {
    return res.status(400).json({ error: 'Enter a card name of 1 to 20 characters.' });
  }
  if (typeof designNote !== 'string' || designNote.length > 300) {
    return res.status(400).json({ error: 'Design notes must be 300 characters or fewer.' });
  }
  if (typeof designImageData !== 'string' || designImageData.length > 240000
    || (designImageData && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(designImageData))) {
    return res.status(400).json({ error: 'The card design image is invalid or too large.' });
  }

  const username = firebaseAccount.displayName || firebaseAccount.email || firebaseAccount.localId;
  const safeStyle = escapeHtml(cardStyle);
  const safeMaterial = escapeHtml(material);
  const safeName = escapeHtml(engravingText.trim());
  const safeUsername = escapeHtml(username);
  const safeNote = escapeHtml(designNote.trim() || 'None').replace(/\n/g, '<br>');
  const preview = designImageData
    ? `<h2>Card design preview</h2><img src="${designImageData}" alt="Uploaded card design preview" style="display:block;max-width:560px;width:100%;height:auto;border:1px solid #ccc;border-radius:16px">`
    : '<p>No design image was uploaded.</p>';
  const text = [
    'A new ATM card request was submitted.',
    `Account: ${username} (${firebaseAccount.localId})`,
    `Material: ${material}`,
    `Card design: ${cardStyle}`,
    `Name on card: ${engravingText.trim()}`,
    `Design notes: ${designNote.trim() || 'None'}`,
    designImageData ? 'The uploaded design is attached.' : 'No design image was uploaded.'
  ].join('\n');

  try {
    await axios.post('https://api.resend.com/emails', {
      from: RESEND_FROM_EMAIL,
      to: ['billionairesxchange@gmail.com'],
      subject: `ATM card request: ${cardStyle} - ${engravingText.trim()}`,
      text,
      html: `<h1>New ATM card request</h1><dl><dt>Account</dt><dd>${safeUsername} (${escapeHtml(firebaseAccount.localId)})</dd><dt>Material</dt><dd>${safeMaterial}</dd><dt>Card design</dt><dd>${safeStyle}</dd><dt>Name on card</dt><dd>${safeName}</dd><dt>Design notes</dt><dd>${safeNote}</dd></dl>${preview}`,
      ...(designImageData ? {
        attachments: [{
          filename: 'card-design-preview.jpg',
          content: designImageData.slice('data:image/jpeg;base64,'.length)
        }]
      } : {})
    }, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      timeout: 15000
    });
    return res.status(200).json({ sent: true });
  } catch (error) {
    console.error('Resend failed to send ATM card request:', error.response?.data || error.message);
    return res.status(502).json({ error: 'Your card request was saved, but the email notification could not be sent.' });
  }
});

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

async function requireAllowedBinanceUser(req, res, next) {
  const idToken = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) return res.status(401).json({ error: 'Sign in to use Binance account features.' });
  if (!FIREBASE_WEB_API_KEY) {
    return res.status(503).json({ error: 'Account verification is not configured on the server.' });
  }
  if (BINANCE_ALLOWED_UIDS.size === 0) {
    return res.status(503).json({ error: 'Binance access is not configured for any account.' });
  }

  let firebaseAccount;
  try {
    const accountResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      { idToken },
      { timeout: 10000 }
    );
    firebaseAccount = accountResponse.data.users?.[0];
  } catch (error) {
    if (error.response?.status === 400) {
      return res.status(401).json({ error: 'Your sign-in session is invalid or expired. Sign in again.' });
    }
    console.error('Firebase token verification failed for Binance request:', error.message);
    return res.status(502).json({ error: 'Could not verify your account. Try again later.' });
  }

  if (!firebaseAccount?.localId) {
    return res.status(401).json({ error: 'Your signed-in account could not be verified.' });
  }
  if (!BINANCE_ALLOWED_UIDS.has(firebaseAccount.localId)) {
    return res.status(403).json({ error: 'This account is not authorized to use Binance account features.' });
  }
  if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
    return res.status(503).json({ error: 'Binance credentials are not configured on the server.' });
  }

  req.firebaseAccount = firebaseAccount;
  next();
}

// Helper: sign query string
function signQuery(queryString) {
  return crypto.createHmac('sha256', BINANCE_API_SECRET)
               .update(queryString)
               .digest('hex');
}

// Place order endpoint
app.post('/api/order', requireAllowedBinanceUser, async (req, res) => {
  const { symbol, side, type, quantity, price } = req.body || {};
  const normalizedSymbol = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
  const normalizedSide = typeof side === 'string' ? side.toUpperCase() : '';
  const normalizedType = typeof type === 'string' ? type.toUpperCase() : '';
  const orderQuantity = Number(quantity);
  const orderPrice = price === undefined || price === null || price === '' ? null : Number(price);

  if (!/^[A-Z0-9]{5,20}$/.test(normalizedSymbol)) {
    return res.status(400).json({ error: 'Enter a valid Binance trading symbol.' });
  }
  if (!['BUY', 'SELL'].includes(normalizedSide)) {
    return res.status(400).json({ error: 'Order side must be BUY or SELL.' });
  }
  if (!['MARKET', 'LIMIT'].includes(normalizedType)) {
    return res.status(400).json({ error: 'Order type must be MARKET or LIMIT.' });
  }
  if (!Number.isFinite(orderQuantity) || orderQuantity <= 0) {
    return res.status(400).json({ error: 'Order quantity must be a positive number.' });
  }
  if (normalizedType === 'LIMIT' && (!Number.isFinite(orderPrice) || orderPrice <= 0)) {
    return res.status(400).json({ error: 'Limit orders require a positive price.' });
  }

  try {
    const params = new URLSearchParams({
      symbol: normalizedSymbol,
      side: normalizedSide,
      type: normalizedType,
      quantity: String(orderQuantity),
      timestamp: String(Date.now())
    });
    if (normalizedType === 'LIMIT') {
      params.set('price', String(orderPrice));
      params.set('timeInForce', 'GTC');
    }
    const queryString = params.toString();
    params.set('signature', signQuery(queryString));

    const response = await axios.post(
      `https://api.binance.com/api/v3/order?${params.toString()}`,
      null,
      { headers: { 'X-MBX-APIKEY': BINANCE_API_KEY }, timeout: 15000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Binance order request failed:', error.response?.data?.msg || error.message);
    res.status(error.response?.status === 400 ? 400 : 502).json({
      error: error.response?.data?.msg || 'Binance could not process the order.'
    });
  }
});

// Example: get account info
app.get('/api/account', requireAllowedBinanceUser, async (_req, res) => {
  try {
    const params = new URLSearchParams({ timestamp: String(Date.now()) });
    params.set('signature', signQuery(params.toString()));

    const response = await axios.get(
      `https://api.binance.com/api/v3/account?${params.toString()}`,
      { headers: { 'X-MBX-APIKEY': BINANCE_API_KEY }, timeout: 15000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Binance account request failed:', error.response?.data?.msg || error.message);
    res.status(502).json({ error: error.response?.data?.msg || 'Binance account information is unavailable.' });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on port ${PORT}`));
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  let pair = 'btcusdt';
  let socket = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@trade`);

  socket.on('message', (data) => {
    const trade = JSON.parse(data);
    ws.send(JSON.stringify({ price: trade.p, quantity: trade.q }));
  });

  ws.on('message', (msg) => {
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
