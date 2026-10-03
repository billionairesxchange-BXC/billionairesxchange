require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '400kb' }));
app.use(express.static(__dirname));

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

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

