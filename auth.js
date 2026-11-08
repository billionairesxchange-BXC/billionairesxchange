(() => {
  const ACCOUNTS_KEY = 'makingsAccounts';
  const CURRENT_USER_KEY = 'makingsCurrentUser';
  const LEGACY_USER_KEY = 'makingsVerificationUser';
  const LEGACY_SESSION_KEY = 'makingsUserLoggedIn';

  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (error) {
      return fallback;
    }
  };

  const getAccounts = () => {
    let accounts = readJson(ACCOUNTS_KEY, []);
    if (!Array.isArray(accounts)) accounts = [];

    const legacyUser = readJson(LEGACY_USER_KEY, null);
    if (legacyUser && !accounts.some((account) => account.username === legacyUser.username || account.email === legacyUser.email)) {
      accounts.push(legacyUser);
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    }

    return accounts;
  };

  const saveAccounts = (accounts) => localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));

  const getCurrentUser = () => {
    const username = localStorage.getItem(CURRENT_USER_KEY);
    if (!username) {
      const legacyUser = readJson(LEGACY_USER_KEY, null);
      if (legacyUser && localStorage.getItem(LEGACY_SESSION_KEY) === 'true') {
        setCurrentUser(legacyUser);
        return legacyUser;
      }
      return null;
    }
    return getAccounts().find((account) => account.username === username) || null;
  };

  const setCurrentUser = (user) => {
    localStorage.setItem(CURRENT_USER_KEY, user.username);
    localStorage.setItem(LEGACY_USER_KEY, JSON.stringify(user));
    localStorage.setItem(LEGACY_SESSION_KEY, 'true');
  };

  const clearCurrentUser = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  };

  const displayName = (user) => `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;

  const renderHeader = () => {
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;

    const user = getCurrentUser();
    if (!user) {
      navActions.innerHTML = `
        <a class="btn btn-ghost" href="verification.html#login">Login</a>
        <a class="btn btn-primary" href="verification.html#signup">Sign Up</a>
      `;
      return;
    }

    navActions.innerHTML = `
      <a class="btn btn-ghost profile-link" href="profile.html">${displayName(user)}</a>
    `;
  };

  window.MakingsAuth = {
    getAccounts,
    getCurrentUser,
    saveAccounts,
    setCurrentUser,
    clearCurrentUser,
    displayName
  };

  document.addEventListener('DOMContentLoaded', renderHeader);
})();

// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: String,
  passwordHash: String,
  balance: Number,
  trades: [{ symbol: String, side: String, quantity: Number, price: Number, date: Date }]
});

module.exports = mongoose.model('User', UserSchema);
