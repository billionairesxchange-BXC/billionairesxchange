import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const WEBSITE_URL = (process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://billionairesxchange-e8162.web.app').replace(/\/+$/, '');
const SESSION_KEY = 'bxc_wallet_api_session_v1';
const RECOVERY_KEY = 'bxc_wallet_recovery_phrase_v1';
const GOLD = '#d4af37';
const MUTED = '#a9a49a';

type User = { id: string; email: string; name: string };
type Connection = {
  id: string;
  name: string;
  kind: string;
  status: string;
  connected: boolean;
  integrationReady: boolean;
};
type Portfolio = {
  syncReady: boolean;
  connectedProviders: string[];
  assets: Array<{ name?: string; symbol?: string; valueUsd?: number }>;
  totalUsd: number;
  message: string;
};
type Nft = { chain: string; contractAddress: string; tokenId: string; name?: string; imageUrl?: string };
type Dashboard = {
  connections: Connection[];
  portfolio: Portfolio;
  nfts: { assets: Nft[] };
};

async function request<T>(path: string, token?: string, body?: object): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || 'The wallet service could not complete this request.');
  return data as T;
}

function Button({ title, onPress, secondary = false, disabled = false }: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, secureTextEntry = false, keyboardType = 'default', autoComplete }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoComplete?: 'name' | 'email' | 'password' | 'new-password';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
        autoComplete={autoComplete || (secureTextEntry ? 'password' : keyboardType === 'email-address' ? 'email' : 'name')}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

