const isLocalServer = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  || window.location.protocol === 'file:';
window.MAKINGS_API_BASE_URL = isLocalServer
  ? (window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin)
  : 'https://billionairesxchange-api.onrender.com';
