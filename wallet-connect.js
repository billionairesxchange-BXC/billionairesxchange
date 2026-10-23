import { signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { auth } from './firebase-client.js';

const apiBase = window.MAKINGS_API_BASE_URL || window.location.origin;
const tabs = {
  login: document.getElementById('connectLoginTab'),
  signup: document.getElementById('connectSignupTab'),
  migrate: document.getElementById('connectMigrateTab')
};
const form = document.getElementById('walletConnectForm');
const nameLabel = document.getElementById('connectNameLabel');
const nameInput = document.getElementById('connectName');
const emailInput = document.getElementById('connectEmail');
const passwordInput = document.getElementById('connectPassword');
const submitButton = document.getElementById('connectSubmit');
const formHelp = document.getElementById('connectFormHelp');
const status = document.getElementById('walletConnectStatus');
const authPanel = document.getElementById('walletConnectAuth');
const pairingPanel = document.getElementById('walletPairing');
const pairingStatus = document.getElementById('walletPairingStatus');
const pairingQr = document.getElementById('walletPairingQr');
const pairingExpiry = document.getElementById('walletPairingExpiry');
let mode = 'login';
let pollTimer = null;

async function api(path, { method = 'GET', body, token, pairingToken } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (pairingToken) headers['X-BXC-Pairing-Token'] = pairingToken;
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || 'The wallet service could not complete this request.');
  return data;
}

function chooseMode(nextMode) {
  mode = nextMode;
  Object.entries(tabs).forEach(([key, button]) => {
    const active = key === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  nameLabel.hidden = mode !== 'signup';
  nameInput.required = mode === 'signup';
  passwordInput.autocomplete = mode === 'migrate' ? 'new-password' : 'current-password';
  submitButton.textContent = mode === 'signup'
    ? 'Create BXC Wallet account'
    : mode === 'migrate'
      ? 'Move account and set wallet password'
      : 'Sign in';
  formHelp.textContent = mode === 'migrate'
    ? 'First use the website’s password reset if needed. Sign in to your verified Firebase account, then set a new BXC Wallet password.'
    : mode === 'signup'
      ? 'We will email you a verification link before you can sign in.'
      : 'Use your BXC Wallet account. Existing website users can migrate their verified account to PostgreSQL.';
  status.textContent = '';
}

async function showPairing(token) {
  const pairing = await api('/api/mobile/pairings', { method: 'POST', body: {}, token });
  authPanel.hidden = true;
  pairingPanel.hidden = false;
  pairingQr.src = pairing.qrDataUrl;
  pairingQr.hidden = false;
  pairingStatus.textContent = 'Open BXC Wallet on your phone and scan this QR code. Confirm the sign-in in the app.';
  pairingExpiry.textContent = `Expires ${new Date(pairing.expiresAt).toLocaleTimeString()}.`;
  const deadline = Date.parse(pairing.expiresAt);

  const poll = async () => {
    if (Date.now() >= deadline) {
      pairingStatus.textContent = 'This QR code expired. Reload the page to request a new one.';
      pairingQr.hidden = true;
      return;
    }
    try {
      const result = await api(`/api/mobile/pairings/${encodeURIComponent(pairing.id)}`, {
        pairingToken: pairing.pollToken
      });
      if (result.status === 'approved') {
        const session = await api(`/api/mobile/pairings/${encodeURIComponent(pairing.id)}/exchange`, {
          method: 'POST',
          body: {},
          pairingToken: pairing.pollToken
        });
        pairingQr.hidden = true;
        pairingStatus.textContent = `Signed in as ${result.user?.email || 'your BXC Wallet account'}.`;
        pairingExpiry.textContent = 'This website sign-in is active for this page session.';
        sessionStorage.setItem('bxcWalletSessionToken', session.token);
        return;
      }
      if (result.status === 'expired' || result.status === 'consumed') {
        pairingStatus.textContent = 'This sign-in request is no longer available. Reload the page to try again.';
        pairingQr.hidden = true;
        return;
      }
      pollTimer = window.setTimeout(poll, 1500);
    } catch (error) {
      pairingStatus.textContent = error.message;
      pairingQr.hidden = true;
    }
  };
  pollTimer = window.setTimeout(poll, 1200);
}

Object.entries(tabs).forEach(([key, button]) => button.addEventListener('click', () => chooseMode(key)));
document.getElementById('walletConnectByPhone').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  status.textContent = '';
  try {
    await showPairing();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Could not start mobile sign-in.';
  } finally {
    button.disabled = false;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  status.textContent = '';
  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (mode === 'signup') {
      const result = await api('/api/mobile/auth/register', {
        method: 'POST',
        body: { email, password, name: nameInput.value.trim() }
      });
      chooseMode('login');
      status.textContent = result.message;
    } else if (mode === 'migrate') {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();
      const result = await api('/api/mobile/auth/migrate-firebase', {
        method: 'POST',
        token: idToken,
        body: { password }
      });
      await showPairing(result.token);
      status.textContent = `Existing account moved to BXC Wallet. Signed in as ${result.user.email}.`;
    } else {
      const result = await api('/api/mobile/auth/login', {
        method: 'POST',
        body: { email, password }
      });
      await showPairing(result.token);
      status.textContent = `Signed in as ${result.user.email}.`;
    }
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Unable to continue.';
  } finally {
    submitButton.disabled = false;
  }
});

const verificationToken = new URLSearchParams(window.location.search).get('verify');
if (verificationToken) {
  status.textContent = 'Verifying your email…';
  api('/api/mobile/auth/verify-email', { method: 'POST', body: { token: verificationToken } })
    .then((result) => {
      status.textContent = result.message;
      window.history.replaceState({}, document.title, window.location.pathname);
    })
    .catch((error) => { status.textContent = error.message; });
}

window.addEventListener('pagehide', () => {
  if (pollTimer) window.clearTimeout(pollTimer);
});
