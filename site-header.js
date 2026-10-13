const siteHeaders = document.querySelectorAll('header.topbar');
const themeStorageKey = 'billionairesXchangeTheme';
const themes = ['black-yellow', 'white-yellow', 'live-pixel'];

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

if (!document.querySelector('link[data-site-header-styles]')) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'site-header.css';
  stylesheet.dataset.siteHeaderStyles = '';
  document.head.appendChild(stylesheet);
}
