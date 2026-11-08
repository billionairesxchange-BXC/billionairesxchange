const NFT_STORAGE_KEY = 'makingsTrackedNftsV1';
const nftNetworks = {
  ethereum: {
    name: 'Ethereum',
    chain: 'eth',
    rpc: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io/address/'
  },
  bsc: {
    name: 'BNB Smart Chain',
    chain: 'bsc',
    rpc: 'https://bsc-rpc.publicnode.com',
    explorer: 'https://bscscan.com/address/'
  },
  polygon: {
    name: 'Polygon',
    chain: 'polygon',
    rpc: 'https://polygon.drpc.org',
    explorer: 'https://polygonscan.com/address/'
  },
  solana: {
    name: 'Solana',
    explorer: 'https://explorer.solana.com/address/'
  }
};
const nftContractAbi = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)'
];
const discoveryForm = document.getElementById('walletNftDiscoveryForm');
const discoveryStatus = document.getElementById('walletNftDiscoveryStatus');
const discoveryList = document.getElementById('walletNftDiscoveryList');
const trackedList = document.getElementById('walletNftList');
const addTrackedForm = document.getElementById('walletNftForm');
const solanaConnectButton = document.getElementById('walletNftSolanaConnect');
const solanaStatus = document.getElementById('walletNftSolanaStatus');
let connectedSolanaAddress = '';

function getEvmNetworks() {
  return Object.entries(nftNetworks).filter(([network]) => network !== 'solana');
}

function connectedAccount() {
  const accounts = window.ethereum?.selectedAddress;
  return typeof accounts === 'string' && accounts ? accounts : '';
}

function readTrackedNfts() {
  const parsed = JSON.parse(localStorage.getItem(NFT_STORAGE_KEY) || '[]');
  if (!Array.isArray(parsed)) throw new Error('Saved NFT list is invalid.');
  return parsed.filter((record) => record
    && Object.hasOwn(nftNetworks, record.network)
    && typeof record.contract === 'string'
    && typeof record.tokenId === 'string');
}

