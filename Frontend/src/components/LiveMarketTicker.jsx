import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaExternalLinkAlt } from "react-icons/fa";

const GLOBAL_INDEXES = [
  // India - keep inside your app
  {
    label: "NIFTY 50",
    country: "India",
    exchange: "NSE",
    symbol: "Nifty 50",
    token: "99926000",
    tradingViewSymbol: "NSE:NIFTY",
    isIndia: true,
  },
  {
    label: "SENSEX",
    country: "India",
    exchange: "BSE",
    symbol: "SENSEX",
    token: "99919000",
    tradingViewSymbol: "BSE:SENSEX",
    isIndia: true,
  },
  {
    label: "BANK NIFTY",
    country: "India",
    exchange: "NSE",
    symbol: "Nifty Bank",
    token: "99926009",
    tradingViewSymbol: "NSE:BANKNIFTY",
    isIndia: true,
  },

  // United States
  { label: "S&P 500", country: "USA", tradingViewSymbol: "SP:SPX" },
  { label: "NASDAQ 100", country: "USA", tradingViewSymbol: "NASDAQ:NDX" },
  { label: "DOW JONES", country: "USA", tradingViewSymbol: "DJ:DJI" },
  { label: "RUSSELL 2000", country: "USA", tradingViewSymbol: "TVC:RUT" },

  // Americas
  { label: "TSX 60", country: "Canada", tradingViewSymbol: "TSX:TX60" },
  { label: "TSX COMP", country: "Canada", tradingViewSymbol: "TSX:TSX" },
  { label: "IBOVESPA", country: "Brazil", tradingViewSymbol: "BMFBOVESPA:IBOV" },
  { label: "IPC", country: "Mexico", tradingViewSymbol: "BMV:ME" },
  { label: "MERVAL", country: "Argentina", tradingViewSymbol: "BCBA:IMV" },
  { label: "IPSA", country: "Chile", tradingViewSymbol: "BCS:SP_IPSA" },

  // Europe
  { label: "FTSE 100", country: "UK", tradingViewSymbol: "TVC:UKX" },
  { label: "DAX 40", country: "Germany", tradingViewSymbol: "XETR:DAX" },
  { label: "CAC 40", country: "France", tradingViewSymbol: "EURONEXT:PX1" },
  { label: "EURO STOXX 50", country: "Europe", tradingViewSymbol: "TVC:SX5E" },
  { label: "SMI", country: "Switzerland", tradingViewSymbol: "SIX:SMI" },
  { label: "IBEX 35", country: "Spain", tradingViewSymbol: "BME:IBC" },
  { label: "FTSE MIB", country: "Italy", tradingViewSymbol: "MIL:FTSEMIB" },
  { label: "AEX", country: "Netherlands", tradingViewSymbol: "EURONEXT:AEX" },
  { label: "BEL 20", country: "Belgium", tradingViewSymbol: "EURONEXT:BEL20" },
  { label: "OMX 30", country: "Sweden", tradingViewSymbol: "OMXSTO:OMXS30" },
  { label: "OMXC 25", country: "Denmark", tradingViewSymbol: "OMXCOP:OMXC25" },
  { label: "OBX", country: "Norway", tradingViewSymbol: "OSL:OBX" },
  { label: "WIG 20", country: "Poland", tradingViewSymbol: "GPW:WIG20" },
  { label: "ATX", country: "Austria", tradingViewSymbol: "VIE:ATX" },
  { label: "PSI 20", country: "Portugal", tradingViewSymbol: "EURONEXT:PSI20" },
  { label: "ISEQ", country: "Ireland", tradingViewSymbol: "EURONEXT:ISEQ" },
  { label: "BIST 100", country: "Turkey", tradingViewSymbol: "BIST:XU100" },

  // Asia
  { label: "NIKKEI 225", country: "Japan", tradingViewSymbol: "TVC:NI225" },
  { label: "TOPIX", country: "Japan", tradingViewSymbol: "TSE:TOPIX" },
  { label: "HANG SENG", country: "Hong Kong", tradingViewSymbol: "HSI:HSI" },
  { label: "SHANGHAI", country: "China", tradingViewSymbol: "SSE:000001" },
  { label: "CSI 300", country: "China", tradingViewSymbol: "SSE:000300" },
  { label: "TAIEX", country: "Taiwan", tradingViewSymbol: "TWSE:TAIEX" },
  { label: "KOSPI", country: "South Korea", tradingViewSymbol: "KRX:KOSPI" },
  { label: "STI", country: "Singapore", tradingViewSymbol: "SGX:STI" },
  { label: "JAKARTA", country: "Indonesia", tradingViewSymbol: "IDX:COMPOSITE" },
  { label: "SET", country: "Thailand", tradingViewSymbol: "SET:SET" },
  { label: "KLCI", country: "Malaysia", tradingViewSymbol: "FTSEMYX:FBMKLCI" },
  { label: "PSEI", country: "Philippines", tradingViewSymbol: "PSE:PSEI" },
  { label: "VNINDEX", country: "Vietnam", tradingViewSymbol: "HOSE:VNINDEX" },
  { label: "KSE 100", country: "Pakistan", tradingViewSymbol: "PSX:KSE100" },

  // Oceania
  { label: "ASX 200", country: "Australia", tradingViewSymbol: "ASX:XJO" },
  { label: "NZX 50", country: "New Zealand", tradingViewSymbol: "NZX:NZ50" },

  // Middle East / Africa
  { label: "TASI", country: "Saudi Arabia", tradingViewSymbol: "TADAWUL:TASI" },
  { label: "DFM", country: "Dubai", tradingViewSymbol: "DFM:DFMGI" },
  { label: "ADX", country: "Abu Dhabi", tradingViewSymbol: "ADX:FADGI" },
  { label: "QE INDEX", country: "Qatar", tradingViewSymbol: "QSE:GNRI" },
  { label: "TA 35", country: "Israel", tradingViewSymbol: "TASE:TA35" },
  { label: "EGX 30", country: "Egypt", tradingViewSymbol: "EGX:EGX30" },
  { label: "JSE TOP 40", country: "South Africa", tradingViewSymbol: "JSE:J200" },
];

