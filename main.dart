import 'dart:async';
import 'dart:convert';

import 'package:bip39/bip39.dart' as bip39;
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:url_launcher/url_launcher.dart';

const _apiUrl = String.fromEnvironment(
  'BXC_API_URL',
  defaultValue: 'http://10.0.2.2:3000',
);
const _websiteUrl = String.fromEnvironment(
  'BXC_WEBSITE_URL',
  defaultValue: 'https://billionairesxchange-e8162.web.app',
);
const _sessionKey = 'bxc_wallet_api_session_v1';
const _phraseKey = 'bxc_wallet_recovery_phrase_v1';
const _gold = Color(0xFFD8B84F);
const _background = Color(0xFF090B0A);

const _secureStorage = FlutterSecureStorage();

class WalletApi {
  WalletApi(this.baseUrl);

  final String baseUrl;

  Future<dynamic> request(
    String path, {
    String? token,
    Map<String, dynamic>? body,
    String method = 'GET',
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{'content-type': 'application/json'};
    if (token != null && token.isNotEmpty) {
      headers['authorization'] = 'Bearer $token';
    }
    final request = http.Request(method, uri)..headers.addAll(headers);
    if (body != null) request.body = jsonEncode(body);
    final streamed = await request.send();
    final response = await http.Response.fromStream(streamed);
    final data = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = data is Map<String, dynamic> ? data['error'] : null;
      throw Exception(message ?? 'The wallet service could not complete this request.');
    }
    return data;
  }
}

void main() {
  runApp(const BxcWalletApp());
}

class BxcWalletApp extends StatelessWidget {
  const BxcWalletApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'BXC Wallet',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          brightness: Brightness.dark,
          scaffoldBackgroundColor: _background,
          colorScheme: const ColorScheme.dark(
            primary: _gold,
            surface: Color(0xFF111512),
            error: Color(0xFFFF8B79),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: const Color(0xFF0D100E),
            labelStyle: const TextStyle(color: Color(0xFFC4CBC4)),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF343D35)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Color(0xFF343D35)),
            ),
          ),
          useMaterial3: true,
        ),
        home: const WalletRoot(),
      );
}

class WalletRoot extends StatefulWidget {
  const WalletRoot({super.key});

  @override
  State<WalletRoot> createState() => _WalletRootState();
}

