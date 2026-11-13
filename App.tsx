import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
const UI_PREVIEW = process.env.EXPO_PUBLIC_UI_PREVIEW === 'true';
const SESSION_KEY = 'bxc_wallet_api_session_v1';
const GOLD = '#4F8CFF';
const MUTED = '#A9B6CA';

type Screen = 'home' | 'market' | 'activity' | 'profile' | 'scan' | 'wallet' | 'accounts' | 'nfts' | 'treasury' | 'trade' | 'bot' | 'shop' | 'investments';
type DataState = 'idle' | 'loading' | 'error' | 'empty' | 'data';

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

type TradeInstrument = { symbol: string; name?: string; status: string };
type BotSummary = {
  id: string;
  status: string;
  optIn: boolean;
  riskLimits: Record<string, number>;
  settings: Record<string, unknown>;
};
type CatalogItem = { id: string; name: string; description?: string };
type WalletSummary = {
  account: { id: string; email: string; name: string };
  balances: Array<{ symbol: string; amount: number; valueUsd?: number }>;
  dataStatus: string;
};

async function request<T>(path: string, token?: string, body?: object, method?: 'POST' | 'PUT'): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: method || (body ? 'POST' : 'GET'),
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
  const [screen, setScreen] = useState<Screen>('home');
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
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [featureDataState, setFeatureDataState] = useState<DataState>('idle');
  const [featureError, setFeatureError] = useState('');
  const [featureRefresh, setFeatureRefresh] = useState(0);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [accountLinkStatus, setAccountLinkStatus] = useState('not available');
  const [instruments, setInstruments] = useState<TradeInstrument[]>([]);
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [shopItems, setShopItems] = useState<CatalogItem[]>([]);
  const [investmentItems, setInvestmentItems] = useState<CatalogItem[]>([]);
  const [maxOrderUsd, setMaxOrderUsd] = useState('100');
  const [maxDailyLossUsd, setMaxDailyLossUsd] = useState('50');
  const [maxOpenOrders, setMaxOpenOrders] = useState('1');
  const [botOptIn, setBotOptIn] = useState(false);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      if (UI_PREVIEW) {
        if (active) {
          setUser({ id: 'ui-preview', email: 'preview@invalid.local', name: 'Preview User' });
          setBusy(false);
        }
        return;
      }
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
      if (!token || UI_PREVIEW) return;
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
    const supportedScreens: Screen[] = ['wallet', 'trade', 'bot', 'shop', 'investments'];
    if (!supportedScreens.includes(screen)) return () => { active = false; };
    setFeatureDataState('loading');
    setFeatureError('');
    if (UI_PREVIEW) {
      setFeatureDataState('empty');
      return () => { active = false; };
    }
    if (!token) {
      setFeatureDataState('error');
      setFeatureError('Sign in to load approved BXC account data.');
      return () => { active = false; };
    }

    async function loadFeature() {
      try {
        if (screen === 'wallet') {
          const [summary, session] = await Promise.all([
            request<WalletSummary>('/api/mobile/wallet/summary', token),
            request<{ accountLinkStatus: string }>('/api/mobile/session', token)
          ]);
          if (active) {
            setWalletSummary(summary);
            setAccountLinkStatus(session.accountLinkStatus);
            setFeatureDataState(summary.balances.length ? 'data' : 'empty');
          }
        } else if (screen === 'trade') {
          const result = await request<{ instruments: TradeInstrument[]; dataStatus: string }>('/api/mobile/trade/instruments', token);
          if (active) {
            setInstruments(result.instruments);
            setFeatureDataState(result.instruments.length ? 'data' : 'empty');
          }
        } else if (screen === 'bot') {
          const result = await request<{ bots: BotSummary[] }>('/api/mobile/bots', token);
          if (active) {
            setBots(result.bots);
            if (result.bots[0]) {
              setBotOptIn(result.bots[0].optIn);
              setMaxOrderUsd(String(result.bots[0].riskLimits.maxOrderUsd || 100));
              setMaxDailyLossUsd(String(result.bots[0].riskLimits.maxDailyLossUsd || 50));
              setMaxOpenOrders(String(result.bots[0].riskLimits.maxOpenOrders || 1));
            }
            setFeatureDataState(result.bots.length ? 'data' : 'empty');
          }
        } else if (screen === 'shop') {
          const result = await request<{ items: CatalogItem[] }>('/api/mobile/shop/catalog', token);
          if (active) {
            setShopItems(result.items);
            setFeatureDataState(result.items.length ? 'data' : 'empty');
          }
        } else {
          const result = await request<{ items: CatalogItem[] }>('/api/mobile/investments', token);
          if (active) {
            setInvestmentItems(result.items);
            setFeatureDataState(result.items.length ? 'data' : 'empty');
          }
        }
      } catch (error) {
        if (active) {
          setFeatureError(error instanceof Error ? error.message : 'Could not load approved feature data.');
          setFeatureDataState('error');
        }
      }
    }
    void loadFeature();
    return () => { active = false; };
  }, [featureRefresh, screen, token]);

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
    if (UI_PREVIEW) {
      setStatus('Website sign-in requires the BXC mobile API and is unavailable in this UI preview.');
      return;
    }
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

  function formatUsd(value: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  async function submitDemoOrder(instrument: TradeInstrument, side: 'BUY' | 'SELL') {
    try {
      await request('/api/mobile/trade/orders', token, {
        instrument: instrument.symbol,
        side,
        quantity: 1,
        orderType: 'MARKET',
        mode: 'demo'
      });
      setStatus(`Demo-only ${side.toLowerCase()} simulation recorded for ${instrument.symbol}. No live order was sent.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not record the demo order.');
    }
  }

  function getRiskLimits() {
    const riskLimits = {
      maxOrderUsd: Number(maxOrderUsd),
      maxDailyLossUsd: Number(maxDailyLossUsd),
      maxOpenOrders: Number(maxOpenOrders)
    };
    if (Object.values(riskLimits).some((value) => !Number.isFinite(value) || value <= 0)
      || !Number.isInteger(riskLimits.maxOpenOrders)) {
      throw new Error('Enter positive risk limits. Maximum open orders must be a whole number.');
    }
    return riskLimits;
  }

  async function saveBotConfiguration() {
    try {
      const botId = bots[0]?.id || Crypto.randomUUID();
      const result = await request<{ bot: BotSummary }>(`/api/mobile/bots/${botId}/config`, token, {
        riskLimits: getRiskLimits(),
        settings: { optIn: botOptIn }
      }, 'PUT');
      setBots([result.bot]);
      setStatus('Bot risk limits saved. Simulation remains off until you explicitly opt in and activate it.');
      setFeatureRefresh((count) => count + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save bot risk limits.');
    }
  }

  async function activateBot() {
    try {
      if (!botOptIn) throw new Error('Turn on explicit demo opt-in before activation.');
      const riskLimits = getRiskLimits();
      const botId = bots[0]?.id;
      if (!botId) throw new Error('Save risk limits before activating the demo bot.');
      await request(`/api/mobile/bots/${botId}/activation`, token, { optIn: true, riskLimits, mode: 'demo' });
      setStatus('Demo bot activated. It can only simulate paper orders.');
      setFeatureRefresh((count) => count + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not activate the demo bot.');
    }
  }

  async function pauseBot() {
    const botId = bots[0]?.id;
    if (!botId) return;
    try {
      await request(`/api/mobile/bots/${botId}/stop`, token, { action: 'pause' });
      setStatus('Bot simulation paused.');
      setFeatureRefresh((count) => count + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not pause the bot.');
    }
  }

  function retryFeatureData() {
    setFeatureRefresh((count) => count + 1);
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => setScreen('home')} style={styles.brand}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>B</Text></View>
            <View>
              <Text style={styles.brandTitle}>BXC Wallet</Text>
              <Text style={styles.brandSubtitle}>BILLIONAIRESXCHANGE</Text>
            </View>
          </Pressable>
          <View style={styles.headerActions}>
            {UI_PREVIEW ? <Text style={styles.previewBadge}>PREVIEW</Text> : null}
            <Pressable
              accessibilityLabel="Open profile"
              accessibilityRole="button"
              onPress={() => setScreen('profile')}
              style={styles.headerIconButton}
            >
              <Text style={styles.headerIconText}>●</Text>
            </Pressable>
          </View>
        </View>
        {UI_PREVIEW ? (
          <Text style={styles.previewNotice}>
            Preview mode · connect to the BXC service to see live wallet data.
          </Text>
        ) : null}
        {status ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{status}</Text> : null}

        {screen === 'scan' ? (
          <View style={styles.pageSection}>
            <Pressable onPress={() => setScreen('home')} style={styles.backButton}>
              <Text style={styles.backButtonText}>‹  Wallet</Text>
            </Pressable>
            <Text style={styles.pageTitle}>Connect to BXC</Text>
            <Text style={styles.body}>Scan a sign-in code from the BXC website. Only approve requests you started.</Text>
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
            <View style={styles.welcomeRow}>
              <View>
                <Text style={styles.greeting}>Good day, {user.name.split(' ')[0]}</Text>
                <Text style={styles.muted}>Your wallet at a glance</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => { void openScanner(); }} style={styles.connectButton}>
                <Text style={styles.connectButtonIcon}>⌁</Text>
                <Text style={styles.connectButtonText}>Connect</Text>
              </Pressable>
            </View>

            <View style={styles.balanceCard}>
              <View style={styles.balanceTopRow}>
                <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
                <Pressable
                  accessibilityLabel={balanceVisible ? 'Hide balance' : 'Show balance'}
                  accessibilityRole="button"
                  onPress={() => setBalanceVisible((visible) => !visible)}
                  style={styles.balanceEye}
                >
                  <Text style={styles.balanceEyeText}>{balanceVisible ? '◉' : '◎'}</Text>
                </Pressable>
              </View>
              <Text style={styles.balance}>
                {balanceVisible && portfolio ? formatUsd(portfolio.totalUsd) : balanceVisible ? '—' : '••••••'}
              </Text>
              <View style={styles.balanceBottomRow}>
                <View style={styles.balanceStatusDot} />
                <Text style={styles.balanceFootnote}>
                  {UI_PREVIEW ? 'Live balance unavailable in preview' : portfolio?.message || 'Connect an account to see your balance'}
                </Text>
              </View>
            </View>

            <View style={styles.quickActions}>
              {[
                { icon: '↑', label: 'Send', onPress: () => { void openWebsitePage('send.html'); } },
                { icon: '↓', label: 'Receive', onPress: () => setStatus('Wallet receive addresses are not available yet.') },
                { icon: '+', label: 'Buy', onPress: () => { void openWebsitePage('deposit.html'); } },
                { icon: '⇄', label: 'Swap', onPress: () => { void openWebsitePage('trade.html'); } }
              ].map((action) => (
                <Pressable
                  accessibilityRole="button"
                  key={action.label}
                  onPress={action.onPress}
                  style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
                >
                  <View style={styles.quickActionIcon}><Text style={styles.quickActionGlyph}>{action.icon}</Text></View>
                  <Text style={styles.quickActionLabel}>{action.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>My assets</Text>
              <Pressable accessibilityRole="button" onPress={() => setScreen('accounts')}>
                <Text style={styles.sectionLink}>Manage</Text>
              </Pressable>
            </View>
            <View style={styles.assetCard}>
              {!portfolio?.assets.length ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyStateIcon}><Text style={styles.emptyStateGlyph}>◈</Text></View>
                  <Text style={styles.emptyStateTitle}>Your assets live here</Text>
                  <Text style={styles.emptyStateBody}>
                    Connect an account to see your coins and balances in one place.
                  </Text>
                  <Pressable accessibilityRole="button" onPress={() => setScreen('accounts')} style={styles.outlineAction}>
                    <Text style={styles.outlineActionText}>Connect an account</Text>
                  </Pressable>
                </View>
              ) : portfolio.assets.map((asset, index) => (
                <View key={`${asset.symbol || asset.name || 'asset'}-${index}`} style={styles.assetRow}>
                  <View style={styles.assetIcon}>
                    <Text style={styles.assetIconText}>{(asset.symbol || asset.name || '?').slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.assetInfo}>
                    <Text style={styles.rowTitle}>{asset.name || asset.symbol || 'Asset'}</Text>
                    <Text style={styles.muted}>{asset.symbol || 'Portfolio asset'}</Text>
                  </View>
                  <Text style={styles.assetValue}>{typeof asset.valueUsd === 'number' ? formatUsd(asset.valueUsd) : '—'}</Text>
                </View>
              ))}
            </View>

            <View style={styles.investmentCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.investmentEyebrow}>GROW YOUR PORTFOLIO</Text>
                  <Text style={styles.investmentTitle}>Investment center</Text>
                </View>
                <View style={styles.investmentBadge}><Text style={styles.investmentBadgeText}>BXC</Text></View>
              </View>
              <Text style={styles.investmentBody}>Explore markets, discover opportunities, and manage your BXC investments.</Text>
              <Pressable accessibilityRole="button" onPress={() => { void openWebsitePage('investment.html'); }} style={styles.investmentAction}>
                <Text style={styles.investmentActionText}>Explore investments</Text>
                <Text style={styles.investmentActionArrow}>›</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {screen === 'market' ? (
          <View style={styles.pageSection}>
            <Text style={styles.pageEyebrow}>DISCOVER BXC</Text>
            <Text style={styles.pageTitle}>Explore</Text>
            <Text style={styles.pageDescription}>Trade, invest, and discover more on BillionairesXchange.</Text>
            {[
              ['Trade & positions', 'trade.html', 'Markets and trading on BXC'],
              ['Trading bot', 'bot-trading.html', 'Explore automated trading tools'],
              ['Investment center', 'investment.html', 'Browse investment opportunities'],
              ['Create a coin', 'create-coin.html', 'Explore BXC coin creation'],
              ['Shop', 'shop.html', 'Browse the BXC marketplace']
            ].map(([label, path, detail]) => (
              <Pressable key={path} accessibilityRole="link" onPress={() => { void openWebsitePage(path); }} style={styles.marketRow}>
                <View style={styles.marketIcon}><Text style={styles.marketIconText}>{label.slice(0, 1)}</Text></View>
                <View style={styles.marketInfo}>
                  <Text style={styles.rowTitle}>{label}</Text>
                  <Text style={styles.muted}>{detail}</Text>
                </View>
                <Text style={styles.marketArrow}>›</Text>
              </Pressable>
            ))}
            <Text style={styles.muted}>These services open on the BXC website.</Text>
          </View>
        ) : null}

        {screen === 'activity' ? (
          <View style={styles.pageSection}>
            <Text style={styles.pageEyebrow}>YOUR WALLET</Text>
            <Text style={styles.pageTitle}>Activity</Text>
            <View style={styles.emptyState}>
              <View style={styles.emptyStateIcon}><Text style={styles.emptyStateGlyph}>↻</Text></View>
              <Text style={styles.emptyStateTitle}>Activity will appear here</Text>
              <Text style={styles.emptyStateBody}>
                Transaction history is not connected to the mobile wallet yet.
              </Text>
              <Pressable accessibilityRole="link" onPress={() => { void openWebsitePage('profile.html'); }} style={styles.outlineAction}>
                <Text style={styles.outlineActionText}>View BXC website activity</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {screen === 'profile' ? (
          <View style={styles.pageSection}>
            <Text style={styles.pageEyebrow}>ACCOUNT</Text>
            <Text style={styles.pageTitle}>Profile</Text>
            <View style={styles.profileCard}>
              <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{user.name.slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.profileInfo}>
                <Text style={styles.rowTitle}>{user.name}</Text>
                <Text style={styles.muted}>{UI_PREVIEW ? 'Preview account' : user.email}</Text>
              </View>
            </View>
            {[
              ['Wallet security', 'On-device recovery phrase', () => setScreen('wallet')],
              ['Connected accounts', `${connections.filter((connection) => connection.connected).length} linked`, () => setScreen('accounts')],
              ['NFT collection', `${nfts.length} collectibles`, () => setScreen('nfts')],
              ['Treasury services', 'Manage BXC services', () => setScreen('treasury')]
            ].map(([label, detail, onPress]) => (
              <Pressable key={String(label)} accessibilityRole="button" onPress={onPress as () => void} style={styles.profileRow}>
                <View style={styles.profileRowInfo}>
                  <Text style={styles.rowTitle}>{String(label)}</Text>
                  <Text style={styles.muted}>{String(detail)}</Text>
                </View>
                <Text style={styles.marketArrow}>›</Text>
              </Pressable>
            ))}
            {!UI_PREVIEW ? <Button title="Sign out" onPress={() => { void signOut(); }} secondary /> : null}
            <Text style={styles.disclaimer}>Never share your recovery phrase. BXC support will never ask for it.</Text>
          </View>
        ) : null}

        {screen === 'wallet' ? (
          <View style={styles.pageSection}>
            <Pressable onPress={() => setScreen('profile')} style={styles.backButton}><Text style={styles.backButtonText}>‹  Profile</Text></Pressable>
            <Text style={styles.pageTitle}>Wallet security</Text>
            <View style={styles.panel}>
            <Text style={styles.panelTitle}>Recovery phrase</Text>
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
            </View>
          </View>
        ) : null}

        {screen === 'accounts' ? (
          <View style={styles.pageSection}>
            <Pressable onPress={() => setScreen('profile')} style={styles.backButton}><Text style={styles.backButtonText}>‹  Profile</Text></Pressable>
            <Text style={styles.pageTitle}>Connected accounts</Text>
            <View style={styles.panel}>
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
            </View>
          </View>
        ) : null}

        {screen === 'nfts' ? (
          <View style={styles.pageSection}>
            <Pressable onPress={() => setScreen('profile')} style={styles.backButton}><Text style={styles.backButtonText}>‹  Profile</Text></Pressable>
            <Text style={styles.pageTitle}>NFT collection</Text>
            <View style={styles.panel}>
            {nfts.length ? nfts.map((item) => (
              <View key={`${item.chain}-${item.contractAddress}-${item.tokenId}`} style={styles.listRow}>
                <Text style={styles.rowTitle}>{item.name || `Token #${item.tokenId}`}</Text>
                <Text style={styles.muted}>{item.chain}</Text>
              </View>
            )) : <Text style={styles.body}>No NFTs are connected. Wallet NFT discovery is not configured yet.</Text>}
            </View>
          </View>
        ) : null}

        {screen === 'treasury' ? (
          <View style={styles.pageSection}>
            <Pressable onPress={() => setScreen('profile')} style={styles.backButton}><Text style={styles.backButtonText}>‹  Profile</Text></Pressable>
            <Text style={styles.pageTitle}>BXC services</Text>
            <View style={styles.panel}>
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
                onPress={() => { void openWebsitePage(path); }}
                style={styles.listRow}
              >
                <Text style={styles.rowTitle}>{label}</Text>
                <Text style={styles.link}>Open website ›</Text>
              </Pressable>
            ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
      {['home', 'market', 'activity', 'profile'].includes(screen) ? (
        <View style={styles.tabBar}>
          {[
            ['home', '⌂', 'Home'],
            ['market', '⌁', 'Explore'],
            ['activity', '↻', 'Activity'],
            ['profile', '●', 'Profile']
          ].map(([key, icon, label]) => {
            const active = screen === key;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={key}
                onPress={() => setScreen(key as typeof screen)}
                style={styles.tabItem}
              >
                <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{icon}</Text>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090B0A' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#090B0A' },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, gap: 22 },
  authContent: { width: '100%', maxWidth: 520, alignSelf: 'center', justifyContent: 'center', flexGrow: 1, padding: 22, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: GOLD },
  brandMarkText: { color: '#11130F', fontSize: 22, fontWeight: '900' },
  brandTitle: { color: '#F6F5F0', fontSize: 16, fontWeight: '800', letterSpacing: 0.1 },
  brandSubtitle: { color: '#858B84', fontSize: 8, fontWeight: '700', letterSpacing: 1.4, marginTop: 3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#171B18', borderWidth: 1, borderColor: '#262C28' },
  headerIconText: { color: '#D5B75A', fontSize: 17 },
  eyebrow: { color: GOLD, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  logo: { color: '#F6F5F0', fontSize: 28, fontWeight: '800', marginTop: 5 },
  subtitle: { color: '#A8AEA8', fontSize: 14, lineHeight: 21 },
  previewBadge: { color: '#E4C96D', fontSize: 9, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden', borderRadius: 20, backgroundColor: '#292412' },
  previewNotice: { padding: 11, borderRadius: 12, borderWidth: 1, borderColor: '#5D4D27', backgroundColor: '#1B1912', color: '#E6D39B', fontSize: 11, lineHeight: 16 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { color: '#F3F4EF', fontSize: 20, fontWeight: '700' },
  muted: { color: '#89918A', fontSize: 11, lineHeight: 17 },
  connectButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#343A35', borderRadius: 20, backgroundColor: '#151916' },
  connectButtonIcon: { color: '#D9B957', fontSize: 17, fontWeight: '700' },
  connectButtonText: { color: '#E7E9E3', fontSize: 11, fontWeight: '700' },
  balanceCard: { padding: 21, gap: 12, borderWidth: 1, borderColor: '#374338', borderRadius: 22, backgroundColor: '#17221B' },
  balanceTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel: { color: '#B3BDB5', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  balanceEye: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(255,255,255,.07)' },
  balanceEyeText: { color: '#D9E2DA', fontSize: 15 },
  balance: { color: '#F7F6EF', fontSize: 36, fontWeight: '800', letterSpacing: -1.2 },
  balanceBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  balanceStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D7B85B' },
  balanceFootnote: { flex: 1, color: '#AAB5AC', fontSize: 10, lineHeight: 15 },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  quickAction: { width: '23%', alignItems: 'center', gap: 8, paddingVertical: 2 },
  quickActionIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#1B211D', borderWidth: 1, borderColor: '#2D3730' },
  quickActionGlyph: { color: '#E3C365', fontSize: 24, fontWeight: '600' },
  quickActionLabel: { color: '#D9DED8', fontSize: 11, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#F0F1EC', fontSize: 17, fontWeight: '700' },
  sectionLink: { color: '#DFC15E', fontSize: 11, fontWeight: '700' },
  assetCard: { padding: 15, borderRadius: 18, borderWidth: 1, borderColor: '#262D28', backgroundColor: '#111512' },
  emptyState: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 19, gap: 9 },
  emptyStateIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#1D2921' },
  emptyStateGlyph: { color: '#DCC05D', fontSize: 23 },
  emptyStateTitle: { color: '#E9ECE6', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  emptyStateBody: { maxWidth: 255, color: '#929A92', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  outlineAction: { marginTop: 4, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#596444' },
  outlineActionText: { color: '#E4CA70', fontSize: 11, fontWeight: '700' },
  assetRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopColor: '#252D27', borderTopWidth: 1, paddingVertical: 10 },
  assetIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#242B22' },
  assetIconText: { color: '#E3C35B', fontSize: 15, fontWeight: '800' },
  assetInfo: { flex: 1, gap: 3 },
  assetValue: { color: '#F1F2ED', fontSize: 13, fontWeight: '700' },
  investmentCard: { padding: 18, gap: 13, borderRadius: 19, borderWidth: 1, borderColor: '#4C4225', backgroundColor: '#211F17' },
  investmentEyebrow: { color: '#C4AD64', fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  investmentTitle: { color: '#F3F0E4', fontSize: 17, fontWeight: '700', marginTop: 5 },
  investmentBadge: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#37301A' },
  investmentBadgeText: { color: '#E8CC69', fontSize: 11, fontWeight: '900' },
  investmentBody: { color: '#B5B1A2', fontSize: 11, lineHeight: 17 },
  investmentAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 11, borderTopWidth: 1, borderTopColor: '#403A28' },
  investmentActionText: { color: '#E9D27E', fontSize: 11, fontWeight: '700' },
  investmentActionArrow: { color: '#E9D27E', fontSize: 20 },
  pageSection: { gap: 16 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 3 },
  backButtonText: { color: '#DEC25F', fontSize: 13, fontWeight: '700' },
  pageEyebrow: { color: '#D5B65B', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  pageTitle: { color: '#F1F2EC', fontSize: 27, fontWeight: '800', marginTop: -10 },
  pageDescription: { color: '#A3AAA3', fontSize: 13, lineHeight: 19, marginTop: -9 },
  marketRow: { minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 15, borderWidth: 1, borderColor: '#262D28', backgroundColor: '#111512' },
  marketIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#24291F' },
  marketIconText: { color: '#E1C15D', fontSize: 16, fontWeight: '800' },
  marketInfo: { flex: 1, gap: 3 },
  marketArrow: { color: '#8E978E', fontSize: 23 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderWidth: 1, borderColor: '#2A312B', borderRadius: 16, backgroundColor: '#141915' },
  profileAvatar: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: '#3A3420' },
  profileAvatarText: { color: '#E8CE72', fontSize: 18, fontWeight: '800' },
  profileInfo: { flex: 1, gap: 4 },
  profileRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: '#262D28', backgroundColor: '#111512' },
  profileRowInfo: { gap: 4 },
  tabBar: { width: '100%', maxWidth: 560, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: '#222823', backgroundColor: '#0D100E' },
  tabItem: { minWidth: 66, alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  tabIcon: { color: '#777F78', fontSize: 20, lineHeight: 24 },
  tabIconActive: { color: '#E0C15F' },
  tabLabel: { color: '#777F78', fontSize: 9, fontWeight: '600' },
  tabLabelActive: { color: '#E0C15F' },
  panel: { borderColor: '#2A312B', borderWidth: 1, borderRadius: 16, padding: 16, backgroundColor: '#111512', gap: 13 },
  panelTitle: { color: '#F0F1EC', fontWeight: '700', fontSize: 17 },
  field: { gap: 7 },
  fieldLabel: { color: '#C4CBC4', fontSize: 12, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#343D35', borderRadius: 11, backgroundColor: '#0D100E', color: '#F5F6F1', paddingHorizontal: 13, fontSize: 15 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 12, backgroundColor: GOLD },
  buttonSecondary: { backgroundColor: '#1B211D', borderWidth: 1, borderColor: '#39453B' },
  buttonText: { color: '#15150F', fontSize: 13, fontWeight: '800' },
  buttonTextSecondary: { color: '#E9D37E' },
  disabled: { opacity: 0.48 },
  buttonStack: { gap: 10 },
  body: { color: '#B2B9B2', fontSize: 12, lineHeight: 18 },
  notice: { color: '#E6D28B', fontSize: 12, lineHeight: 18 },
  warning: { color: '#FFB570', fontSize: 12, lineHeight: 18 },
  success: { color: '#8ED3A2', fontSize: 13, fontWeight: '700' },
  pending: { color: '#D7C283', fontSize: 10, fontWeight: '700' },
  link: { color: '#E2C45F', fontSize: 12, fontWeight: '700' },
  listRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopColor: '#29312A', borderTopWidth: 1, paddingVertical: 10 },
  rowTitle: { color: '#E9ECE6', fontSize: 13, fontWeight: '700' },
  cameraFrame: { height: 340, overflow: 'hidden', borderRadius: 16, backgroundColor: '#000' },
  camera: { flex: 1 },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  word: { minWidth: '30%', padding: 8, borderRadius: 8, backgroundColor: '#20251F', color: '#F0DE9B', fontSize: 12 },
  disclaimer: { color: '#89918A', fontSize: 10, textAlign: 'center', lineHeight: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }
});
