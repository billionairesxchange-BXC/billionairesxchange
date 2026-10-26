# Investment Center stock listings

The Investment Center combines exchange listings from EOD Historical Data, Alpha Vantage, FCS API, and Upstox when the providers support the selected country. Results are deduplicated by exchange and symbol, and each listing shows its contributing source or sources. The provider catalog reflects the providers' actual coverage and cannot guarantee every publicly traded security.

## Server configuration

Set provider keys only in the API server environment. Never place real keys in browser code or commit them:

- `EODHD_API_TOKEN` enables EOD Historical Data exchange catalogs and stock listings.
- `ALPHA_VANTAGE_API_KEY` enables Alpha Vantage's active listing-status file for America (USA).
- `FCS_API_KEY` enables the FCS API stock catalog. Results are filtered by the provider-reported country.
- Upstox's public daily instrument master supplies NSE/BSE equity instruments for India and does not use a user API token for this catalog.

The key names are documented in `.env.example`. Restart or redeploy the API after setting environment variables. Missing or unavailable providers appear as warnings; other configured sources can still return listings.

## Coverage and caching

- EOD Historical Data supplies listings for its reported exchanges, including the Jamaica Stock Exchange when covered by the provider.
- Alpha Vantage's listing-status catalog is used for US active listings; it is not treated as a complete catalog for other countries.
- FCS API is queried for its stock catalog and filtered to the selected country when the provider includes a matching country code/name.
- Upstox instruments are included for India, limited to NSE and BSE equity instruments (`EQ`).
- Featured country choices are America, Barbados, Cayman, Cuba, Jamaica, Puerto Rico, UK, and India. Cuba has no public stock exchange listings; Puerto Rico has no separate exchange.
- Stocks are actual provider-returned catalog records; no sample listings are added as fallback data.

Provider stock catalogs are cached in server memory for up to 24 hours, and merged country results for up to six hours. The browser displays up to 100 listings at a time and supports filtering and loading more. Country-listing data is not a quote feed; portfolio allocations and charts remain illustrative demos and no brokerage orders are sent.

## API routes

- `GET /api/stocks/countries` returns provider-supported countries and the featured markets.
- `GET /api/stocks/listings?country=JAM` returns merged listings and provider warnings for a country code.
