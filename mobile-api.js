const crypto = require('crypto');
const { promisify } = require('util');
const axios = require('axios');
const QRCode = require('qrcode');

const scrypt = promisify(crypto.scrypt);
const PASSWORD_BYTES = 64;
const PASSWORD_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const PAIRING_LIFETIME_MS = 2 * 60 * 1000;
const PROVIDERS = [
  { id: 'binance', name: 'Binance', kind: 'exchange' },
  { id: 'kraken', name: 'Kraken', kind: 'exchange' },
  { id: 'coinbase', name: 'Coinbase', kind: 'exchange' },
  { id: 'alpaca', name: 'Alpaca', kind: 'brokerage' },
  { id: 'interactive_brokers', name: 'Interactive Brokers', kind: 'brokerage' },
  { id: 'web3', name: 'Web3 wallets & NFTs', kind: 'web3' }
];

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function validEmail(email) {
  return typeof email === 'string'
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizedEmail(email) {
  return email.trim().toLocaleLowerCase('en-US');
}

function normalizedWebsiteOrigin(origin) {
  if (typeof origin !== 'string') return null;
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) return null;
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

async function passwordRecord(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

async function passwordMatches(password, saltHex, hashHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (salt.length !== 16 || expected.length !== PASSWORD_BYTES) return false;
  const actual = await scrypt(password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
  return crypto.timingSafeEqual(actual, expected);
}

function asyncRoute(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error('Wallet API request failed:', error.message);
      if (!res.headersSent) res.status(500).json({ error: 'The wallet service could not complete this request.' });
    });
  };
}

function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    const error = new Error('Email delivery is not configured on the server.');
    error.status = 503;
    throw error;
  }
  return axios.post('https://api.resend.com/emails', {
    from,
    to: [to],
    subject,
    html
  }, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 15000
  });
}