class _WalletRootState extends State<WalletRoot> {
  final _api = WalletApi(_apiUrl.replaceFirst(RegExp(r'/+$'), ''));
  String? _token;
  Map<String, dynamic>? _user;
  Map<String, dynamic>? _dashboard;
  bool _loading = true;
  bool _busy = false;
  bool _signup = false;
  bool _balanceVisible = true;
  String _status = '';
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_restoreSession());
  }

  Future<void> _restoreSession() async {
    try {
      final saved = await _secureStorage.read(key: _sessionKey);
      if (saved != null) {
        final profile = await _api.request('/api/mobile/auth/me', token: saved);
        if (!mounted) return;
        setState(() {
          _token = saved;
          _user = Map<String, dynamic>.from(profile as Map);
        });
        await _loadDashboard();
      }
    } catch (_) {
      await _secureStorage.delete(key: _sessionKey);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadDashboard() async {
    if (_token == null) return;
    try {
      final data = await _api.request('/api/mobile/dashboard', token: _token);
      if (mounted) setState(() => _dashboard = Map<String, dynamic>.from(data as Map));
    } catch (error) {
      _notify(_message(error));
    }
  }

  Future<void> _authenticate({
    required String email,
    required String password,
    String? name,
  }) async {
    setState(() {
      _busy = true;
      _status = '';
    });
    try {
      if (_signup) {
        final result = await _api.request(
          '/api/mobile/auth/register',
          method: 'POST',
          body: {'email': email, 'name': name, 'password': password},
        );
        if (mounted) {
          setState(() {
            _signup = false;
            _status = (result as Map<String, dynamic>)['message']?.toString() ??
                'Account created. Sign in to continue.';
          });
        }
      } else {
        final result = Map<String, dynamic>.from(await _api.request(
          '/api/mobile/auth/login',
          method: 'POST',
          body: {'email': email, 'password': password},
        ) as Map);
        final user = Map<String, dynamic>.from(result['user'] as Map);
        final token = result['token'] as String;
        await _secureStorage.write(key: _sessionKey, value: token);
        if (mounted) {
          setState(() {
            _token = token;
            _user = user;
          });
        }
        await _loadDashboard();
      }
    } catch (error) {
      if (mounted) setState(() => _status = _message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signOut() async {
    try {
      await _api.request('/api/mobile/auth/logout',
          token: _token, body: <String, dynamic>{}, method: 'POST');
    } catch (_) {}
    await _secureStorage.delete(key: _sessionKey);
    if (mounted) {
      setState(() {
        _token = null;
        _user = null;
        _dashboard = null;
        _tab = 0;
      });
    }
  }

  String _message(Object error) =>
      error.toString().replaceFirst(RegExp(r'^Exception: '), '');

  void _notify(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _openWebsite(String page) async {
    final uri = Uri.parse('$_websiteUrl/$page');
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      _notify('Could not open the BXC website.');
    }
  }

  Future<bool> _approvePairing(String rawValue) async {
    final uri = Uri.tryParse(rawValue);
    final expectedOrigin = Uri.parse(_websiteUrl).origin;
    final code = uri?.queryParameters['token'];
    final origin = uri?.queryParameters['origin'];
    if (uri == null || uri.scheme != 'bxcwallet' || uri.host != 'pair' ||
        code == null || code.isEmpty || origin != expectedOrigin) {
      _notify('That QR code is not a sign-in request from your configured BXC website.');
      return false;
    }
    final approved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Approve website sign-in?'),
        content: Text(
          'Sign in to $origin as ${_user?['email']}. Only approve requests you just started on a website you trust.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Approve')),
        ],
      ),
    );
    if (approved != true) return false;
    try {
      final result = await _api.request(
        '/api/mobile/pairings/approve',
        token: _token,
        method: 'POST',
        body: {'token': code, 'origin': origin},
      );
      _notify((result as Map<String, dynamic>)['message']?.toString() ?? 'Sign-in approved.');
      return true;
    } catch (error) {
      _notify(_message(error));
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: _gold)),
      );
    }
    if (_user == null) {
      return AuthPage(
        busy: _busy,
        signup: _signup,
        status: _status,
        onSubmit: _authenticate,
        onToggle: () => setState(() {
          _signup = !_signup;
          _status = '';
        }),
      );
    }
    final user = _user!;
    final pages = [
      HomePage(
        user: user,
        dashboard: _dashboard,
        balanceVisible: _balanceVisible,
        onToggleBalance: () => setState(() => _balanceVisible = !_balanceVisible),
        onRefresh: _loadDashboard,
        onConnect: () => _openScanner(),
        onAccounts: () => _openDetail('Connected accounts'),
        onAction: _openWebsite,
      ),
      ExplorePage(onOpen: _openWebsite),
      ActivityPage(onOpen: _openWebsite),
      ProfilePage(
        user: user,
        dashboard: _dashboard,
        onSecurity: () => _openDetail('Wallet security'),
        onAccounts: () => _openDetail('Connected accounts'),
        onNfts: () => _openDetail('NFT collection'),
        onServices: () => _openDetail('BXC services'),
        onSignOut: _signOut,
      ),
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Brand(),
        actions: [
          IconButton(
            tooltip: 'Refresh wallet',
            onPressed: _loadDashboard,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(child: pages[_tab]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (index) => setState(() => _tab = index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.explore_outlined), label: 'Explore'),
          NavigationDestination(icon: Icon(Icons.history), label: 'Activity'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
        ],
      ),
    );
  }

  Future<void> _openScanner() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (context) => ScannerPage(onCode: _approvePairing),
    ));
  }

  Future<void> _openDetail(String title) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (context) => DetailPage(
        title: title,
        dashboard: _dashboard,
        onOpenWebsite: _openWebsite,
      ),
    ));
  }
}

class AuthPage extends StatefulWidget {
  const AuthPage({
    required this.busy,
    required this.signup,
    required this.status,
    required this.onSubmit,
    required this.onToggle,
    super.key,
  });

