(() => {
  const storageKey = 'billionairesXchangeTheme';
  const availableThemes = new Set(['black-yellow', 'white-yellow', 'live-pixel']);
  const themeInputs = [...document.querySelectorAll('input[name="siteTheme"]')];
  const status = document.getElementById('themeSaveStatus');
  const profileDialog = document.getElementById('settingsProfileDialog');
  const profileOpen = document.getElementById('settingsProfileOpen');
  const profileClose = document.getElementById('settingsProfileClose');
  const profileStatus = document.getElementById('settingsProfileStatus');
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

  profileOpen?.addEventListener('click', () => profileDialog?.showModal());
  profileClose?.addEventListener('click', () => profileDialog?.close());
  profileDialog?.addEventListener('click', (event) => {
    if (event.target === profileDialog) profileDialog.close();
  });
  document.getElementById('settingsProfilePhoto')?.addEventListener('click', () => {
    const photoAction = [...document.querySelectorAll('.profile-menu-dropdown button[role="menuitem"]')]
      .find((button) => /photo/i.test(button.textContent));
    if (!photoAction) {
      profileStatus.textContent = 'Sign in to change your profile photo.';
      return;
    }
    photoAction.click();
  });
  document.getElementById('settingsProfileLogout')?.addEventListener('click', () => {
    const logoutAction = [...document.querySelectorAll('.profile-menu-dropdown button[role="menuitem"]')]
      .find((button) => button.textContent.trim() === 'Log out');
    if (!logoutAction) {
      profileStatus.textContent = 'You are not signed in.';
      return;
    }
    logoutAction.click();
  });
})();
