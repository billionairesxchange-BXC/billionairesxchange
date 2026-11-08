const siteHeaders = document.querySelectorAll('header.topbar');
const themeStorageKey = 'billionairesXchangeTheme';
const themes = ['black-yellow', 'white-yellow', 'live-pixel'];

if (!document.querySelector('.site-background-video')) {
  document.body.classList.add('has-site-background');
  const backgroundVideos = Array.from({ length: 7 }, (_, index) => `Background${index + 1}.mp4`);
  let backgroundVideoIndex = 0;
  let failedBackgroundVideos = 0;
  const backgroundVideo = document.createElement('video');
  backgroundVideo.className = 'site-background-video';
  const compatibleVideoSource = document.createElement('source');
  compatibleVideoSource.src = backgroundVideos[backgroundVideoIndex];
  compatibleVideoSource.type = 'video/mp4';
  backgroundVideo.append(compatibleVideoSource);
  backgroundVideo.poster = 'Starry%20Night-poster.jpg';
  backgroundVideo.autoplay = true;
  backgroundVideo.muted = true;
  backgroundVideo.loop = false;
  backgroundVideo.playsInline = true;
  backgroundVideo.preload = 'metadata';
  backgroundVideo.setAttribute('aria-hidden', 'true');
  backgroundVideo.setAttribute('role', 'presentation');
  backgroundVideo.tabIndex = -1;
  document.body.prepend(backgroundVideo);
  const playBackgroundVideo = () => {
    if (document.visibilityState === 'hidden' || failedBackgroundVideos >= backgroundVideos.length || !backgroundVideo.paused) return;
    backgroundVideo.play().catch((error) => {
      if (error.name !== 'AbortError') {
        console.warn('The site background video could not autoplay:', error);
      }
    });
  };
  const advanceBackgroundVideo = () => {
    backgroundVideoIndex = (backgroundVideoIndex + 1) % backgroundVideos.length;
    compatibleVideoSource.src = backgroundVideos[backgroundVideoIndex];
    backgroundVideo.load();
    playBackgroundVideo();
  };
  backgroundVideo.addEventListener('ended', advanceBackgroundVideo);
  backgroundVideo.addEventListener('error', () => {
    failedBackgroundVideos += 1;
    if (failedBackgroundVideos >= backgroundVideos.length) {
      console.error('None of the site background videos could be loaded.');
      return;
    }
    advanceBackgroundVideo();
  });
  document.addEventListener('visibilitychange', playBackgroundVideo);
  window.addEventListener('pageshow', playBackgroundVideo);
  backgroundVideo.addEventListener('loadeddata', playBackgroundVideo);
  playBackgroundVideo();
} else {
  document.body.classList.add('has-site-background');
}

document.querySelectorAll('a[href="treasury.html#wallet"]').forEach((link) => {
  link.textContent = 'Wallet';
});

const walletSplash = document.createElement('div');
walletSplash.className = 'site-wallet-splash';
walletSplash.hidden = true;
walletSplash.setAttribute('role', 'status');
walletSplash.setAttribute('aria-live', 'polite');
walletSplash.innerHTML = '<img src="BillionairesXchange-Logo.png" alt=""><p></p>';
const walletSplashMessage = walletSplash.querySelector('p');
document.body.appendChild(walletSplash);
let walletSplashActive = false;
let skipArrivalSplash = false;
let arrivalSplashTimer = null;
try {
  skipArrivalSplash = sessionStorage.getItem('bxcSkipArrivalSplash') === '1';
  sessionStorage.removeItem('bxcSkipArrivalSplash');
} catch (error) {
  console.warn('The site arrival splash preference could not be read:', error);
}
if (!skipArrivalSplash) {
  walletSplashMessage.textContent = 'Loading BillionairesXchange…';
  walletSplash.hidden = false;
  document.body.classList.add('site-wallet-splash-active');
  arrivalSplashTimer = window.setTimeout(() => {
    if (walletSplashActive) return;
    walletSplash.hidden = true;
    document.body.classList.remove('site-wallet-splash-active');
  }, 1400);
}
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    || link.target === '_blank' || walletSplashActive) return;
  const destination = new URL(link.href, window.location.href);
  if (!/\/treasury\.html$/i.test(destination.pathname)
    || !['#wallet', '#create-wallet', '#recover-wallet'].includes(destination.hash)) return;

  event.preventDefault();
  walletSplashActive = true;
  window.clearTimeout(arrivalSplashTimer);
  link.closest('dialog[open]')?.close();
  document.body.classList.add('site-wallet-splash-active');
  walletSplashMessage.textContent = 'Opening your wallet…';
  walletSplash.hidden = false;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch((error) => console.warn('Wallet navigation could not exit full screen:', error));
  }
  try {
    sessionStorage.setItem('bxcSkipArrivalSplash', '1');
  } catch (error) {
    console.warn('The wallet arrival splash preference could not be saved:', error);
  }
  window.setTimeout(() => window.location.assign(destination.href), 8000);
}, true);

