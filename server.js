require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { registerMobileApi } = require('./mobile-api');

const app = express();
const port = Number(process.env.PORT) || 3000;
const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY;
const databaseSsl = process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: process.env.RENDER !== 'true' }
  : false;
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: databaseSsl
    })
  : null;

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((request, response, next) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);
  const origin = request.get('origin');
  if (origin && allowedOrigins.includes(origin)) {
    response.set('Access-Control-Allow-Origin', origin);
    response.set('Vary', 'Origin');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  }
  if (request.method === 'OPTIONS') return response.sendStatus(204);
  next();
});

registerMobileApi(app);

const persistedKeys = new Set([
  'makingsPositionMarketPositions',
  'makingsPaperOrders',
  'makingsPositionMarketBalance',
  'makingsWalletCreditCardBalance',
  'makingsTradePaperBalance',
  'makingsTradeRealizedProfit',
  'makingsInvestmentDemoState',
  'makingsBotBackgroundState',
  'makingsBotMemory',
  'botPositionRecords'
]);
const persistedKey = (key) => persistedKeys.has(key)
  || /^makingsAutoPilotBotsV1:[^:]{1,128}$/.test(key)
  || /^makingsBot(Settings|Memory):[^:]{1,128}$/.test(key);

async function initializeDatabase() {
  if (!pool) throw new Error('DATABASE_URL is required for persistent paper trading.');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_account_state (
      uid TEXT PRIMARY KEY,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function authenticate(request, response, next) {
  const token = (request.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !firebaseApiKey) return response.status(401).json({ error: 'Sign in is required for background paper trading.' });
  try {
    const result = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });
    const data = await result.json();
    const uid = data.users?.[0]?.localId;
    if (!result.ok || typeof uid !== 'string') return response.status(401).json({ error: 'Your sign-in session is invalid or expired.' });
    request.accountUid = uid;
    next();
  } catch (error) {
    console.error('Firebase account verification failed:', error);
    response.status(503).json({ error: 'Sign-in verification is temporarily unavailable.' });
  }
}

app.get('/healthz', async (request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', paperWorker: 'enabled' });
  } catch (error) {
    console.error('Health check failed:', error);
    response.status(503).json({ status: 'unavailable' });
  }
});

app.get('/api/paper/state', authenticate, async (request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store');
    const result = await pool.query('SELECT state FROM paper_account_state WHERE uid = $1', [request.accountUid]);
    response.json(result.rows[0]?.state || {});
  } catch (error) {
    next(error);
  }
});

app.put('/api/paper/state', authenticate, async (request, response, next) => {
  const state = request.body;
  if (!state || typeof state !== 'object' || Array.isArray(state)
    || Object.keys(state).length > 32
    || Object.entries(state).some(([key, value]) => !persistedKey(key) || typeof value !== 'string' || value.length > 100000)) {
    return response.status(400).json({ error: 'Paper account state contains an unsupported key or value.' });
  }
  try {
    await pool.query(`
      INSERT INTO paper_account_state (uid, state) VALUES ($1, $2::jsonb)
      ON CONFLICT (uid) DO UPDATE SET state = paper_account_state.state || EXCLUDED.state, updated_at = NOW()
    `, [request.accountUid, JSON.stringify(state)]);
    response.json({ saved: true });
  } catch (error) {
    next(error);
  }
});