export default function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [screen, setScreen] = useState<'home' | 'scan' | 'wallet' | 'accounts' | 'nfts' | 'treasury'>('home');
  const [busy, setBusy] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedToken, setScannedToken] = useState('');
  const [pairingOrigin, setPairingOrigin] = useState('');
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [walletExists, setWalletExists] = useState(false);
  const [pendingPhrase, setPendingPhrase] = useState('');

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const saved = await SecureStore.getItemAsync(SESSION_KEY);
        if (saved) {
          const profile = await request<User>('/api/mobile/auth/me', saved);
          if (active) {
            setToken(saved);
            setUser(profile);
          }
        }
      } catch {
        await SecureStore.deleteItemAsync(SESSION_KEY);
      } finally {
        if (active) setBusy(false);
      }
    }
    void restoreSession();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadOverview() {
      if (!token) return;
      try {
        const dashboard = await request<Dashboard>('/api/mobile/dashboard', token);
        if (active) {
          setPortfolio(dashboard.portfolio);
          setConnections(dashboard.connections);
          setNfts(dashboard.nfts.assets);
          setStatus('');
        }
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : 'Could not load wallet overview.');
      }
    }
    void loadOverview();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(RECOVERY_KEY)
      .then((phrase) => { if (active) setWalletExists(Boolean(phrase)); })
      .catch(() => { if (active) setStatus('Secure wallet storage is unavailable on this device.'); });
    return () => { active = false; };
  }, []);

  async function signIn() {
    setBusy(true);
    setStatus('');
    try {
      const result = await request<{ token: string; user: User }>('/api/mobile/auth/login', undefined, {
        email,
        password
      });
      await SecureStore.setItemAsync(SESSION_KEY, result.token, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      });
      setToken(result.token);
      setUser(result.user);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function signUp() {
    setBusy(true);
    setStatus('');
    try {
      const result = await request<{ message: string }>('/api/mobile/auth/register', undefined, {
        email,
        name,
        password
      });
      setStatus(result.message);
      setAuthMode('login');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      await request('/api/mobile/auth/logout', token, {});
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not end the server session.');
    } finally {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      setToken('');
      setUser(null);
      setScreen('home');
      setPassword('');
    }
  }

  async function generateWallet() {
    try {
      const entropy = Crypto.getRandomBytes(16);
      setPendingPhrase(entropyToMnemonic(entropy, wordlist));
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create a recovery phrase.');
    }
  }

  async function saveWallet() {
    try {
      await SecureStore.setItemAsync(RECOVERY_KEY, pendingPhrase, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      });
      setPendingPhrase('');
      setWalletExists(true);
      setStatus('Recovery phrase stored on this device. It was not uploaded to BXC servers.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not store the wallet securely.');
    }
  }

  function handleScanned(data: string) {
    if (scannedToken) return;
    let pairingCode = '';
    let origin = '';
    try {
      const url = new URL(data);
      pairingCode = url.searchParams.get('token') || '';
      origin = url.searchParams.get('origin') || '';
      const expectedOrigin = new URL(WEBSITE_URL).origin;
      if (url.protocol !== 'bxcwallet:' || url.hostname !== 'pair'
        || !pairingCode || origin !== expectedOrigin) {
        pairingCode = '';
      }
    } catch {
      pairingCode = '';
    }
    if (!pairingCode) {
      setStatus('That QR code is not a sign-in request from your configured BXC website.');
      return;
    }
    setPairingOrigin(origin);
    setScannedToken(pairingCode);
  }

  async function approvePairing() {
    try {
      const result = await request<{ message: string }>('/api/mobile/pairings/approve', token, {
        token: scannedToken,
        origin: pairingOrigin
      });
      setStatus(result.message);
      setScannedToken('');
      setPairingOrigin('');
      setScreen('home');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not approve website sign-in.');
      setScannedToken('');
      setPairingOrigin('');
    }
  }

  function confirmPairing() {
    Alert.alert(
      'Approve website sign-in?',
      `Sign in to ${pairingOrigin} as ${user?.email}. Only approve this if you just scanned the QR code on a website you trust.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => { setScannedToken(''); setPairingOrigin(''); } },
        { text: 'Approve', onPress: () => { void approvePairing(); } }
      ]
    );
  }

  async function openScanner() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setStatus('Camera permission is required to scan a website sign-in QR code.');
        return;
      }
    }
    setScannedToken('');
    setScreen('scan');
  }

  if (busy && !user) {
    return (
      <SafeAreaView style={styles.loading}>
        <StatusBar style="light" />
        <ActivityIndicator color={GOLD} size="large" />
        <Text style={styles.subtitle}>Opening BXC Wallet…</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>BILLIONAIRESXCHANGE</Text>
          <Text style={styles.logo}>BXC Wallet</Text>
          <Text style={styles.subtitle}>A unified account for your website and mobile wallet.</Text>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
            {authMode === 'signup' && <Field label="Name" value={name} onChangeText={setName} />}
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
            <Field
              label="Password (12+ characters)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={authMode === 'signup' ? 'new-password' : 'password'}
            />
            {status ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{status}</Text> : null}
            <Button
              title={busy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}
              onPress={() => { void (authMode === 'login' ? signIn() : signUp()); }}
              disabled={busy || !email || !password || (authMode === 'signup' && !name)}
            />
            <Button
              title={authMode === 'login' ? 'Create a BXC Wallet account' : 'I already have an account'}
              onPress={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setStatus(''); }}
              secondary
            />
          </View>
          <Text style={styles.disclaimer}>Never share your recovery phrase. BXC will never ask you to send it to support.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>BILLIONAIRESXCHANGE</Text>
            <Text style={styles.logo}>BXC Wallet</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => { void signOut(); }}>
            <Text style={styles.link}>Sign out</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Hello, {user.name}</Text>
        {status ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{status}</Text> : null}

        {screen === 'scan' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Scan website sign-in QR</Text>
            <Text style={styles.body}>Only scan a code you requested from the official BXC website.</Text>
            <View style={styles.cameraFrame}>
              <CameraView
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => handleScanned(data)}
                style={styles.camera}
              />
            </View>
            {scannedToken ? (
              <View style={styles.buttonStack}>
                <Text style={styles.notice}>QR scanned. Review the sign-in confirmation on your device.</Text>
                <Button title="Review and approve sign-in" onPress={confirmPairing} />
                <Button title="Cancel scan" onPress={() => { setScannedToken(''); setPairingOrigin(''); setScreen('home'); }} secondary />
              </View>
            ) : null}
            <Button title="Back" onPress={() => setScreen('home')} secondary />
          </View>
        ) : null}

        {screen === 'home' ? (
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.fieldLabel}>Portfolio value</Text>
              <Text style={styles.balance}>
                {portfolio ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(portfolio.totalUsd) : '—'}
              </Text>
              <Text style={styles.body}>{portfolio?.message || 'Loading portfolio status…'}</Text>
            </View>
            <View style={styles.grid}>
              <Button title="Scan website QR" onPress={() => { void openScanner(); }} />
              <Button title={walletExists ? 'Local wallet ready' : 'Create BXC Wallet'} onPress={() => setScreen('wallet')} secondary />
              <Button title="Manage trading accounts" onPress={() => setScreen('accounts')} secondary />
              <Button title="NFT collection" onPress={() => setScreen('nfts')} secondary />
              <Button title="Treasury services" onPress={() => setScreen('treasury')} secondary />
            </View>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Connected accounts</Text>
              <Text style={styles.body}>{connections.filter((connection) => connection.connected).length} linked accounts</Text>
              <Text style={styles.muted}>Provider authorization and live balance sync are not yet configured.</Text>
            </View>
          </>
        ) : null}

        {screen === 'wallet' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>On-device wallet</Text>
            <Text style={styles.body}>
              {walletExists
                ? 'A recovery phrase is stored in this device’s OS-protected secure storage.'
                : 'Create a recovery phrase on this device. It is never sent to the BXC server.'}
            </Text>
            {pendingPhrase ? (
              <>
                <Text style={styles.warning}>Write this phrase down and keep it private. Anyone with it can control the wallet.</Text>
                <View style={styles.words}>
                  {pendingPhrase.split(' ').map((word, index) => (
                    <Text key={`${word}-${index}`} style={styles.word}>{index + 1}. {word}</Text>
                  ))}
                </View>
                <Button title="I saved my recovery phrase" onPress={() => { void saveWallet(); }} />
                <Button title="Discard phrase" onPress={() => setPendingPhrase('')} secondary />
              </>
            ) : walletExists ? (
              <Text style={styles.success}>BXC Wallet is set up on this device.</Text>
            ) : (
              <Button title="Generate recovery phrase" onPress={() => { void generateWallet(); }} />
            )}
            <Button title="Back to overview" onPress={() => setScreen('home')} secondary />
          </View>
        ) : null}

        {screen === 'accounts' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Trading accounts</Text>
            <Text style={styles.body}>Connections remain off until provider OAuth and secure credential storage are configured.</Text>
            {connections.map((connection) => (
              <View key={connection.id} style={styles.listRow}>
                <View>
                  <Text style={styles.rowTitle}>{connection.name}</Text>
                  <Text style={styles.muted}>{connection.kind} · {connection.status.replaceAll('_', ' ')}</Text>
                </View>
                <Text style={styles.pending}>Not ready</Text>
              </View>
            ))}
            <Button title="Back to overview" onPress={() => setScreen('home')} secondary />
          </View>
        ) : null}

        {screen === 'nfts' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>NFT collection</Text>
            {nfts.length ? nfts.map((item) => (
              <View key={`${item.chain}-${item.contractAddress}-${item.tokenId}`} style={styles.listRow}>
                <Text style={styles.rowTitle}>{item.name || `Token #${item.tokenId}`}</Text>
                <Text style={styles.muted}>{item.chain}</Text>
              </View>
            )) : <Text style={styles.body}>No NFTs are connected. Wallet NFT discovery is not configured yet.</Text>}
            <Button title="Back to overview" onPress={() => setScreen('home')} secondary />
          </View>
        ) : null}

        {screen === 'treasury' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Treasury services</Text>
            <Text style={styles.body}>Open an existing BXC treasury function. These actions continue on the website.</Text>
            {[
              ['Deposit', 'deposit.html'],
              ['Withdraw', 'withdraw.html'],
              ['Transfer', 'transfer.html'],
              ['Send crypto', 'send.html'],
              ['Pay bills', 'pay-bills.html'],
              ['Investment Center', 'investment.html'],
              ['Trade and positions', 'trade.html'],
              ['Activity history', 'profile.html'],
              ['Shop', 'shop.html'],
              ['Vault', 'vault.html'],
              ['Insurance', 'insurance.html'],
              ['Mortgage', 'mortgage.html']
            ].map(([label, path]) => (
              <Pressable
                accessibilityRole="link"
                key={path}
                onPress={() => {
                  void Linking.openURL(`${WEBSITE_URL}/${path}`);
                }}
                style={styles.listRow}
              >
                <Text style={styles.rowTitle}>{label}</Text>
                <Text style={styles.link}>Open website ›</Text>
              </Pressable>
            ))}
            <Button title="Back to overview" onPress={() => setScreen('home')} secondary />
          </View>
        ) : null}
        <Text style={styles.footer}>Demo shell · No trading provider is connected · Never share your recovery phrase.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080808' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#080808' },
  content: { width: '100%', maxWidth: 700, alignSelf: 'center', padding: 20, paddingBottom: 36, gap: 16 },
  authContent: { width: '100%', maxWidth: 520, alignSelf: 'center', justifyContent: 'center', flexGrow: 1, padding: 20, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: GOLD, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  logo: { color: '#f7f4ea', fontSize: 27, fontWeight: '800', marginTop: 5 },
  subtitle: { color: MUTED, fontSize: 14, lineHeight: 21 },
  panel: { borderColor: 'rgba(212,175,55,.32)', borderWidth: 1, borderRadius: 14, padding: 17, backgroundColor: '#111', gap: 13 },
  panelTitle: { color: '#f7f4ea', fontWeight: '800', fontSize: 18 },
  field: { gap: 7 },
  fieldLabel: { color: '#d8d0bd', fontSize: 12, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderColor: 'rgba(212,175,55,.33)', borderRadius: 9, backgroundColor: '#090909', color: '#fff', paddingHorizontal: 12, fontSize: 15 },
  button: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 9, backgroundColor: GOLD },
  buttonSecondary: { backgroundColor: '#191919', borderWidth: 1, borderColor: 'rgba(212,175,55,.42)' },
  buttonText: { color: '#101010', fontSize: 14, fontWeight: '800' },
  buttonTextSecondary: { color: '#f1df9b' },
  disabled: { opacity: 0.48 },
  buttonStack: { gap: 10 },
  balanceCard: { gap: 8, padding: 20, borderWidth: 1, borderRadius: 14, borderColor: GOLD, backgroundColor: '#12110e' },
  balance: { color: '#f6e6a9', fontSize: 32, fontWeight: '800' },
  body: { color: '#c9c4b8', fontSize: 13, lineHeight: 19 },
  muted: { color: MUTED, fontSize: 11, lineHeight: 17 },
  notice: { color: '#f2d889', fontSize: 13, lineHeight: 19 },
  warning: { color: '#ffb570', fontSize: 13, lineHeight: 19 },
  success: { color: '#74d9aa', fontSize: 14, fontWeight: '700' },
  pending: { color: '#d7c283', fontSize: 11, fontWeight: '700' },
  link: { color: '#f3d66f', fontSize: 13, fontWeight: '700' },
  grid: { gap: 10 },
  listRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopColor: 'rgba(212,175,55,.14)', borderTopWidth: 1, paddingVertical: 10 },
  rowTitle: { color: '#f6f3ea', fontSize: 14, fontWeight: '700' },
  cameraFrame: { height: 340, overflow: 'hidden', borderRadius: 12, backgroundColor: '#000' },
  camera: { flex: 1 },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  word: { minWidth: '30%', padding: 8, borderRadius: 7, backgroundColor: '#080808', color: '#f4e6b7', fontSize: 12 },
  disclaimer: { color: MUTED, fontSize: 11, textAlign: 'center', lineHeight: 17 },
  footer: { color: '#827d72', fontSize: 10, textAlign: 'center', marginTop: 8 }
});
