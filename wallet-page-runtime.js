const runtimeElementIds = [
  'currencyLabel',
  'holdingsTableBody',
  'preferredCurrency',
  'totalHoldingsValue',
  'walletPaperBalance',
  'walletRealizedPnl'
];

export async function mountWalletPage(mode) {
  if (!['send', 'receive'].includes(mode)) throw new Error('Unknown wallet page mode.');

  const mount = document.getElementById('walletActionMount');
  const status = document.getElementById('walletActionPageStatus');
  const response = await fetch('treasury.html');
  if (!response.ok) throw new Error('Could not load the BXC Wallet components.');

  const sourceDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
  const sourceWallet = sourceDocument.getElementById('cryptoWallet');
  if (!sourceWallet) throw new Error('The BXC Wallet component is unavailable.');

  const walletSection = document.createElement('section');
  walletSection.id = 'wallet';
  walletSection.className = 'wallet-section section-shell';
  walletSection.setAttribute('aria-label', 'BXC Wallet');

  const wallet = sourceWallet.cloneNode(true);
  const sendSection = wallet.querySelector('#walletSendSection');
  const sendDisclosure = wallet.querySelector('#walletSendDisclosure');
  const receiveSection = wallet.querySelector('#walletReceiveSection');
  const paymentRequestForm = wallet.querySelector('#walletPaymentRequestForm');
  const addressSection = wallet.querySelector('.wallet-addresses');
  if (!sendSection || !sendDisclosure || !receiveSection || !paymentRequestForm || !addressSection) {
    throw new Error('The BXC Wallet controls are incomplete.');
  }

  sendSection.hidden = false;
  sendDisclosure.hidden = mode !== 'send';
  sendDisclosure.open = mode === 'send';
  receiveSection.hidden = mode !== 'receive';
  paymentRequestForm.hidden = mode !== 'receive';
  addressSection.hidden = mode !== 'receive';
  walletSection.append(wallet);

  const runtimeElements = document.createElement('div');
  runtimeElements.className = 'wallet-send-runtime-data';
  runtimeElements.hidden = true;
  runtimeElementIds.forEach((id) => {
    const element = sourceDocument.getElementById(id);
    if (element) runtimeElements.append(element.cloneNode(true));
  });
  walletSection.append(runtimeElements);
  mount.replaceChildren(walletSection);

  await import('./wallet.bundle.js');
  status.hidden = true;
}

const mode = document.body.classList.contains('wallet-receive-page') ? 'receive' : 'send';
mountWalletPage(mode).catch((error) => {
  console.error(`Crypto ${mode} page could not initialize:`, error);
  const status = document.getElementById('walletActionPageStatus');
  status.textContent = `Could not load the BXC Wallet ${mode} form: ${error.message}`;
  status.classList.add('is-error');
});