  final bool busy;
  final bool signup;
  final String status;
  final Future<void> Function({required String email, required String password, String? name}) onSubmit;
  final VoidCallback onToggle;

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 480),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Brand(),
                      const SizedBox(height: 32),
                      Text(widget.signup ? 'Create your account' : 'Welcome back',
                          style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 8),
                      const Text('A unified account for your website and mobile wallet.'),
                      const SizedBox(height: 24),
                      if (widget.signup) ...[
                        TextFormField(
                          controller: _name,
                          textCapitalization: TextCapitalization.words,
                          decoration: const InputDecoration(labelText: 'Name'),
                          validator: (value) => (value == null || value.trim().isEmpty) ? 'Enter your name.' : null,
                        ),
                        const SizedBox(height: 14),
                      ],
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        decoration: const InputDecoration(labelText: 'Email'),
                        validator: (value) => (value == null || !value.contains('@')) ? 'Enter a valid email.' : null,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _password,
                        obscureText: true,
                        decoration: const InputDecoration(labelText: 'Password (12+ characters)'),
                        validator: (value) => (value == null || value.length < 12) ? 'Use at least 12 characters.' : null,
                      ),
                      if (widget.status.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        Text(widget.status, style: const TextStyle(color: _gold)),
                      ],
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: widget.busy
                            ? null
                            : () {
                                if (!_formKey.currentState!.validate()) return;
                                unawaited(widget.onSubmit(
                                  email: _email.text.trim(),
                                  password: _password.text,
                                  name: _name.text.trim(),
                                ));
                              },
                        child: Text(widget.busy ? 'Please wait…' : widget.signup ? 'Create account' : 'Sign in'),
                      ),
                      TextButton(
                        onPressed: widget.busy ? null : widget.onToggle,
                        child: Text(widget.signup ? 'I already have an account' : 'Create a BXC Wallet account'),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Never share your recovery phrase. BXC will never ask you to send it to support.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Color(0xFF89918A), fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class HomePage extends StatelessWidget {
  const HomePage({
    required this.user,
    required this.dashboard,
    required this.balanceVisible,
    required this.onToggleBalance,
    required this.onRefresh,
    required this.onConnect,
    required this.onAccounts,
    required this.onAction,
    super.key,
  });

  final Map<String, dynamic> user;
  final Map<String, dynamic>? dashboard;
  final bool balanceVisible;
  final VoidCallback onToggleBalance;
  final Future<void> Function() onRefresh;
  final VoidCallback onConnect;
  final VoidCallback onAccounts;
  final Future<void> Function(String) onAction;

  @override
  Widget build(BuildContext context) {
    final portfolio = dashboard?['portfolio'] as Map<String, dynamic>?;
    final assets = (portfolio?['assets'] as List<dynamic>? ?? const []);
    final total = (portfolio?['totalUsd'] as num?)?.toDouble();
    final name = (user['name'] as String? ?? 'there').split(' ').first;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        children: [
          Row(
            children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Good day, $name', style: Theme.of(context).textTheme.titleLarge),
                const Text('Your wallet at a glance', style: TextStyle(color: Color(0xFF89918A))),
              ])),
              OutlinedButton.icon(onPressed: onConnect, icon: const Icon(Icons.qr_code_scanner), label: const Text('Connect')),
            ],
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              color: const Color(0xFF17221B),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF374338)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Text('TOTAL BALANCE', style: TextStyle(color: Color(0xFFB3BDB5), letterSpacing: 1.2, fontSize: 11)),
                IconButton(onPressed: onToggleBalance, tooltip: balanceVisible ? 'Hide balance' : 'Show balance', icon: Icon(balanceVisible ? Icons.visibility_outlined : Icons.visibility_off_outlined)),
              ]),
              Text(
                !balanceVisible ? '••••••' : total == null ? '—' : _usd(total),
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              Text(portfolio?['message']?.toString() ?? 'Connect an account to see your balance',
                  style: const TextStyle(color: Color(0xFFAAB5AC), fontSize: 12)),
            ]),
          ),
          const SizedBox(height: 20),
          Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
            _Action(icon: Icons.north_east, label: 'Send', onTap: () => onAction('send.html')),
            _Action(icon: Icons.south_west, label: 'Receive', onTap: () => _message(context, 'Wallet receive addresses are not available yet.')),
            _Action(icon: Icons.add, label: 'Buy', onTap: () => onAction('deposit.html')),
            _Action(icon: Icons.swap_horiz, label: 'Swap', onTap: () => onAction('trade.html')),
          ]),
          const SizedBox(height: 28),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('My assets', style: Theme.of(context).textTheme.titleMedium),
            TextButton(onPressed: onAccounts, child: const Text('Manage')),
          ]),
          if (assets.isEmpty)
            _EmptyState(
              title: 'Your assets live here',
              body: 'Connect an account to see your coins and balances in one place.',
              action: 'Connect an account',
              onTap: onAccounts,
            )
          else
            ...assets.map((item) {
              final asset = Map<String, dynamic>.from(item as Map);
              return ListTile(
                leading: CircleAvatar(backgroundColor: const Color(0xFF242B22), child: Text((asset['symbol'] ?? asset['name'] ?? '?').toString().substring(0, 1).toUpperCase(), style: const TextStyle(color: _gold))),
                title: Text((asset['name'] ?? asset['symbol'] ?? 'Asset').toString()),
                subtitle: Text((asset['symbol'] ?? 'Portfolio asset').toString()),
                trailing: Text(asset['valueUsd'] is num ? _usd((asset['valueUsd'] as num).toDouble()) : '—'),
              );
            }),
          const SizedBox(height: 18),
          Card(
            color: const Color(0xFF211F17),
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('GROW YOUR PORTFOLIO', style: TextStyle(color: _gold, fontSize: 11, letterSpacing: 1.1)),
                const SizedBox(height: 8),
                Text('Investment center', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                const Text('Explore markets, discover opportunities, and manage your BXC investments.'),
                Align(alignment: Alignment.centerRight, child: TextButton.icon(onPressed: () => onAction('investment.html'), icon: const Icon(Icons.arrow_forward), label: const Text('Explore investments'))),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class ExplorePage extends StatelessWidget {
  const ExplorePage({required this.onOpen, super.key});
  final Future<void> Function(String) onOpen;

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Explore', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          const Text('Trade, invest, and discover more on BillionairesXchange.', style: TextStyle(color: Color(0xFF89918A))),
          const SizedBox(height: 16),
          for (final item in const [
            ('Trade & positions', 'trade.html', 'Markets and trading on BXC'),
            ('Trading bot', 'bot-trading.html', 'Explore automated trading tools'),
            ('Investment center', 'investment.html', 'Browse investment opportunities'),
            ('Create a coin', 'create-coin.html', 'Explore BXC coin creation'),
            ('Shop', 'shop.html', 'Browse the BXC marketplace'),
          ])
            ListTile(
              leading: const Icon(Icons.open_in_new, color: _gold),
              title: Text(item.$1),
              subtitle: Text(item.$3),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => onOpen(item.$2),
            ),
          const Text('These services open on the BXC website.', style: TextStyle(color: Color(0xFF89918A))),
        ],
      );
}

