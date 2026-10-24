# Investment Center stock listings

The Investment Center retrieves supported stock exchanges, countries, and active stock listings from EOD Historical Data through the server API. Exchange listings are grouped by provider-reported country; the country list reflects the provider's coverage and does not imply that every country has a supported exchange.

## Configuration

Set `EODHD_API_TOKEN` as a server-side environment variable. Do not expose the token in browser code or commit a real token. The variable is documented in `.env.example`.

Without the token, the country cards remain visible and listing requests show an explicit configuration error with instructions to set `EODHD_API_TOKEN` in the server environment and restart or redeploy the API. Provider rate limits and exchange-level errors are surfaced in the Investment Center.

## API routes

- `GET /api/stocks/countries` returns supported countries and their exchanges.
- `GET /api/stocks/listings?country=USA` returns stock listings for the selected ISO 3166-1 alpha-3 country code.

Exchange and country responses are cached in server memory. Complete country listings are cached for six hours; partial results with unavailable exchanges are retried after one minute. The browser displays up to 100 listings at a time and supports filtering and loading additional listings.

The main Investment Center and the Stock Investments catalog use the same API. Listing data is not a quote feed, and the portfolio, allocations, and charts remain illustrative demo features; no brokerage orders are sent.

Country choices on both stock browsing pages show a regional flag icon and sort alphabetically by their displayed names. The dedicated Stocks page uses selectable country cards. For familiarity, the United States, Cayman Islands, and United Kingdom are displayed as America, Cayman, and UK.

For Jamaica (`JAM`), the listing endpoint aggregates common and preferred stocks from every Jamaica exchange returned by the provider, including the Jamaica Stock Exchange when covered. The dedicated Stocks page displays the full Jamaica result set without the 100-listing page limit. Provider coverage and the server-side EODHD token are required for these listings to load.

America (NYSE/Nasdaq), Barbados, Cayman, Cuba, Puerto Rico, Jamaica, and UK are always shown as country choices, even before the provider token is configured. Their cards identify the relevant exchange or market context. Stock listings are shown only when returned by the configured provider; countries with no provider exchange coverage display an explicit no-listings message rather than fabricated stocks. Cuba has no public stock exchange listings, and Puerto Rico does not have a separate stock exchange.
