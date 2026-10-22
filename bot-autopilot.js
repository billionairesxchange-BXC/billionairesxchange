(() => {
  const createForm = document.getElementById('autoPilotCreateForm');
  if (!createForm) return;

  const minimumBuyUsd = 20;
  const maxActiveBots = 4;
  const refreshIntervalMs = 15000;
  const marketPairs = {
    BTC: 'BTCUSDT',
    ETH: 'ETHUSDT',
    XRP: 'XRPUSDT',
    SOL: 'SOLUSDT',
    ADA: 'ADAUSDT',
    DOT: 'DOTUSDT',
    DOGE: 'DOGEUSDT'
  };
  const durationOptions = {
    '1h': { label: '1 hour', milliseconds: 60 * 60 * 1000 },
    '4h': { label: '4 hours', milliseconds: 4 * 60 * 60 * 1000 },
    '12h': { label: '12 hours', milliseconds: 12 * 60 * 60 * 1000 },
    '24h': { label: '24 hours', milliseconds: 24 * 60 * 60 * 1000 },
    '7d': { label: '7 days', milliseconds: 7 * 24 * 60 * 60 * 1000 }
  };
  const accountId = localStorage.getItem('makingsCurrentUser') || 'guest';
  const storageKey = `makingsAutoPilotBotsV1:${accountId}`;
  const botList = document.getElementById('autoPilotBotList');
  const status = document.getElementById('autoPilotStatus');
  const alerts = document.getElementById('autoPilotAlerts');
  const historyBody = document.getElementById('autoPilotTradeHistory');
  let storageReady = false;
  let bots = loadBots();
  let cycleTimer = null;
  let cycleInProgress = false;

  function announce(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function loadBots() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) {
        storageReady = true;
        return [];
      }
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error('Saved autopilot data is not a list.');
      const restored = parsed.map((bot) => {
        if (!bot || typeof bot.id !== 'string' || typeof bot.name !== 'string'
          || !Number.isFinite(Number(bot.startingBalance)) || !Number.isFinite(Number(bot.balance))) {
          throw new Error('A saved autopilot bot has invalid data.');
        }
        const duration = durationOptions[bot.durationKey];
        if (!duration) throw new Error(`Saved bot "${bot.name}" has an unsupported duration.`);
        const wasRunning = bot.status === 'running' || bot.status === 'finishing';
        return {
          ...bot,
          status: wasRunning ? 'paused' : bot.status,
          endsAt: null,
          startedAt: null,
          realizedPnl: Number(bot.realizedPnl) || 0,
          totalLosses: Number.isFinite(Number(bot.totalLosses))
            ? Math.max(0, Number(bot.totalLosses))
            : (Array.isArray(bot.trades) ? bot.trades : []).reduce((sum, trade) => sum + (Number(trade.pnl) < 0 ? Math.abs(Number(trade.pnl)) : 0), 0),
          remainingMs: Number.isFinite(Number(bot.remainingMs))
            ? Math.max(0, Number(bot.remainingMs))
            : duration.milliseconds,
          openPosition: bot.openPosition || null,
          trades: Array.isArray(bot.trades) ? bot.trades : [],
          learning: bot.learning && typeof bot.learning === 'object' ? bot.learning : {},
          consentGranted: bot.consentGranted === true
        };
      });
      storageReady = true;
      return restored;
    } catch (error) {
      console.error('Autopilot data could not be loaded:', error);
      announce(`Saved autopilot bots could not be loaded: ${error.message}. Existing data was left unchanged.`, true);
      return [];
    }
  }

  function persistBots() {
    if (!storageReady) {
      announce('Autopilot storage is unavailable; no bot changes were saved.', true);
      return false;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(bots));
      return true;
    } catch (error) {
      console.error('Autopilot bot data could not be saved:', error);
      announce(`Could not save autopilot data: ${error.message}.`, true);
      return false;
    }
  }

  function money(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function timeRemaining(bot) {
    const remaining = bot.status === 'running' && bot.endsAt
      ? Math.max(0, bot.endsAt - Date.now())
      : Math.max(0, Number(bot.remainingMs) || 0);
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    return hours ? `${hours}h ${minutes}m remaining` : `${minutes}m remaining`;
  }

  function summarizeLearning(bot) {
    const records = Object.values(bot.learning);
    const trades = records.reduce((sum, item) => sum + (Number(item.trades) || 0), 0);
    const wins = records.reduce((sum, item) => sum + (Number(item.wins) || 0), 0);
    return trades
      ? `Learning from ${trades} closed trade${trades === 1 ? '' : 's'} (${Math.round(wins / trades * 100)}% wins).`
      : 'Learning begins after the first position closes.';
  }

  function totalStats() {
    const trades = bots.flatMap((bot) => bot.trades);
    return {
      net: bots.reduce((sum, bot) => sum + (Number(bot.realizedPnl) || 0), 0),
      losses: bots.reduce((sum, bot) => sum + (Number(bot.totalLosses) || 0), 0),
      active: bots.filter((bot) => bot.status === 'running' || bot.status === 'finishing').length,
      trades
    };
  }

  function renderSummary() {
    const totals = totalStats();
    const net = document.getElementById('autoPilotNetPnl');
    net.textContent = money(totals.net);
    net.classList.toggle('autopilot-loss', totals.net < 0);
    document.getElementById('autoPilotTotalLosses').textContent = money(totals.losses);
    document.getElementById('autoPilotActiveCount').textContent = `${totals.active} / ${maxActiveBots}`;
  }

  function addDetail(container, label, value) {
    const item = document.createElement('span');
    item.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    item.appendChild(strong);
    container.appendChild(item);
  }

  function renderBots() {
    botList.replaceChildren();
    if (!bots.length) {
      const empty = document.createElement('p');
      empty.className = 'autopilot-empty';
      empty.textContent = 'No autopilot bots yet. Create one above and explicitly approve its simulated $20 minimum-buy rule.';
      botList.appendChild(empty);
      renderSummary();
      renderHistory();
      return;
    }

    bots.forEach((bot) => {
      const card = document.createElement('article');
      card.className = 'autopilot-bot-card';

      const heading = document.createElement('div');
      heading.className = 'autopilot-bot-heading';
      const name = document.createElement('h4');
      name.textContent = bot.name;
      const botStatus = document.createElement('span');
      botStatus.className = `autopilot-bot-status is-${bot.status}`;
      botStatus.textContent = bot.status.replace('-', ' ');
      heading.append(name, botStatus);

      const summary = document.createElement('div');
      summary.className = 'autopilot-bot-details';
      addDetail(summary, 'Selected coin', bot.openPosition?.symbol || bot.selectedSymbol || 'Scanning');
      addDetail(summary, 'Virtual cash', money(bot.balance));
      addDetail(summary, 'Realized P/L', money(bot.realizedPnl));
      const openPnl = bot.openPosition
        ? (Number(bot.openPosition.lastPrice || bot.openPosition.entryPrice) - bot.openPosition.entryPrice) * bot.openPosition.quantity
        : 0;
      addDetail(summary, 'Open P/L', money(openPnl));
      addDetail(summary, 'Goal', money(bot.goalUsd));
      addDetail(summary, 'Trade cap', money(bot.tradeCapUsd));
      addDetail(summary, 'Adaptive settings', bot.currentSettings
        ? `${bot.currentSettings.risk} · ${bot.currentSettings.strategy}`
        : 'Auto-selected per market');
      addDetail(summary, 'Duration', bot.status === 'running' ? timeRemaining(bot) : durationOptions[bot.durationKey].label);

      const position = document.createElement('p');
      position.className = 'autopilot-position-summary';
      position.textContent = bot.openPosition
        ? `Open ${bot.openPosition.symbol} paper position: ${money(bot.openPosition.amount)} at ${money(bot.openPosition.entryPrice)}. ${bot.openPosition.risk} ${bot.openPosition.strategy}; stop ${bot.openPosition.stopLossPct}% / target ${bot.openPosition.takeProfitPct}%.`
        : 'No open paper position.';

      const learning = document.createElement('p');
      learning.className = 'autopilot-learning-summary';
      learning.textContent = summarizeLearning(bot);

      const actions = document.createElement('div');
      actions.className = 'autopilot-bot-actions';
      if (bot.status === 'paused') {
        actions.appendChild(makeActionButton('Start Auto Pilot', 'start', bot.id, 'btn-primary'));
      }
      if (bot.status === 'running' || bot.status === 'finishing') {
        actions.appendChild(makeActionButton('Pause bot', 'pause', bot.id, 'btn-ghost'));
      }
      if (bot.status !== 'running' && bot.status !== 'finishing' && !bot.openPosition) {
        actions.appendChild(makeActionButton('Remove bot', 'remove', bot.id, 'btn-ghost'));
      }

      card.append(heading, summary, position, learning, actions);
      botList.appendChild(card);
    });

    renderSummary();
    renderHistory();
  }

  function makeActionButton(label, action, botId, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${className}`;
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.botId = botId;
    return button;
  }

  function renderHistory() {
    const records = totalStats().trades.sort((left, right) => Number(right.closedAt) - Number(left.closedAt)).slice(0, 100);
    historyBody.replaceChildren();
    if (!records.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'No autopilot trades have closed yet.';
      row.appendChild(cell);
      historyBody.appendChild(row);
      return;
    }
    records.forEach((trade) => {
      const row = document.createElement('tr');
      [
        trade.botName,
        trade.symbol,
        money(trade.amount),
        money(trade.entryPrice),
        money(trade.exitPrice)
      ].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      const result = document.createElement('td');
      result.textContent = `${Number(trade.pnl) >= 0 ? 'Gain ' : 'Loss '}${money(Math.abs(Number(trade.pnl)))}`;
      result.className = Number(trade.pnl) >= 0 ? 'autopilot-gain' : 'autopilot-loss';
      row.appendChild(result);
      const closed = document.createElement('td');
      closed.textContent = new Date(trade.closedAt).toLocaleString();
      row.appendChild(closed);
      historyBody.appendChild(row);
    });
  }

  function recordOutcome(bot, position, exitPrice, reason) {
    const proceeds = position.quantity * exitPrice;
    const pnl = proceeds - position.amount;
    bot.balance += proceeds;
    bot.realizedPnl = (Number(bot.realizedPnl) || 0) + pnl;
    bot.totalLosses = (Number(bot.totalLosses) || 0) + (pnl < 0 ? Math.abs(pnl) : 0);
    const trade = {
      id: `${bot.id}-${Date.now()}`,
      botName: bot.name,
      symbol: position.symbol,
      amount: position.amount,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      exitPrice,
      pnl,
      reason,
      closedAt: Date.now()
    };
    bot.trades.push(trade);
    bot.trades = bot.trades.slice(-200);

    const learning = bot.learning[position.symbol] || { trades: 0, wins: 0, losses: 0, returnPctTotal: 0 };
    learning.trades += 1;
    learning.wins += pnl > 0 ? 1 : 0;
    learning.losses += pnl <= 0 ? 1 : 0;
    learning.returnPctTotal += position.amount ? pnl / position.amount * 100 : 0;
    bot.learning[position.symbol] = learning;
    bot.openPosition = null;

    const result = pnl > 0
      ? `${bot.name}: ${position.symbol} paper trade gained ${money(pnl)}.`
      : `${bot.name}: ${position.symbol} paper trade lost ${money(Math.abs(pnl))}.`;
    announce(result);
    addTradeAlert(result, pnl);
    notifyBrowser(bot, result);
    return pnl;
  }

  function addTradeAlert(message, pnl) {
    const item = document.createElement('li');
    item.className = pnl >= 0 ? 'autopilot-gain' : 'autopilot-loss';
    item.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
    alerts.prepend(item);
    while (alerts.children.length > 8) alerts.lastElementChild.remove();
  }

  function notifyBrowser(bot, message) {
    if (!bot.browserNotifications || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification('BXC Auto Pilot paper trade', { body: message });
    } catch (error) {
      console.error('Browser trade notification could not be shown:', error);
      announce(`${message} Browser notification failed; the result is recorded below.`, true);
    }
  }

  function scoreCandidate(bot, market) {
    const history = bot.learning[market.symbol];
    if (!history || !history.trades) return market.changePct;
    const averageReturn = history.returnPctTotal / history.trades;
    const winRate = history.wins / history.trades;
    const learningAdjustment = Math.max(-2, Math.min(2, averageReturn * 0.2 + (winRate - 0.5) * 2));
    return market.changePct + learningAdjustment;
  }

  function chooseCandidate(bot, markets) {
    return markets
      .filter((market) => market.changePct > 0 && market.quoteVolume >= 1000000)
      .map((market) => ({ ...market, score: scoreCandidate(bot, market) }))
      .filter((market) => market.score > 0)
      .sort((left, right) => right.score - left.score)[0] || null;
  }

  function settingsForMarket(market) {
    const volatility = market.highPrice > market.lowPrice
      ? (market.highPrice - market.lowPrice) / market.price * 100
      : 0;
    if (volatility >= 12) {
      return { risk: 'Conservative', strategy: 'Volatility control', riskFraction: 0.02, stopLossPct: 2.5, takeProfitPct: 5 };
    }
    if (market.changePct >= 8) {
      return { risk: 'Aggressive', strategy: 'Momentum', riskFraction: 0.08, stopLossPct: 3, takeProfitPct: 7 };
    }
    return { risk: 'Balanced', strategy: 'Momentum', riskFraction: 0.04, stopLossPct: 3.5, takeProfitPct: 6 };
  }

  function openPaperPosition(bot, market) {
    const settings = settingsForMarket(market);
    const amount = Math.min(bot.tradeCapUsd, bot.balance, Math.max(minimumBuyUsd, bot.balance * settings.riskFraction));
    if (amount < minimumBuyUsd) {
      bot.status = 'paused';
      bot.endsAt = null;
      bot.startedAt = null;
      bot.remainingMs = Math.max(0, bot.remainingMs);
      announce(`${bot.name} paused: its virtual balance is below the USD $20 minimum buy.`, true);
      return;
    }

    const amountToSpend = Math.round(amount * 100) / 100;
    bot.balance -= amountToSpend;
    bot.selectedSymbol = market.symbol;
    bot.currentSettings = {
      risk: settings.risk,
      strategy: settings.strategy,
      stopLossPct: settings.stopLossPct,
      takeProfitPct: settings.takeProfitPct
    };
    bot.openPosition = {
      symbol: market.symbol,
      amount: amountToSpend,
      quantity: amountToSpend / market.price,
      entryPrice: market.price,
      lastPrice: market.price,
      openedAt: Date.now(),
      stopLossPct: settings.stopLossPct,
      takeProfitPct: settings.takeProfitPct,
      risk: settings.risk,
      strategy: settings.strategy
    };
    announce(`${bot.name} selected ${market.symbol} (${market.changePct >= 0 ? '+' : ''}${market.changePct.toFixed(2)}% 24h, score ${market.score.toFixed(2)}). Opened a ${settings.risk.toLowerCase()} paper position for ${money(amountToSpend)}; minimum buy is $20.`);
  }

  function closeIfTriggered(bot, market, reason) {
    const position = bot.openPosition;
    if (!position || market.symbol !== position.symbol) return false;
    position.lastPrice = market.price;
    const movePct = ((market.price - position.entryPrice) / position.entryPrice) * 100;
    const stopHit = movePct <= -position.stopLossPct;
    const targetHit = movePct >= position.takeProfitPct;
    const durationEnded = bot.status === 'finishing';
    if (!stopHit && !targetHit && !durationEnded) return false;

    const closeReason = reason || (stopHit ? 'stop-loss' : targetHit ? 'take-profit' : 'duration ended');
    const pnl = recordOutcome(bot, position, market.price, closeReason);
    if (bot.realizedPnl >= bot.goalUsd) {
      bot.status = 'goal-reached';
      bot.remainingMs = 0;
      bot.endsAt = null;
      bot.startedAt = null;
      announce(`${bot.name} reached its realized profit goal of ${money(bot.goalUsd)}. Bot paused.`);
    } else if (durationEnded) {
      bot.status = 'completed';
      bot.remainingMs = 0;
      bot.endsAt = null;
      bot.startedAt = null;
      announce(`${bot.name} completed its duration. Final paper trade ${pnl >= 0 ? 'gain' : 'loss'}: ${money(Math.abs(pnl))}.`);
    }
    return true;
  }

  async function fetchMarkets() {
    const symbols = encodeURIComponent(JSON.stringify(Object.values(marketPairs)));
    let lastError;
    for (const base of ['https://data-api.binance.vision', 'https://api.binance.com']) {
      try {
        const response = await fetch(`${base}/api/v3/ticker/24hr?symbols=${symbols}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Market quote service returned HTTP ${response.status}.`);
        const responseData = await response.json();
        if (!Array.isArray(responseData)) throw new Error('Market quote service returned an unexpected response.');
        const symbolByPair = Object.fromEntries(Object.entries(marketPairs).map(([symbol, pair]) => [pair, symbol]));
        return responseData.map((ticker) => ({
          symbol: symbolByPair[ticker.symbol],
          price: Number(ticker.lastPrice),
          changePct: Number(ticker.priceChangePercent),
          quoteVolume: Number(ticker.quoteVolume),
          highPrice: Number(ticker.highPrice),
          lowPrice: Number(ticker.lowPrice)
        })).filter((market) => market.symbol && Number.isFinite(market.price) && market.price > 0
          && Number.isFinite(market.changePct) && Number.isFinite(market.quoteVolume));
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Market quote services are unavailable.');
  }

  function processBot(bot, markets) {
    const now = Date.now();
    if (bot.status === 'running' && bot.endsAt && now >= bot.endsAt) {
      bot.status = bot.openPosition ? 'finishing' : 'completed';
      bot.remainingMs = 0;
      bot.endsAt = null;
      bot.startedAt = null;
    } else if (bot.status === 'running' && bot.endsAt) {
      bot.remainingMs = Math.max(0, bot.endsAt - now);
    }

    if (bot.openPosition) {
      const currentMarket = markets.find((market) => market.symbol === bot.openPosition.symbol);
      if (currentMarket) {
        if (closeIfTriggered(bot, currentMarket)) return;
      } else if (bot.status === 'finishing') {
        announce(`${bot.name} reached its duration, but a fresh quote for ${bot.openPosition.symbol} is unavailable. It will wait for a quote before closing the paper position.`, true);
        return;
      }
      if (bot.status === 'finishing' && !bot.openPosition) {
        bot.status = 'completed';
        return;
      }
      return;
    }

    if (bot.status !== 'running') return;
    if (bot.realizedPnl >= bot.goalUsd) {
      bot.status = 'goal-reached';
      bot.remainingMs = 0;
      bot.endsAt = null;
      bot.startedAt = null;
      announce(`${bot.name} reached its realized profit goal of ${money(bot.goalUsd)}.`);
      return;
    }
    const candidate = chooseCandidate(bot, markets);
    if (!candidate) {
      announce(`${bot.name} found no positive-momentum, $1M-volume market this scan. It will check again.`);
      return;
    }
    openPaperPosition(bot, candidate);
  }

  async function runCycle() {
    if (cycleInProgress || !bots.some((bot) => bot.status === 'running' || bot.status === 'finishing')) return;
    cycleInProgress = true;
    try {
      const markets = await fetchMarkets();
      bots.filter((bot) => bot.status === 'running' || bot.status === 'finishing')
        .forEach((bot) => processBot(bot, markets));
      if (persistBots()) renderBots();
    } catch (error) {
      console.error('Autopilot market scan failed:', error);
      announce(`Auto Pilot could not scan markets: ${error.message}. No trade was placed; active bots will retry.`, true);
    } finally {
      cycleInProgress = false;
      if (!bots.some((bot) => bot.status === 'running' || bot.status === 'finishing') && cycleTimer) {
        clearInterval(cycleTimer);
        cycleTimer = null;
      }
    }
  }

  function startCycleTimer() {
    if (!cycleTimer) cycleTimer = window.setInterval(runCycle, refreshIntervalMs);
  }

  async function startBot(bot) {
    const activeCount = bots.filter((item) => item.status === 'running' || item.status === 'finishing').length;
    if (activeCount >= maxActiveBots) {
      announce(`Only ${maxActiveBots} bots can run at the same time. Pause another bot before starting this one.`, true);
      return;
    }
    if (!bot.consentGranted) {
      announce('This bot has no saved paper-trading authorization. Create it again and accept the consent checkbox before starting.', true);
      return;
    }
    if (bot.balance < minimumBuyUsd) {
      announce(`${bot.name} needs at least $20 in virtual balance before it can buy.`, true);
      return;
    }
    if (bot.remainingMs <= 0 && !bot.openPosition) {
      announce(`${bot.name} has used its selected duration. Create a new bot to start another session.`, true);
      return;
    }
    if (bot.browserNotifications && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.error('Browser notification permission request failed:', error);
      }
    }
    if (bot.remainingMs <= 0 && bot.openPosition) {
      bot.status = 'finishing';
      bot.startedAt = null;
      bot.endsAt = null;
    } else {
      bot.status = 'running';
      bot.startedAt = Date.now();
      bot.endsAt = bot.startedAt + bot.remainingMs;
    }
    if (!persistBots()) {
      bot.status = 'paused';
      bot.startedAt = null;
      bot.endsAt = null;
      return;
    }
    startCycleTimer();
    renderBots();
    announce(`${bot.name} started. It scans multiple supported markets every 15 seconds and uses paper funds only.`);
    await runCycle();
  }

  function pauseBot(bot) {
    if (bot.status !== 'running' && bot.status !== 'finishing') return;
    if (bot.status === 'running' && bot.endsAt) bot.remainingMs = Math.max(0, bot.endsAt - Date.now());
    bot.status = 'paused';
    bot.startedAt = null;
    bot.endsAt = null;
    if (persistBots()) {
      renderBots();
      announce(`${bot.name} paused. Any open paper position is retained and can be managed when the bot resumes.`);
    }
    if (!bots.some((item) => item.status === 'running' || item.status === 'finishing') && cycleTimer) {
      clearInterval(cycleTimer);
      cycleTimer = null;
    }
  }

  createForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.getElementById('autoPilotBotName').value.trim();
    const startingBalance = Number(document.getElementById('autoPilotBudget').value);
    const tradeCapUsd = Number(document.getElementById('autoPilotTradeCap').value);
    const durationKey = document.getElementById('autoPilotDuration').value;
    const goalUsd = Number(document.getElementById('autoPilotGoal').value);
    const consentGranted = document.getElementById('autoPilotConsent').checked;
    if (!name || name.length > 32 || startingBalance < minimumBuyUsd || tradeCapUsd < minimumBuyUsd
      || tradeCapUsd > startingBalance || goalUsd <= 0 || !durationOptions[durationKey] || !consentGranted) {
      announce('Enter a name, a virtual balance of at least $20, a trade cap between $20 and your balance, a goal and duration, then accept the paper-trading authorization.', true);
      return;
    }

    const bot = {
      id: `autopilot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      status: 'paused',
      startingBalance,
      balance: startingBalance,
      tradeCapUsd,
      goalUsd,
      durationKey,
      remainingMs: durationOptions[durationKey].milliseconds,
      startedAt: null,
      endsAt: null,
      realizedPnl: 0,
      totalLosses: 0,
      selectedSymbol: '',
      openPosition: null,
      trades: [],
      learning: {},
      consentGranted,
      browserNotifications: document.getElementById('autoPilotBrowserNotifications').checked
    };
    bots.unshift(bot);
    if (!persistBots()) {
      bots.shift();
      return;
    }
    createForm.reset();
    document.getElementById('autoPilotBudget').value = '1000';
    document.getElementById('autoPilotTradeCap').value = '100';
    document.getElementById('autoPilotDuration').value = '24h';
    document.getElementById('autoPilotGoal').value = '100';
    renderBots();
    announce(`${name} created and paused. Start it when you are ready; its $20 minimum applies only to simulated buys.`);
  });

  botList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const bot = bots.find((item) => item.id === button.dataset.botId);
    if (!bot) return;
    if (button.dataset.action === 'start') {
      startBot(bot);
    } else if (button.dataset.action === 'pause') {
      pauseBot(bot);
    } else if (button.dataset.action === 'remove' && bot.status !== 'running'
      && bot.status !== 'finishing' && !bot.openPosition) {
      bots = bots.filter((item) => item.id !== bot.id);
      if (persistBots()) {
        renderBots();
        announce(`${bot.name} removed.`);
      } else {
        bots.unshift(bot);
      }
    }
  });

  window.addEventListener('pagehide', () => {
    let changed = false;
    bots.forEach((bot) => {
      if (bot.status === 'running' || bot.status === 'finishing') {
        if (bot.status === 'running' && bot.endsAt) bot.remainingMs = Math.max(0, bot.endsAt - Date.now());
        bot.status = 'paused';
        bot.startedAt = null;
        bot.endsAt = null;
        changed = true;
      }
    });
    if (changed) persistBots();
  });

  renderBots();
  if (bots.some((bot) => bot.status === 'paused' && bot.remainingMs <= 0 && !bot.openPosition)) {
    announce('A saved bot has completed its run time. Start is disabled; create a new bot for another session.');
  } else if (bots.some((bot) => bot.status === 'paused' && bot.openPosition)) {
    announce('Saved bots are paused while this page is closed. Resume a bot to continue managing its open paper position.');
  }
})();
