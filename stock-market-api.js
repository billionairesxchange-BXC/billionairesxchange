import './api-config.js';

const countryDisplayNames = {
  USA: 'America',
  BRB: 'Barbados',
  CYM: 'Cayman',
  CUB: 'Cuba',
  PRI: 'Puerto Rico',
  JAM: 'Jamaica',
  GBR: 'UK',
};

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