class ActivityPage extends StatelessWidget {
  const ActivityPage({required this.onOpen, super.key});
  final Future<void> Function(String) onOpen;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: _EmptyState(
            title: 'Activity will appear here',
            body: 'Transaction history is not connected to the mobile wallet yet.',
            action: 'View BXC website activity',
            onTap: () => onOpen('profile.html'),
          ),
        ),
      );
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({
    required this.user,
    required this.dashboard,
    required this.onSecurity,
    required this.onAccounts,
    required this.onNfts,
    required this.onServices,
    required this.onSignOut,
    super.key,
  });

  final Map<String, dynamic> user;
  final Map<String, dynamic>? dashboard;
  final VoidCallback onSecurity;
  final VoidCallback onAccounts;
  final VoidCallback onNfts;
  final VoidCallback onServices;
  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    final connections = dashboard?['connections'] as List<dynamic>? ?? const [];
    final nfts = (dashboard?['nfts'] as Map<String, dynamic>?)?['assets'] as List<dynamic>? ?? const [];
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Profile', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        ListTile(
          leading: CircleAvatar(backgroundColor: const Color(0xFF3A3420), child: Text((user['name'] as String? ?? 'B').substring(0, 1).toUpperCase(), style: const TextStyle(color: _gold))),
          title: Text(user['name']?.toString() ?? 'BXC Wallet user'),
          subtitle: Text(user['email']?.toString() ?? ''),
        ),
        _ProfileRow(title: 'Wallet security', detail: 'On-device recovery phrase', icon: Icons.shield_outlined, onTap: onSecurity),
        _ProfileRow(title: 'Connected accounts', detail: '${connections.length} linked', icon: Icons.link, onTap: onAccounts),
        _ProfileRow(title: 'NFT collection', detail: '${nfts.length} collectibles', icon: Icons.image_outlined, onTap: onNfts),
        _ProfileRow(title: 'Treasury services', detail: 'Manage BXC services', icon: Icons.account_balance_outlined, onTap: onServices),
        const SizedBox(height: 14),
        OutlinedButton.icon(onPressed: () => unawaited(onSignOut()), icon: const Icon(Icons.logout), label: const Text('Sign out')),
        const Padding(
          padding: EdgeInsets.only(top: 18),
          child: Text('Never share your recovery phrase. BXC support will never ask for it.', textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF89918A), fontSize: 12)),
        ),
      ],
    );
  }
}