function registerMobileApi(app) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    const unavailable = (_req, res) => res.status(503).json({
      error: 'Wallet accounts are not configured. Set DATABASE_URL and apply the wallet database migration.'
    });
    app.use('/api/mobile', unavailable);
    return;
  }

  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  async function requireSession(req, res, next) {
    const token = (req.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9_-]+)$/)?.[1];
    if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
    const result = await pool.query(
      `SELECT u.id, u.email, u.display_name
       FROM wallet_sessions s
       JOIN wallet_users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
         AND u.email_verified_at IS NOT NULL`,
      [tokenHash(token)]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Your session is invalid or expired. Sign in again.' });
    req.walletUser = result.rows[0];
    next();
  }

  const authAttempts = new Map();
  function limitAuthAttempts(req, res, next) {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const attempts = (authAttempts.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
    if (attempts.length >= 20) {
      authAttempts.set(key, attempts);
      return res.status(429).json({ error: 'Too many account requests. Wait 15 minutes and try again.' });
    }
    attempts.push(now);
    authAttempts.set(key, attempts);
    if (authAttempts.size > 10000) {
      for (const [address, times] of authAttempts) {
        if (!times.some((time) => now - time < 15 * 60 * 1000)) authAttempts.delete(address);
      }
    }
    next();
  }

  async function createSession(userId) {
    const token = createToken();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await pool.query(
      'INSERT INTO wallet_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
      [tokenHash(token), userId, expiresAt]
    );
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async function createEmailToken(userId, purpose) {
    const token = createToken();
    const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS);
    await pool.query(
      'DELETE FROM wallet_email_tokens WHERE user_id = $1 AND purpose = $2',
      [userId, purpose]
    );
    await pool.query(
      'INSERT INTO wallet_email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [tokenHash(token), userId, purpose, expiresAt]
    );
    return token;
  }

  async function loadConnections(userId) {
    const connected = await pool.query(
      `SELECT provider, provider_account_id, display_name, status, updated_at
       FROM wallet_provider_connections
       WHERE user_id = $1
       ORDER BY provider`,
      [userId]
    );
    const savedByProvider = new Map(connected.rows.map((connection) => [connection.provider, connection]));
    return PROVIDERS.map((provider) => {
      const connection = savedByProvider.get(provider.id);
      return {
        ...provider,
        status: connection?.status || 'not_connected',
        connected: connection?.status === 'connected',
        accountName: connection?.display_name || null,
        integrationReady: false
      };
    });
  }

  async function loadPortfolio(userId) {
    const [connections, latestSnapshots] = await Promise.all([
      pool.query(
        `SELECT provider FROM wallet_provider_connections
         WHERE user_id = $1 AND status = 'connected'`,
        [userId]
      ),
      pool.query(
        `SELECT DISTINCT ON (provider) provider, snapshot, created_at
         FROM wallet_portfolio_snapshots
         WHERE user_id = $1
         ORDER BY provider, created_at DESC`,
        [userId]
      )
    ]);
    const assets = latestSnapshots.rows.flatMap((row) => (
      Array.isArray(row.snapshot.assets) ? row.snapshot.assets : []
    ));
    return {
      syncReady: false,
      connectedProviders: connections.rows.map((row) => row.provider),
      assets,
      totalUsd: assets.reduce((total, asset) => total + (Number(asset.valueUsd) || 0), 0),
      message: connections.rowCount
        ? 'Provider sync is not configured yet; these snapshots may be stale.'
        : 'Connect a supported account to sync balances, orders, and positions.'
    };
  }

  async function loadNfts(userId) {
    const result = await pool.query(
      `SELECT chain, contract_address AS "contractAddress", token_id AS "tokenId",
              name, image_url AS "imageUrl", metadata
       FROM wallet_nft_assets WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return { assets: result.rows, discoveryReady: false };
  }

  app.get('/api/mobile/health', asyncRoute(async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  }));

  app.post('/api/mobile/auth/register', limitAuthAttempts, asyncRoute(async (req, res) => {
    const { email, name, password } = req.body || {};
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 80) {
      return res.status(400).json({ error: 'Name must be between 1 and 80 characters.' });
    }
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      return res.status(400).json({ error: 'Use a password between 12 and 128 characters.' });
    }

    const emailAddress = normalizedEmail(email);
    const existing = await pool.query('SELECT id FROM wallet_users WHERE email = $1', [emailAddress]);
    if (existing.rowCount) return res.status(409).json({ error: 'An account already exists for this email.' });

    const { salt, hash } = await passwordRecord(password);
    const created = await pool.query(
      `INSERT INTO wallet_users (email, display_name, password_salt, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [emailAddress, name.trim(), salt, hash]
    );
    const userId = created.rows[0].id;
    const token = await createEmailToken(userId, 'verify_email');
    const baseUrl = (process.env.AUTH_PUBLIC_URL || 'https://billionairesxchange-e8162.web.app').replace(/\/+$/, '');
    const verificationUrl = `${baseUrl}/wallet-connect.html?verify=${encodeURIComponent(token)}`;
    try {
      await sendEmail(
        emailAddress,
        'Verify your BXC Wallet account',
        `<p>Verify your email to activate your BXC Wallet account.</p><p><a href="${verificationUrl}">Verify email address</a></p><p>This link expires in 30 minutes. If you did not create this account, ignore this message.</p>`
      );
    } catch (error) {
      console.error('Could not send BXC Wallet verification email:', error.message);
      await pool.query('DELETE FROM wallet_users WHERE id = $1 AND email_verified_at IS NULL', [userId]);
      return res.status(error.status || 502).json({
        error: 'The verification email could not be sent, so the account was not created. Try again later.'
      });
    }
    res.status(201).json({ verificationRequired: true, message: 'Check your email to verify your account.' });
  }));

  app.post('/api/mobile/auth/verify-email', limitAuthAttempts, asyncRoute(async (req, res) => {
    const token = req.body?.token;
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
      return res.status(400).json({ error: 'The verification link is invalid or expired.' });
    }
    const result = await pool.query(
      `UPDATE wallet_users
       SET email_verified_at = NOW(), updated_at = NOW()
       WHERE id = (
         SELECT user_id FROM wallet_email_tokens
         WHERE token_hash = $1 AND purpose = 'verify_email' AND expires_at > NOW()
       )
       RETURNING id, email, display_name`,
      [tokenHash(token)]
    );
    if (!result.rowCount) return res.status(400).json({ error: 'The verification link is invalid or expired.' });
    await pool.query(
      "DELETE FROM wallet_email_tokens WHERE token_hash = $1 AND purpose = 'verify_email'",
      [tokenHash(token)]
    );
    res.json({ verified: true, message: 'Email verified. You can now sign in.' });
  }));

  app.post('/api/mobile/auth/login', limitAuthAttempts, asyncRoute(async (req, res) => {
    const { email, password } = req.body || {};
    if (!validEmail(email) || typeof password !== 'string' || password.length > 128) {
      return res.status(400).json({ error: 'Enter your email and password.' });
    }
    const result = await pool.query(
      'SELECT id, email, display_name, password_salt, password_hash, email_verified_at FROM wallet_users WHERE email = $1',
      [normalizedEmail(email)]
    );
    const user = result.rows[0];
    if (!user || !(await passwordMatches(password, user.password_salt, user.password_hash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    if (!user.email_verified_at) {
      return res.status(403).json({ error: 'Verify your email address before signing in.' });
    }
    const session = await createSession(user.id);
    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: { id: user.id, email: user.email, name: user.display_name }
    });
  }));

  app.post('/api/mobile/auth/migrate-firebase', limitAuthAttempts, asyncRoute(async (req, res) => {
    const idToken = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
    const password = req.body?.password;
    if (!idToken || typeof password !== 'string' || password.length < 12 || password.length > 128) {
      return res.status(400).json({ error: 'Sign in to your verified website account and use a password between 12 and 128 characters.' });
    }
    if (!process.env.FIREBASE_WEB_API_KEY) {
      return res.status(503).json({ error: 'Firebase account migration is not configured on the server.' });
    }
    let firebaseUser;
    try {
      const response = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY)}`,
        { idToken },
        { timeout: 10000 }
      );
      firebaseUser = response.data.users?.[0];
    } catch (error) {
      if (error.response?.status === 400) return res.status(401).json({ error: 'The website sign-in session is invalid or expired. Sign in again.' });
      console.error('Firebase token verification failed during wallet account migration:', error.message);
      return res.status(502).json({ error: 'Could not verify your website account. Try again later.' });
    }
    if (!firebaseUser?.localId || !firebaseUser.email || firebaseUser.emailVerified !== true) {
      return res.status(403).json({ error: 'Sign in to a website account with a verified email before migrating it.' });
    }

    const emailAddress = normalizedEmail(firebaseUser.email);
    const existing = await pool.query('SELECT id FROM wallet_users WHERE email = $1', [emailAddress]);
    if (existing.rowCount) return res.status(409).json({ error: 'A wallet account already exists for this email. Sign in to it instead.' });

    const { salt, hash } = await passwordRecord(password);
    const inserted = await pool.query(
      `INSERT INTO wallet_users (email, display_name, password_salt, password_hash, email_verified_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, email, display_name`,
      [emailAddress, (firebaseUser.displayName || firebaseUser.email).slice(0, 80), salt, hash]
    );
    const user = inserted.rows[0];
    const session = await createSession(user.id);
    res.status(201).json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: { id: user.id, email: user.email, name: user.display_name }
    });
  }));

  app.get('/api/mobile/auth/me', requireSession, (req, res) => {
    res.json({
      id: req.walletUser.id,
      email: req.walletUser.email,
      name: req.walletUser.display_name
    });
  });

  app.post('/api/mobile/auth/logout', requireSession, asyncRoute(async (req, res) => {
    const token = (req.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9_-]+)$/)[1];
    await pool.query(
      'UPDATE wallet_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
      [tokenHash(token)]
    );
    res.status(204).end();
  }));

  app.post('/api/mobile/pairings', limitAuthAttempts, asyncRoute(async (req, res) => {
    const websiteOrigin = normalizedWebsiteOrigin(req.get('origin'));
    if (!websiteOrigin) {
      return res.status(400).json({ error: 'Start website sign-in from a valid secure website origin.' });
    }
    res.set('Cache-Control', 'no-store');
    const token = createToken();
    const pollToken = createToken();
    const expiresAt = new Date(Date.now() + PAIRING_LIFETIME_MS);
    const websiteToken = (req.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9_-]+)$/)?.[1];
    let websiteUserId = null;
    if (websiteToken) {
      const websiteUser = await pool.query(
        `SELECT s.user_id
         FROM wallet_sessions s
         JOIN wallet_users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
           AND u.email_verified_at IS NOT NULL`,
        [tokenHash(websiteToken)]
      );
      if (!websiteUser.rowCount) return res.status(401).json({ error: 'Your website sign-in expired. Sign in again.' });
      websiteUserId = websiteUser.rows[0].user_id;
    }
    const created = await pool.query(
      `INSERT INTO wallet_pairings (token_hash, poll_token_hash, website_user_id, website_origin, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [tokenHash(token), tokenHash(pollToken), websiteUserId, websiteOrigin, expiresAt]
    );
    const qrPayload = new URL('bxcwallet://pair');
    qrPayload.searchParams.set('token', token);
    qrPayload.searchParams.set('origin', websiteOrigin);
    const qrDataUrl = await QRCode.toDataURL(qrPayload.toString(), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 300,
      color: { dark: '#090909', light: '#ffffff' }
    });
    res.status(201).json({
      id: created.rows[0].id,
      pollToken,
      qrDataUrl,
      expiresAt: expiresAt.toISOString()
    });
  }));

  app.get('/api/mobile/pairings/:id', limitAuthAttempts, asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const pollToken = req.get('X-BXC-Pairing-Token') || '';
    await pool.query(
      `UPDATE wallet_pairings
       SET status = 'expired'
       WHERE id = $1 AND poll_token_hash = $2
         AND status IN ('pending', 'approved') AND expires_at <= NOW()`,
      [req.params.id, tokenHash(pollToken)]
    );
    const pairing = await pool.query(
      `SELECT p.status, p.expires_at, u.id AS user_id, u.email, u.display_name
       FROM wallet_pairings p
       LEFT JOIN wallet_users u ON u.id = p.mobile_user_id
       WHERE p.id = $1 AND p.poll_token_hash = $2`,
      [req.params.id, tokenHash(pollToken)]
    );
    if (!pairing.rowCount) return res.status(404).json({ error: 'This pairing request was not found.' });
    const record = pairing.rows[0];
    res.json({
      status: record.status,
      expiresAt: record.expires_at,
      user: record.user_id ? { id: record.user_id, email: record.email, name: record.display_name } : null
    });
  }));

  app.post('/api/mobile/pairings/:id/exchange', limitAuthAttempts, asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const pollToken = req.get('X-BXC-Pairing-Token') || '';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pairing = await client.query(
        `SELECT mobile_user_id
         FROM wallet_pairings
         WHERE id = $1
           AND poll_token_hash = $2
           AND status = 'approved'
           AND expires_at > NOW()
         FOR UPDATE`,
        [req.params.id, tokenHash(pollToken)]
      );
      if (!pairing.rowCount) {
        await client.query('ROLLBACK');
        return res.status(410).json({ error: 'This pairing request is not approved or has expired.' });
      }
      const sessionToken = createToken();
      const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
      await client.query(
        'INSERT INTO wallet_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [tokenHash(sessionToken), pairing.rows[0].mobile_user_id, expiresAt]
      );
      await client.query(
        "UPDATE wallet_pairings SET status = 'consumed', consumed_at = NOW() WHERE id = $1",
        [req.params.id]
      );
      await client.query('COMMIT');
      res.json({ token: sessionToken, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }));

  app.post('/api/mobile/pairings/approve', requireSession, asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const token = req.body?.token;
    const websiteOrigin = normalizedWebsiteOrigin(req.body?.origin);
    if (typeof token !== 'string' || token.length < 32 || token.length > 128 || !websiteOrigin) {
      return res.status(400).json({ error: 'The website pairing code is invalid or expired.' });
    }
    const approved = await pool.query(
      `UPDATE wallet_pairings
       SET status = 'approved', mobile_user_id = $1, approved_at = NOW()
       WHERE token_hash = $2
         AND status = 'pending'
         AND expires_at > NOW()
         AND website_origin = $3
         AND (website_user_id IS NULL OR website_user_id = $1)
       RETURNING id`,
      [req.walletUser.id, tokenHash(token), websiteOrigin]
    );
    if (!approved.rowCount) return res.status(410).json({
      error: 'This pairing code is expired or already used. Generate a new code on the website.'
    });
    res.json({ paired: true, message: 'Website sign-in approved. Continue on the website.' });
  }));

  app.get('/api/mobile/connections', requireSession, asyncRoute(async (req, res) => {
    res.json(await loadConnections(req.walletUser.id));
  }));

  app.get('/api/mobile/portfolio', requireSession, asyncRoute(async (req, res) => {
    res.json(await loadPortfolio(req.walletUser.id));
  }));

  app.get('/api/mobile/nfts', requireSession, asyncRoute(async (req, res) => {
    res.json(await loadNfts(req.walletUser.id));
  }));

  app.get('/api/mobile/dashboard', requireSession, asyncRoute(async (req, res) => {
    const [connections, portfolio, nfts] = await Promise.all([
      loadConnections(req.walletUser.id),
      loadPortfolio(req.walletUser.id),
      loadNfts(req.walletUser.id)
    ]);
    res.json({
      user: {
        id: req.walletUser.id,
        email: req.walletUser.email,
        name: req.walletUser.display_name
      },
      connections,
      portfolio,
      nfts,
      generatedAt: new Date().toISOString()
    });
  }));
}

module.exports = { registerMobileApi };
