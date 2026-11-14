import * as ethers from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import * as solana from '@solana/web3.js';
import QRCode from 'qrcode';
import Eth from '@ledgerhq/hw-app-eth';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';

const WALLET_STORAGE_KEY = 'makingsEncryptedWalletV1';
const WALLET_UNLOCK_ATTEMPTS_KEY = 'makingsWalletUnlockAttemptsV1';
const PAPER_BALANCE_KEY = 'makingsPositionMarketBalance';
const REALIZED_PROFIT_KEY = 'makingsTradeRealizedProfit';
const CREDIT_CARD_BALANCE_KEY = 'makingsWalletCreditCardBalance';
const CONNECTED_WALLET_STORAGE_KEY = 'makingsTreasuryWalletAdded';
const KDF_ITERATIONS = 310000;
const WALLET_IDLE_LOCK_MS = 15 * 60 * 1000;
const BACKUP_PHRASE_VISIBLE_MS = 60 * 1000;
const MAX_WALLET_UNLOCK_ATTEMPTS = 5;
const WALLET_UNLOCK_LOCK_MS = 10 * 60 * 1000;
const EVM_LEDGER_PATH = "m/44'/60'/0'/0/0";
const NETWORKS = {
  bitcoin: {
    name: 'Bitcoin',
    symbol: 'BTC',
    path: "m/84'/0'/0'/0/0",
    explorer: 'https://mempool.space/address/',
    priceId: 'bitcoin'
  },
  ethereum: {
    name: 'Ethereum',
    symbol: 'ETH',
    path: "m/44'/60'/0'/0/0",
    chainId: 1,
    rpc: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io/address/',
    priceId: 'ethereum'
  },
  bsc: {
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    path: "m/44'/60'/0'/0/0",
    chainId: 56,
    rpc: 'https://bsc-rpc.publicnode.com',
    explorer: 'https://bscscan.com/address/',
    priceId: 'binancecoin'
  },
  polygon: {
    name: 'Polygon PoS',
    symbol: 'POL',
    path: "m/44'/60'/0'/0/0",
    chainId: 137,
    rpc: 'https://polygon.drpc.org',
    explorer: 'https://polygonscan.com/address/',
    priceId: 'polygon-ecosystem-token'
  },
  solana: {
    name: 'Solana',
    symbol: 'SOL',
    path: "m/44'/501'/0'/0'",
    rpc: 'https://solana-rpc.publicnode.com',
    explorer: 'https://explorer.solana.com/address/',
    priceId: 'solana'
  }
};
const NETWORK_LOGOS = {
  bitcoin: '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#f7931a"/><text x="20" y="28" fill="#fff" font-size="25" font-weight="700" text-anchor="middle">₿</text></svg>',
  ethereum: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 1 8 21l12 7 12-7L20 1Zm0 39 12-17-12 7-12-7 12 17Z" fill="#627eea"/></svg>',
  bsc: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="m20 1 7 7-7 7-7-7 7-7Zm11 11 7 7-7 7-7-7 7-7ZM9 12l7 7-7 7-7-7 7-7Zm11 11 7 7-7 7-7-7 7-7Zm0-12 9 9-9 9-9-9 9-9Z" fill="#f0b90b"/></svg>',
  polygon: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M12 6 22 1l10 5v11l-10 6-10-6V6Zm2 2v8l8 5 8-5V8l-8-5-8 5Zm-2 14v7l10 6 10-6v-7l-2 1v5l-8 5-8-5v-5l-2-1Z" fill="#8247e5"/><path d="m22 9 6 3.5v7L22 23l-6-3.5v-7L22 9Z" fill="#8247e5"/></svg>',
  solana: '<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="solanaGradient" x1="0" x2="1" y1="1" y2="0"><stop stop-color="#9945ff"/><stop offset="1" stop-color="#14f195"/></linearGradient></defs><path d="M9 8h25l-4 5H5l4-5Zm-3 9h25l-4 5H2l4-5Zm3 9h25l-4 5H5l4-5Z" fill="url(#solanaGradient)"/></svg>'
};
const walletRoot = document.getElementById('cryptoWallet');