class ScannerPage extends StatefulWidget {
  const ScannerPage({required this.onCode, super.key});
  final Future<bool> Function(String) onCode;

  @override
  State<ScannerPage> createState() => _ScannerPageState();
}

class _ScannerPageState extends State<ScannerPage> {
  bool _handled = false;

  Future<void> _handleCode(String value) async {
    if (_handled) return;
    setState(() => _handled = true);
    final approved = await widget.onCode(value);
    if (!mounted) return;
    if (approved) {
      Navigator.of(context).pop();
    } else {
      setState(() => _handled = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Connect to BXC')),
        body: Column(
          children: [
            const Padding(
              padding: EdgeInsets.all(18),
              child: Text('Scan a sign-in code from the BXC website. Only approve requests you started.'),
            ),
            Expanded(
              child: MobileScanner(
                onDetect: (capture) {
                  if (_handled || capture.barcodes.isEmpty) return;
                  final value = capture.barcodes.first.rawValue;
                  if (value == null) return;
                  unawaited(_handleCode(value));
                },
              ),
            ),
          ],
        ),
      );
}

class DetailPage extends StatefulWidget {
  const DetailPage({
    required this.title,
    required this.dashboard,
    required this.onOpenWebsite,
    super.key,
  });

  final String title;
  final Map<String, dynamic>? dashboard;
  final Future<void> Function(String) onOpenWebsite;

  @override
  State<DetailPage> createState() => _DetailPageState();
}

class _DetailPageState extends State<DetailPage> {
  String? _phraseDraft;
  bool _phraseExists = false;
  bool _phraseLoaded = false;

  @override
  void initState() {
    super.initState();
    unawaited(_loadPhraseStatus());
  }

  Future<void> _loadPhraseStatus() async {
    final phrase = await _secureStorage.read(key: _phraseKey);
    if (mounted) {
      setState(() {
        _phraseExists = phrase != null;
        _phraseLoaded = true;
      });
    }
  }

  Future<void> _savePhrase() async {
    final phrase = _phraseDraft;
    if (phrase == null) return;
    await _secureStorage.write(key: _phraseKey, value: phrase);
    if (mounted) {
      setState(() {
        _phraseDraft = null;
        _phraseExists = true;
      });
      _message(context, 'Recovery phrase saved in this device’s secure storage.');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.title)),
        body: ListView(padding: const EdgeInsets.all(20), children: [_content(context)]),
      );

  Widget _content(BuildContext context) {
    if (widget.title == 'Wallet security') {
      if (!_phraseLoaded) return const Center(child: CircularProgressIndicator(color: _gold));
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Recovery phrase', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Text(_phraseExists ? 'A recovery phrase is stored in this device’s OS-protected secure storage.' : 'Create a recovery phrase on this device. It is never sent to the BXC server.'),
            if (_phraseDraft != null) ...[
              const SizedBox(height: 18),
              const Text('Write this phrase down and keep it private. Anyone with it can control the wallet.', style: TextStyle(color: Color(0xFFFFB570))),
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final entry in _phraseDraft!.split(' ').asMap().entries)
                  Chip(label: Text('${entry.key + 1}. ${entry.value}')),
              ]),
              const SizedBox(height: 16),
              FilledButton(onPressed: () => unawaited(_savePhrase()), child: const Text('I saved my recovery phrase')),
              TextButton(onPressed: () => setState(() => _phraseDraft = null), child: const Text('Discard phrase')),
            ] else if (_phraseExists)
              const Padding(padding: EdgeInsets.only(top: 14), child: Text('BXC Wallet is set up on this device.', style: TextStyle(color: Color(0xFF8ED3A2))))
            else
              Padding(padding: const EdgeInsets.only(top: 18), child: FilledButton(onPressed: () => setState(() => _phraseDraft = bip39.generateMnemonic(strength: 128)), child: const Text('Generate recovery phrase'))),
          ]);
    }
    if (widget.title == 'Connected accounts') {
      final connections = widget.dashboard?['connections'] as List<dynamic>? ?? const [];
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Connections remain off until provider OAuth and secure credential storage are configured.'),
        const SizedBox(height: 16),
        if (connections.isEmpty) const Text('No connected accounts.'),
        for (final item in connections)
          ListTile(
            title: Text((item as Map<String, dynamic>)['name']?.toString() ?? 'Account'),
            subtitle: Text('${item['kind'] ?? ''} · ${(item['status'] ?? '').toString().replaceAll('_', ' ')}'),
            trailing: const Text('Not ready', style: TextStyle(color: _gold)),
          ),
      ]);
    }
    if (widget.title == 'NFT collection') {
      final nfts = (widget.dashboard?['nfts'] as Map<String, dynamic>?)?['assets'] as List<dynamic>? ?? const [];
      if (nfts.isEmpty) return const Text('No NFTs are connected. Wallet NFT discovery is not configured yet.');
      return Column(children: [
        for (final item in nfts)
          ListTile(
            title: Text((item as Map<String, dynamic>)['name']?.toString() ?? 'Token #${item['tokenId']}'),
            subtitle: Text(item['chain']?.toString() ?? ''),
          ),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('These actions continue on the BXC website.'),
      const SizedBox(height: 12),
      for (final item in const [
        ('Deposit', 'deposit.html'),
        ('Withdraw', 'withdraw.html'),
        ('Transfer', 'transfer.html'),
        ('Send crypto', 'send.html'),
        ('Pay bills', 'pay-bills.html'),
        ('Investment center', 'investment.html'),
        ('Trade and positions', 'trade.html'),
        ('Activity history', 'profile.html'),
        ('Shop', 'shop.html'),
        ('Vault', 'vault.html'),
        ('Insurance', 'insurance.html'),
        ('Mortgage', 'mortgage.html'),
      ])
        ListTile(title: Text(item.$1), trailing: const Icon(Icons.open_in_new), onTap: () => widget.onOpenWebsite(item.$2)),
    ]);
  }
}

