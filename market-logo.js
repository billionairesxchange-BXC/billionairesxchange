(() => {
  const palettes = [
    ['#f2c14e', '#7a4c00'],
    ['#66d9b8', '#075f54'],
    ['#7db7ff', '#17458a'],
    ['#d99cff', '#5b2878'],
    ['#ff9d78', '#80351f'],
    ['#f28aa8', '#762541'],
    ['#a5d86e', '#3c6422']
  ];
  const categoryMarks = {
    Futures: '<path d="M12 37 21 27l6 5 11-15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 17h7v7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    Indices: '<path d="M13 36V26h6v10zm11 0V18h6v18zm11 0V12h6v24z" fill="currentColor"/>',
    Options: '<circle cx="17" cy="18" r="4" fill="currentColor"/><circle cx="36" cy="17" r="4" fill="currentColor"/><circle cx="27" cy="36" r="4" fill="currentColor"/><path d="m20 20 5 12m8-12-5 12m-7-14h11" fill="none" stroke="currentColor" stroke-width="2.5"/>',
    Economy: '<circle cx="27" cy="25" r="15" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 25h30M27 10c5 5 7 10 7 15s-2 10-7 15c-5-5-7-10-7-15s2-10 7-15z" fill="none" stroke="currentColor" stroke-width="2"/>',
    'Corporate Bonds': '<path d="M13 39h29M17 37V23m8 14V23m8 14V23m8 14V23M13 21l14-9 15 9z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
    'Government Bonds': '<path d="M11 20h32L27 10zm4 18h24M17 22v14m7-14v14m7-14v14m7-14v14M12 42h30" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
    ETFs: '<rect x="13" y="12" width="11" height="11" rx="2" fill="currentColor"/><rect x="30" y="12" width="11" height="11" rx="2" fill="currentColor" opacity=".72"/><rect x="13" y="29" width="11" height="11" rx="2" fill="currentColor" opacity=".72"/><rect x="30" y="29" width="11" height="11" rx="2" fill="currentColor"/>'
  };

  window.createMarketLogoSrc = (symbol, category) => {
    const cleanSymbol = String(symbol || '').split(':').pop().replace(/[^a-z0-9]/gi, '').toUpperCase();
    const initials = (cleanSymbol.slice(0, 3) || 'MKT').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let hash = 0;
    for (const character of String(symbol || category || 'market')) {
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }
    const [accent, shade] = palettes[hash % palettes.length];
    const mark = categoryMarks[category] || categoryMarks.Indices;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${shade}"/><stop offset="1" stop-color="#101010"/></linearGradient></defs><rect x="1" y="1" width="52" height="52" rx="14" fill="url(#g)" stroke="${accent}" stroke-opacity=".62"/><g style="color:${accent}">${mark}</g><text x="27" y="49" text-anchor="middle" fill="#f5f5f5" font-family="Arial,sans-serif" font-size="7" font-weight="700" letter-spacing=".7">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  };
})();
