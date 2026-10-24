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
  if (header.querySelector('.site-utility-banner')) return;

  const aboutLink = header.querySelector('a[href="about-support.html"]') || document.createElement('a');
  aboutLink.href = 'about-support.html';
  aboutLink.className = 'site-utility-link';
  aboutLink.textContent = 'About & Support';

  const settingsLink = header.querySelector('a[href="settings.html"]') || document.createElement('a');
  settingsLink.href = 'settings.html';
  settingsLink.className = 'site-utility-link';
  settingsLink.textContent = 'Settings';

  const banner = document.createElement('nav');
  banner.className = 'site-utility-banner';
  banner.setAttribute('aria-label', 'Quick links');
  banner.append(aboutLink, settingsLink);
  header.prepend(banner);
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
    autoPilotSettings.open = true;
    autoPilotSettings.scrollIntoView({ behavior: 'smooth', block: 'start' });
    autoPilotSettings.querySelector('summary').focus({ preventScroll: true });
  });
}

if (!document.querySelector('link[data-site-header-styles]')) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'site-header.css';
  stylesheet.dataset.siteHeaderStyles = '';
  document.head.appendChild(stylesheet);
}