class Brand extends StatelessWidget {
  const Brand({super.key});

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: _gold, borderRadius: BorderRadius.circular(12)),
          child: const Text('B', style: TextStyle(color: Color(0xFF11130F), fontSize: 22, fontWeight: FontWeight.w900)),
        ),
        const SizedBox(width: 10),
        const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('BXC Wallet', style: TextStyle(fontWeight: FontWeight.w800)),
          Text('BILLIONAIRESXCHANGE', style: TextStyle(color: Color(0xFF858B84), fontSize: 9, letterSpacing: 1.1)),
        ]),
      ]);
}

class _Action extends StatelessWidget {
  const _Action({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Column(children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(color: const Color(0xFF1B211D), borderRadius: BorderRadius.circular(17), border: Border.all(color: const Color(0xFF2D3730))),
            child: Icon(icon, color: _gold),
          ),
          const SizedBox(height: 7),
          Text(label, style: const TextStyle(fontSize: 12)),
        ]),
      );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.title, required this.body, required this.action, required this.onTap});
  final String title;
  final String body;
  final String action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.account_balance_wallet_outlined, size: 44, color: _gold),
        const SizedBox(height: 10),
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Text(body, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF929A92))),
        const SizedBox(height: 10),
        OutlinedButton(onPressed: onTap, child: Text(action)),
      ]);
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({required this.title, required this.detail, required this.icon, required this.onTap});
  final String title;
  final String detail;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
        color: const Color(0xFF111512),
        child: ListTile(
          leading: Icon(icon, color: _gold),
          title: Text(title),
          subtitle: Text(detail),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      );
}

String _usd(double value) => '\$${value.toStringAsFixed(2)}';

void _message(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}