function metadataFrom(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function resolveMetadataUrl(value) {
  if (typeof value !== 'string') return '';
  if (value.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${value.slice(7).replace(/^ipfs\//, '')}`;
  if (/^https:\/\//i.test(value)) return value;
  return '';
}

function createNftCard({ name, details, image, contract, network, tokenId }) {
  const card = document.createElement('article');
  card.className = 'wallet-nft-card';
  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = name || 'NFT image';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    card.appendChild(img);
  }
  const title = document.createElement('strong');
  title.textContent = name || `Token #${tokenId}`;
  const description = document.createElement('span');
  description.textContent = details || `${nftNetworks[network].name} · #${tokenId}`;
  if (contract) {
    const link = document.createElement('a');
    link.href = `${nftNetworks[network].explorer}${encodeURIComponent(contract)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View contract';
    card.appendChild(link);
  }
  card.prepend(title);
  card.appendChild(description);
  return card;
}

function addRemoveButton(card, record) {
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn btn-ghost';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    try {
      const remaining = readTrackedNfts().filter((item) => !(item.network === record.network
        && item.contract.toLowerCase() === record.contract.toLowerCase()
        && item.tokenId === record.tokenId));
      localStorage.setItem(NFT_STORAGE_KEY, JSON.stringify(remaining));
      void renderTrackedNfts();
    } catch (error) {
      card.textContent = `Could not remove tracked NFT: ${error.message}`;
      card.classList.add('is-error');
    }
  });
  card.appendChild(removeButton);
}

async function moralisFetch(url, apiKey) {
  const response = await fetch(url, { headers: { 'X-API-Key': apiKey } });
  if (response.status === 429) throw new Error('Moralis rate limit reached. Wait before trying again.');
  if (!response.ok) throw new Error(`Moralis returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.result)) throw new Error('Moralis returned an invalid NFT response.');
  return {
    items: payload.result,
    cursor: typeof payload.cursor === 'string' ? payload.cursor : ''
  };
}

discoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const address = connectedAccount();
  const apiKey = document.getElementById('walletNftApiKey').value.trim();
  const button = document.getElementById('walletNftDiscoverButton');
  if (!address && !connectedSolanaAddress) {
    discoveryStatus.textContent = 'Connect an EVM wallet above or a Solana wallet below before discovering NFTs.';
    discoveryStatus.classList.add('is-error');
    return;
  }
  if (!apiKey) {
    discoveryStatus.textContent = 'Enter a Moralis API key to discover NFTs.';
    discoveryStatus.classList.add('is-error');
    return;
  }
  button.disabled = true;
  discoveryList.replaceChildren();
  discoveryStatus.classList.remove('is-error');
  discoveryStatus.textContent = 'Searching Ethereum, BNB Smart Chain, and Polygon for NFTs…';
  const requests = (address ? getEvmNetworks() : []).map(([network, config]) => ({
    network,
    load: async () => {
      const items = [];
      let cursor = '';
      let page = 0;
      do {
        const url = new URL(`https://deep-index.moralis.io/api/v2.2/${encodeURIComponent(address)}/nft`);
        url.searchParams.set('chain', config.chain);
        url.searchParams.set('format', 'decimal');
        url.searchParams.set('limit', '100');
        url.searchParams.set('exclude_spam', 'true');
        url.searchParams.set('normalizeMetadata', 'true');
        if (cursor) url.searchParams.set('cursor', cursor);
        const result = await moralisFetch(url, apiKey);
        items.push(...result.items);
        cursor = result.cursor;
        page += 1;
      } while (cursor && page < 10);
      return { network, items };
    }
  }));
  if (connectedSolanaAddress) {
    requests.push({
      network: 'solana',
      load: async () => {
        const url = new URL(`https://solana-gateway.moralis.io/account/mainnet/${encodeURIComponent(connectedSolanaAddress)}/nft`);
        url.searchParams.set('nftMetadata', 'true');
        url.searchParams.set('mediaItems', 'true');
        url.searchParams.set('excludeSpam', 'true');
        url.searchParams.set('includeFungibleAssets', 'false');
        const response = await fetch(url, { headers: { 'X-API-Key': apiKey } });
        if (response.status === 429) throw new Error('Moralis rate limit reached. Wait before trying again.');
        if (!response.ok) throw new Error(`Moralis returned HTTP ${response.status}.`);
        const items = await response.json();
        if (!Array.isArray(items)) throw new Error('Moralis returned an invalid Solana NFT response.');
        return { network: 'solana', items };
      }
    });
  }
  const results = await Promise.allSettled(requests.map(({ load }) => load()));
  let total = 0;
  const failures = [];
  results.forEach((result, index) => {
    const network = requests[index].network;
    if (result.status === 'rejected') {
      failures.push(`${nftNetworks[network].name}: ${result.reason.message || 'Lookup failed.'}`);
      return;
    }
    const { items } = result.value;
    total += items.length;
    if (!items.length) return;
    const heading = document.createElement('h5');
    heading.className = 'wallet-nft-network-heading';
    heading.textContent = `${nftNetworks[network].name} (${items.length})`;
    discoveryList.appendChild(heading);
    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const metadata = metadataFrom(item.normalized_metadata || item.metadata);
      const tokenId = String(item.token_id || item.tokenId || item.mint || item.mintAddress || '');
      discoveryList.appendChild(createNftCard({
        name: item.name || metadata.name,
        details: `${network === 'solana' ? 'Mint' : 'Token'} #${tokenId || 'unknown'} · ${item.symbol || 'NFT'}`,
        image: resolveMetadataUrl(metadata.image || item.image || item.media?.[0]?.original_url),
        contract: item.token_address || item.tokenAddress || item.mint || item.mintAddress || '',
        network,
        tokenId
      }));
    });

    solanaConnectButton.addEventListener('click', async () => {
      if (!window.solana?.connect) {
        solanaStatus.textContent = 'No compatible Solana wallet found. Install Phantom or another Solana browser wallet.';
        solanaStatus.classList.add('is-error');
        return;
      }
      solanaConnectButton.disabled = true;
      try {
        const connection = await window.solana.connect();
        connectedSolanaAddress = connection.publicKey?.toString() || '';
        if (!connectedSolanaAddress) throw new Error('The Solana wallet did not return an account.');
        solanaStatus.classList.remove('is-error');
        solanaStatus.textContent = `Solana wallet connected: ${connectedSolanaAddress}`;
      } catch (error) {
        solanaStatus.textContent = error.code === 4001
          ? 'Solana wallet connection was rejected.'
          : `Could not connect Solana wallet: ${error.message}`;
        solanaStatus.classList.add('is-error');
      } finally {
        solanaConnectButton.disabled = false;
      }
    });
  });
  discoveryStatus.textContent = `${total} NFT${total === 1 ? '' : 's'} found${failures.length ? `; ${failures.join('; ')}` : ''}.`;
  discoveryStatus.classList.toggle('is-error', failures.length > 0);
  button.disabled = false;
});