let fishAudioClient;
const aiVoiceRequests = new Map();
app.post('/api/ai/voice', authenticate, async (request, response) => {
  const now = Date.now();
  const recentRequests = (aiVoiceRequests.get(request.accountUid) || []).filter((time) => now - time < 60000);
  if (recentRequests.length >= 8) {
    return response.status(429).json({ error: 'AI voice is limited to 8 requests per minute.' });
  }
  recentRequests.push(now);
  aiVoiceRequests.set(request.accountUid, recentRequests);
  if (aiVoiceRequests.size > 1000) {
    for (const [uid, times] of aiVoiceRequests) {
      if (!times.some((time) => now - time < 60000)) aiVoiceRequests.delete(uid);
    }
  }

  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
  if (!text || text.length > 1200) {
    return response.status(400).json({ error: 'Provide analysis text up to 1,200 characters.' });
  }
  if (!process.env.FISH_API_KEY) {
    return response.status(503).json({ error: 'Fish Audio is not configured on the server.' });
  }

  try {
    if (!fishAudioClient) {
      const { FishAudioClient } = await import('fish-audio');
      fishAudioClient = new FishAudioClient({ apiKey: process.env.FISH_API_KEY });
    }
    const audioStream = await fishAudioClient.textToSpeech.convert(
      { text, format: 'mp3', latency: 'balanced' },
      's1',
      { timeoutInSeconds: 30, maxRetries: 1 }
    );
    const audioChunks = [];
    let audioSize = 0;
    for await (const chunk of audioStream) {
      audioSize += chunk.byteLength;
      if (audioSize > 8 * 1024 * 1024) {
        return response.status(502).json({ error: 'Generated voice audio exceeded the size limit.' });
      }
      audioChunks.push(Buffer.from(chunk));
    }
    response.set({ 'Cache-Control': 'no-store', 'Content-Type': 'audio/mpeg' });
    response.send(Buffer.concat(audioChunks));
  } catch (error) {
    console.error('Fish Audio text-to-speech request failed:', error.message || 'Unknown error.');
    response.status(502).json({ error: 'AI voice generation failed. Try again.' });
  }
});

app.use((error, request, response, next) => {
  console.error('API request failed:', error);
  if (response.headersSent) return next(error);
  response.status(500).json({ error: 'The paper account request could not be completed.' });
});

const marketPairs = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT', 'ADAUSDT', 'DOTUSDT', 'DOGEUSDT', 'BNBUSDT', 'TRXUSDT', 'USDCUSDT'];
let workerBusy = false;