function applyTheme(theme) {
  const selectedTheme = themes.includes(theme) ? theme : 'black-yellow';
  document.documentElement.dataset.siteTheme = selectedTheme;
  try {
    localStorage.setItem(themeStorageKey, selectedTheme);
  } catch (error) {
    console.error('Unable to save the selected site theme:', error);
  }
  return selectedTheme;
}

let savedTheme = 'black-yellow';
try {
  const storedTheme = localStorage.getItem(themeStorageKey);
  if (storedTheme && themes.includes(storedTheme)) savedTheme = storedTheme;
} catch (error) {
  console.error('Unable to load the saved site theme:', error);
}
applyTheme(savedTheme);

siteHeaders.forEach((header) => {
  if (document.body.classList.contains('home-page')) return;
  if (header.querySelector('.site-utility-banner')) return;

  const settingsLink = header.querySelector('a[href="settings.html"]') || document.createElement('a');
  settingsLink.href = 'settings.html';
  settingsLink.className = 'site-utility-link';
  settingsLink.textContent = 'Settings';

  const aboutLink = document.createElement('a');
  aboutLink.className = 'site-utility-link';
  aboutLink.href = 'about-support.html';
  aboutLink.textContent = 'About';

  const banner = document.createElement('nav');
  banner.className = 'site-utility-banner';
  banner.setAttribute('aria-label', 'Quick links');
  banner.append(aboutLink, settingsLink);

  const profileButton = document.createElement('button');
  profileButton.className = 'site-profile-icon-button';
  profileButton.type = 'button';
  profileButton.setAttribute('aria-label', 'Open profile and account menu');
  profileButton.setAttribute('aria-haspopup', 'dialog');
  profileButton.setAttribute('aria-expanded', 'false');
  profileButton.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="22"></circle><circle cx="24" cy="18" r="7"></circle><path d="M10 40c1.8-7.5 7-11 14-11s12.2 3.5 14 11"></path></svg>';

  const notificationsButton = document.createElement('button');
  notificationsButton.className = 'site-notifications-button';
  notificationsButton.type = 'button';
  notificationsButton.setAttribute('aria-label', 'Open notifications');
  notificationsButton.setAttribute('aria-haspopup', 'dialog');
  notificationsButton.setAttribute('aria-expanded', 'false');
  notificationsButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg><span class="site-notifications-count" hidden></span>';
  const notificationsCount = notificationsButton.querySelector('.site-notifications-count');
  const notificationsDialog = document.createElement('dialog');
  notificationsDialog.className = 'site-notifications-dialog';
  notificationsDialog.setAttribute('aria-labelledby', 'siteNotificationsTitle');
  notificationsDialog.innerHTML = `
    <div class="site-notifications-heading">
      <h2 id="siteNotificationsTitle">Notifications</h2>
      <button class="site-notifications-close" type="button" aria-label="Close notifications">×</button>
    </div>
    <p class="site-notifications-status" role="status" aria-live="polite"></p>
    <button class="site-notifications-mark-all" type="button">Mark all as read</button>
    <section aria-labelledby="siteNotificationsNewHeading">
      <h3 id="siteNotificationsNewHeading">New</h3>
      <ul class="site-notifications-list" data-notification-list="new"></ul>
    </section>
    <section aria-labelledby="siteNotificationsPastHeading">
      <h3 id="siteNotificationsPastHeading">Past</h3>
      <ul class="site-notifications-list" data-notification-list="past"></ul>
    </section>
  `;
  const notificationsStatus = notificationsDialog.querySelector('.site-notifications-status');
  const newNotifications = notificationsDialog.querySelector('[data-notification-list="new"]');
  const pastNotifications = notificationsDialog.querySelector('[data-notification-list="past"]');
  const notificationMarkAllButton = notificationsDialog.querySelector('.site-notifications-mark-all');
  let notificationError = '';
  const notificationKey = () => {
    try {
      return `bxcNotifications:${localStorage.getItem('makingsAuthUid') || localStorage.getItem('makingsCurrentUser') || 'guest'}`;
    } catch (error) {
      console.error('Notification account could not be determined:', error);
      return null;
    }
  };
  const loadNotifications = () => {
    const key = notificationKey();
    if (!key) throw new Error('Notification account is unavailable.');
    const saved = localStorage.getItem(key);
    if (saved === null) return [];
    const notifications = JSON.parse(saved);
    if (!Array.isArray(notifications) || notifications.some((item) => !item
      || typeof item.id !== 'string'
      || typeof item.source !== 'string'
      || typeof item.title !== 'string'
      || typeof item.message !== 'string'
      || !Number.isFinite(new Date(Number(item.createdAt)).getTime())
      || !['info', 'gain', 'loss'].includes(item.type)
      || (item.readAt !== null && !Number.isFinite(new Date(Number(item.readAt)).getTime())))) {
      throw new Error('Saved notifications have an invalid format.');
    }
    return notifications;
  };
  const updateNotificationsBadge = (notifications) => {
    const unreadCount = notifications.filter((item) => item.readAt === null).length;
    notificationsCount.hidden = unreadCount === 0;
    notificationsCount.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    notificationsButton.setAttribute('aria-label', `Open notifications, ${unreadCount} new`);
  };
  const saveNotifications = (notifications) => {
    const key = notificationKey();
    if (!key) {
      notificationError = 'Notifications could not be saved because the account is unavailable.';
      notificationsStatus.textContent = notificationError;
      return false;
    }
    try {
      localStorage.setItem(key, JSON.stringify(notifications));
      notificationError = '';
      window.dispatchEvent(new Event('bxc-notifications-updated'));
      return true;
    } catch (error) {
      notificationError = 'Notifications could not be saved. Check browser storage and try again.';
      notificationsStatus.textContent = notificationError;
      console.error('Notifications could not be saved:', error);
      return false;
    }
  };
  const renderNotification = (notification, isUnread) => {
    const item = document.createElement('li');
    item.className = `site-notification-item is-${notification.type}${isUnread ? ' is-unread' : ''}`;
    const heading = document.createElement('h4');
    heading.textContent = notification.title;
    const source = document.createElement('span');
    source.className = 'site-notification-source';
    source.textContent = notification.source;
    const message = document.createElement('p');
    message.textContent = notification.message;
    const time = document.createElement('time');
    time.dateTime = new Date(Number(notification.createdAt)).toISOString();
    time.textContent = new Date(Number(notification.createdAt)).toLocaleString();
    item.append(heading, source, message, time);
    if (isUnread) {
      const readButton = document.createElement('button');
      readButton.type = 'button';
      readButton.textContent = 'Mark as read';
      readButton.addEventListener('click', () => {
        try {
          const current = loadNotifications();
          const target = current.find((entry) => entry.id === notification.id);
          if (!target) return;
          target.readAt = Date.now();
          saveNotifications(current);
        } catch (error) {
          notificationsStatus.textContent = `Could not update notification: ${error.message}`;
          console.error('Notification could not be marked as read:', error);
        }
      });
      item.appendChild(readButton);
    }
    return item;
  };
  const renderNotifications = () => {
    try {
      const all = loadNotifications().sort((left, right) => Number(right.createdAt) - Number(left.createdAt));
      const unread = all.filter((item) => item.readAt === null);
      const past = all.filter((item) => item.readAt !== null);
      const renderList = (list, records, isUnread, emptyMessage) => {
        if (records.length) {
          list.replaceChildren(...records.map((item) => renderNotification(item, isUnread)));
          return;
        }
        const empty = document.createElement('li');
        empty.className = 'site-notifications-empty';
        empty.textContent = emptyMessage;
        list.replaceChildren(empty);
      };
      renderList(newNotifications, unread, true, 'No new notifications.');
      renderList(pastNotifications, past, false, 'No past notifications.');
      notificationMarkAllButton.disabled = unread.length === 0;
      notificationsStatus.textContent = notificationError;
      updateNotificationsBadge(all);
    } catch (error) {
      newNotifications.replaceChildren();
      pastNotifications.replaceChildren();
      notificationMarkAllButton.disabled = true;
      notificationsCount.hidden = true;
      notificationsButton.setAttribute('aria-label', 'Notifications unavailable');
      notificationError = 'Notifications could not be loaded. Existing notification data was left unchanged.';
      notificationsStatus.textContent = notificationError;
      console.error('Notifications could not be loaded:', error);
    }
  };
  window.bxcAddNotification = ({ source, title, message, type = 'info' } = {}) => {
    if (typeof source !== 'string' || !source.trim()
      || typeof title !== 'string' || !title.trim()
      || typeof message !== 'string' || !message.trim()
      || !['info', 'gain', 'loss'].includes(type)) {
      console.error('Notification was not saved because its source, title, message, or type was invalid.');
      return false;
    }
    try {
      const all = loadNotifications();
      all.unshift({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        source: source.trim(),
        title: title.trim(),
        message: message.trim(),
        type,
        createdAt: Date.now(),
        readAt: null
      });
      return saveNotifications(all);
    } catch (error) {
      notificationError = 'A notification could not be saved. Existing notification data was left unchanged.';
      notificationsStatus.textContent = notificationError;
      console.error('Notification could not be created:', error);
      return false;
    }
  };
  notificationsButton.addEventListener('click', () => {
    renderNotifications();
    notificationsDialog.showModal();
    notificationsButton.setAttribute('aria-expanded', 'true');
  });
  notificationsDialog.querySelector('.site-notifications-close').addEventListener('click', () => notificationsDialog.close());
  notificationsDialog.addEventListener('close', () => notificationsButton.setAttribute('aria-expanded', 'false'));
  notificationMarkAllButton.addEventListener('click', () => {
    try {
      const all = loadNotifications();
      all.forEach((item) => {
        if (item.readAt === null) item.readAt = Date.now();
      });
      saveNotifications(all);
    } catch (error) {
      notificationsStatus.textContent = `Notifications could not be updated: ${error.message}`;
      console.error('Notifications could not be marked as read:', error);
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === notificationKey()) renderNotifications();
  });
  window.addEventListener('bxc-notifications-updated', renderNotifications);
  renderNotifications();

  const profileDialog = document.createElement('dialog');
  profileDialog.className = 'site-profile-dialog';
  profileDialog.setAttribute('aria-label', 'Profile and wallet menu');
  profileDialog.innerHTML = `
    <div class="site-profile-dialog-heading">
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="22"></circle><circle cx="24" cy="18" r="7"></circle><path d="M10 40c1.8-7.5 7-11 14-11s12.2 3.5 14 11"></path></svg>
      <div><span class="eyebrow">Account menu</span><h2>Your profile</h2></div>
      <button class="site-profile-close" type="button" aria-label="Close profile menu">×</button>
    </div>
    <div class="site-profile-photo-action-wrap">
      <button class="site-profile-photo-action" type="button" data-profile-action="photo">Change profile photo</button>
    </div>
    <div class="site-profile-account-actions">
      <a class="btn btn-ghost" href="verification.html#login">Log in</a>
      <a class="btn btn-primary" href="verification.html#signup">Sign up</a>
    </div>
    <div class="site-profile-balance-row">
      <span>Balances</span>
      <button class="site-balance-visibility" type="button">
        <svg class="eye-visible-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        <svg class="eye-hidden-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-3.1 3.7M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.2 0 2.3-.2 3.3-.6"></path></svg>
        <span class="visually-hidden">Hide balances</span>
      </button>
    </div>
    <nav class="site-profile-wallet-links" aria-label="Wallet actions">
      <h3>Wallet</h3>
      <a href="pay-bills.html">Pay Bills</a>
      <a href="request-card.html">Request Card</a>
      <a href="investment.html">Investment</a>
      <a href="insurance.html">Insurance</a>
      <a href="mortgage.html">Mortgage</a>
    </nav>
    <nav class="site-profile-links" aria-label="More">
      <a href="settings.html">Settings</a>
      <a href="live-feed.html">Live Feed</a>
      <a href="billionaires-world.html">Billionaires World</a>
      <a href="community-inbox.html">Community Inbox</a>
    </nav>
    <div class="site-profile-extra-actions">
      <button type="button" data-profile-action="logout">Log out</button>
      <p class="site-profile-status" role="status" aria-live="polite"></p>
    </div>
  `;
  const profileClose = profileDialog.querySelector('.site-profile-close');
  const balanceVisibility = profileDialog.querySelector('.site-balance-visibility');
  const profileStatus = profileDialog.querySelector('.site-profile-status');
  const syncBalanceVisibility = (hidden = document.body.classList.contains('treasury-balances-hidden')) => {
    document.body.classList.toggle('treasury-balances-hidden', hidden);
    balanceVisibility.setAttribute('aria-pressed', String(hidden));
    balanceVisibility.setAttribute('aria-label', hidden ? 'Show balances' : 'Hide balances');
    balanceVisibility.title = hidden ? 'Show balances' : 'Hide balances';
    balanceVisibility.querySelector('.visually-hidden').textContent = hidden ? 'Show balances' : 'Hide balances';
  };
  let savedBalancesHidden = false;
  try {
    savedBalancesHidden = localStorage.getItem('treasuryBalancesHidden') === 'true';
  } catch (error) {
    console.error('Balance visibility preference could not be loaded:', error);
  }
  syncBalanceVisibility(savedBalancesHidden);

  profileButton.addEventListener('click', () => {
    if (profileDialog.open) {
      profileDialog.close();
      return;
    }
    const profileBounds = profileButton.getBoundingClientRect();
    const maxDialogHeight = Math.min(window.innerHeight * 0.88, 720);
    profileDialog.style.top = `${Math.max(16, Math.min(profileBounds.bottom + 8, window.innerHeight - maxDialogHeight - 16))}px`;
    profileDialog.style.right = `${Math.max(16, window.innerWidth - profileBounds.right)}px`;
    profileDialog.show();
    profileButton.setAttribute('aria-expanded', 'true');
  });
  profileClose.addEventListener('click', () => profileDialog.close());
  profileDialog.addEventListener('close', () => profileButton.setAttribute('aria-expanded', 'false'));
  profileDialog.addEventListener('click', (event) => {
    if (event.target === profileDialog) profileDialog.close();
  });
  profileDialog.querySelectorAll('a[href$="#create-wallet"], a[href$="#recover-wallet"]').forEach((link) => {
    link.addEventListener('click', () => profileDialog.close());
  });
  balanceVisibility.addEventListener('click', () => {
    const hidden = balanceVisibility.getAttribute('aria-pressed') !== 'true';
    try {
      localStorage.setItem('treasuryBalancesHidden', String(hidden));
    } catch (error) {
      console.error('Balance visibility preference could not be saved:', error);
    }
    syncBalanceVisibility(hidden);
    document.dispatchEvent(new CustomEvent('balances-visibility-change', { detail: { hidden } }));
  });
  profileDialog.querySelector('[data-profile-action="photo"]').addEventListener('click', () => {
    const photoInput = document.querySelector('.profile-menu-dropdown input[type="file"]');
    if (!photoInput) {
      profileStatus.textContent = 'Sign in to change your profile photo.';
      return;
    }
    photoInput.click();
  });
  profileDialog.querySelector('[data-profile-action="logout"]').addEventListener('click', () => {
    const logoutAction = [...document.querySelectorAll('.profile-menu-dropdown button[role="menuitem"]')]
      .find((button) => button.textContent.trim() === 'Log out');
    if (!logoutAction) {
      profileStatus.textContent = 'You are not signed in.';
      return;
    }
    logoutAction.click();
  });
  document.addEventListener('balances-visibility-change', (event) => syncBalanceVisibility(event.detail.hidden));
  window.addEventListener('storage', (event) => {
    if (event.key === 'treasuryBalancesHidden') syncBalanceVisibility(event.newValue === 'true');
  });
  banner.append(notificationsButton, profileButton);
  header.prepend(banner);
  header.append(notificationsDialog, profileDialog);
});

const openAutoPilotSettings = document.getElementById('openAutoPilotSettings');
const autoPilotSettings = document.getElementById('autopilotSettings');
if (openAutoPilotSettings && autoPilotSettings) {
  if (window.location.hash === '#autopilot') autoPilotSettings.open = true;
  const syncAutoPilotExpandedState = () => {
    openAutoPilotSettings.setAttribute('aria-expanded', String(autoPilotSettings.open));
  };
  syncAutoPilotExpandedState();
  autoPilotSettings.addEventListener('toggle', syncAutoPilotExpandedState);
  openAutoPilotSettings.addEventListener('click', () => {
    autoPilotSettings.open = !autoPilotSettings.open;
    if (autoPilotSettings.open) {
      autoPilotSettings.scrollIntoView({ behavior: 'smooth', block: 'start' });
      autoPilotSettings.querySelector('summary').focus({ preventScroll: true });
    }
  });
}

if (!document.querySelector('link[data-site-header-styles]')) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'site-header.css';
  stylesheet.dataset.siteHeaderStyles = '';
  document.head.appendChild(stylesheet);
}
