import * as ethers from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import * as solana from '@solana/web3.js';
import QRCode from 'qrcode';
import Eth from '@ledgerhq/hw-app-eth';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';

const WALLET_STORAGE_KEY = 'makingsEncryptedWalletV1';
const KDF_ITERATIONS = 310000;
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
const walletRoot = document.getElementById('cryptoWallet');

if (walletRoot) {
  const byId = (id) => document.getElementById(id);
  const state = byId('cryptoWalletState');
  const message = byId('cryptoWalletMessage');
  const dashboard = byId('walletDashboard');
  const addressList = byId('walletAddressList');
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
  let walletAddresses = {};
  let balanceValues = {};
  let priceData = {};
  let exchangeRates = { USD: 1 };
  let lastPriceRefresh = 0;
  let balanceInterval = null;
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

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('is-error', isError);
  }

  function showOnlyForm(formToShow) {
    forms.forEach((form) => { form.hidden = form !== formToShow; });
    byId('walletPhrasePanel').hidden = true;
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

  async function encryptPhrase(phrase, password) {
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
      const title = document.createElement('strong');
      title.textContent = `${config.name} (${config.symbol})`;
      const address = document.createElement('code');
      address.textContent = walletAddresses[network] || 'Deriving address...';
      address.title = walletAddresses[network] || '';
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
      card.append(title, address, balance, copy);
      addressList.appendChild(card);
    });
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
        cell.textContent = `${config.name}: balance unavailable — refresh to retry.`;
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
    byId('assetCount').textContent = Object.keys(balanceValues).length;
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
    byId('holdingsChange').textContent = 'Refreshing on-chain balances...';
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
    byId('holdingsChange').textContent = `Updated ${new Date().toLocaleTimeString()}${unavailable.length ? `; unavailable: ${unavailable.join(', ')}` : ''}`;
    if (unavailable.length) setMessage(`Some public network services did not respond: ${unavailable.join(', ')}. Retry refresh later.`, true);
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

  byId('walletNftForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!mnemonicPhrase && !ledgerAddress && !hardwareLedgerAddress) {
      setMessage('Unlock the wallet or connect MetaMask or Ledger to check NFT ownership.', true);
      return;
    }
    const network = byId('walletNftNetwork').value;
    const contract = byId('walletNftContract').value.trim();
    const tokenId = byId('walletNftTokenId').value.trim();
    const libraries = await importWalletLibraries();
    if (!libraries.ethers.isAddress(contract) || !/^\d+$/.test(tokenId)) {
      setMessage('Enter a valid ERC-721 contract address and unsigned integer token ID.', true);
      return;
    }
    try {
      const records = getTrackedNfts();
      const exists = records.some((item) => item.network === network
        && item.contract.toLowerCase() === contract.toLowerCase()
        && item.tokenId === tokenId);
      if (!exists) records.push({ network, contract, tokenId });
      localStorage.setItem(NFT_STORAGE_KEY, JSON.stringify(records));
      byId('walletNftContract').value = '';
      byId('walletNftTokenId').value = '';
      await renderTrackedNfts();
    } catch (error) {
      console.error('Could not add tracked NFT:', error);
      setMessage(`Could not track this NFT: ${error.message}`, true);
    }
  });

  byId('walletNftDiscoveryForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    moralisApiKey = byId('walletNftApiKey').value.trim();
    if (!moralisApiKey) {
      byId('walletNftDiscoveryStatus').textContent = 'Enter a Moralis API key to discover NFTs.';
      byId('walletNftDiscoveryStatus').classList.add('is-error');
      return;
    }
    await discoverWalletNfts(moralisApiKey);
  });

  async function unlockWithPhrase(phrase) {
    mnemonicPhrase = phrase;
    onboarding.hidden = true;
    walletAppContent.hidden = false;
    byId('wallet').classList.remove('wallet-onboarding-active');
    state.textContent = 'Wallet unlocked';
    dashboard.hidden = false;
    byId('walletBackupButton').hidden = false;
    byId('walletLockButton').hidden = false;
    byId('walletRefreshButton').hidden = false;
    creationControls.forEach((button) => { button.hidden = true; });
    forms.forEach((form) => { form.hidden = true; });
    byId('walletPhrasePanel').hidden = true;
    setMessage('Deriving addresses. On-chain balances will be queried from public network services.');
    try {
      const unavailableNetworks = await deriveAllAddresses();
      await renderTrackedNfts();
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
    const hasExternalEvmAccount = Boolean(ledgerAddress || hardwareLedgerAddress);
    dashboard.hidden = !hasExternalEvmAccount;
    byId('walletBackupButton').hidden = true;
    byId('walletLockButton').hidden = true;
    byId('walletRefreshButton').hidden = !hasExternalEvmAccount;
    byId('walletUnlockButton').hidden = !getSavedWallet();
    byId('walletCreateButton').hidden = Boolean(getSavedWallet());
    byId('walletRestoreButton').hidden = Boolean(getSavedWallet());
    state.textContent = hardwareLedgerAddress
      ? 'Ledger hardware account connected'
      : ledgerAddress
        ? 'MetaMask account connected'
      : getSavedWallet() ? 'Wallet locked in this browser' : 'No wallet set up';
    byId('holdingsChange').textContent = hardwareLedgerAddress || ledgerAddress
      ? 'External EVM balances active'
      : getSavedWallet() ? 'Wallet locked' : 'Not connected';
    byId('totalHoldingsValue').textContent = '--';
    byId('assetCount').textContent = '0';
    byId('holdingsTableBody').replaceChildren();
    byId('walletNftList').textContent = hasExternalEvmAccount
      ? 'Connect an EVM account to verify tracked NFTs.'
      : 'Unlock the wallet or connect MetaMask or Ledger to verify and display tracked NFTs.';
    byId('walletPhrasePanel').hidden = true;
    byId('walletRecoveryWords').replaceChildren();
    byId('walletBackupForm').reset();
    byId('walletRestoreForm').reset();
    byId('walletUnlockForm').reset();
    if (hasExternalEvmAccount) {
      renderAddresses();
      renderTrackedNfts();
      if (balanceInterval) clearInterval(balanceInterval);
      balanceInterval = setInterval(() => { refreshBalances(); }, 30000);
    }
    if (showMessage) setMessage(hasExternalEvmAccount
      ? 'Recovery-phrase wallet locked. Your connected EVM account remains available.'
      : 'Wallet locked. The encrypted backup remains in this browser.');
  }

  function renderPhrase(phrase, isBackup) {
    const list = byId('walletRecoveryWords');
    list.replaceChildren();
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
      close.addEventListener('click', () => {
        list.replaceChildren();
        byId('walletPhrasePanel').hidden = true;
        setMessage('Recovery phrase hidden.');
      });
      byId('walletPhrasePanel').appendChild(close);
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
      byId('walletConnectLedgerButton').disabled = true;
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
        const canSendEvm = ['ethereum', 'bsc', 'polygon'].includes(byId('walletSendNetwork').value);
        byId('walletUseLedger').disabled = !canSendEvm;
        if (!canSendEvm) byId('walletUseLedger').checked = false;
        status.classList.remove('is-error');
        status.textContent = `MetaMask account connected: ${ledgerAddress}. If this is Ledger-backed, approve transactions on your device; this site cannot verify hardware.`;
        byId('walletConnectLedgerButton').textContent = 'Disconnect MetaMask';
        if (onboardingStatus) {
          onboardingStatus.classList.remove('is-error');
          onboardingStatus.textContent = `MetaMask connected: ${ledgerAddress}`;
        }
        if (!mnemonicPhrase && activateAccount) {
          walletAddresses = { ethereum: ledgerAddress, bsc: ledgerAddress, polygon: ledgerAddress };
          byId('wallet').classList.remove('wallet-onboarding-active');
          state.textContent = 'MetaMask account connected';
          dashboard.hidden = false;
          byId('walletRefreshButton').hidden = false;
          renderAddresses();
          await refreshBalances();
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
        byId('walletConnectLedgerButton').disabled = false;
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

  byId('walletConnectLedgerButton').addEventListener('click', async () => {
    if (ledgerAddress) {
      ledgerAddress = null;
      ledgerProvider = null;
      byId('walletUseLedger').checked = false;
      byId('walletUseLedger').disabled = true;
      byId('walletConnectLedgerButton').textContent = 'Connect MetaMask';
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
    byId('walletConnectHardwareButton').textContent = 'Connect Ledger (USB)';
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

  byId('walletConnectHardwareButton').addEventListener('click', async () => {
    if (hardwareLedgerTransport) {
      await disconnectHardwareLedger();
      return;
    }
    const status = byId('walletHardwareStatus');
    if (!window.isSecureContext || !navigator.hid) {
      status.textContent = 'Direct Ledger USB requires a secure browser context and WebHID support. Try Chrome or Edge over HTTPS, or use MetaMask.';
      status.classList.add('is-error');
      return;
    }
    const button = byId('walletConnectHardwareButton');
    button.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Connect your Ledger, unlock it, and open the Ethereum app. Approve the displayed address on the device.';
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
      byId('walletUseHardwareLedger').disabled = !['ethereum', 'bsc', 'polygon'].includes(byId('walletSendNetwork').value);
      button.textContent = 'Disconnect Ledger';
      status.textContent = `Ledger EVM address verified on-device: ${hardwareLedgerAddress}. Keep the Ethereum app open to sign EVM transactions.`;
      if (!mnemonicPhrase) {
        walletAddresses = { ethereum: hardwareLedgerAddress, bsc: hardwareLedgerAddress, polygon: hardwareLedgerAddress };
        state.textContent = 'Ledger hardware account connected';
        dashboard.hidden = false;
        byId('walletRefreshButton').hidden = false;
        renderAddresses();
        await refreshBalances();
        if (balanceInterval) clearInterval(balanceInterval);
        balanceInterval = setInterval(() => { refreshBalances(); }, 30000);
      }
      await renderTrackedNfts();
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
        byId('walletConnectLedgerButton').textContent = 'Connect MetaMask';
        byId('walletLedgerStatus').textContent = 'MetaMask account changed. Reconnect to use the new account.';
        if (!mnemonicPhrase) lockWallet(false);
      }
    });
  }

  const onboarding = byId('walletOnboarding');
  const walletAppContent = byId('walletAppContent');
  const finishOnboarding = () => {
    onboarding.hidden = true;
    walletAppContent.hidden = false;
  };

  window.addEventListener('hashchange', () => {
    const isFirstVisit = !getSavedWallet();
    if (location.hash === '#wallet' && isFirstVisit) {
      byId('walletOnboardingOptions').hidden = true;
      byId('walletOnboardingWelcome').hidden = false;
      onboarding.hidden = false;
      walletAppContent.hidden = true;
      byId('wallet').classList.add('wallet-onboarding-active');
      requestAnimationFrame(() => walletRoot.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } else if (location.hash !== '#wallet') {
      onboarding.hidden = true;
      walletAppContent.hidden = false;
      byId('wallet').classList.remove('wallet-onboarding-active');
    }
  });

  byId('walletOnboardingNext').addEventListener('click', () => {
    byId('walletOnboardingWelcome').hidden = true;
    byId('walletOnboardingOptions').hidden = false;
    if (window.ethereum) {
      void connectMetaMask(true, false);
    } else {
      void connectMetaMask(false, false);
    }
  });
  byId('walletOnboardingBack').addEventListener('click', () => {
    byId('walletOnboardingOptions').hidden = true;
    byId('walletOnboardingWelcome').hidden = false;
  });
  byId('walletOnboardingCreate').addEventListener('click', () => {
    finishOnboarding();
    showOnlyForm(byId('walletCreateForm'));
    byId('walletCreatePassword').focus();
  });
  byId('walletOnboardingRestore').addEventListener('click', () => {
    finishOnboarding();
    showOnlyForm(byId('walletRestoreForm'));
    byId('walletRestorePhrase').focus();
  });
  byId('walletCreateButton').addEventListener('click', () => showOnlyForm(byId('walletCreateForm')));
  byId('walletRestoreButton').addEventListener('click', () => showOnlyForm(byId('walletRestoreForm')));
  byId('walletUnlockButton').addEventListener('click', () => showOnlyForm(byId('walletUnlockForm')));
  byId('walletBackupButton').addEventListener('click', () => showOnlyForm(byId('walletBackupForm')));
  byId('walletLockButton').addEventListener('click', () => lockWallet());
  document.querySelectorAll('[data-wallet-cancel]').forEach((button) => {
    button.addEventListener('click', () => {
      pendingNewPhrase = null;
      pendingPassword = null;
      byId('walletCreateForm').reset();
      byId('walletPhrasePanel').dataset.password = '';
      byId('walletRecoveryWords').replaceChildren();
      byId('walletPhrasePanel').hidden = true;
      forms.forEach((form) => { form.hidden = true; });
      if (mnemonicPhrase) setMessage('Wallet remains unlocked.');
      else lockWallet(false);
    });
  });

  byId('walletCreateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = byId('walletCreatePassword').value;
    if (password.length < 12 || password !== byId('walletCreatePasswordConfirm').value) {
      setMessage('Use the same wallet password in both fields; it must be at least 12 characters.', true);
      return;
    }
    try {
      const entropy = crypto.getRandomValues(new Uint8Array(16));
      pendingNewPhrase = ethers.Mnemonic.fromEntropy(ethers.hexlify(entropy)).phrase;
      pendingPassword = password;
      byId('walletCreatePassword').value = '';
      byId('walletCreatePasswordConfirm').value = '';
      byId('walletPhrasePanel').dataset.mode = 'create';
      renderPhrase(pendingNewPhrase, false);
      setMessage('Write down these 12 words in order. They are shown only now unless you verify your password to view your backup.');
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
      await encryptPhrase(pendingNewPhrase, password);
      mnemonicPhrase = pendingNewPhrase;
      pendingNewPhrase = null;
      pendingPassword = null;
      byId('walletPhrasePanel').hidden = true;
      await unlockWithPhrase(mnemonicPhrase);
    } catch (error) {
      console.error('Wallet encryption or initialization failed:', error);
      setMessage(`Could not save the encrypted wallet: ${error.message}`, true);
    }
  });

  byId('walletRestoreForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const phrase = byId('walletRestorePhrase').value.trim().toLowerCase().replace(/\s+/g, ' ');
    const password = byId('walletRestorePassword').value;
    if (password.length < 12 || password !== byId('walletRestorePasswordConfirm').value) {
      setMessage('Use the same wallet password in both fields; it must be at least 12 characters.', true);
      return;
    }
    try {
      const mnemonic = ethers.Mnemonic.fromPhrase(phrase);
      if (![12, 15, 18, 21, 24].includes(mnemonic.phrase.split(' ').length)) {
        throw new Error('Use a valid 12-, 15-, 18-, 21-, or 24-word BIP-39 recovery phrase.');
      }
      await encryptPhrase(mnemonic.phrase, password);
      byId('walletRestorePhrase').value = '';
      byId('walletRestorePassword').value = '';
      byId('walletRestorePasswordConfirm').value = '';
      await unlockWithPhrase(mnemonic.phrase);
    } catch (error) {
      console.error('Wallet restore failed:', error);
      setMessage(`Could not restore wallet: ${error.message}`, true);
    }
  });

  byId('walletUnlockForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const phrase = await decryptPhrase(byId('walletUnlockPassword').value);
      byId('walletUnlockPassword').value = '';
      await unlockWithPhrase(phrase);
    } catch (error) {
      console.error('Wallet unlock failed:', error);
      setMessage(error.message, true);
    }
  });

  byId('walletBackupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const phrase = await decryptPhrase(byId('walletBackupPassword').value);
      byId('walletBackupPassword').value = '';
      renderPhrase(phrase, true);
      setMessage('Recovery phrase revealed. Keep it offline and hide it when finished.');
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
  byId('walletRefreshButton')?.addEventListener('click', () => { refreshBalances(); });
  window.addEventListener('pagehide', () => {
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
    }
  });

  try {
    const savedWallet = getSavedWallet();
    const isFirstVisit = !savedWallet
      && location.hash === '#wallet';
    onboarding.hidden = !isFirstVisit;
    walletAppContent.hidden = isFirstVisit;
    byId('wallet').classList.toggle('wallet-onboarding-active', isFirstVisit);
    const isSecureContext = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecureContext || !crypto.subtle) {
      creationControls.forEach((button) => { button.disabled = true; });
      byId('walletRestoreButton').disabled = true;
      byId('walletUnlockButton').disabled = true;
      setMessage('Secure browser cryptography requires HTTPS or localhost. Open this wallet over a secure connection.', true);
    } else if (savedWallet) {
      byId('walletCreateButton').hidden = true;
      byId('walletRestoreButton').hidden = true;
      byId('walletUnlockButton').hidden = false;
      state.textContent = 'Wallet locked in this browser';
    }
    if (window.ethereum && !isFirstVisit) void connectMetaMask(false);
  } catch (error) {
    onboarding.hidden = false;
    walletAppContent.hidden = true;
    byId('wallet').classList.add('wallet-onboarding-active');
    byId('walletCreateButton').hidden = true;
    byId('walletRestoreButton').hidden = true;
    setMessage(error.message, true);
  }
}
