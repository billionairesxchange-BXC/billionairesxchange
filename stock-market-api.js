import './api-config.js';

const countryDisplayNames = {
  USA: 'America',
  BRB: 'Barbados',
  CYM: 'Cayman',
  CUB: 'Cuba',
  PRI: 'Puerto Rico',
  JAM: 'Jamaica',
  GBR: 'UK',
  IND: 'India',
};

export function getFeaturedStockCountries() {
  return [
    { code: 'USA', iso2: 'US', name: 'United States', market: 'NYSE / Nasdaq', exchanges: [] },
    { code: 'BRB', iso2: 'BB', name: 'Barbados', market: 'Barbados Stock Exchange', exchanges: [] },
    { code: 'CYM', iso2: 'KY', name: 'Cayman Islands', market: 'Cayman Islands Stock Exchange', exchanges: [] },
    { code: 'CUB', iso2: 'CU', name: 'Cuba', market: 'No public stock exchange listings', exchanges: [] },
    { code: 'PRI', iso2: 'PR', name: 'Puerto Rico', market: 'U.S. exchanges; no separate Puerto Rico exchange', exchanges: [] },
    { code: 'JAM', iso2: 'JM', name: 'Jamaica', market: 'Jamaica Stock Exchange', exchanges: [] },
    { code: 'GBR', iso2: 'GB', name: 'United Kingdom', market: 'London Stock Exchange', exchanges: [] },
    { code: 'IND', iso2: 'IN', name: 'India', market: 'NSE / BSE', exchanges: [] }
  ];
}

export function getStockCountryName(country) {
  return countryDisplayNames[country.code] || country.name;
}

export function getStockCountryFlag(country) {
  const code = String(country.iso2 || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...Array.from(code, (letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

export function sortStockCountries(countries) {
  return [...countries].sort((left, right) =>
    getStockCountryName(left).localeCompare(getStockCountryName(right), 'en', { sensitivity: 'base' })
  );
}

async function requestStockApi(path) {
  const apiBase = window.MAKINGS_API_BASE_URL || '';
  const response = await fetch(`${apiBase}/api/stocks/${path}`);
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`The stock service returned an invalid response. ${error.message}`);
  }
  if (!response.ok) throw new Error(data.error || `Stock data request failed (${response.status}).`);
  return data;
}

export async function fetchStockCountries() {
  const data = await requestStockApi('countries');
  if (!Array.isArray(data.countries)) throw new Error('The stock service returned an invalid country list.');
  return data.countries;
}

export async function fetchCountryStockListings(countryCode) {
  if (!/^[A-Z]{3}$/.test(countryCode)) throw new Error('Choose a valid country code.');
  const data = await requestStockApi(`listings?country=${encodeURIComponent(countryCode)}`);
  if (!Array.isArray(data.listings)) throw new Error('The stock service returned an invalid listing list.');
  return {
    listings: data.listings,
    warnings: Array.isArray(data.warnings) ? data.warnings : []
  };
}
