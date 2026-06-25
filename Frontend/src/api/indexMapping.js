const INDEX_MAP = {
  IN: {
    currency: "₹",
    locale: "en-IN",
    symbols: [
      { proName: "NSE:NIFTY", title: "NIFTY 50" },
      { proName: "BSE:SENSEX", title: "SENSEX" },
      { proName: "NSE:BANKNIFTY", title: "BANK NIFTY" },
    ],
    // For the "Open X" navigation — route name mapped below
    routes: [
      { label: "NIFTY 50", route: "NIFTY" },
      { label: "SENSEX", route: "SENSEX" },
      { label: "BANK NIFTY", route: "BANKNIFTY" },
    ],
  },

  US: {
    currency: "$",
    locale: "en-US",
    symbols: [
      { proName: "TVC:SPX", title: "S&P 500" },
      { proName: "TVC:IXIC", title: "NASDAQ" },
      { proName: "TVC:DJI", title: "DOW JONES" },
    ],
    routes: [
      { label: "S&P 500", route: "SPX" },
      { label: "NASDAQ", route: "IXIC" },
      { label: "DOW JONES", route: "DJI" },
    ],
  },

  GB: {
    currency: "£",
    locale: "en-GB",
    symbols: [
      { proName: "TVC:FTSE", title: "FTSE 100" },
      { proName: "TVC:FTMC", title: "FTSE 250" },
      { proName: "TVC:SXXP", title: "EURO STOXX" },
    ],
    routes: [
      { label: "FTSE 100", route: "FTSE" },
      { label: "FTSE 250", route: "FTMC" },
      { label: "EURO STOXX", route: "STOXX" },
    ],
  },

  JP: {
    currency: "¥",
    locale: "ja-JP",
    symbols: [
      { proName: "TVC:NI225", title: "NIKKEI 225" },
      { proName: "TVC:TOPX", title: "TOPIX" },
      { proName: "TVC:JP400", title: "JPX-NIKKEI" },
    ],
    routes: [
      { label: "NIKKEI 225", route: "NI225" },
      { label: "TOPIX", route: "TOPX" },
      { label: "JPX-NIKKEI", route: "JP400" },
    ],
  },

  DE: {
    currency: "€",
    locale: "de-DE",
    symbols: [
      { proName: "TVC:GDAXI", title: "DAX 40" },
      { proName: "TVC:MDAXI", title: "MDAX" },
      { proName: "TVC:SDAXI", title: "SDAX" },
    ],
    routes: [
      { label: "DAX 40", route: "GDAXI" },
      { label: "MDAX", route: "MDAXI" },
      { label: "SDAX", route: "SDAXI" },
    ],
  },

  FR: {
    currency: "€",
    locale: "fr-FR",
    symbols: [
      { proName: "TVC:FCHI", title: "CAC 40" },
      { proName: "TVC:PCI", title: "CAC ALL" },
    ],
    routes: [
      { label: "CAC 40", route: "FCHI" },
      { label: "CAC ALL", route: "PCI" },
    ],
  },

  AU: {
    currency: "A$",
    locale: "en-AU",
    symbols: [
      { proName: "TVC:AXJO", title: "ASX 200" },
      { proName: "TVC:XAO", title: "ALL ORDS" },
    ],
    routes: [
      { label: "ASX 200", route: "AXJO" },
      { label: "ALL ORDS", route: "XAO" },
    ],
  },

  HK: {
    currency: "HK$",
    locale: "en-HK",
    symbols: [
      { proName: "TVC:HSI", title: "HANG SENG" },
      { proName: "TVC:HSTECH", title: "HANG SENG TECH" },
    ],
    routes: [
      { label: "HANG SENG", route: "HSI" },
      { label: "HANG SENG TECH", route: "HSTECH" },
    ],
  },

  CA: {
    currency: "C$",
    locale: "en-CA",
    symbols: [
      { proName: "TVC:TSX", title: "TSX COMP" },
      { proName: "TVC:TSX60", title: "TSX 60" },
    ],
    routes: [
      { label: "TSX COMP", route: "TSX" },
      { label: "TSX 60", route: "TSX60" },
    ],
  },

  CN: {
    currency: "¥",
    locale: "zh-CN",
    symbols: [
      { proName: "TVC:SSEC", title: "SHANGHAI" },
      { proName: "TVC:CSI300", title: "CSI 300" },
      { proName: "TVC:SZSE", title: "SHENZHEN" },
    ],
    routes: [
      { label: "SHANGHAI", route: "SSEC" },
      { label: "CSI 300", route: "CSI300" },
      { label: "SHENZHEN", route: "SZSE" },
    ],
  },

  KR: {
    currency: "₩",
    locale: "ko-KR",
    symbols: [
      { proName: "TVC:KOSPI", title: "KOSPI" },
      { proName: "TVC:KQ11", title: "KOSDAQ" },
    ],
    routes: [
      { label: "KOSPI", route: "KOSPI" },
      { label: "KOSDAQ", route: "KQ11" },
    ],
  },

  SG: {
    currency: "S$",
    locale: "en-SG",
    symbols: [
      { proName: "TVC:STI", title: "STRAITS TIMES" },
    ],
    routes: [{ label: "STRAITS TIMES", route: "STI" }],
  },

  BR: {
    currency: "R$",
    locale: "pt-BR",
    symbols: [
      { proName: "TVC:IBOV", title: "IBOVESPA" },
    ],
    routes: [{ label: "IBOVESPA", route: "IBOV" }],
  },

  ZA: {
    currency: "R",
    locale: "en-ZA",
    symbols: [
      { proName: "TVC:J203", title: "JSE TOP 40" },
    ],
    routes: [{ label: "JSE TOP 40", route: "J203" }],
  },
};

// Default to India if country not in map
export function getIndexConfig(countryCode) {
  return INDEX_MAP[countryCode] || INDEX_MAP.IN;
}

export function isIndianIndexRoute(routeName) {
  const upper = String(routeName || "").toUpperCase().trim();
  return ["NIFTY", "SENSEX", "BANKNIFTY"].includes(upper);
}

export function getAllIndexRoutes() {
  return Object.entries(INDEX_MAP).flatMap(([countryCode, config]) =>
    (config.routes || []).map((item) => ({
      ...item,
      countryCode,
    }))
  );
}

// ── Reverse lookup: given a route name (e.g. "SPX", "FTSE"), return { tvSymbol, label } ──
// Used by StockDetails to resolve TradingView symbols for global indexes.
export function resolveIndexByRoute(routeName) {
  if (!routeName) return null;

  const upper = String(routeName).toUpperCase().trim();

  for (const countryCode of Object.keys(INDEX_MAP)) {
    const config = INDEX_MAP[countryCode];
    for (const item of config.routes) {
      if (item.route.toUpperCase() === upper) {
        // Find the matching TradingView proName
        const symbolEntry = config.symbols.find(
          (s) => s.title === item.label
        );
        return {
          tvSymbol: symbolEntry ? symbolEntry.proName : null,
          label: item.label,
          route: item.route,
          countryCode,
        };
      }
    }
  }

  return null;
}

export const SUPPORTED_COUNTRIES = Object.keys(INDEX_MAP);
