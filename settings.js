(() => {
  const storageKey = 'billionairesXchangeTheme';
  const availableThemes = new Set(['black-yellow', 'white-yellow', 'live-pixel']);
  const themeInputs = [...document.querySelectorAll('input[name="siteTheme"]')];
  const status = document.getElementById('themeSaveStatus');
  let currentTheme = 'black-yellow';

  try {
    const storedTheme = localStorage.getItem(storageKey);
    if (storedTheme && availableThemes.has(storedTheme)) currentTheme = storedTheme;
  } catch (error) {
    console.error('Unable to load the saved site theme:', error);
    status.textContent = 'Could not load your saved theme. Choose a theme to apply it.';
  }

  document.documentElement.dataset.siteTheme = currentTheme;
  themeInputs.forEach((input) => {
    input.checked = input.value === currentTheme;
    input.addEventListener('change', () => {
      if (!input.checked || !availableThemes.has(input.value)) return;

      currentTheme = input.value;
      document.documentElement.dataset.siteTheme = currentTheme;
      try {
        localStorage.setItem(storageKey, currentTheme);
        status.textContent = `Theme saved: ${input.labels[0].querySelector('strong').textContent}.`;
      } catch (error) {
        console.error('Unable to save the selected site theme:', error);
        status.textContent = 'Theme applied for this page, but could not be saved in this browser.';
      }
    });
  });
})();