async function renderTrackedNfts() {
  trackedList.replaceChildren();
  const address = connectedAccount();
  let records;
  try {
    records = readTrackedNfts();
  } catch (error) {
    trackedList.textContent = error.message;
    return;
  }
  if (!address) {
    trackedList.textContent = 'Connect your EVM wallet above to verify tracked NFTs.';
    return;
  }
  if (!records.length) {
    trackedList.textContent = 'No tracked NFTs. Add an ERC-721 contract and token ID above.';
    return;
  }
  let libraries;
  try {
    libraries = await import('https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm');
  } catch (error) {
    trackedList.textContent = `NFT verification library could not be loaded: ${error.message}`;
    return;
  }
  const { Contract, JsonRpcProvider, isAddress } = libraries;
  await Promise.all(records.map(async (record) => {
    const card = document.createElement('article');
    card.className = 'wallet-nft-card';
    card.textContent = `Checking ${nftNetworks[record.network].name} token #${record.tokenId}…`;
    trackedList.appendChild(card);
    try {
      if (!isAddress(record.contract)) throw new Error('Invalid contract address.');
      const provider = new JsonRpcProvider(nftNetworks[record.network].rpc);
      const contract = new Contract(record.contract, nftContractAbi, provider);
      const owner = await contract.ownerOf(record.tokenId);
      if (owner.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`Connected account does not own this token (owner: ${owner}).`);
      }
      const uri = await contract.tokenURI(record.tokenId);
      let metadata;
      if (uri.startsWith('data:application/json')) {
        const [header, data] = uri.split(',', 2);
        const decoded = header.includes(';base64')
          ? new TextDecoder().decode(Uint8Array.from(atob(data), (character) => character.charCodeAt(0)))
          : decodeURIComponent(data);
        metadata = JSON.parse(decoded);
      } else {
        const metadataUrl = resolveMetadataUrl(uri);
        if (!metadataUrl) throw new Error('Unsupported token metadata URI.');
        const metadataResponse = await fetch(metadataUrl);
        if (!metadataResponse.ok) throw new Error(`Token metadata returned HTTP ${metadataResponse.status}.`);
        metadata = await metadataResponse.json();
      }
      const image = resolveMetadataUrl(metadata.image);
      const verifiedCard = createNftCard({
        name: metadata.name,
        details: `${nftNetworks[record.network].name} · #${record.tokenId}`,
        image,
        contract: record.contract,
        network: record.network,
        tokenId: record.tokenId
      });
      addRemoveButton(verifiedCard, record);
      card.replaceWith(verifiedCard);
    } catch (error) {
      card.textContent = `${nftNetworks[record.network].name} #${record.tokenId}: ${error.message}`;
      card.classList.add('is-error');
      addRemoveButton(card, record);
    }
  }));
}

addTrackedForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!connectedAccount()) {
    document.getElementById('walletNftList').textContent = 'Connect your EVM wallet above before tracking NFTs.';
    return;
  }
  const network = document.getElementById('walletNftNetwork').value;
  const contract = document.getElementById('walletNftContract').value.trim();
  const tokenId = document.getElementById('walletNftTokenId').value.trim();
  const { isAddress } = await import('https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm');
  if (!isAddress(contract) || !/^\d+$/.test(tokenId)) {
    document.getElementById('walletNftList').textContent = 'Enter a valid ERC-721 contract address and unsigned integer token ID.';
    return;
  }
  try {
    const records = readTrackedNfts();
    const exists = records.some((record) => record.network === network
      && record.contract.toLowerCase() === contract.toLowerCase()
      && record.tokenId === tokenId);
    if (!exists) records.push({ network, contract, tokenId });
    localStorage.setItem(NFT_STORAGE_KEY, JSON.stringify(records));
    document.getElementById('walletNftContract').value = '';
    document.getElementById('walletNftTokenId').value = '';
    await renderTrackedNfts();
  } catch (error) {
    document.getElementById('walletNftList').textContent = `Could not track this NFT: ${error.message}`;
  }
});

window.addEventListener('ethereum#initialized', renderTrackedNfts, { once: true });
window.ethereum?.on?.('accountsChanged', renderTrackedNfts);
renderTrackedNfts().catch((error) => {
  trackedList.textContent = `Could not load tracked NFTs: ${error.message}`;
});