if (walletRoot) {
  const byId = (id) => document.getElementById(id);
  const scrollToWalletActionIfRequested = () => {
    const targetId = {
      '#walletReceiveSection': 'walletReceiveSection'
    }[window.location.hash];
    if (targetId) {
      requestAnimationFrame(() => byId(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  };
  const state = byId('cryptoWalletState');
  const message = byId('cryptoWalletMessage');
  const dashboard = byId('walletDashboard');
  const addressList = byId('walletAddressList');
  const assetCatalog = byId('walletAssetCatalog');
  const assetCatalogSearch = byId('walletAssetSearch');
  const assetCatalogStatus = byId('walletAssetCatalogStatus');
  const assetCatalogLoadMore = document.createElement('div');
  assetCatalogLoadMore.id = 'walletAssetLoadMore';
  assetCatalogLoadMore.className = 'wallet-asset-load-sentinel';
  assetCatalogLoadMore.setAttribute('aria-hidden', 'true');
  const balanceVisibilityButton = byId('walletBalanceVisibility');
  const forms = [
    'walletCreateForm',
    'walletUnlockForm',
    'walletRestoreForm',
    'walletBackupForm'
  ].map(byId);
  const creationControls = [
    byId('walletCreateButton'),
    byId('walletRestoreButton'),
    byId('walletUnlockButton')
  ];
  let mnemonicPhrase = null;
  let pendingNewPhrase = null;
  let pendingPassword = null;
  let pendingCredentialType = 'password';
  let walletAddresses = {};
  let balanceValues = {};
  let priceData = {};
  let exchangeRates = { USD: 1 };
  let lastPriceRefresh = 0;
  let balanceInterval = null;
  let idleLockTimer = null;
  let backupPhraseHideTimer = null;
  let lastWalletActivity = Date.now();
  let ledgerAddress = null;
  let ledgerProvider = null;
  let metaMaskConnection = null;
  let metaMaskConnectionRequestsAccess = false;
  let hardwareLedgerTransport = null;
  let hardwareLedgerEth = null;
  let hardwareLedgerAddress = null;
  let moralisApiKey = null;
  let nftDiscoveryRequest = 0;
  const NFT_STORAGE_KEY = 'makingsTrackedNftsV1';
  let marketAssets = [];
  let marketAssetPage = 1;
  let marketAssetsHaveMore = true;
  let marketAssetsLoading = false;
  let marketAssetSearchText = '';
  let marketAssetRetryAt = 0;
  let marketAssetLoadError = '';
  let walletUnlockCountdown = null;
  let walletUnlockInProgress = false;

  function readUnlockAttempts() {
    const raw = localStorage.getItem(WALLET_UNLOCK_ATTEMPTS_KEY);
    if (!raw) return { failedAttempts: 0, lockedUntil: 0 };
    const attempts = JSON.parse(raw);
    if (!attempts || !Number.isInteger(attempts.failedAttempts)
      || attempts.failedAttempts < 0
      || !Number.isFinite(attempts.lockedUntil)
      || attempts.lockedUntil < 0) {
      throw new Error('Wallet security lock data is invalid. Reload the page to try again.');
    }
    return attempts;
  }

  function writeUnlockAttempts(attempts) {
    localStorage.setItem(WALLET_UNLOCK_ATTEMPTS_KEY, JSON.stringify(attempts));
  }

  function formatLockCountdown(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function setUnlockInputsDisabled(disabled) {
    const form = byId('walletUnlockForm');
    form.querySelectorAll('input, button').forEach((control) => {
      control.disabled = disabled;
    });
  }

  function updateUnlockAttemptStatus(prefix = '') {
    const status = byId('walletOnboardingMetaStatus');
    const input = byId('walletUnlockPassword');
    let attempts;
    try {
      attempts = readUnlockAttempts();
      if (attempts.lockedUntil && attempts.lockedUntil <= Date.now()) {
        attempts = { failedAttempts: 0, lockedUntil: 0 };
        writeUnlockAttempts(attempts);
      }
    } catch (error) {
      status.textContent = `Wallet security status unavailable: ${error.message}`;
      status.classList.add('is-error');
      status.hidden = false;
      setUnlockInputsDisabled(true);
      return true;
    }

    if (attempts.lockedUntil > Date.now()) {
      const remaining = attempts.lockedUntil - Date.now();
      status.textContent = `${prefix ? `${prefix} ` : ''}Wallet suspended. Try again in ${formatLockCountdown(remaining)}.`;
      status.classList.add('is-error');
      status.hidden = false;
      setUnlockInputsDisabled(true);
      if (!walletUnlockCountdown) {
        walletUnlockCountdown = window.setInterval(() => {
          if (attempts.lockedUntil <= Date.now()) {
            window.clearInterval(walletUnlockCountdown);
            walletUnlockCountdown = null;
            try {
              writeUnlockAttempts({ failedAttempts: 0, lockedUntil: 0 });
              status.classList.remove('is-error');
              status.textContent = 'Wallet ready. Enter your PIN to continue.';
              setUnlockInputsDisabled(false);
              input.focus();
            } catch (error) {
              status.textContent = `Wallet security status unavailable: ${error.message}`;
              status.classList.add('is-error');
            }
            return;
          }
          status.textContent = `${prefix ? `${prefix} ` : ''}Wallet suspended. Try again in ${formatLockCountdown(attempts.lockedUntil - Date.now())}.`;
        }, 1000);
      }
      return true;
    }

    if (walletUnlockCountdown) {
      window.clearInterval(walletUnlockCountdown);
      walletUnlockCountdown = null;
    }
    setUnlockInputsDisabled(false);
    if (prefix) {
      status.textContent = `${prefix} ${MAX_WALLET_UNLOCK_ATTEMPTS - attempts.failedAttempts} attempt${MAX_WALLET_UNLOCK_ATTEMPTS - attempts.failedAttempts === 1 ? '' : 's'} remaining.`;
      status.classList.add('is-error');
      status.hidden = false;
    } else if (attempts.failedAttempts > 0) {
      const remaining = MAX_WALLET_UNLOCK_ATTEMPTS - attempts.failedAttempts;
      status.textContent = `${remaining} attempt${remaining === 1 ? '' : 's'} remaining before the wallet is suspended for 10 minutes.`;
      status.classList.remove('is-error');
      status.hidden = false;
    } else {
      status.textContent = walletCredentialType() === 'pin'
        ? 'Enter your PIN to open your wallet.'
        : 'Enter your password to open your wallet.';
      status.classList.remove('is-error');
      status.hidden = false;
    }
    return false;
  }

  function recordFailedWalletUnlock() {
    const attempts = readUnlockAttempts();
    attempts.failedAttempts += 1;
    if (attempts.failedAttempts >= MAX_WALLET_UNLOCK_ATTEMPTS) {
      attempts.failedAttempts = MAX_WALLET_UNLOCK_ATTEMPTS;
      attempts.lockedUntil = Date.now() + WALLET_UNLOCK_LOCK_MS;
    }
    writeUnlockAttempts(attempts);
    const isPin = walletCredentialType() === 'pin';
    const prefix = isPin ? 'PIN code incorrect.' : 'Wallet password incorrect.';
    updateUnlockAttemptStatus(prefix);
  }

  function getSavedWallet() {
    const value = localStorage.getItem(WALLET_STORAGE_KEY);
    if (!value) return null;
    try {
      const record = JSON.parse(value);
      if (record.version !== 1
        || record.kdf !== 'PBKDF2-SHA256'
        || record.iterations !== KDF_ITERATIONS
        || record.cipher !== 'AES-256-GCM'
        || !record.ciphertext || !record.salt || !record.iv) {
        throw new Error('Invalid encrypted-wallet data.');
      }

      return record;
    } catch (error) {
      console.error('Stored wallet data could not be read:', error);
      throw new Error('Saved wallet data is damaged. Restore from your recovery phrase.');
    }
  }

  function walletCredentialType() {
    return getSavedWallet()?.credentialType === 'pin' ? 'pin' : 'password';
  }

  function configureCredentialInput(input, credentialType) {
    const isPin = credentialType === 'pin';
    input.inputMode = isPin ? 'numeric' : 'text';
    input.maxLength = isPin ? 5 : 128;
    input.pattern = isPin
      ? '[0-9]{5}'
      : '';
    input.autocomplete = input.id === 'walletUnlockPassword' || input.id === 'walletBackupPassword'
      ? 'current-password'
      : 'new-password';
  }

  function isValidCredential(value, credentialType) {
    if (credentialType === 'pin') return /^\d{4,8}$/.test(value);
    return value.length >= 12
      && /[A-Z]/.test(value)
      && /[a-z]/.test(value)
      && /\d/.test(value)
      && /[^A-Za-z0-9]/.test(value);
  }

  function updateCredentialMode(prefix, credentialType) {
    const isPin = credentialType === 'pin';
    const label = isPin ? 'Five-digit wallet PIN' : 'Wallet password';
    const confirmLabel = isPin ? 'Confirm five-digit PIN' : 'Confirm password';
    const valueInput = byId(`${prefix}Password`);
    const confirmInput = byId(`${prefix}PasswordConfirm`);
    const labelElement = byId(`${prefix}CredentialLabel`);
    const confirmLabelElement = byId(`${prefix}ConfirmLabel`);
    if (labelElement) labelElement.textContent = prefix === 'walletRestore' && !isPin ? 'New wallet password' : label;
    if (confirmLabelElement) confirmLabelElement.textContent = confirmLabel;
    if (valueInput) configureCredentialInput(valueInput, credentialType);
    if (confirmInput) configureCredentialInput(confirmInput, credentialType);
    const help = byId(`${prefix}CredentialHelp`);
    if (help) help.textContent = isPin
      ? 'Use exactly five digits. This PIN encrypts the recovery phrase in this browser and cannot be reset by BillionairesXchange. A short PIN is easier to guess than a strong password.'
      : 'Use 12 or more characters with uppercase and lowercase letters, a number, and a special character.';
  }

  function updateUnlockCredentialLabel() {
    const isPin = walletCredentialType() === 'pin';
    const unlockCredentialLabel = byId('walletUnlockCredentialLabel');
    if (unlockCredentialLabel) unlockCredentialLabel.textContent = isPin ? 'Five-digit wallet PIN' : 'Wallet password';
    configureCredentialInput(byId('walletUnlockPassword'), isPin ? 'pin' : 'password');
    byId('walletPinKeypad').hidden = !isPin;
    byId('walletPinVisibility').hidden = !isPin;
    byId('walletPinVisibility').textContent = 'Show';
    byId('walletPinVisibility').setAttribute('aria-label', 'Show PIN');
    byId('walletPinVisibility').setAttribute('aria-pressed', 'false');
    byId('walletUnlockPassword').type = 'password';
    const backupCredentialLabel = byId('walletBackupCredentialLabel');
    if (backupCredentialLabel) backupCredentialLabel.textContent = isPin ? 'Wallet PIN' : 'Wallet password';
    configureCredentialInput(byId('walletBackupPassword'), isPin ? 'pin' : 'password');
  }

  function rememberConnectedWallet() {
    try {
      localStorage.setItem(CONNECTED_WALLET_STORAGE_KEY, 'true');
    } catch (error) {
      console.error('Could not remember the connected Treasury wallet:', error);
    }
  }

  function setMessage(text, isError = false) {
    if (document.body.classList.contains('treasury-vault-locked')) {
      const onboardingStatus = byId('walletOnboardingMetaStatus');
      onboardingStatus.textContent = text;
      onboardingStatus.hidden = !text;
      onboardingStatus.classList.toggle('is-error', isError);
      return;
    }
    message.textContent = text;
    message.classList.toggle('is-error', isError);
  }

  function clearIdleLockTimer() {
    if (idleLockTimer) window.clearTimeout(idleLockTimer);
    idleLockTimer = null;
  }

  function lockAfterInactivity() {
    clearIdleLockTimer();
    lockWallet(false);
    setMessage('Wallet locked after 15 minutes of inactivity. Unlock it to continue.');
  }

  function scheduleIdleLock() {
    clearIdleLockTimer();
    if (!mnemonicPhrase) return;
    idleLockTimer = window.setTimeout(lockAfterInactivity, WALLET_IDLE_LOCK_MS);
  }

  function recordWalletActivity() {
    if (!mnemonicPhrase) return;
    lastWalletActivity = Date.now();
    scheduleIdleLock();
  }

  function hideRevealedBackupPhrase(messageText = 'Recovery phrase hidden.') {
    if (backupPhraseHideTimer) window.clearTimeout(backupPhraseHideTimer);
    backupPhraseHideTimer = null;
    byId('walletRecoveryWords').replaceChildren();
    byId('walletPhrasePanel').hidden = true;
    byId('walletPhrasePanel').dataset.mode = '';
    byId('walletPhrasePanel').querySelector('.wallet-backup-close')?.remove();
    setMessage(messageText);
  }

  function showOnlyForm(formToShow) {
    forms.forEach((form) => { form.hidden = form !== formToShow; });
    if (byId('walletPhrasePanel').dataset.mode === 'backup') {
      hideRevealedBackupPhrase('');
    } else if (byId('walletPhrasePanel').dataset.mode === 'create') {
      byId('walletRecoveryWords').replaceChildren();
      byId('walletPhrasePanel').hidden = true;
      byId('walletPhrasePanel').dataset.mode = '';
      pendingNewPhrase = null;
      pendingPassword = null;
    }
    if (backupPhraseHideTimer) window.clearTimeout(backupPhraseHideTimer);
    backupPhraseHideTimer = null;
    setMessage('');
  }

  function bytesToBase64(bytes) {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function base64ToBytes(value) {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  async function fetchWithTimeout(resource, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(resource, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function deriveEncryptionKey(password, salt) {
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptPhrase(phrase, password, credentialType = 'password') {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveEncryptionKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(phrase)
    );
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({
      version: 1,
      credentialType,
      kdf: 'PBKDF2-SHA256',
      iterations: KDF_ITERATIONS,
      cipher: 'AES-256-GCM',
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    }));
  }

  async function decryptPhrase(password) {
    const record = getSavedWallet();
    if (!record) throw new Error('No encrypted wallet was found in this browser.');
    const key = await deriveEncryptionKey(password, base64ToBytes(record.salt));
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
        key,
        base64ToBytes(record.ciphertext)
      );
      return new TextDecoder().decode(plaintext);
    } catch {
      throw new Error('Incorrect wallet password, or encrypted wallet data is damaged.');
    }
  }

  async function importWalletLibraries() {
    if (!globalThis.Buffer) globalThis.Buffer = Buffer;
    return { ethers, Buffer, bitcoin, solana };
  }

  function getSeedBytes(ethers) {
    return ethers.getBytes(ethers.Mnemonic.fromPhrase(mnemonicPhrase).computeSeed());
  }

  async function deriveSolanaPrivateSeed(seed, path) {
    async function hmac(keyBytes, data) {
      const key = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign']
      );
      return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
    }

    const master = await hmac(new TextEncoder().encode('ed25519 seed'), seed);
    let privateKey = master.slice(0, 32);
    let chainCode = master.slice(32);
    const segments = path.split('/').slice(1);
    for (const segment of segments) {
      if (!segment.endsWith("'")) throw new Error('Solana derivation path must use hardened children.');
      const childIndex = Number.parseInt(segment.slice(0, -1), 10);
      if (!Number.isInteger(childIndex) || childIndex < 0 || childIndex >= 0x80000000) {
        throw new Error('Invalid Solana derivation path.');
      }
      const data = new Uint8Array(37);
      data[0] = 0;
      data.set(privateKey, 1);
      new DataView(data.buffer).setUint32(33, childIndex + 0x80000000, false);
      const derived = await hmac(chainCode, data);
      privateKey = derived.slice(0, 32);
      chainCode = derived.slice(32);
    }
    return privateKey;
  }

  async function deriveAllAddresses() {
    const libraries = await importWalletLibraries();
    const seed = getSeedBytes(libraries.ethers);
    const bitcoinWallet = libraries.ethers.HDNodeWallet.fromPhrase(mnemonicPhrase, undefined, NETWORKS.bitcoin.path);
    const bitcoinPublicKey = Buffer.from(libraries.ethers.getBytes(
      libraries.ethers.SigningKey.computePublicKey(bitcoinWallet.privateKey, true)
    ));
    const bitcoinHash = libraries.bitcoin.crypto.hash160(bitcoinPublicKey);
    const bitcoinAddress = libraries.bitcoin.address.toBech32(
      bitcoinHash,
      0,
      libraries.bitcoin.networks.bitcoin.bech32
    );
    const evmWallet = libraries.ethers.Wallet.fromPhrase(mnemonicPhrase, undefined, NETWORKS.ethereum.path);
    const solanaKey = await deriveSolanaPrivateSeed(seed, NETWORKS.solana.path);
    const solanaKeypair = libraries.solana.Keypair.fromSeed(Uint8Array.from(solanaKey));

    walletAddresses = {
      bitcoin: bitcoinAddress,
      ethereum: evmWallet.address,
      bsc: evmWallet.address,
      polygon: evmWallet.address,
      solana: solanaKeypair.publicKey.toBase58()
    };
    renderAddresses();
    if (balanceInterval) clearInterval(balanceInterval);
    balanceInterval = setInterval(() => { refreshBalances(); }, 30000);
    return refreshBalances();
  }

  function renderAddresses() {
    addressList.replaceChildren();
    Object.entries(NETWORKS).filter(([network]) => walletAddresses[network]).forEach(([network, config]) => {
      const card = document.createElement('article');
      card.className = 'wallet-address-card';
      const heading = document.createElement('div');
      heading.className = 'wallet-address-heading';
      const logo = document.createElement('span');
      logo.className = `wallet-network-logo wallet-network-logo-${network}`;
      logo.setAttribute('aria-label', `${config.name} logo`);
      logo.innerHTML = NETWORK_LOGOS[network];
      const title = document.createElement('strong');
      title.textContent = `${config.name} (${config.symbol})`;
      heading.append(logo, title);
      const address = document.createElement('code');
      address.textContent = walletAddresses[network] || 'Deriving address...';
      address.title = walletAddresses[network] || '';
      const qr = document.createElement('canvas');
      qr.className = 'wallet-address-qr';
      qr.setAttribute('aria-label', `Receive ${config.symbol} QR code`);
      QRCode.toCanvas(qr, walletAddresses[network], { width: 160, margin: 1 })
        .catch((error) => {
          console.error(`Could not generate ${config.name} address QR code:`, error);
          setMessage(`The ${config.name} address is available, but its QR code could not be generated.`, true);
        });
      const balance = document.createElement('span');
      balance.id = `walletBalance-${network}`;
      balance.textContent = 'Balance pending';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn btn-secondary';
      copy.textContent = 'Copy';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(walletAddresses[network]);
          setMessage(`${config.name} address copied.`);
        } catch (error) {
          console.error('Clipboard copy failed:', error);
          setMessage('Could not copy address. Select and copy it manually.', true);
        }
      });
      card.append(heading, address, qr, balance, copy);
      addressList.appendChild(card);
    });
    clearPaymentRequest();
    byId('walletPaymentRequestStatus').textContent = 'Wallet addresses updated. Create a new payment request to share the current address.';
    updateReceiveAddress();
  }

  function currencyInfo() {
    const select = byId('preferredCurrency');
    const key = select ? select.value.toUpperCase() : 'USD';
    const symbols = { USD: '$', EUR: '€', GBP: '£', JMD: 'J$', BBD: 'Bds$', TTD: 'TT$', XCD: 'EC$' };
    return { key, symbol: symbols[key] || `${key} ` };
  }

  function formatCurrency(value) {
    const { key, symbol } = currencyInfo();
    const rate = exchangeRates[key] || (key === 'USD' ? 1 : null);
    if (!Number.isFinite(value) || !rate) return '--';
    return `${symbol}${(value * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function renderPaperSummary() {
    const balanceElement = byId('walletPaperBalance');
    const profitElement = byId('walletRealizedPnl');
    const creditCardBalanceElement = byId('walletCreditCardBalance');
    try {
      const rawBalance = localStorage.getItem(PAPER_BALANCE_KEY);
      const paperBalance = rawBalance === null ? 10000 : Number(rawBalance);
      if (!Number.isFinite(paperBalance) || paperBalance < 0) {
        balanceElement.textContent = 'Unavailable';
        balanceElement.classList.add('negative');
      } else {
        balanceElement.textContent = formatCurrency(paperBalance);
        balanceElement.classList.remove('negative');
      }

      if (creditCardBalanceElement) {
        const rawCardBalance = localStorage.getItem(CREDIT_CARD_BALANCE_KEY);
        const cardBalance = rawCardBalance === null ? 0 : Number(rawCardBalance);
        if (!Number.isFinite(cardBalance) || cardBalance < 0) {
          creditCardBalanceElement.textContent = 'Unavailable';
          creditCardBalanceElement.classList.add('negative');
        } else {
          creditCardBalanceElement.textContent = formatCurrency(cardBalance);
          creditCardBalanceElement.classList.remove('negative');
        }
      }

      const rawProfit = localStorage.getItem(REALIZED_PROFIT_KEY);
      const realizedProfit = rawProfit === null ? 0 : Number(rawProfit);
      if (!Number.isFinite(realizedProfit)) {
        profitElement.textContent = 'Unavailable';
        profitElement.classList.remove('positive', 'negative');
        return;
      }
      profitElement.textContent = `${realizedProfit > 0 ? '+' : realizedProfit < 0 ? '-' : ''}${formatCurrency(Math.abs(realizedProfit))}`;
      profitElement.classList.toggle('positive', realizedProfit >= 0);
      profitElement.classList.toggle('negative', realizedProfit < 0);
    } catch (error) {
      console.error('Paper balance and realized profit/loss could not be loaded:', error);
      balanceElement.textContent = 'Unavailable';
      balanceElement.classList.add('negative');
      profitElement.textContent = 'Unavailable';
      profitElement.classList.remove('positive', 'negative');
    }
  }

  function formatAmount(value) {
    if (!Number.isFinite(value)) return '--';
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 });
  }

  function parseTokenAmount(value, decimals, symbol) {
    const text = String(value).trim();
    const match = text.match(/^(\d+)(?:\.(\d+))?$/);
    if (!match || (match[2] || '').length > decimals) {
      throw new Error(`Enter a valid ${symbol} amount with up to ${decimals} decimal places.`);
    }
    const unit = 10n ** BigInt(decimals);
    const fraction = (match[2] || '').padEnd(decimals, '0');
    const amount = BigInt(match[1]) * unit + BigInt(fraction || '0');
    if (amount <= 0n) throw new Error('Enter an amount greater than zero.');
    return amount;
  }

  async function rpc(network, method, params) {
    const response = await fetchWithTimeout(NETWORKS[network].rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    if (!response.ok) throw new Error(`${NETWORKS[network].name} RPC returned HTTP ${response.status}.`);
    const result = await response.json();
    if (result.error) throw new Error(result.error.message || `${NETWORKS[network].name} RPC request failed.`);
    return result.result;
  }

  async function readBalance(network) {
    const address = walletAddresses[network];
    if (!address) throw new Error(`No wallet address is available for ${NETWORKS[network].name}.`);
    if (network === 'bitcoin') {
      const response = await fetchWithTimeout(`https://mempool.space/api/address/${encodeURIComponent(address)}`);
      if (!response.ok) throw new Error(`Bitcoin explorer returned HTTP ${response.status}.`);
      const data = await response.json();
      const chain = data.chain_stats;
      const mempool = data.mempool_stats;
      const satoshis = chain.funded_txo_sum - chain.spent_txo_sum
        + mempool.funded_txo_sum - mempool.spent_txo_sum;
      return satoshis / 1e8;
    }
    if (network === 'solana') {
      const genesisHash = await rpc(network, 'getGenesisHash', []);
      if (genesisHash !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') {
        throw new Error('The configured RPC did not verify the Solana mainnet network.');
      }
      const lamports = await rpc(network, 'getBalance', [address, { commitment: 'confirmed' }]);
      return lamports.value / 1e9;
    }
    const chainId = await rpc(network, 'eth_chainId', []);
    if (Number.parseInt(chainId, 16) !== NETWORKS[network].chainId) {
      throw new Error(`The configured RPC did not verify the ${NETWORKS[network].name} network.`);
    }
    const hexBalance = await rpc(network, 'eth_getBalance', [address, 'latest']);
    return Number(BigInt(hexBalance)) / 1e18;
  }

  async function refreshMarketData() {
    if (Date.now() - lastPriceRefresh < 300000) return;
    lastPriceRefresh = Date.now();
    const ids = [...new Set(Object.values(NETWORKS).map((item) => item.priceId))].join(',');
    try {
      const response = await fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
      if (!response.ok) throw new Error(`Price service returned HTTP ${response.status}.`);
      priceData = await response.json();
    } catch (error) {
      lastPriceRefresh = 0;
      console.error('Wallet price estimates are unavailable:', error);
      setMessage('On-chain balances loaded; estimated fiat prices are temporarily unavailable.', true);
    }

    try {
      const response = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/USD');
      if (!response.ok) throw new Error(`Exchange-rate service returned HTTP ${response.status}.`);
      const rates = await response.json();
      exchangeRates = { USD: 1, ...rates.rates };
    } catch (error) {
      console.error('Wallet currency conversion rates are unavailable:', error);
    }
  }

  function renderMarketAssetCatalog() {
    const query = marketAssetSearchText.trim().toLowerCase();
    const results = marketAssets.filter((asset) =>
      !query || asset.name.toLowerCase().includes(query) || asset.symbol.toLowerCase().includes(query)
    );
    assetCatalog.replaceChildren();
    results.forEach((asset) => {
      const item = document.createElement('article');
      item.className = 'wallet-market-asset';
      const heading = document.createElement('div');
      heading.className = 'wallet-market-asset-heading';
      if (asset.image) {
        const image = document.createElement('img');
        image.src = asset.image;
        image.alt = '';
        image.loading = 'lazy';
        image.onerror = () => { image.hidden = true; };
        heading.appendChild(image);
      }
      const identity = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = asset.name;
      const symbol = document.createElement('span');
      symbol.textContent = asset.symbol;
      identity.append(name, symbol);
      heading.appendChild(identity);
      const price = document.createElement('strong');
      price.className = 'wallet-market-asset-price';
      price.textContent = Number.isFinite(asset.current_price) ? formatCurrency(asset.current_price) : 'Price unavailable';
      const change = document.createElement('span');
      change.className = `wallet-market-asset-change${asset.price_change_percentage_24h < 0 ? ' is-negative' : ''}`;
      change.textContent = Number.isFinite(asset.price_change_percentage_24h)
        ? `${asset.price_change_percentage_24h >= 0 ? '+' : ''}${asset.price_change_percentage_24h.toFixed(2)}%`
        : '--';
      const note = document.createElement('small');
      note.textContent = 'Market listing · wallet balance not verified';
      item.append(heading, price, change, note);
      assetCatalog.appendChild(item);
    });
    if (marketAssetsHaveMore) assetCatalog.appendChild(assetCatalogLoadMore);
    assetCatalogStatus.textContent = query
      ? `${results.length} matches in ${marketAssets.length} loaded market assets${marketAssetsHaveMore ? '. Scroll down in the catalog to load more results.' : '.'}`
      : `${marketAssets.length.toLocaleString()} CoinGecko market assets loaded${marketAssetsHaveMore ? '. Scroll down to load more automatically.' : ' — all available pages loaded.'}`;
  }

  async function loadMarketAssets() {
    if (marketAssetsLoading || !marketAssetsHaveMore || Date.now() < marketAssetRetryAt) return;
    marketAssetsLoading = true;
    marketAssetLoadError = '';
    assetCatalogStatus.textContent = 'Loading market assets...';
    try {
      const response = await fetchWithTimeout(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${marketAssetPage}&sparkline=false&price_change_percentage=24h`
      );
      if (!response.ok) throw new Error(`Market asset service returned HTTP ${response.status}.`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Market asset service returned an invalid list.');
      const loadedIds = new Set(marketAssets.map((asset) => asset.id));
      const newAssets = data.filter((asset) => asset.id && !loadedIds.has(asset.id)).map((asset) => ({
        id: asset.id,
        name: String(asset.name || asset.id),
        symbol: String(asset.symbol || '').toUpperCase(),
        image: String(asset.image || ''),
        current_price: Number(asset.current_price),
        price_change_percentage_24h: Number(asset.price_change_percentage_24h)
      }));
      marketAssets.push(...newAssets);
      marketAssetPage += 1;
      marketAssetsHaveMore = data.length === 250;
      renderMarketAssetCatalog();
    } catch (error) {
      console.error('Wallet market asset catalog could not be loaded:', error);
      marketAssetLoadError = error.message;
      marketAssetRetryAt = Date.now() + 10000;
      window.setTimeout(loadMarketAssets, 10000);
    } finally {
      marketAssetsLoading = false;
      renderMarketAssetCatalog();
      if (marketAssetLoadError) assetCatalogStatus.textContent = `Could not load market assets: ${marketAssetLoadError}. Retrying automatically.`;
    }
  }

  if (assetCatalog) {
    if ('IntersectionObserver' in window) {
      const assetCatalogObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMarketAssets();
      }, { root: assetCatalog, rootMargin: '240px 0px' });
      assetCatalogObserver.observe(assetCatalogLoadMore);
    } else {
      assetCatalog.addEventListener('scroll', () => {
        if (assetCatalog.scrollTop + assetCatalog.clientHeight >= assetCatalog.scrollHeight - 240) loadMarketAssets();
      }, { passive: true });
    }
  }

  assetCatalogSearch?.addEventListener('input', () => {
    marketAssetSearchText = assetCatalogSearch.value;
    renderMarketAssetCatalog();
  });

  if (balanceVisibilityButton) {
    let balancesHidden = localStorage.getItem('treasuryBalancesHidden') === 'true';
    const applyBalanceVisibility = () => {
      walletAppContent.classList.toggle('treasury-balances-hidden', balancesHidden);
      document.body.classList.toggle('treasury-balances-hidden', balancesHidden);
      balanceVisibilityButton.setAttribute('aria-pressed', String(balancesHidden));
      balanceVisibilityButton.setAttribute('aria-label', balancesHidden ? 'Show balances' : 'Hide balances');
      balanceVisibilityButton.title = balancesHidden ? 'Show balances' : 'Hide balances';
    };
    applyBalanceVisibility();
    balanceVisibilityButton.addEventListener('click', () => {
      balancesHidden = !balancesHidden;
      try {
        localStorage.setItem('treasuryBalancesHidden', String(balancesHidden));
      } catch (error) {
        console.error('Treasury balance visibility preference could not be saved:', error);
      }
      applyBalanceVisibility();
      document.dispatchEvent(new CustomEvent('balances-visibility-change', { detail: { hidden: balancesHidden } }));
    });
    document.addEventListener('balances-visibility-change', (event) => {
      balancesHidden = Boolean(event.detail.hidden);
      applyBalanceVisibility();
    });
    window.addEventListener('storage', (event) => {
      if (event.key !== 'treasuryBalancesHidden') return;
      balancesHidden = event.newValue === 'true';
      applyBalanceVisibility();
    });
  }

  function renderBalances() {
    const table = byId('holdingsTableBody');
    table.replaceChildren();
    let totalUsd = 0;
    let hasAllPrices = true;

    Object.entries(NETWORKS).filter(([network]) => walletAddresses[network]).forEach(([network, config]) => {
      const amount = balanceValues[network];
      const row = document.createElement('tr');
      if (!Number.isFinite(amount)) {
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = `${config.name}: balance unavailable — automatic retry is enabled.`;
        row.appendChild(cell);
        table.appendChild(row);
        return;
      }

      const usdPrice = priceData[config.priceId]?.usd;
      const change = priceData[config.priceId]?.usd_24h_change;
      const valueUsd = Number.isFinite(usdPrice) ? amount * usdPrice : null;
      if (valueUsd === null) hasAllPrices = false;
      else totalUsd += valueUsd;

      const asset = document.createElement('td');
      const assetName = document.createElement('div');
      assetName.className = 'asset-name';
      const badge = document.createElement('span');
      badge.className = 'asset-badge';
      badge.textContent = config.symbol.charAt(0);
      const name = document.createElement('div');
      const symbol = document.createElement('strong');
      symbol.textContent = config.symbol;
      const networkName = document.createElement('small');
      networkName.textContent = config.name;
      name.append(symbol, document.createElement('br'), networkName);
      assetName.append(badge, name);
      asset.appendChild(assetName);
      const amountCell = document.createElement('td');
      amountCell.textContent = `${formatAmount(amount)} ${config.symbol}`;
      const priceCell = document.createElement('td');
      priceCell.textContent = Number.isFinite(usdPrice) ? formatCurrency(usdPrice) : 'Price unavailable';
      const valueCell = document.createElement('td');
      valueCell.textContent = valueUsd === null ? '--' : formatCurrency(valueUsd);
      const changeCell = document.createElement('td');
      changeCell.textContent = Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '--';
      row.append(asset, amountCell, priceCell, valueCell, changeCell);
      table.appendChild(row);
    });

    const totalValue = byId('totalHoldingsValue');
    totalValue.textContent = hasAllPrices && Object.keys(balanceValues).length === Object.keys(walletAddresses).length
      ? formatCurrency(totalUsd)
      : '--';
    const preferredCurrency = byId('preferredCurrency');
    if (preferredCurrency) byId('currencyLabel').textContent = preferredCurrency.value.toUpperCase();
  }

  let qrScannerStream = null;
  let qrScannerFrame = 0;

  async function validateRecipient(network, recipient) {
    if (network === 'bitcoin') {
      const { bitcoin } = await importWalletLibraries();
      bitcoin.address.toOutputScript(recipient, bitcoin.networks.bitcoin);
      return true;
    }
    if (network === 'solana') {
      new solana.PublicKey(recipient);
      return true;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) throw new Error('Invalid EVM address.');
    return true;
  }

  async function refreshBalances() {
    const activeNetworks = Object.keys(walletAddresses).filter((network) => NETWORKS[network]);
    if (!activeNetworks.length) return;
    const results = await Promise.all(activeNetworks.map(async (network) => {
      try {
        return [network, await readBalance(network), null];
      } catch (error) {
        console.error(`${NETWORKS[network].name} balance lookup failed:`, error);
        return [network, null, error];
      }
    }));
    results.forEach(([network, amount, error]) => {
      const balanceElement = byId(`walletBalance-${network}`);
      if (error) {
        if (balanceElement) balanceElement.textContent = `Balance unavailable: ${error.message}`;
        delete balanceValues[network];
      } else {
        balanceValues[network] = amount;
        if (balanceElement) balanceElement.textContent = `Balance: ${formatAmount(amount)} ${NETWORKS[network].symbol}`;
      }
    });
    await refreshMarketData();
    renderBalances();
    const unavailable = results.filter(([, , error]) => error).map(([network]) => NETWORKS[network].name);
    if (unavailable.length) setMessage(`Some public network services did not respond: ${unavailable.join(', ')}. Balances will retry automatically.`, true);
    return unavailable;
  }

  function getTrackedNfts() {
    try {
      const value = JSON.parse(localStorage.getItem(NFT_STORAGE_KEY) || '[]');
      if (!Array.isArray(value)) throw new Error('Tracked NFT data must be a list.');
      return value.filter((record) => record
        && ['ethereum', 'bsc', 'polygon'].includes(record.network)
        && typeof record.contract === 'string'
        && typeof record.tokenId === 'string');
    } catch (error) {
      console.error('Tracked NFT records could not be loaded:', error);
      throw new Error('NFT tracker data is damaged. Clear the tracked NFT list and try again.');
    }
  }

  function uint256Hex(value) {
    const integer = BigInt(value);
    if (integer < 0n || integer >= 1n << 256n) throw new Error('NFT token ID must be a valid unsigned integer.');
    return integer.toString(16).padStart(64, '0');
  }

  function decodeAbiString(encoded) {
    if (!encoded || encoded === '0x' || !/^0x[0-9a-fA-F]+$/.test(encoded) || encoded.length < 130) return '';
    const body = encoded.slice(2);
    const offset = Number(BigInt(`0x${body.slice(0, 64)}`)) * 2;
    if (!Number.isSafeInteger(offset) || offset < 64 || offset + 64 > body.length) return '';
    const length = Number(BigInt(`0x${body.slice(offset, offset + 64)}`));
    if (!Number.isSafeInteger(length) || length > 4096 || offset + 64 + length * 2 > body.length) return '';
    const start = offset + 64;
    return new TextDecoder().decode(Uint8Array.from(
      body.slice(start, start + length * 2).match(/.{2}/g) || [],
      (byte) => Number.parseInt(byte, 16)
    ));
  }

  function normalizeMetadataUrl(value) {
    if (value.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${value.slice('ipfs://'.length).replace(/^ipfs\//, '')}`;
    if (value.startsWith('ar://')) return `https://arweave.net/${value.slice('ar://'.length)}`;
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('NFT metadata must use HTTPS, IPFS, or Arweave.');
    return url.href;
  }

  async function loadNftRecord(record) {
    const libraries = await importWalletLibraries();
    if (!libraries.ethers.isAddress(record.contract) || !/^\d+$/.test(record.tokenId)) {
      throw new Error('The saved NFT contract address or token ID is invalid.');
    }
    const contractAddress = record.contract.toLowerCase();
    const ownerResult = await rpc(record.network, 'eth_call', [{
      to: contractAddress,
      data: `0x6352211e${uint256Hex(record.tokenId)}`
    }, 'latest']);
    const owner = `0x${ownerResult.slice(-40)}`;
    const ownedByWallet = owner.toLowerCase() === walletAddresses[record.network].toLowerCase();
    if (!ownedByWallet) throw new Error(`Token ${record.tokenId} is currently owned by ${owner}, not this wallet.`);
    const uriResult = await rpc(record.network, 'eth_call', [{
      to: contractAddress,
      data: `0xc87b56dd${uint256Hex(record.tokenId)}`
    }, 'latest']);
    const uri = decodeAbiString(uriResult);
    if (!uri) throw new Error('This ERC-721 contract did not return a token URI.');
    const metadataUrl = normalizeMetadataUrl(uri);
    const response = await fetchWithTimeout(metadataUrl);
    if (!response.ok) throw new Error(`NFT metadata service returned HTTP ${response.status}.`);
    const metadata = await response.json();
    return { ...record, name: metadata.name || `Token #${record.tokenId}`, image: metadata.image || '', description: metadata.description || '' };
  }

  function renderNftCard(record) {
    const card = document.createElement('article');
    card.className = 'wallet-nft-card';
    if (record.image) {
      try {
        const imageUrl = normalizeMetadataUrl(record.image);
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = '';
        image.loading = 'lazy';
        card.appendChild(image);
      } catch (error) {
        console.error('NFT image URL was ignored:', error);
      }
    }
    const title = document.createElement('strong');
    title.textContent = record.name || `Token #${record.tokenId}`;
    const details = document.createElement('span');
    details.textContent = record.network === 'solana'
      ? `${NETWORKS.solana.name} · ${record.symbol || 'NFT'} · ${record.contract}`
      : `${NETWORKS[record.network].name} · #${record.tokenId}${record.amount && record.amount !== '1' ? ` · Owned: ${record.amount}` : ''}`;
    const link = document.createElement('a');
    link.href = `${NETWORKS[record.network].explorer}${encodeURIComponent(record.contract)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View contract';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-ghost';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      try {
        const tracked = getTrackedNfts().filter((item) =>
          !(item.network === record.network
            && item.contract.toLowerCase() === record.contract.toLowerCase()
            && item.tokenId === record.tokenId)
        );
        localStorage.setItem(NFT_STORAGE_KEY, JSON.stringify(tracked));
        renderTrackedNfts();
      } catch (error) {
        console.error('Could not remove tracked NFT:', error);
        setMessage(error.message, true);
      }
    });
    card.append(title, details, link, remove);
    return card;
  }

  function nftMetadata(record) {
    if (record.normalized_metadata && typeof record.normalized_metadata === 'object') {
      return record.normalized_metadata;
    }
    if (record.metadata && typeof record.metadata === 'object') return record.metadata;
    if (typeof record.metadata === 'string') {
      try {
        const parsed = JSON.parse(record.metadata);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        return {};
      }
    }
    return {};
  }

  function normalizeDiscoveredEvmNft(network, item) {
    if (!item || typeof item.token_address !== 'string' || typeof item.token_id !== 'string') {
      throw new Error('NFT provider returned an item with a missing contract or token ID.');
    }
    const metadata = nftMetadata(item);
    const media = item.media || {};
    const image = metadata.image
      || media.original_media_url
      || media?.media_collection?.high?.url
      || '';
    return {
      network,
      contract: item.token_address,
      tokenId: item.token_id,
      name: metadata.name || item.name || `Token #${item.token_id}`,
      symbol: item.symbol || '',
      image,
      amount: item.amount || '1',
      contractType: item.contract_type || 'NFT'
    };
  }

  function normalizeDiscoveredSolanaNft(item) {
    if (!item || typeof item.mint !== 'string') {
      throw new Error('NFT provider returned an item with a missing Solana mint address.');
    }
    const media = item.media || {};
    const image = media.originalMediaUrl
      || media?.mediaCollection?.high?.url
      || media?.mediaCollection?.medium?.url
      || '';
    return {
      network: 'solana',
      contract: item.mint,
      tokenId: item.mint,
      name: item.name || item.collection?.name || `Solana NFT ${item.mint.slice(0, 8)}`,
      symbol: item.symbol || '',
      image,
      amount: item.amount || '1',
      contractType: 'Solana NFT'
    };
  }

  function renderDiscoveredNftCard(record) {
    const card = document.createElement('article');
    card.className = 'wallet-nft-card';
    if (record.image) {
      try {
        const imageUrl = normalizeMetadataUrl(record.image);
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = '';
        image.loading = 'lazy';
        card.appendChild(image);
      } catch (error) {
        console.error('NFT provider image URL was ignored:', error);
      }
    }
    const title = document.createElement('strong');
    title.textContent = record.name;
    const details = document.createElement('span');
    details.textContent = record.network === 'solana'
      ? `Solana · ${record.symbol || 'NFT'} · ${record.contract}`
      : `${NETWORKS[record.network].name} · ${record.contractType} · #${record.tokenId}${record.amount !== '1' ? ` · Owned: ${record.amount}` : ''}`;
    const link = document.createElement('a');
    link.href = `${NETWORKS[record.network].explorer}${encodeURIComponent(record.contract)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View on explorer';
    card.append(title, details, link);
    return card;
  }

  async function moralisFetch(url, apiKey) {
    const response = await fetchWithTimeout(url, {
      headers: { 'X-API-Key': apiKey }
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('Moralis rejected the API key or does not allow this endpoint for your plan.');
    }
    if (response.status === 429) {
      throw new Error('Moralis rate limit reached. Wait before trying NFT discovery again.');
    }
    if (!response.ok) {
      throw new Error(`Moralis NFT service returned HTTP ${response.status}.`);
    }
    return response.json();
  }

  async function discoverEvmNfts(network, address, apiKey) {
    const chain = { ethereum: 'eth', bsc: 'bsc', polygon: 'polygon' }[network];
    const items = [];
    let cursor = '';
    let page = 0;
    do {
      const url = new URL(`https://deep-index.moralis.io/api/v2.2/${encodeURIComponent(address)}/nft`);
      url.searchParams.set('chain', chain);
      url.searchParams.set('format', 'decimal');
      url.searchParams.set('limit', '100');
      url.searchParams.set('exclude_spam', 'true');
      url.searchParams.set('normalizeMetadata', 'true');
      url.searchParams.set('media_items', 'true');
      if (cursor) url.searchParams.set('cursor', cursor);
      const payload = await moralisFetch(url, apiKey);
      if (!payload || !Array.isArray(payload.result)) {
        throw new Error('Moralis returned an invalid NFT response.');
      }
      items.push(...payload.result.map((item) => normalizeDiscoveredEvmNft(network, item)));
      cursor = typeof payload.cursor === 'string' ? payload.cursor : '';
      page += 1;
    } while (cursor && page < 10);
    return { items, truncated: Boolean(cursor) };
  }

  async function discoverSolanaNfts(address, apiKey) {
    const url = new URL(`https://solana-gateway.moralis.io/account/mainnet/${encodeURIComponent(address)}/nft`);
    url.searchParams.set('nftMetadata', 'true');
    url.searchParams.set('mediaItems', 'true');
    url.searchParams.set('excludeSpam', 'true');
    url.searchParams.set('includeFungibleAssets', 'false');
    const payload = await moralisFetch(url, apiKey);
    if (!Array.isArray(payload)) throw new Error('Moralis returned an invalid Solana NFT response.');
    return { items: payload.map(normalizeDiscoveredSolanaNft), truncated: false };
  }

  function nftDiscoveryError(network, error) {
    const entry = document.createElement('p');
    entry.className = 'wallet-nft-discovery-error';
    entry.textContent = `${NETWORKS[network].name}: ${error.message}`;
    byId('walletNftDiscoveryList').appendChild(entry);
  }

  async function discoverWalletNfts(apiKey) {
    const requestId = ++nftDiscoveryRequest;
    const list = byId('walletNftDiscoveryList');
    const status = byId('walletNftDiscoveryStatus');
    const button = byId('walletNftDiscoverButton');
    list.replaceChildren();
    if (!walletAddresses.ethereum && !walletAddresses.solana) {
      status.textContent = 'Unlock the recovery-phrase wallet or connect MetaMask before discovering NFTs.';
      status.classList.add('is-error');
      return;
    }
    button.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Searching Ethereum, BNB Chain, Polygon, and Solana for NFTs…';
    const networks = [
      ['ethereum', walletAddresses.ethereum, discoverEvmNfts],
      ['bsc', walletAddresses.bsc, discoverEvmNfts],
      ['polygon', walletAddresses.polygon, discoverEvmNfts],
      ['solana', walletAddresses.solana, discoverSolanaNfts]
    ].filter(([, address]) => address);
    const skippedNetworks = ['ethereum', 'bsc', 'polygon', 'solana']
      .filter((network) => !walletAddresses[network]);
    const results = await Promise.allSettled(networks.map(async ([network, address, discover]) => ({
      network,
      ...(network === 'solana'
        ? await discover(address, apiKey)
        : await discover(network, address, apiKey))
    })));
    if (requestId !== nftDiscoveryRequest) return;
    let found = 0;
    let failures = 0;
    let truncated = false;
    results.forEach((result, index) => {
      const [network] = networks[index];
      if (result.status === 'rejected') {
        failures += 1;
        console.error(`${NETWORKS[network].name} NFT discovery failed:`, result.reason);
        nftDiscoveryError(network, result.reason instanceof Error ? result.reason : new Error('NFT lookup failed.'));
        return;
      }
      const { items, truncated: pageLimitReached } = result.value;
      truncated ||= pageLimitReached;
      found += items.length;
      if (!items.length) return;
      const heading = document.createElement('h5');
      heading.className = 'wallet-nft-network-heading';
      heading.textContent = `${NETWORKS[network].name} (${items.length})`;
      list.appendChild(heading);
      const grid = document.createElement('div');
      grid.className = 'wallet-nft-list';
      items.forEach((item) => grid.appendChild(renderDiscoveredNftCard(item)));
      list.appendChild(grid);
    });
    if (requestId === nftDiscoveryRequest) {
      if (found === 0 && failures === 0) {
        status.textContent = `No NFTs were found${skippedNetworks.length ? `; skipped ${skippedNetworks.map((network) => NETWORKS[network].name).join(', ')} because no address is connected` : ''}.`;
      } else {
        const unavailableNetworks = networks.length - results.filter((result) => result.status === 'fulfilled').length;
        status.textContent = `${found} NFT${found === 1 ? '' : 's'} found${failures ? `; ${failures} network lookup${failures === 1 ? '' : 's'} failed` : ''}${skippedNetworks.length ? `; skipped ${skippedNetworks.map((network) => NETWORKS[network].name).join(', ')} because no address is connected` : ''}${truncated ? '; showing the first 1,000 NFTs per EVM network' : ''}.`;
        if (unavailableNetworks > 0) status.classList.add('is-error');
      }
      button.disabled = false;
    }
  }

  function autoDiscoverWalletNfts() {
    if (!byId('walletNftAutoDiscover').checked || !moralisApiKey) return;
    if (!walletAddresses.ethereum && !walletAddresses.solana) return;
    void discoverWalletNfts(moralisApiKey);
  }

  async function renderTrackedNfts() {
    const list = byId('walletNftList');
    list.replaceChildren();
    if (!mnemonicPhrase && !ledgerAddress && !hardwareLedgerAddress) {
      list.textContent = 'Unlock the wallet or connect MetaMask or Ledger to verify and display tracked NFTs.';
      return;
    }
    let records;
    try {
      records = getTrackedNfts();
    } catch (error) {
      list.textContent = error.message;
      return;
    }
    if (!records.length) {
      list.textContent = 'No tracked NFTs. Add an ERC-721 contract and token ID above.';
      return;
    }

    await Promise.all(records.map(async (record) => {
      const placeholder = document.createElement('article');
      placeholder.className = 'wallet-nft-card';
      placeholder.textContent = `Checking ${NETWORKS[record.network].name} token #${record.tokenId}...`;
      list.appendChild(placeholder);
      try {
        const metadata = await loadNftRecord(record);
        placeholder.replaceWith(renderNftCard(metadata));
      } catch (error) {
        console.error('NFT ownership or metadata check failed:', error);
        placeholder.textContent = `${NETWORKS[record.network]?.name || record.network} #${record.tokenId}: ${error.message}`;
        placeholder.classList.add('is-error');
      }
    }));
  }

  async function unlockWithPhrase(phrase) {
    writeUnlockAttempts({ failedAttempts: 0, lockedUntil: 0 });
    mnemonicPhrase = phrase;
    lastWalletActivity = Date.now();
    scheduleIdleLock();
    walletRoot.classList.remove('wallet-credentials-pending');
    setVaultLockScreen(false);
    state.textContent = 'Wallet unlocked';
    dashboard.hidden = false;
    byId('walletBackupButton').hidden = false;
    byId('walletLockButton').hidden = false;
    creationControls.forEach((button) => { button.hidden = true; });
    if (balanceInterval) clearInterval(balanceInterval);
    balanceInterval = setInterval(() => { refreshBalances(); }, 30000);
    forms.forEach((form) => { form.hidden = true; });
    byId('walletPhrasePanel').hidden = true;
    setMessage('Deriving addresses. On-chain balances will be queried from public network services.');
    try {
      if (assetCatalog && marketAssets.length === 0) await loadMarketAssets();
      const unavailableNetworks = await deriveAllAddresses();
      scrollToWalletActionIfRequested();
      setMessage(unavailableNetworks.length
        ? `Wallet unlocked. Balance services unavailable: ${unavailableNetworks.join(', ')}.`
        : 'Wallet unlocked. Public network services can observe your connection and queried addresses.',
      unavailableNetworks.length > 0);
    } catch (error) {
      lockWallet(false);
      setMessage(`Could not initialize wallet libraries: ${error.message}`, true);
      throw error;
    }
  }

  function lockWallet(showMessage = true) {
    clearIdleLockTimer();
    if (backupPhraseHideTimer) window.clearTimeout(backupPhraseHideTimer);
    backupPhraseHideTimer = null;
    mnemonicPhrase = null;
    pendingNewPhrase = null;
    pendingPassword = null;
    walletAddresses = hardwareLedgerAddress
      ? { ethereum: hardwareLedgerAddress, bsc: hardwareLedgerAddress, polygon: hardwareLedgerAddress }
      : ledgerAddress
        ? { ethereum: ledgerAddress, bsc: ledgerAddress, polygon: ledgerAddress }
      : {};
    balanceValues = {};
    if (balanceInterval) clearInterval(balanceInterval);
    balanceInterval = null;
    dashboard.hidden = true;
    byId('walletBackupButton').hidden = true;
    byId('walletLockButton').hidden = true;
    byId('walletUnlockButton').hidden = !getSavedWallet();
    byId('walletCreateButton').hidden = Boolean(getSavedWallet());
    byId('walletRestoreButton').hidden = Boolean(getSavedWallet());
    state.textContent = hardwareLedgerAddress
      ? 'Ledger hardware account connected'
      : ledgerAddress
        ? 'MetaMask account connected'
      : getSavedWallet() ? 'Wallet locked in this browser' : 'No wallet set up';
    renderPaperSummary();
    byId('totalHoldingsValue').textContent = '--';
    byId('holdingsTableBody').replaceChildren();
    byId('walletPhrasePanel').hidden = true;
    byId('walletPhrasePanel').dataset.mode = '';
    byId('walletRecoveryWords').replaceChildren();
    byId('walletBackupForm').reset();
    byId('walletRestoreForm').reset();
    byId('walletUnlockForm').reset();
    showWalletAccessGate();
    if (showMessage) setMessage('Wallet locked. Enter its PIN or password to continue.');
  }

  function renderPhrase(phrase, isBackup) {
    const list = byId('walletRecoveryWords');
    list.replaceChildren();
    byId('walletPhrasePanel').dataset.mode = isBackup ? 'backup' : 'create';
    byId('walletPhrasePanel').querySelector('.wallet-backup-close')?.remove();
    phrase.trim().split(/\s+/).forEach((word, index) => {
      const item = document.createElement('li');
      item.textContent = word;
      item.setAttribute('aria-label', `Word ${index + 1}: ${word}`);
      list.appendChild(item);
    });
    byId('walletBackupConfirmed').checked = false;
    byId('walletBackupConfirmed').disabled = isBackup;
    byId('walletConfirmBackup').hidden = isBackup;
    byId('walletConfirmBackup').disabled = true;
    byId('walletPhrasePanel').hidden = false;
    forms.forEach((form) => { form.hidden = true; });
    if (isBackup) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'btn btn-ghost';
      close.classList.add('wallet-backup-close');
      close.textContent = 'Hide recovery phrase';
      close.addEventListener('click', () => hideRevealedBackupPhrase());
      byId('walletPhrasePanel').appendChild(close);
      backupPhraseHideTimer = window.setTimeout(
        () => hideRevealedBackupPhrase('Recovery phrase hidden automatically after 60 seconds.'),
        BACKUP_PHRASE_VISIBLE_MS
      );
    }
  }

  byId('walletDownloadRecoveryPhrase').addEventListener('click', () => {
    const phrase = Array.from(byId('walletRecoveryWords').querySelectorAll('li'))
      .map((item) => item.textContent)
      .join(' ');
    if (!phrase) {
      setMessage('The recovery phrase is not available to download. Reopen the backup phrase and try again.', true);
      return;
    }
    let downloadUrl;
    try {
      const file = new Blob([`${phrase}\n`], { type: 'text/plain;charset=utf-8' });
      downloadUrl = URL.createObjectURL(file);
      const download = document.createElement('a');
      download.href = downloadUrl;
      download.download = 'wallet-recovery-phrase.txt';
      download.hidden = true;
      document.body.appendChild(download);
      download.click();
      download.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setMessage('Recovery phrase downloaded as an unencrypted text file. Keep it offline and secure.');
    } catch (error) {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      console.error('Recovery phrase download failed:', error);
      setMessage(`Could not download the recovery phrase: ${error.message}`, true);
    }
  });

  async function submitWalletTransaction(network, recipient, amount) {
    const { ethers, Buffer, bitcoin, solana } = await importWalletLibraries();
    const useMetaMask = byId('walletUseLedger').checked;
    const useHardwareLedger = byId('walletUseHardwareLedger').checked;
    if (network === 'bitcoin') {
      if (!mnemonicPhrase || useMetaMask || useHardwareLedger) {
        throw new Error('Bitcoin signing requires the recovery-phrase wallet. Direct Ledger signing currently supports EVM networks only.');
      }
      const address = bitcoin.address.toOutputScript(recipient, bitcoin.networks.bitcoin);
      const bitcoinWallet = ethers.HDNodeWallet.fromPhrase(mnemonicPhrase, undefined, NETWORKS.bitcoin.path);
      const privateKey = new ethers.SigningKey(bitcoinWallet.privateKey);
      const publicKey = Buffer.from(ethers.getBytes(ethers.SigningKey.computePublicKey(bitcoinWallet.privateKey, true)));
      const publicKeyHash = bitcoin.crypto.hash160(publicKey);
      const witnessScript = Buffer.concat([Buffer.from([0x00, 0x14]), publicKeyHash]);
      const payment = {
        address: bitcoin.address.toBech32(publicKeyHash, 0, bitcoin.networks.bitcoin.bech32),
        output: witnessScript
      };
      const satoshiValue = parseTokenAmount(amount, 8, 'BTC');
      if (satoshiValue > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('BTC amount is too large for safe transaction encoding.');
      const satoshis = Number(satoshiValue);
      const [utxoResponse, feeResponse] = await Promise.all([
        fetchWithTimeout(`https://mempool.space/api/address/${encodeURIComponent(payment.address)}/utxo`),
        fetchWithTimeout('https://mempool.space/api/v1/fees/recommended')
      ]);
      if (!utxoResponse.ok || !feeResponse.ok) throw new Error('Bitcoin fee or UTXO service is unavailable.');
      const utxos = await utxoResponse.json();
      const fees = await feeResponse.json();
      const feeRate = Math.max(1, Number(fees.halfHourFee) || 10);
      let total = 0;
      let selected = [];
      let fee = 0;
      for (const utxo of utxos) {
        selected.push(utxo);
        total += utxo.value;
        fee = Math.ceil((10 + selected.length * 68 + 2 * 31) * feeRate);
        if (total >= satoshis + fee) break;
      }
      if (total < satoshis + fee) throw new Error('Insufficient BTC for this amount plus the estimated network fee.');
      const change = total - satoshis - fee;
      const actualFee = change > 546 ? fee : total - satoshis;
      if (satoshis < 546) throw new Error('BTC amount is below the dust limit.');
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
      selected.forEach((utxo) => {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: { script: payment.output, value: utxo.value }
        });
      });
      psbt.addOutput({ address: recipient, value: satoshis });
      if (change > 546) psbt.addOutput({ address: payment.address, value: change });
      const confirmed = window.confirm(`Send ${amount} BTC to ${recipient}?\nEstimated fee: ${(actualFee / 1e8).toFixed(8)} BTC (${feeRate} sat/vB).\nThis transaction cannot be reversed.`);
      if (!confirmed) throw new Error('Transaction cancelled before signing.');
      const derInteger = (hexValue) => {
        let hex = hexValue.slice(2).replace(/^0+/, '');
        if (!hex) hex = '00';
        if (hex.length % 2) hex = `0${hex}`;
        if (Number.parseInt(hex.slice(0, 2), 16) >= 0x80) hex = `00${hex}`;
        return Buffer.from(hex, 'hex');
      };
      const signer = {
        publicKey,
        sign: (hash) => {
          const signature = privateKey.sign(ethers.hexlify(hash));
          const r = derInteger(signature.r);
          const s = derInteger(signature.s);
          return Buffer.concat([
            Buffer.from([0x30, 4 + r.length + s.length, 0x02, r.length]),
            r,
            Buffer.from([0x02, s.length]),
            s
          ]);
        }
      };
      psbt.signAllInputs(signer);
      psbt.finalizeAllInputs();
      const txHex = psbt.extractTransaction().toHex();
      const broadcast = await fetchWithTimeout('https://mempool.space/api/tx', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: txHex
      });
      const responseText = await broadcast.text();
      if (!broadcast.ok) throw new Error(`Bitcoin transaction broadcast failed: ${responseText}`);
      return { hash: responseText.trim(), explorer: 'https://mempool.space/tx/' };
    }

    if (network === 'solana') {
      if (!mnemonicPhrase || useMetaMask || useHardwareLedger) {
        throw new Error('Solana signing requires the recovery-phrase wallet. Direct Ledger signing currently supports EVM networks only.');
      }
      const { PublicKey, Connection, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } = solana;
      const recipientKey = new PublicKey(recipient);
      const seed = getSeedBytes(ethers);
      const derived = await deriveSolanaPrivateSeed(seed, NETWORKS.solana.path);
      const keypair = Keypair.fromSeed(Uint8Array.from(derived));
      const lamportValue = parseTokenAmount(amount, 9, 'SOL');
      if (lamportValue > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('SOL amount is too large for safe transaction encoding.');
      const lamports = Number(lamportValue);
      const connection = new Connection(NETWORKS.solana.rpc, 'confirmed');
      const genesisHash = await connection.getGenesisHash();
      if (genesisHash !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp') {
        throw new Error('The configured RPC did not verify Solana mainnet. No transaction was sent.');
      }
      const transaction = new Transaction().add(SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipientKey,
        lamports
      }));
      transaction.feePayer = keypair.publicKey;
      transaction.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
      const feeLamports = await connection.getFeeForMessage(transaction.compileMessage(), 'confirmed');
      if (feeLamports.value === null) throw new Error('Could not estimate the Solana network fee.');
      const confirmed = window.confirm(`Send ${amount} SOL to ${recipient} on Solana mainnet?\nEstimated network fee: ${(feeLamports.value / LAMPORTS_PER_SOL).toFixed(9)} SOL.\nThis transaction cannot be reversed.`);
      if (!confirmed) throw new Error('Transaction cancelled before signing.');
      const hash = await sendAndConfirmTransaction(connection, transaction, [keypair], { commitment: 'confirmed' });
      return { hash, explorer: NETWORKS.solana.explorer };
    }

    const networkConfig = NETWORKS[network];
    if (!ethers.isAddress(recipient)) throw new Error('Enter a valid EVM recipient address.');
    if (useMetaMask && useHardwareLedger) throw new Error('Choose either MetaMask or direct Ledger signing, not both.');
    if (useMetaMask && !ledgerAddress) throw new Error('Connect your MetaMask account before selecting it.');
    if (useHardwareLedger && (!hardwareLedgerAddress || !hardwareLedgerEth)) {
      throw new Error('Connect your Ledger device and open the Ethereum app before selecting direct Ledger signing.');
    }
    if (!useMetaMask && !useHardwareLedger && !mnemonicPhrase) {
      throw new Error('Unlock the recovery-phrase wallet or choose a connected external EVM account.');
    }
    const connectedChainId = await rpc(network, 'eth_chainId', []);
    if (Number.parseInt(connectedChainId, 16) !== networkConfig.chainId) {
      throw new Error(`The configured RPC did not verify the ${networkConfig.name} network. No transaction was sent.`);
    }
    const provider = new ethers.JsonRpcProvider(networkConfig.rpc, networkConfig.chainId);
    const fromAddress = useHardwareLedger
      ? hardwareLedgerAddress
      : useMetaMask
        ? ledgerAddress
        : ethers.Wallet.fromPhrase(mnemonicPhrase, undefined, NETWORKS.ethereum.path).address;
    let signer;
    if (useMetaMask) {
      if (!ledgerAddress || !ledgerProvider) throw new Error('Connect your account through MetaMask first.');
      const currentChainId = await ledgerProvider.request({ method: 'eth_chainId' });
      if (Number.parseInt(currentChainId, 16) !== networkConfig.chainId) {
        try {
          await ledgerProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${networkConfig.chainId.toString(16)}` }]
          });
        } catch (error) {
          if (error.code !== 4902) throw error;
          const chain = {
            56: { chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://bsc-rpc.publicnode.com'], blockExplorerUrls: ['https://bscscan.com'] },
            137: { chainName: 'Polygon PoS', nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 }, rpcUrls: ['https://polygon.drpc.org'], blockExplorerUrls: ['https://polygonscan.com'] }
          }[networkConfig.chainId];
          if (!chain) throw error;
          await ledgerProvider.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: `0x${networkConfig.chainId.toString(16)}`, ...chain }]
          });
        }
      }
      const browserProvider = new ethers.BrowserProvider(ledgerProvider);
      signer = await browserProvider.getSigner();
      const signerAddress = await signer.getAddress();
      if (signerAddress.toLowerCase() !== ledgerAddress.toLowerCase()) {
        throw new Error('The MetaMask account changed. Reconnect MetaMask and verify the address before continuing.');
      }
    } else if (!useHardwareLedger) {
      signer = ethers.Wallet.fromPhrase(mnemonicPhrase, undefined, NETWORKS.ethereum.path).connect(provider);
    }
    const value = ethers.parseEther(String(amount));
    const gasLimit = await provider.estimateGas({ from: fromAddress, to: recipient, value });
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
    if (!gasPrice) throw new Error('Could not retrieve the network gas price. Try again later.');
    const feeEstimate = gasLimit * gasPrice;
    const nativeUnit = ethers.formatEther(feeEstimate);
    const sourceDescription = useHardwareLedger
      ? `Ledger hardware account ${hardwareLedgerAddress}`
      : useMetaMask
        ? `MetaMask account ${ledgerAddress}`
        : 'your recovery-phrase wallet';
    const confirmed = window.confirm(`Send ${amount} ${networkConfig.symbol} to ${recipient} on ${networkConfig.name} from ${sourceDescription}?\nEstimated network fee: ${nativeUnit} ${networkConfig.symbol}.\nThis transaction cannot be reversed.`);
    if (!confirmed) throw new Error('Transaction cancelled before signing.');
    if (useHardwareLedger) {
      const unsigned = ethers.Transaction.from({
        type: 0,
        chainId: networkConfig.chainId,
        nonce: await provider.getTransactionCount(hardwareLedgerAddress, 'pending'),
        gasLimit,
        gasPrice,
        to: recipient,
        value,
        data: '0x'
      });
      const deviceSignature = await hardwareLedgerEth.signTransaction(
        EVM_LEDGER_PATH,
        unsigned.unsignedSerialized.slice(2)
      );
      const signature = ethers.Signature.from({
        r: `0x${deviceSignature.r}`,
        s: `0x${deviceSignature.s}`,
        v: Number.parseInt(deviceSignature.v, 16)
      });
      const recoveredAddress = ethers.recoverAddress(unsigned.unsignedHash, signature);
      if (recoveredAddress.toLowerCase() !== hardwareLedgerAddress.toLowerCase()) {
        throw new Error('Ledger signature did not match the verified hardware address; the transaction was not broadcast.');
      }
      const signed = ethers.Transaction.from({
        ...unsigned.toJSON(),
        signature
      });
      const broadcast = await provider.broadcastTransaction(signed.serialized);
      await broadcast.wait(1);
      return {
        hash: broadcast.hash,
        explorer: `https://${network === 'ethereum' ? 'etherscan.io' : network === 'bsc' ? 'bscscan.com' : 'polygonscan.com'}/tx/`
      };
    }
    const transaction = await signer.sendTransaction({ to: recipient, value, gasLimit, gasPrice });
    await transaction.wait(1);
    return { hash: transaction.hash, explorer: `https://${network === 'ethereum' ? 'etherscan.io' : network === 'bsc' ? 'bscscan.com' : 'polygonscan.com'}/tx/` };
  }

  async function connectMetaMask(requestAccess = true, activateAccount = true) {
    const status = byId('walletLedgerStatus');
    const onboardingStatus = byId('walletOnboardingMetaStatus');
    if (ledgerAddress && ledgerProvider) {
      if (onboardingStatus) {
        onboardingStatus.textContent = `MetaMask connected: ${ledgerAddress}`;
        onboardingStatus.classList.remove('is-error');
      }
      return true;
    }
    if (!window.ethereum) {
      const messageText = 'MetaMask was not detected. Install the browser extension or continue with a recovery phrase.';
      status.textContent = messageText;
      status.classList.add('is-error');
      if (onboardingStatus) {
        onboardingStatus.textContent = messageText;
        onboardingStatus.classList.add('is-error');
      }
      return false;
    }
    if (metaMaskConnection) {
      const pendingRequestsAccess = metaMaskConnectionRequestsAccess;
      const connected = await metaMaskConnection;
      if (connected || !requestAccess || pendingRequestsAccess) return connected;
      return connectMetaMask(true);
    }

    const connect = async () => {
      const connectMetaMaskButton = byId('walletConnectLedgerButton');
      if (connectMetaMaskButton) connectMetaMaskButton.disabled = true;
      status.classList.remove('is-error');
      status.textContent = requestAccess
        ? 'Approve the account connection in MetaMask.'
        : 'Checking for a previously connected MetaMask account…';
      if (onboardingStatus) {
        onboardingStatus.classList.remove('is-error');
        onboardingStatus.textContent = requestAccess
          ? 'Approve the account connection in MetaMask.'
          : 'Checking for a previously connected MetaMask account…';
      }
      try {
        const accounts = await window.ethereum.request({
          method: requestAccess ? 'eth_requestAccounts' : 'eth_accounts'
        });
        if (!Array.isArray(accounts) || !accounts[0]) {
          const messageText = 'MetaMask is ready to connect. You can connect it now or continue with a recovery phrase.';
          status.textContent = messageText;
          if (onboardingStatus) onboardingStatus.textContent = messageText;
          return false;
        }
        ledgerAddress = accounts[0];
        ledgerProvider = window.ethereum;
        rememberConnectedWallet();
        const canSendEvm = ['ethereum', 'bsc', 'polygon'].includes(byId('walletSendNetwork').value);
        byId('walletUseLedger').disabled = !canSendEvm;
        if (!canSendEvm) byId('walletUseLedger').checked = false;
        status.classList.remove('is-error');
        status.textContent = `MetaMask account connected: ${ledgerAddress}. If this is Ledger-backed, approve transactions on your device; this site cannot verify hardware.`;
        const connectMetaMaskButton = byId('walletConnectLedgerButton');
        if (connectMetaMaskButton) connectMetaMaskButton.textContent = 'Disconnect MetaMask';
        if (onboardingStatus) {
          onboardingStatus.classList.remove('is-error');
          onboardingStatus.textContent = `MetaMask connected: ${ledgerAddress}`;
        }
        if (!mnemonicPhrase && activateAccount) {
          setVaultLockScreen(false);
          walletAddresses = { ethereum: ledgerAddress, bsc: ledgerAddress, polygon: ledgerAddress };
          byId('wallet').classList.remove('wallet-onboarding-active');
          state.textContent = 'MetaMask account connected';
          dashboard.hidden = false;
          renderAddresses();
          await refreshBalances();
          scrollToReceiveIfRequested();
          if (balanceInterval) clearInterval(balanceInterval);
          balanceInterval = setInterval(() => { refreshBalances(); }, 30000);
        }
        return true;
      } catch (error) {
        console.error('MetaMask account connection failed:', error);
        const messageText = error.code === 4001
          ? 'MetaMask connection was rejected. You can still create or restore a wallet.'
          : `Could not connect MetaMask: ${error.message}`;
        status.textContent = messageText;
        status.classList.add('is-error');
        if (onboardingStatus) {
          onboardingStatus.textContent = messageText;
          onboardingStatus.classList.add('is-error');
        }
        return false;
      } finally {
        if (connectMetaMaskButton) connectMetaMaskButton.disabled = false;
      }
    };

    metaMaskConnectionRequestsAccess = requestAccess;
    metaMaskConnection = connect();
    try {
      return await metaMaskConnection;
    } finally {
      metaMaskConnection = null;
      metaMaskConnectionRequestsAccess = false;
    }
  }

  byId('walletConnectLedgerButton')?.addEventListener('click', async () => {
    if (ledgerAddress) {
      ledgerAddress = null;
      ledgerProvider = null;
      byId('walletUseLedger').checked = false;
      byId('walletUseLedger').disabled = true;
      const connectMetaMaskButton = byId('walletConnectLedgerButton');
      if (connectMetaMaskButton) connectMetaMaskButton.textContent = 'Connect MetaMask';
      byId('walletLedgerStatus').textContent = 'MetaMask account disconnected from this page.';
      byId('walletLedgerStatus').classList.remove('is-error');
      if (byId('walletOnboardingMetaStatus')) {
        byId('walletOnboardingMetaStatus').textContent = 'MetaMask account disconnected from this page.';
        byId('walletOnboardingMetaStatus').classList.remove('is-error');
      }
      if (!mnemonicPhrase) lockWallet(false);
      return;
    }
    await connectMetaMask(true);
  });

  async function disconnectHardwareLedger() {
    const transport = hardwareLedgerTransport;
    hardwareLedgerTransport = null;
    hardwareLedgerEth = null;
    hardwareLedgerAddress = null;
    byId('walletUseHardwareLedger').checked = false;
    byId('walletUseHardwareLedger').disabled = true;
    const hardwareButton = byId('walletConnectHardwareButton');
    if (hardwareButton) hardwareButton.textContent = 'Connect Ledger (USB)';
    if (transport) {
      try {
        await transport.close();
      } catch (error) {
        console.error('Ledger USB transport could not be closed cleanly:', error);
        byId('walletHardwareStatus').textContent = `Ledger was disconnected, but the browser could not close its device session cleanly: ${error.message}`;
        byId('walletHardwareStatus').classList.add('is-error');
      }
    }
    if (!mnemonicPhrase) lockWallet(false);
    if (!byId('walletHardwareStatus').classList.contains('is-error')) {
      byId('walletHardwareStatus').textContent = 'Ledger device disconnected.';
    }
  }

  byId('walletConnectHardwareButton')?.addEventListener('click', async () => {
    if (hardwareLedgerTransport) {
      await disconnectHardwareLedger();
      return;
    }
    const status = byId('walletHardwareStatus');
    if (!window.isSecureContext || !navigator.hid) {
      status.textContent = 'Direct Ledger USB requires a secure browser context and WebHID support. Try Chrome or Edge over HTTPS, or use MetaMask.';
      status.classList.add('is-error');
      if (byId('walletAppContent').hidden) byId('walletOnboardingMetaStatus').textContent = status.textContent;
      return;
    }
    const button = byId('walletConnectHardwareButton');
    if (button) button.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Connect your Ledger, unlock it, and open the Ethereum app. Approve the displayed address on the device.';
    if (byId('walletAppContent').hidden) byId('walletOnboardingMetaStatus').textContent = status.textContent;
    let transport;
    try {
      transport = await TransportWebHID.create();
      const ethApp = new Eth(transport);
      const account = await ethApp.getAddress(EVM_LEDGER_PATH, true);
      if (!account.address || !ethers.isAddress(account.address)) {
        throw new Error('Ledger returned an invalid EVM address.');
      }
      hardwareLedgerTransport = transport;
      hardwareLedgerEth = ethApp;
      hardwareLedgerAddress = ethers.getAddress(account.address);
      rememberConnectedWallet();
      byId('walletUseHardwareLedger').disabled = !['ethereum', 'bsc', 'polygon'].includes(byId('walletSendNetwork').value);
      button.textContent = 'Disconnect Ledger';
      status.textContent = `Ledger EVM address verified on-device: ${hardwareLedgerAddress}. Keep the Ethereum app open to sign EVM transactions.`;
      if (!mnemonicPhrase) {
        setVaultLockScreen(false);
        walletAddresses = { ethereum: hardwareLedgerAddress, bsc: hardwareLedgerAddress, polygon: hardwareLedgerAddress };
        state.textContent = 'Ledger hardware account connected';
        dashboard.hidden = false;
        renderAddresses();
        await refreshBalances();
        scrollToReceiveIfRequested();
        if (balanceInterval) clearInterval(balanceInterval);
        balanceInterval = setInterval(() => { refreshBalances(); }, 30000);
      }
    } catch (error) {
      if (transport) {
        try {
          await transport.close();
        } catch (closeError) {
          console.error('Ledger USB transport cleanup failed:', closeError);
        }
      }
      console.error('Direct Ledger connection failed:', error);
      status.textContent = `Could not connect to Ledger: ${error.message}. Ensure the Ethereum app is open and close other apps using the device.`;
      status.classList.add('is-error');
      if (byId('walletAppContent').hidden) byId('walletOnboardingMetaStatus').textContent = status.textContent;
    } finally {
      button.disabled = false;
    }
  });

  if (window.ethereum?.on) {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (!ledgerAddress) return;
      if (!Array.isArray(accounts) || !accounts[0] || accounts[0].toLowerCase() !== ledgerAddress.toLowerCase()) {
        ledgerAddress = null;
        ledgerProvider = null;
        byId('walletUseLedger').checked = false;
        byId('walletUseLedger').disabled = true;
        const connectMetaMaskButton = byId('walletConnectLedgerButton');
        if (connectMetaMaskButton) connectMetaMaskButton.textContent = 'Connect MetaMask';
        byId('walletLedgerStatus').textContent = 'MetaMask account changed. Reconnect to use the new account.';
        if (!mnemonicPhrase) lockWallet(false);
      }
    });
  }

  const onboarding = byId('walletOnboarding');
  const walletAppContent = byId('walletAppContent');
  document.body.append(onboarding);
  const onboardingCreateFlow = byId('walletOnboardingCreateFlow');
  onboardingCreateFlow.append(byId('walletCreateForm'), byId('walletPhrasePanel'));
  const setPageInertExcept = (exemptElement) => {
    Array.from(document.body.children).forEach((child) => {
      child.inert = child !== exemptElement;
    });
  };
  const setVaultLockScreen = (locked) => {
    onboarding.hidden = !locked;
    walletAppContent.hidden = locked;
    byId('wallet').classList.toggle('wallet-onboarding-active', locked);
    document.body.classList.toggle('treasury-vault-locked', locked);
    if (locked) {
      walletRoot.classList.add('wallet-credentials-pending');
      setPageInertExcept(onboarding);
    }
    else Array.from(document.body.children).forEach((child) => { child.inert = false; });
  };

  function showWalletAccessGate() {
    let hasSavedWallet = false;
    try {
      hasSavedWallet = Boolean(getSavedWallet());
    } catch (error) {
      console.error('Existing wallet could not be read; requiring recovery:', error);
    }
    byId('walletOnboardingCreate').hidden = hasSavedWallet;
    byId('walletOnboardingRestore').hidden = hasSavedWallet;
    byId('walletOnboardingWelcomeCreate').hidden = hasSavedWallet;
    byId('walletUnlockForm').hidden = !hasSavedWallet;
    byId('walletOnboardingWelcome').hidden = hasSavedWallet;
    byId('walletOnboardingOptions').hidden = !hasSavedWallet;
    byId('walletOnboardingTitle').textContent = hasSavedWallet ? 'Enter your PIN' : 'Create or recover';
    byId('walletOnboardingDescription').textContent = hasSavedWallet
      ? 'Enter the PIN you created to open your encrypted wallet.'
      : 'Create a new encrypted wallet or recover an existing one to get started.';
    byId('walletOnboardingMetaStatus').hidden = true;
    byId('walletOnboardingMetaStatus').textContent = '';
    byId('walletOnboardingMetaStatus').classList.remove('is-error');
    onboardingCreateFlow.hidden = true;
    byId('walletOnboardingCreate').parentElement.hidden = false;
    byId('walletOnboardingBack').hidden = false;
    if (hasSavedWallet) {
      updateUnlockCredentialLabel();
      updateUnlockAttemptStatus();
      requestAnimationFrame(() => byId('walletUnlockPassword').focus());
    }
    setVaultLockScreen(true);
  }
  const finishOnboarding = () => {
    walletRoot.classList.add('wallet-credentials-pending');
    setVaultLockScreen(false);
  };

  const startWalletCreateFlow = () => {
    byId('walletOnboardingWelcome').hidden = true;
    byId('walletOnboardingOptions').hidden = false;
    byId('walletOnboardingCreate').parentElement.hidden = true;
    byId('walletOnboardingBack').hidden = true;
    onboardingCreateFlow.hidden = false;
    setVaultLockScreen(true);
    updateCredentialMode('walletCreate', byId('walletCreateCredentialType')?.value || 'pin');
    showOnlyForm(byId('walletCreateForm'));
    byId('walletCreatePassword').focus();
  };
  const startWalletRestoreFlow = () => {
    finishOnboarding();
    updateCredentialMode('walletRestore', byId('walletRestoreCredentialType')?.value || 'pin');
    showOnlyForm(byId('walletRestoreForm'));
    byId('walletRestorePhrase').focus();
  };
  const openWalletSetupFromHash = () => {
    const action = location.hash === '#create-wallet'
      ? 'create'
      : location.hash === '#recover-wallet'
        ? 'recover'
        : null;
    if (!action) return;
    requestAnimationFrame(() => walletRoot.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    try {
      const savedWallet = getSavedWallet();
      if (action === 'create' && savedWallet) {
        showWalletAccessGate();
        byId('walletOnboardingMetaStatus').hidden = false;
        byId('walletOnboardingMetaStatus').textContent = 'A wallet is already saved in this browser. Enter its PIN before creating another wallet.';
        return;
      }
      if (action === 'recover' && savedWallet
        && !window.confirm('Recovering a wallet will replace the encrypted wallet saved in this browser. Continue only if you have the recovery phrase for the wallet you want to restore.')) {
        return;
      }
      if (action === 'create') startWalletCreateFlow();
      else startWalletRestoreFlow();
    } catch (error) {
      console.error('Wallet setup could not be opened:', error);
      setMessage(`Could not open wallet setup: ${error.message}`, true);
    }
  };

  window.addEventListener('hashchange', () => {
    openWalletSetupFromHash();
    scrollToWalletActionIfRequested();
  });

  byId('walletOnboardingNext').addEventListener('click', () => {
    byId('walletOnboardingWelcome').hidden = true;
    byId('walletOnboardingOptions').hidden = false;
  });
  byId('walletOnboardingWelcomeCreate').addEventListener('click', startWalletCreateFlow);
  byId('walletOnboardingBack').addEventListener('click', () => {
    byId('walletOnboardingOptions').hidden = true;
    byId('walletOnboardingWelcome').hidden = false;
  });
  byId('walletOnboardingCreate').addEventListener('click', () => {
    startWalletCreateFlow();
  });
  byId('walletOnboardingRestore').addEventListener('click', () => {
    startWalletRestoreFlow();
  });
  byId('walletCreateButton').addEventListener('click', () => {
    updateCredentialMode('walletCreate', byId('walletCreateCredentialType')?.value || 'pin');
    showOnlyForm(byId('walletCreateForm'));
  });
  byId('walletRestoreButton').addEventListener('click', () => {
    updateCredentialMode('walletRestore', byId('walletRestoreCredentialType')?.value || 'pin');
    showOnlyForm(byId('walletRestoreForm'));
  });
  byId('walletUnlockButton').addEventListener('click', () => {
    updateUnlockCredentialLabel();
    showWalletAccessGate();
  });
  byId('walletBackupButton').addEventListener('click', () => {
    updateUnlockCredentialLabel();
    showOnlyForm(byId('walletBackupForm'));
  });
  byId('walletCreateCredentialType')?.addEventListener('change', (event) => updateCredentialMode('walletCreate', event.target.value));
  byId('walletRestoreCredentialType')?.addEventListener('change', (event) => updateCredentialMode('walletRestore', event.target.value));
  byId('walletCreateForm').addEventListener('reset', () => {
    window.setTimeout(() => updateCredentialMode('walletCreate', byId('walletCreateCredentialType')?.value || 'pin'), 0);
  });
  byId('walletRestoreForm').addEventListener('reset', () => {
    window.setTimeout(() => updateCredentialMode('walletRestore', byId('walletRestoreCredentialType')?.value || 'pin'), 0);
  });
  byId('walletLockButton').addEventListener('click', () => lockWallet());
  document.querySelectorAll('[data-wallet-cancel]').forEach((button) => {
    button.addEventListener('click', () => {
      pendingNewPhrase = null;
      pendingPassword = null;
      pendingCredentialType = 'password';
      pendingCredentialType = 'password';
      byId('walletCreateForm').reset();
      byId('walletPhrasePanel').dataset.password = '';
      byId('walletRecoveryWords').replaceChildren();
      byId('walletPhrasePanel').hidden = true;
      forms.forEach((form) => { form.hidden = true; });
      if (mnemonicPhrase) setMessage('Wallet remains unlocked.');
      else lockWallet(false);
    });
  });

  byId('walletUnlockPassword').addEventListener('input', () => {
    const status = byId('walletOnboardingMetaStatus');
    status.hidden = true;
    status.textContent = '';
    status.classList.remove('is-error');
    if (walletCredentialType() === 'pin') {
      byId('walletUnlockPassword').value = byId('walletUnlockPassword').value.replace(/\D/g, '').slice(0, 5);
      if (byId('walletUnlockPassword').value.length === 5) {
        byId('walletUnlockForm').requestSubmit();
      }
    }
  });
  byId('walletPinVisibility').addEventListener('click', () => {
    const input = byId('walletUnlockPassword');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    byId('walletPinVisibility').textContent = visible ? 'Hide' : 'Show';
    byId('walletPinVisibility').setAttribute('aria-label', visible ? 'Hide PIN' : 'Show PIN');
    byId('walletPinVisibility').setAttribute('aria-pressed', String(visible));
    input.focus();
  });
  byId('walletPinKeypad').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const input = byId('walletUnlockPassword');
    if (button.dataset.walletPinAction === 'clear') {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      return;
    }
    if (button.dataset.walletPinAction === 'backspace') {
      input.value = input.value.slice(0, -1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      return;
    }
    if (/^\d$/.test(button.dataset.walletPin || '') && input.value.length < 5) {
      input.value += button.dataset.walletPin;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  byId('walletCreateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = byId('walletCreatePassword').value;
    const credentialType = byId('walletCreateCredentialType')?.value || 'pin';
    if (!isValidCredential(password, credentialType) || (credentialType === 'pin' && !/^\d{5}$/.test(password))) {
      setMessage(credentialType === 'pin'
        ? 'Use a wallet PIN containing exactly five digits.'
        : 'Use a password of at least 12 characters with uppercase and lowercase letters, a number, and a special character.', true);
      return;
    }
    if (password !== byId('walletCreatePasswordConfirm').value) {
      setMessage('The wallet credential entries do not match.', true);
      return;
    }
    try {
      const entropy = crypto.getRandomValues(new Uint8Array(16));
      pendingNewPhrase = ethers.Mnemonic.fromEntropy(ethers.hexlify(entropy)).phrase;
      pendingPassword = password;
      pendingCredentialType = credentialType;
      byId('walletCreatePassword').value = '';
      byId('walletCreatePasswordConfirm').value = '';
      byId('walletPhrasePanel').dataset.mode = 'create';
      renderPhrase(pendingNewPhrase, false);
      setMessage('Write down these 12 words in order. They are shown only now unless you verify your wallet credential to view your backup.');
    } catch (error) {
      console.error('Wallet generation failed:', error);
      setMessage(`Could not generate a recovery phrase: ${error.message}`, true);
    }
  });

  byId('walletBackupConfirmed').addEventListener('change', (event) => {
    byId('walletConfirmBackup').disabled = !event.target.checked;
  });

  byId('walletConfirmBackup').addEventListener('click', async () => {
    const password = pendingPassword;
    if (!pendingNewPhrase || !password || !byId('walletBackupConfirmed').checked) {
      setMessage('Confirm that you safely backed up the recovery phrase first.', true);
      return;
    }
    try {
      await encryptPhrase(pendingNewPhrase, password, pendingCredentialType);
      mnemonicPhrase = pendingNewPhrase;
      pendingNewPhrase = null;
      pendingPassword = null;
      pendingCredentialType = 'password';
      byId('walletPhrasePanel').hidden = true;
      await unlockWithPhrase(mnemonicPhrase);
    } catch (error) {
      console.error('Wallet encryption or initialization failed:', error);
      setMessage(`Could not save the encrypted wallet: ${error.message}`, true);
    }
  });

  byId('walletRestoreForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = byId('walletRestorePassword').value;
    const confirmPassword = byId('walletRestorePasswordConfirm').value;
    const credentialType = byId('walletRestoreCredentialType')?.value || 'pin';
    if (!isValidCredential(password, credentialType) || (credentialType === 'pin' && !/^\d{5}$/.test(password))) {
      setMessage(credentialType === 'pin'
        ? 'Use a wallet PIN containing exactly five digits.'
        : 'Use a password of at least 12 characters with uppercase and lowercase letters, a number, and a special character.', true);
      return;
    }
    if (password !== confirmPassword) {
      setMessage('The wallet credential entries do not match.', true);
      return;
    }
    const phrase = byId('walletRestorePhrase').value.trim().toLowerCase().replace(/\s+/g, ' ');
    byId('walletRestorePhrase').value = '';
    byId('walletRestorePassword').value = '';
    byId('walletRestorePasswordConfirm').value = '';
    try {
      const mnemonic = ethers.Mnemonic.fromPhrase(phrase);
      if (![12, 15, 18, 21, 24].includes(mnemonic.phrase.split(' ').length)) {
        throw new Error('Use a valid 12-, 15-, 18-, 21-, or 24-word BIP-39 recovery phrase.');
      }
      await encryptPhrase(mnemonic.phrase, password, credentialType);
      await unlockWithPhrase(mnemonic.phrase);
    } catch (error) {
      console.error('Wallet restore failed:', error);
      setMessage(`Could not restore wallet: ${error.message}`, true);
    }
  });

  byId('walletUnlockForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (walletUnlockInProgress || updateUnlockAttemptStatus()) return;
    const password = byId('walletUnlockPassword').value;
    byId('walletUnlockPassword').value = '';
    const status = byId('walletOnboardingMetaStatus');
    walletUnlockInProgress = true;
    setUnlockInputsDisabled(true);
    let phrase;
    try {
      phrase = await decryptPhrase(password);
    } catch (error) {
      console.error('Wallet unlock failed:', error);
      try {
        recordFailedWalletUnlock();
      } catch (storageError) {
        console.error('Could not record failed wallet unlock attempt:', storageError);
        status.textContent = `Wallet security status unavailable: ${storageError.message}`;
        status.classList.add('is-error');
        status.hidden = false;
        setUnlockInputsDisabled(true);
      }
      walletUnlockInProgress = false;
      if (!submitButton.disabled) byId('walletUnlockPassword').focus();
      return;
    }
    try {
      await unlockWithPhrase(phrase);
    } catch (error) {
      console.error('Wallet opened incorrectly after successful credential verification:', error);
      status.textContent = `The PIN was accepted, but the wallet could not finish opening: ${error.message}`;
      status.classList.add('is-error');
      status.hidden = false;
    } finally {
      walletUnlockInProgress = false;
      try {
        const attempts = readUnlockAttempts();
        setUnlockInputsDisabled(attempts.lockedUntil > Date.now());
      } catch (error) {
        console.error('Could not verify wallet unlock lockout status:', error);
        setUnlockInputsDisabled(true);
      }
    }
  });

  byId('walletBackupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = byId('walletBackupPassword').value;
    byId('walletBackupPassword').value = '';
    try {
      const phrase = await decryptPhrase(password);
      renderPhrase(phrase, true);
      setMessage('Recovery phrase revealed. It will be hidden after 60 seconds; keep it offline and never share it.');
    } catch (error) {
      console.error('Recovery phrase could not be revealed:', error);
      setMessage(error.message, true);
    }
  });

  function updateReceiveAddress() {
    const network = byId('walletReceiveNetwork').value;
    const address = walletAddresses[network] || '';
    byId('walletReceiveAddress').textContent = address || 'Unlock wallet to view your address.';
    const canvas = byId('walletReceiveQr');
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!address) return;
    QRCode.toCanvas(canvas, address, { width: 200, margin: 1 })
      .catch((error) => {
        console.error('Could not generate receive QR code:', error);
        setMessage('Address is available, but the QR-code library could not be loaded.', true);
      });
  }

  function createPaymentRequest(network, address, amount) {
    const config = NETWORKS[network];
    if (!config) throw new Error('Choose a supported coin and network.');
    if (!address) throw new Error(`Unlock the wallet to receive ${config.symbol} on ${config.name}.`);
    if (!amount) return address;
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      throw new Error('Enter a payment amount greater than zero, or leave it blank for any amount.');
    }

    if (network === 'bitcoin') return `bitcoin:${address}?amount=${encodeURIComponent(amount)}`;
    if (network === 'solana') return `solana:${address}?amount=${encodeURIComponent(amount)}`;

    const chainId = config.chainId;
    const value = ethers.parseUnits(amount, 18).toString();
    return `ethereum:${address}@${chainId}?value=${value}`;
  }

  function clearPaymentRequest() {
    byId('walletPaymentRequestQr').hidden = true;
    byId('walletPaymentRequestUri').hidden = true;
    byId('walletCopyPaymentRequest').hidden = true;
    byId('walletPaymentRequestUri').textContent = '';
    const canvas = byId('walletPaymentRequestQr');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  byId('walletPaymentRequestForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const network = byId('walletRequestNetwork').value;
    const amount = byId('walletRequestAmount').value.trim();
    const address = walletAddresses[network] || '';
    const status = byId('walletPaymentRequestStatus');
    const button = byId('walletCreatePaymentRequest');
    button.disabled = true;
    clearPaymentRequest();
    try {
      const paymentRequest = createPaymentRequest(network, address, amount);
      await QRCode.toCanvas(byId('walletPaymentRequestQr'), paymentRequest, { width: 200, margin: 1 });
      byId('walletPaymentRequestQr').hidden = false;
      byId('walletPaymentRequestUri').textContent = paymentRequest;
      byId('walletPaymentRequestUri').hidden = false;
      byId('walletCopyPaymentRequest').hidden = false;
      status.textContent = `${amount ? `${amount} ${NETWORKS[network].symbol} requested` : `Any amount in ${NETWORKS[network].symbol}`}. Share this QR code or payment request with the payer.`;
      status.classList.remove('is-error');
    } catch (error) {
      console.error('Payment request could not be created:', error);
      status.textContent = `Could not create payment request: ${error.message}`;
      status.classList.add('is-error');
    } finally {
      button.disabled = false;
    }
  });

  byId('walletRequestNetwork').addEventListener('change', () => {
    clearPaymentRequest();
    byId('walletPaymentRequestStatus').textContent = `Create a request to receive ${NETWORKS[byId('walletRequestNetwork').value].symbol}.`;
  });
  byId('walletRequestAmount').addEventListener('input', clearPaymentRequest);

  byId('walletCopyPaymentRequest').addEventListener('click', async () => {
    const request = byId('walletPaymentRequestUri').textContent;
    if (!request) {
      setMessage('Create a payment request before copying it.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(request);
      setMessage('Payment request copied.');
    } catch (error) {
      console.error('Payment request clipboard copy failed:', error);
      setMessage('Could not copy the payment request. Select and copy it manually.', true);
    }
  });

  byId('walletReceiveNetwork').addEventListener('change', updateReceiveAddress);
  byId('walletScanQrButton').addEventListener('click', async () => {
    const video = byId('walletScanVideo');
    if (qrScannerStream) {
      qrScannerStream.getTracks().forEach((track) => track.stop());
      qrScannerStream = null;
      cancelAnimationFrame(qrScannerFrame);
      video.srcObject = null;
      video.hidden = true;
      byId('walletScanQrButton').textContent = 'Scan recipient QR';
      return;
    }
    if (!('BarcodeDetector' in window)) {
      setMessage('This browser does not support QR scanning. Update your browser or paste the recipient address.', true);
      return;
    }
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      qrScannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = qrScannerStream;
      video.hidden = false;
      byId('walletScanQrButton').textContent = 'Stop QR scanner';
      await video.play();
      const scanFrame = async () => {
        if (!qrScannerStream) return;
        try {
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            qrScannerFrame = requestAnimationFrame(scanFrame);
            return;
          }
          const detected = await detector.detect(video);
          if (detected.length) {
            const network = byId('walletSendNetwork').value;
            const scanned = detected[0].rawValue.trim();
            const recipient = scanned.replace(/^(bitcoin|solana|ethereum):/i, '').split(/[?@]/)[0];
            await validateRecipient(network, recipient);
            byId('walletSendRecipient').value = recipient;
            qrScannerStream.getTracks().forEach((track) => track.stop());
            qrScannerStream = null;
            video.srcObject = null;
            video.hidden = true;
            byId('walletScanQrButton').textContent = 'Scan recipient QR';
            setMessage('Recipient QR scanned. Verify the address and network before sending.');
            return;
          }
        } catch (error) {
          console.error('Recipient QR scan failed:', error);
          qrScannerStream.getTracks().forEach((track) => track.stop());
          qrScannerStream = null;
          video.srcObject = null;
          video.hidden = true;
          byId('walletScanQrButton').textContent = 'Scan recipient QR';
          setMessage(`Could not read a valid ${NETWORKS[byId('walletSendNetwork').value].name} address from that QR code.`, true);
          return;
        }
        qrScannerFrame = requestAnimationFrame(scanFrame);
      };
      scanFrame();
    } catch (error) {
      console.error('Could not start QR scanner:', error);
      if (qrScannerStream) qrScannerStream.getTracks().forEach((track) => track.stop());
      qrScannerStream = null;
      video.hidden = true;
      setMessage(`Could not start camera QR scanning: ${error.message}`, true);
    }
  });

  byId('walletCopyAddress').addEventListener('click', async () => {
    const address = walletAddresses[byId('walletReceiveNetwork').value];
    if (!address) {
      setMessage('This account has no address for the selected network. Unlock the software wallet for BTC or SOL.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      setMessage('Receive address copied.');
    } catch (error) {
      console.error('Receive address clipboard copy failed:', error);
      setMessage('Could not copy address. Select and copy it manually.', true);
    }
  });

  byId('walletSendForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!mnemonicPhrase && !ledgerAddress && !hardwareLedgerAddress) {
      setMessage('Unlock the wallet or connect MetaMask or Ledger before sending a transaction.', true);
      return;
    }
    const network = byId('walletSendNetwork').value;
    const recipient = byId('walletSendRecipient').value.trim();
    const amount = byId('walletSendAmount').value.trim();
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setMessage('Enter an amount greater than zero.', true);
      return;
    }
    byId('walletSendButton').disabled = true;
    byId('walletSendButton').textContent = 'Preparing transaction...';
    try {
      const transaction = await submitWalletTransaction(network, recipient, amount);
      const link = document.createElement('a');
      link.href = transaction.explorer + encodeURIComponent(transaction.hash);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = transaction.hash;
      message.replaceChildren(document.createTextNode('Transaction confirmed: '), link);
      message.classList.remove('is-error');
      if (typeof window.bxcAddNotification !== 'function') {
        console.error('The Wallet transaction notification could not be saved because the notification inbox is unavailable.');
      } else {
        const currency = NETWORKS[network].symbol;
        window.bxcAddNotification({
          source: 'Wallet',
          title: 'Transaction confirmed',
          message: `Sent ${amount} ${currency} successfully.`,
          type: 'info'
        });
      }
      byId('walletSendRecipient').value = '';
      byId('walletSendAmount').value = '';
      await refreshBalances();
    } catch (error) {
      console.error('Wallet transaction failed:', error);
      setMessage(error.message || 'Transaction failed. Check its status before retrying.', true);
    } finally {
      byId('walletSendButton').disabled = false;
      byId('walletSendButton').textContent = 'Review and send';
    }
  });

  byId('walletSendNetwork').addEventListener('change', () => {
    const symbol = NETWORKS[byId('walletSendNetwork').value].symbol;
    byId('walletSendAmount').setAttribute('aria-label', `Amount in ${symbol}`);
    const ledgerNetwork = ['ethereum', 'bsc', 'polygon'].includes(byId('walletSendNetwork').value);
    byId('walletUseLedger').disabled = !ledgerAddress || !ledgerNetwork;
    byId('walletUseHardwareLedger').disabled = !hardwareLedgerAddress || !ledgerNetwork;
    if (!ledgerNetwork) byId('walletUseLedger').checked = false;
    if (!ledgerNetwork) byId('walletUseHardwareLedger').checked = false;
  });
  byId('walletUseLedger').disabled = true;
  byId('walletUseHardwareLedger').disabled = true;
  byId('walletUseLedger').addEventListener('change', () => {
    if (byId('walletUseLedger').checked && !ledgerAddress) {
      byId('walletUseLedger').checked = false;
      setMessage('Connect your MetaMask account before selecting it.', true);
      return;
    }
    if (byId('walletUseLedger').checked) {
      byId('walletUseHardwareLedger').checked = false;
    }
  });
  byId('walletUseHardwareLedger').addEventListener('change', () => {
    if (byId('walletUseHardwareLedger').checked && !hardwareLedgerAddress) {
      byId('walletUseHardwareLedger').checked = false;
      setMessage('Connect your Ledger device through USB before selecting direct hardware signing.', true);
      return;
    }
    if (byId('walletUseHardwareLedger').checked) {
      byId('walletUseLedger').checked = false;
    }
  });
  byId('preferredCurrency').addEventListener('change', renderBalances);
  byId('preferredCurrency').addEventListener('change', renderPaperSummary);
  const creditCardTransferForm = byId('walletCreditCardTransferForm');
  if (creditCardTransferForm) {
    creditCardTransferForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = byId('walletCreditCardTransferStatus');
      const amountInput = byId('walletCreditCardTransferAmount');
      const amount = Math.round(Number(amountInput.value) * 100);
      if (!Number.isFinite(amount) || amount < 1) {
        status.textContent = 'Enter a transfer amount of at least $0.01.';
        return;
      }
      const submitButton = creditCardTransferForm.querySelector('button[type="submit"]');
      if (submitButton.disabled) return;
      submitButton.disabled = true;

      let previousPaperRaw;
      let previousCardRaw;
      try {
        previousPaperRaw = localStorage.getItem(PAPER_BALANCE_KEY);
        previousCardRaw = localStorage.getItem(CREDIT_CARD_BALANCE_KEY);
        const paperBalance = previousPaperRaw === null ? 10000 : Number(previousPaperRaw);
        const cardBalance = previousCardRaw === null ? 0 : Number(previousCardRaw);
        const paperCents = Math.round(paperBalance * 100);
        const cardCents = Math.round(cardBalance * 100);
        if (!Number.isFinite(paperCents) || paperCents < amount || !Number.isFinite(cardCents) || cardCents < 0) {
          status.textContent = 'The Paper Balance is unavailable or too low for this transfer.';
          return;
        }

        const nextPaperBalance = ((paperCents - amount) / 100).toFixed(2);
        const nextCardBalance = ((cardCents + amount) / 100).toFixed(2);
        localStorage.setItem(CREDIT_CARD_BALANCE_KEY, nextCardBalance);
        localStorage.setItem(PAPER_BALANCE_KEY, nextPaperBalance);

        const token = await window.makingsGetIdToken?.();
        const localFileMode = window.location.protocol === 'file:';
        if (token && !localFileMode) {
          const apiBase = window.MAKINGS_API_BASE_URL || window.location.origin;
          const response = await fetch(`${apiBase}/api/paper/state`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              [PAPER_BALANCE_KEY]: nextPaperBalance,
              [CREDIT_CARD_BALANCE_KEY]: nextCardBalance
            })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || 'Account balances could not be synced.');
        }

        renderPaperSummary();
        amountInput.value = '';
        status.textContent = localFileMode && token
          ? `Transferred ${formatCurrency(amount / 100)} locally. Open the hosted wallet page to sync account balances.`
          : `Transferred ${formatCurrency(amount / 100)} to the simulated card balance.`;
      } catch (error) {
        try {
          if (previousCardRaw === null) localStorage.removeItem(CREDIT_CARD_BALANCE_KEY);
          else localStorage.setItem(CREDIT_CARD_BALANCE_KEY, previousCardRaw);
          if (previousPaperRaw === null) localStorage.removeItem(PAPER_BALANCE_KEY);
          else localStorage.setItem(PAPER_BALANCE_KEY, previousPaperRaw);
          renderPaperSummary();
        } catch (rollbackError) {
          console.error('Credit card transfer rollback failed:', rollbackError);
        }
        status.textContent = `Transfer could not be completed: ${error.message}`;
      } finally {
        submitButton.disabled = false;
      }
    });
  }
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === PAPER_BALANCE_KEY || event.key === REALIZED_PROFIT_KEY || event.key === CREDIT_CARD_BALANCE_KEY) {
      renderPaperSummary();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (mnemonicPhrase || ledgerAddress || hardwareLedgerAddress)) {
      void refreshBalances();
    }
  });
  window.addEventListener('pagehide', () => {
    clearIdleLockTimer();
    if (backupPhraseHideTimer) window.clearTimeout(backupPhraseHideTimer);
    backupPhraseHideTimer = null;
    mnemonicPhrase = null;
    pendingNewPhrase = null;
    pendingPassword = null;
    byId('walletRecoveryWords').replaceChildren();
    byId('walletPhrasePanel').hidden = true;
    if (balanceInterval) clearInterval(balanceInterval);
    if (qrScannerStream) qrScannerStream.getTracks().forEach((track) => track.stop());
    if (hardwareLedgerTransport) {
      void hardwareLedgerTransport.close().catch((error) => {
        console.error('Ledger USB transport could not be closed during page navigation:', error);
      });
      ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
        document.addEventListener(eventName, recordWalletActivity, { passive: true });
      });
      document.addEventListener('visibilitychange', () => {
        if (!mnemonicPhrase) return;
        if (Date.now() - lastWalletActivity >= WALLET_IDLE_LOCK_MS) {
          lockAfterInactivity();
          return;
        }
        if (document.visibilityState === 'visible') scheduleIdleLock();
      });
    }
  });

  try {
    const savedWallet = getSavedWallet();
    renderPaperSummary();
    showWalletAccessGate();
    const isSecureContext = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecureContext || !crypto.subtle) {
      creationControls.forEach((button) => { button.disabled = true; });
      byId('walletRestoreButton').disabled = true;
      setUnlockInputsDisabled(true);
      state.textContent = 'Secure connection required';
      const secureContextMessage = 'Secure browser cryptography requires HTTPS or localhost. Open this wallet over a secure connection.';
      setMessage(secureContextMessage, true);
      byId('walletOnboardingMetaStatus').textContent = secureContextMessage;
      byId('walletOnboardingMetaStatus').classList.add('is-error');
      byId('walletOnboardingMetaStatus').hidden = false;
    } else if (savedWallet) {
      byId('walletCreateButton').hidden = true;
      byId('walletRestoreButton').hidden = true;
      byId('walletUnlockButton').hidden = false;
      state.textContent = 'Wallet locked in this browser';
    } else {
      state.textContent = 'No wallet set up';
    }
  } catch (error) {
    setVaultLockScreen(true);
    byId('walletCreateButton').hidden = true;
    byId('walletRestoreButton').hidden = true;
    setMessage(error.message, true);
  }

  openWalletSetupFromHash();

  if (window.ethereum) void connectMetaMask(false);
  if (navigator.hid && window.isSecureContext) {
    navigator.hid.getDevices().then((devices) => {
      if (!ledgerAddress && !hardwareLedgerAddress && devices.some((device) => device.vendorId === 0x2c97)) {
        byId('walletOnboardingMetaStatus').textContent = 'A previously authorized Ledger device is available. Click Connect Ledger to choose and verify its Ethereum account.';
      }
    }).catch((error) => {
      console.error('Previously authorized Ledger devices could not be detected:', error);
    });
  }
}
