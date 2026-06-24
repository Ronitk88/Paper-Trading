import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { detectCountry } from "../api/location";
import { getIndexConfig } from "../api/indexMapping";

const UK_INDEXES = getIndexConfig("GB");

function mergeRoutes(userRoutes, ukRoutes) {
  const seen = new Set();
  const merged = [];

  const add = (item) => {
    const key = item.route.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  };

  (userRoutes || []).forEach(add);
  (ukRoutes || []).forEach(add);

  return merged;
}

function LiveMarketTicker({ variant = "strip" }) {
  const navigate = useNavigate();
  const [country, setCountry] = useState(null);
  const [userConfig, setUserConfig] = useState(null);
  const [allRoutes, setAllRoutes] = useState([]);

  useEffect(() => {
    detectCountry().then((result) => {
      setCountry(result);
      const cfg = getIndexConfig(result.code);
      setUserConfig(cfg);
      setAllRoutes(mergeRoutes(cfg.routes, UK_INDEXES.routes));
    });
  }, []);

  // ── Cards variant — static card display ──
  if (variant === "cards") {
    const cardsConfig = userConfig || getIndexConfig("IN");

    return (
      <div className="market-card-list">
        {allRoutes.map((item) => (
          <button
            key={item.route}
            className="market-card-item market-clickable"
            onClick={() =>
              navigate(`/stocks/${encodeURIComponent(item.route)}`)
            }
            type="button"
          >
            <span>{item.label}</span>
            <strong>View Chart</strong>
          </button>
        ))}

        <div className="market-card-item">
          <span>Market Mode</span>
          <strong>
            {country?.name || "India"} · Paper Trading
          </strong>
        </div>
      </div>
    );
  }

  // ── Strip variant — scrolling ticker ──
  return (
    <div className="market-strip ticker-scroll-wrap" style={{ overflow: "hidden" }}>
      <div className="ticker-scroll-track">
        {allRoutes.length === 0 ? (
          <span className="ticker-scroll-item">
            Loading markets...
          </span>
        ) : (
          <>
            {[...Array(2)].map((_, dup) => (
              <div className="ticker-scroll-group" key={dup}>
                {allRoutes.map((item) => (
                  <span
                    key={`${item.route}-${dup}`}
                    className="ticker-scroll-item"
                    onClick={() =>
                      navigate(`/stocks/${encodeURIComponent(item.route)}`)
                    }
                    title={`Open ${item.label} chart`}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default LiveMarketTicker;
