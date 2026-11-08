const WALLET_STORAGE_KEY = 'makingsEncryptedWalletV1';
const KDF_ITERATIONS = 310000;

function readWalletRecord() {
  let record;
  try {
    const saved = localStorage.getItem(WALLET_STORAGE_KEY);
    if (!saved) throw new Error('No wallet has been created in this browser.');
    record = JSON.parse(saved);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('The saved wallet data is damaged.');
    throw error;
  }

  if (!record || record.version !== 1 || record.kdf !== 'PBKDF2-SHA256'
    || record.iterations !== KDF_ITERATIONS || record.cipher !== 'AES-256-GCM'
    || typeof record.salt !== 'string' || typeof record.iv !== 'string'
    || typeof record.ciphertext !== 'string') {
    throw new Error('The saved wallet data is damaged or uses an unsupported format.');
  }
  return record;
}

function decodeBase64(value) {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch (error) {
    throw new Error(`The saved wallet data is damaged: ${error.message}`);
  }
}

export function getWalletCredentialInfo() {
  const record = readWalletRecord();
  return { type: record.credentialType === 'pin' ? 'pin' : 'password' };
}

export async function verifyWalletCredential(credential) {
  const record = readWalletRecord();
  if (typeof credential !== 'string' || !credential) return false;
  if (record.credentialType === 'pin' && !/^\d{4,8}$/.test(credential)) return false;

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(credential),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: decodeBase64(record.salt), iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  try {
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64(record.iv) },
      key,
      decodeBase64(record.ciphertext)
    );
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'OperationError') return false;
    throw error;
  }
}
