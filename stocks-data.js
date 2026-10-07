// Stock exchanges and major listed companies by country
export const STOCK_EXCHANGES = {
  'United Kingdom': {
    exchange: 'London Stock Exchange (LSE)',
    companies: [
      { symbol: 'HSBA', name: 'HSBC Holdings', sector: 'Financial Services' },
      { symbol: 'SHEL', name: 'Shell', sector: 'Energy' },
      { symbol: 'ULVR', name: 'Unilever', sector: 'Consumer Goods' },
      { symbol: 'AVGO', name: 'AstraZeneca', sector: 'Pharmaceuticals' },
      { symbol: 'PRX', name: 'Prudential', sector: 'Financial Services' },
      { symbol: 'DGE', name: 'Diageo', sector: 'Beverages' },
      { symbol: 'GSK', name: 'GSK (GlaxoSmithKline)', sector: 'Pharmaceuticals' },
      { symbol: 'BAR', name: 'Barclays', sector: 'Financial Services' },
      { symbol: 'LLOY', name: 'Lloyds Banking', sector: 'Financial Services' },
      { symbol: 'RIO', name: 'Rio Tinto', sector: 'Mining' }
    ]
  },
  'Jamaica': {
    exchange: 'Jamaica Stock Exchange (JSE)',
    companies: [
      { symbol: 'NCB', name: 'NCB Financial Group', sector: 'Financial Services' },
      { symbol: 'JMMBGL', name: 'JMMB Group', sector: 'Financial Services' },
      { symbol: 'SCBFM', name: 'Scotia Group Jamaica', sector: 'Financial Services' },
      { symbol: 'FCIB', name: 'FirstCaribbean International Bank', sector: 'Financial Services' },
      { symbol: 'WISYNCO', name: 'Wisynco Group', sector: 'Consumer Goods' },
      { symbol: 'BARITA', name: 'Barita Investments', sector: 'Financial Services' },
      { symbol: 'PURITY', name: 'Purity Bakery', sector: 'Food & Beverage' },
      { symbol: 'CAR', name: 'Caribbean Assurance Holdings', sector: 'Insurance' },
      { symbol: 'NCB', name: 'National Commercial Bank Jamaica', sector: 'Banking' },
      { symbol: 'JETS', name: 'Jamaica Broilers Group', sector: 'Agriculture' }
    ]
  },
  'United States': {
    exchange: 'NASDAQ / NYSE',
    companies: [
      { symbol: 'AAPL', name: 'Apple', sector: 'Technology' },
      { symbol: 'MSFT', name: 'Microsoft', sector: 'Technology' },
      { symbol: 'GOOGL', name: 'Alphabet (Google)', sector: 'Technology' },
      { symbol: 'AMZN', name: 'Amazon', sector: 'Retail' },
      { symbol: 'NVDA', name: 'NVIDIA', sector: 'Semiconductors' },
      { symbol: 'TSLA', name: 'Tesla', sector: 'Automotive' },
      { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financial Services' },
      { symbol: 'V', name: 'Visa', sector: 'Financial Services' },
      { symbol: 'WMT', name: 'Walmart', sector: 'Retail' },
      { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Pharmaceuticals' }
    ]
  },
  'Cayman Islands': {
    exchange: 'Cayman Islands Stock Exchange (CSX)',
    companies: [
      { symbol: 'CRIX', name: 'Cayman Investment Bank', sector: 'Financial Services' },
      { symbol: 'CIB', name: 'Cayman Islands Bank', sector: 'Banking' },
      { symbol: 'BOOCI', name: 'Bank of the Cayman Islands', sector: 'Banking' },
      { symbol: 'CCIF', name: 'Cayman Capital Investment Fund', sector: 'Financial Services' },
      { symbol: 'CISL', name: 'Caribbean Insurance & Surety Ltd', sector: 'Insurance' },
      { symbol: 'CCIB', name: 'Cayman Commercial & Investment Bank', sector: 'Banking' },
      { symbol: 'SECU', name: 'Secure Holdings Ltd', sector: 'Financial Services' },
      { symbol: 'CFSI', name: 'Cayman Financial Services Inc', sector: 'Financial Services' },
      { symbol: 'CAIR', name: 'Cayman Airways', sector: 'Transportation' },
      { symbol: 'COIL', name: 'Caribbean Offshore Insurance Ltd', sector: 'Insurance' }
    ]
  },
  'Barbados': {
    exchange: 'Barbados Stock Exchange (BSE)',
    companies: [
      { symbol: 'CMMB', name: 'Caribbean Maritime & Merchant Bank', sector: 'Financial Services' },
      { symbol: 'SCBFM', name: 'Scotia Group Barbados', sector: 'Banking' },
      { symbol: 'FIB', name: 'FirstCaribbean International Bank', sector: 'Banking' },
      { symbol: 'BIZB', name: 'Barbados Investment & Development Bank', sector: 'Financial Services' },
      { symbol: 'RBB', name: 'Republic Bank Barbados', sector: 'Banking' },
      { symbol: 'DUNNP', name: 'Dunn & Company', sector: 'Retail' },
      { symbol: 'GONE', name: 'Gone Fishing', sector: 'Retail' },
      { symbol: 'BAIB', name: 'Barbados Agricultural Industrial Bank', sector: 'Agricultural' },
      { symbol: 'AIA', name: 'Assure Insurance Agents', sector: 'Insurance' },
      { symbol: 'CDB', name: 'Caribbean Development Bank', sector: 'Financial Services' }
    ]
  },
  'Puerto Rico': {
    exchange: 'PR Stock Exchange (PRSX)',
    companies: [
      { symbol: 'BPRZ', name: 'Bank of Puerto Rico', sector: 'Banking' },
      { symbol: 'OFG', name: 'Oriental Financial Group', sector: 'Financial Services' },
      { symbol: 'PRCO', name: 'PR Communications', sector: 'Telecommunications' },
      { symbol: 'AENF', name: 'Altus Energy', sector: 'Energy' },
      { symbol: 'ECPR', name: 'Equity Commonwealth PR', sector: 'Real Estate' },
      { symbol: 'PRGC', name: 'PR Gas & Power', sector: 'Utilities' },
      { symbol: 'PRSC', name: 'PR Sugar Company', sector: 'Agriculture' },
      { symbol: 'PRHI', name: 'PR Health Industries', sector: 'Healthcare' },
      { symbol: 'PRRT', name: 'PR Retail Trade', sector: 'Retail' },
      { symbol: 'PRFI', name: 'PR Financial Inc', sector: 'Financial Services' }
    ]
  },
  'Cuba': {
    exchange: 'Bolsa de Valores de La Habana (BVH)',
    companies: [
      { symbol: 'CBKS', name: 'Banco de Crédito y Comercio', sector: 'Banking' },
      { symbol: 'CBMT', name: 'Banco Metropolitano', sector: 'Banking' },
      { symbol: 'CTUR', name: 'Cuban Tourism Board', sector: 'Tourism' },
      { symbol: 'CENG', name: 'Cuban Energy Company', sector: 'Energy' },
      { symbol: 'CINT', name: 'Cuban International Trading', sector: 'International Trade' },
      { symbol: 'CSUG', name: 'Cuban Sugar Industry', sector: 'Agriculture' },
      { symbol: 'CMFG', name: 'Cuban Manufactured Goods', sector: 'Manufacturing' },
      { symbol: 'CTEL', name: 'Cuban Telecommunications', sector: 'Telecommunications' },
      { symbol: 'CPHA', name: 'Cuban Pharmaceuticals', sector: 'Pharmaceuticals' },
      { symbol: 'CMIN', name: 'Cuban Mining', sector: 'Mining' }
    ]
  }
};

// Export a sorted list of countries
export const COUNTRY_ORDER = Object.keys(STOCK_EXCHANGES).sort();