async function fetchMarketSnapshots() {
  const response = await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(marketPairs))}`);
  if (!response.ok) throw new Error(`Market quote service returned HTTP ${response.status}.`);
  const tickers = await response.json();
  if (!Array.isArray(tickers)) throw new Error('Market quote service returned invalid data.');
  return Object.fromEntries(tickers.map((ticker) => [
    ticker.symbol.replace(/USDT$/, ''),
    { price: Number(ticker.lastPrice), changePct: Number(ticker.priceChangePercent), volume: Number(ticker.quoteVolume) }
  ]).filter(([, market]) => Number.isFinite(market.price) && market.price > 0));
}

function processPaperTrade(state, markets) {
  let positions;
  try { positions = JSON.parse(state.makingsPositionMarketPositions || '[]'); } catch { return; }
  if (!Array.isArray(positions) || !positions.length) return;
  let orders;
  try { orders = JSON.parse(state.makingsPaperOrders || '[]'); } catch { orders = []; }
  let balance = Number(state.makingsPositionMarketBalance);
  if (!Number.isFinite(balance) || balance < 0) balance = 10000;
  let realizedProfit = Number(state.makingsTradeRealizedProfit) || 0;
  const remaining = [];
  for (const position of positions) {
    const market = markets[position.symbol];
    if (!market || !(Number(position.quantity) > 0)) { remaining.push(position); continue; }
    const isShort = position.side === 'SELL';
    const stopHit = Number(position.stopLoss) > 0 && (isShort ? market.price >= Number(position.stopLoss) : market.price <= Number(position.stopLoss));
    const targetHit = Number(position.takeProfit) > 0 && (isShort ? market.price <= Number(position.takeProfit) : market.price >= Number(position.takeProfit));
    if (!stopHit && !targetHit) {
      remaining.push(position);
      continue;
    }
    const exitPrice = stopHit ? Number(position.stopLoss) : Number(position.takeProfit);
    const quantity = Number(position.quantity);
    const pnl = (isShort ? Number(position.averagePrice) - exitPrice : exitPrice - Number(position.averagePrice)) * quantity;
    balance += isShort
      ? Math.max(0, (Number(position.margin) || Number(position.averagePrice) * quantity) + pnl)
      : quantity * exitPrice;
    realizedProfit += pnl;
    orders.unshift({
      symbol: position.symbol, side: isShort ? 'BUY' : 'SELL', mode: 'spot',
      positionSide: isShort ? 'SHORT' : 'LONG', type: stopHit ? 'STOP_LOSS' : 'TAKE_PROFIT',
      quantity, price: exitPrice, time: Date.now()
    });
  }
  state.makingsPositionMarketPositions = JSON.stringify(remaining);
  state.makingsPaperOrders = JSON.stringify(orders.slice(0, 100));
  state.makingsPositionMarketBalance = String(balance);
  state.makingsTradeRealizedProfit = String(realizedProfit);
}

function processAutoPilotBots(state, markets) {
  const entries = Object.entries(state).filter(([key]) => key.startsWith('makingsAutoPilotBotsV1:'));
  for (const [key, saved] of entries) {
    let bots;
    try { bots = JSON.parse(saved); } catch { continue; }
    if (!Array.isArray(bots)) continue;
    let changed = false;
    for (const bot of bots) {
      if (!bot || bot.consentGranted !== true || !['running', 'finishing'].includes(bot.status)) continue;
      if (Date.now() - Number(bot.clientUpdatedAt || 0) < 30000) continue;
      changed = true;
      const now = Date.now();
      if (bot.status === 'running' && bot.endsAt && now >= bot.endsAt) {
        bot.status = bot.openPosition ? 'finishing' : 'completed';
        bot.remainingMs = 0;
        bot.endsAt = null;
        bot.startedAt = null;
      }
      if (bot.openPosition) {
        const position = bot.openPosition;
        const market = markets[position.symbol];
        if (!market) continue;
        position.lastPrice = market.price;
        const movePct = (market.price - position.entryPrice) / position.entryPrice * 100;
        const reason = movePct <= -position.stopLossPct ? 'stop-loss'
          : movePct >= position.takeProfitPct ? 'take-profit'
            : bot.status === 'finishing' ? 'duration ended' : '';
        if (!reason) continue;
        const quantity = Math.min(position.quantity, Number(bot.sellAmountUsd) > 0 ? Number(bot.sellAmountUsd) / market.price : position.quantity);
        const amount = position.amount * (quantity / position.quantity);
        const pnl = quantity * market.price - amount;
        bot.balance += quantity * market.price;
        bot.realizedPnl = (Number(bot.realizedPnl) || 0) + pnl;
        bot.trades = Array.isArray(bot.trades) ? bot.trades : [];
        bot.trades.push({
          id: `${bot.id}-${now}`, botName: bot.name, symbol: position.symbol, amount, quantity,
          entryPrice: position.entryPrice, exitPrice: market.price, pnl, reason, closedAt: now
        });
        bot.trades = bot.trades.slice(-200);
        position.quantity -= quantity;
        position.amount -= amount;
        position.lastPrice = market.price;
        if (position.quantity <= 1e-10) bot.openPosition = null;
        const learning = bot.learning[position.symbol] || { trades: 0, wins: 0, losses: 0, returnPctTotal: 0 };
        learning.trades += 1;
        learning.wins += pnl > 0 ? 1 : 0;
        learning.losses += pnl <= 0 ? 1 : 0;
        learning.returnPctTotal += amount ? pnl / amount * 100 : 0;
        bot.learning[position.symbol] = learning;
        if (bot.realizedPnl >= bot.goalUsd) {
          bot.status = bot.openPosition ? 'finishing' : 'goal-reached';
          bot.remainingMs = 0;
          bot.endsAt = null;
          bot.startedAt = null;
        } else if (bot.status === 'finishing' && !bot.openPosition) {
          bot.status = 'completed';
        }
      } else if (bot.status === 'running') {
        if (bot.endsAt) bot.remainingMs = Math.max(0, bot.endsAt - now);
        if (Number(bot.realizedPnl) >= Number(bot.goalUsd)) {
          bot.status = 'goal-reached';
          bot.remainingMs = 0;
          bot.endsAt = null;
          continue;
        }
        const market = markets[bot.selectedSymbol];
        if (!market || market.changePct <= 0 || market.volume < 1000000) continue;
        const volatility = market.highPrice > market.lowPrice ? (market.highPrice - market.lowPrice) / market.price * 100 : 0;
        const riskFraction = volatility >= 12 ? 0.02 : market.changePct >= 8 ? 0.08 : 0.04;
        const amount = Math.min(Number(bot.buyAmountUsd) || Number(bot.balance) * riskFraction,
          Number(bot.tradeCapUsd), Number(bot.balance));
        if (amount < 0.01) { bot.status = 'paused'; continue; }
        bot.balance -= amount;
        bot.openPosition = {
          symbol: bot.selectedSymbol, amount, quantity: amount / market.price,
          entryPrice: market.price, lastPrice: market.price, openedAt: now,
          stopLossPct: volatility >= 12 ? 2.5 : market.changePct >= 8 ? 3 : 3.5,
          takeProfitPct: volatility >= 12 ? 5 : market.changePct >= 8 ? 7 : 6
        };
      }
    }
    if (changed) state[key] = JSON.stringify(bots);
  }
}

function processClassicBot(state, markets) {
  const now = Date.now();
  let bot;
  try { bot = JSON.parse(state.makingsBotBackgroundState || 'null'); } catch { return; }
  if (!bot || (bot.running !== true && !bot.position) || Date.now() - Number(bot.updatedAt) < 30000) return;
  const market = markets[bot.symbol];
  if (!market) return;
  let balance = Number(bot.balance);
  let pnl = Number(bot.pnl) || 0;
  let position = bot.position || null;
  const history = (Array.isArray(bot.history) ? bot.history : [])
    .map(Number).filter((price) => Number.isFinite(price) && price > 0).slice(-20);
  if (history.length < 4) return;
  const prices = [...history, market.price];
  const current = prices[prices.length - 1];
  let signal = 'HOLD';
  if (bot.strategy === 'Momentum') {
    const start = prices[Math.max(0, prices.length - 6)];
    const move = (current - start) / start;
    signal = move > 0.001 ? 'BUY' : move < -0.001 ? 'SELL' : 'HOLD';
  } else if (bot.strategy === 'Scalp') {
    const move = (current - prices[prices.length - 2]) / prices[prices.length - 2];
    signal = move > 0.0015 ? 'BUY' : move < -0.0015 ? 'SELL' : 'HOLD';
  } else if (bot.strategy === 'Mean reversion (single market)') {
    const reference = prices.slice(-11, -1);
    const average = reference.reduce((sum, price) => sum + price, 0) / reference.length;
    const deviation = (current - average) / average;
    signal = deviation < -0.002 ? 'BUY' : deviation > 0.002 ? 'SELL' : 'HOLD';
  } else {
    signal = prices.length % 6 === 0 ? 'BUY' : 'HOLD';
  }
  const recent = prices.slice(-6);
  const prior = prices.slice(-12, -6);
  const shortAverage = recent.reduce((sum, price) => sum + price, 0) / recent.length;
  const longPrices = prices.slice(-20);
  const longAverage = longPrices.reduce((sum, price) => sum + price, 0) / longPrices.length;
  const momentum = (recent[recent.length - 1] - recent[0]) / recent[0] * 100;
  const priorMomentum = prior.length ? (prior[prior.length - 1] - prior[0]) / prior[0] * 100 : 0;
  const trend = (shortAverage - longAverage) / longAverage * 100;
  const score = momentum * 4 + trend * 3 + (momentum - priorMomentum) * 2;
  const signalStrength = Math.min(96, Math.max(55, 55 + Math.abs(score) * 8));
  if (signalStrength < 55) signal = 'HOLD';
  let closedTrade = null;
  if (position && position.symbol === bot.symbol) {
    const movePct = (market.price - Number(position.entry)) / Number(position.entry) * 100;
    const durationExpired = Number(position.expiresAt) > 0 && now >= Number(position.expiresAt);
    if (durationExpired || movePct >= Number(position.takeProfit) || movePct <= -Number(position.stopLoss)) {
      const result = Number(position.size) * (market.price - Number(position.entry));
      balance += Number(position.size) * market.price;
      pnl += result;
      closedTrade = {
        symbol: bot.symbol,
        entry: Number(position.entry),
        exit: market.price,
        pnl: result,
        source: position.source || 'AI bot',
        pauseAfterExit: position.pauseAfterExit === true,
        reason: durationExpired ? 'duration ended' : movePct >= Number(position.takeProfit) ? 'take-profit' : 'stop-loss',
        time: now
      };
      position = null;
    }
  } else if (bot.running === true && signal === 'BUY' && market.volume >= 1000000 && pnl < Number(bot.goalProfit)) {
    const risk = { Conservative: 0.03, Balanced: 0.06, Aggressive: 0.1 }[bot.riskLevel] || 0.06;
    const maxTrade = Number(bot.maxTradeAmount) > 0 ? Number(bot.maxTradeAmount) : Infinity;
    const size = Math.min(balance * risk / market.price, 2.5, maxTrade / market.price);
    if (size * market.price >= 20 && size * market.price <= balance) {
      position = {
        symbol: bot.symbol, entry: market.price, size,
        stopLoss: Number(bot.stopLoss) || 5, takeProfit: Number(bot.takeProfit) || 10,
        strategy: 'Background paper momentum'
      };
      balance -= size * market.price;
      const records = (() => {
        try {
          const parsed = JSON.parse(state.botPositionRecords || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      })();
      records.push({
        id: `${bot.symbol}-${now}`, symbol: bot.symbol, quantity: size, amount: size * market.price,
        openPrice: market.price, openedAt: now, closePrice: null, closedAt: null, status: 'OPEN', source: 'AI bot'
      });
      state.botPositionRecords = JSON.stringify(records);
    }
  }
  state.makingsBotBackgroundState = JSON.stringify({
    ...bot, running: bot.running === true && !(closedTrade?.pauseAfterExit) && pnl < Number(bot.goalProfit), balance, pnl, position,
    history: prices.slice(-30), updatedAt: Date.now()
  });
  state.makingsTradePaperBalance = String(balance);
  state.makingsPositionMarketBalance = String(balance);
  if (pnl !== Number(bot.pnl || 0)) {
    const realized = Number(state.makingsTradeRealizedProfit) || 0;
    state.makingsTradeRealizedProfit = String(realized + pnl - (Number(bot.pnl) || 0));
  }
  if (closedTrade) {
    try {
      const records = JSON.parse(state.botPositionRecords || '[]');
      const record = Array.isArray(records) ? [...records].reverse().find((item) => item.symbol === bot.symbol
        && item.source === closedTrade.source && item.status === 'OPEN') : null;
      if (record) {
        record.closePrice = market.price;
        record.closedAt = closedTrade.time;
        record.status = 'CLOSED';
        state.botPositionRecords = JSON.stringify(records);
      }
    } catch (error) {
      console.error('A saved bot position record could not be updated:', error);
    }
    for (const key of Object.keys(state).filter((name) => name.startsWith('makingsBotMemory:'))) {
      try {
        const memory = JSON.parse(state[key]);
        memory.pnl = pnl;
        memory.openPosition = null;
        memory.closedTrades = Array.isArray(memory.closedTrades) ? memory.closedTrades : [];
        memory.closedTrades.unshift(closedTrade);
        memory.closedTrades = memory.closedTrades.slice(0, 100);
        state[key] = JSON.stringify(memory);
      } catch (error) {
        console.error('A saved bot memory record could not be updated:', error);
      }
    }
  }
}

async function runPaperWorker() {
  if (workerBusy || !pool) return;
  workerBusy = true;
  try {
    const result = await pool.query(`
      SELECT uid, state, updated_at::text AS state_version FROM paper_account_state
      WHERE state ? 'makingsPositionMarketPositions'
         OR state ? 'makingsBotBackgroundState'
         OR state::text LIKE '%makingsAutoPilotBotsV1:%'
    `);
    if (!result.rowCount) return;
    const markets = await fetchMarketSnapshots();
    for (const row of result.rows) {
      const state = row.state || {};
      processPaperTrade(state, markets);
      processAutoPilotBots(state, markets);
      processClassicBot(state, markets);
      await pool.query(
        'UPDATE paper_account_state SET state = $1::jsonb, updated_at = NOW() WHERE uid = $2 AND updated_at = $3::timestamptz',
        [JSON.stringify(state), row.uid, row.state_version]
      );
    }
  } catch (error) {
    console.error('Background paper-trade worker failed; it will retry:', error);
  } finally {
    workerBusy = false;
  }
}

initializeDatabase().then(() => {
  app.listen(port, () => console.log(`BillionairesXchange API listening on ${port}`));
  setInterval(runPaperWorker, 15000);
  runPaperWorker();
}).catch((error) => {
  console.error('The API could not start:', error);
  process.exitCode = 1;
});