function LiveMarketTicker() {
  const navigate = useNavigate();

  const tickerRef = useRef(null);
  const animationRef = useRef(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef({
    startX: 0,
    startScrollLeft: 0,
  });

  const tickerItems = useMemo(() => {
    return [...GLOBAL_INDEXES, ...GLOBAL_INDEXES];
  }, []);

  useEffect(() => {
    const ticker = tickerRef.current;

    if (!ticker) return;

    const speed = 0.45;

    const animate = () => {
      if (!isDragging && ticker) {
        ticker.scrollLeft += speed;

        if (ticker.scrollLeft >= ticker.scrollWidth / 2) {
          ticker.scrollLeft = 0;
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isDragging]);

  const openIndex = (item) => {
    if (item.isIndia) {
      navigate(`/stocks/${encodeURIComponent(item.symbol)}`);
      return;
    }

    const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(
      item.tradingViewSymbol
    )}`;

    window.open(tradingViewUrl, "_blank", "noopener,noreferrer");
  };

  const handleMouseDown = (e) => {
    const ticker = tickerRef.current;
    if (!ticker) return;

    setIsDragging(true);

    dragState.current = {
      startX: e.pageX - ticker.offsetLeft,
      startScrollLeft: ticker.scrollLeft,
    };
  };

  const handleMouseMove = (e) => {
    const ticker = tickerRef.current;
    if (!ticker || !isDragging) return;

    e.preventDefault();

    const x = e.pageX - ticker.offsetLeft;
    const walk = (x - dragState.current.startX) * 1.4;

    ticker.scrollLeft = dragState.current.startScrollLeft - walk;
  };

  const stopDragging = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e) => {
    const ticker = tickerRef.current;
    if (!ticker) return;

    setIsDragging(true);

    dragState.current = {
      startX: e.touches[0].pageX - ticker.offsetLeft,
      startScrollLeft: ticker.scrollLeft,
    };
  };

  const handleTouchMove = (e) => {
    const ticker = tickerRef.current;
    if (!ticker || !isDragging) return;

    const x = e.touches[0].pageX - ticker.offsetLeft;
    const walk = (x - dragState.current.startX) * 1.4;

    ticker.scrollLeft = dragState.current.startScrollLeft - walk;
  };

  return (
    <div className="global-index-ticker-shell">
      <div
        ref={tickerRef}
        className={`global-index-ticker ${isDragging ? "dragging" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={stopDragging}
      >
        {tickerItems.map((item, index) => (
          <button
            key={`${item.label}-${item.country}-${index}`}
            type="button"
            className={item.isIndia ? "index-pill indian-index" : "index-pill global-index"}
            onClick={() => openIndex(item)}
            title={
              item.isIndia
                ? `Open ${item.label} inside app`
                : `Open ${item.label} TradingView chart`
            }
          >
            <span className="index-label">{item.label}</span>
            <span className="index-country">{item.country}</span>

            {!item.isIndia && <FaExternalLinkAlt className="index-external-icon" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export default LiveMarketTicker;