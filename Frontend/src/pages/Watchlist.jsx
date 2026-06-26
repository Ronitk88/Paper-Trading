import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaChartLine,
  FaEye,
  FaRedo,
  FaSearch,
  FaStar,
  FaTrash,
} from "react-icons/fa";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SkeletonLoader from "../components/SkeletonLoader";
import { useConfirm } from "../components/ConfirmProvider";
import api from "../api/api";

function Watchlist() {
  const navigate = useNavigate();
  const { showConfirm } = useConfirm();

  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [removingSymbol, setRemovingSymbol] = useState(null);
  const [search, setSearch] = useState("");
  const [livePrices, setLivePrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);

  useEffect(() => {
    loadWatchlist();
  }, []);

  useEffect(() => {
    if (stocks.length === 0) return;
    loadLivePrices();
    const interval = setInterval(loadLivePrices, 10000);
    return () => clearInterval(interval);
  }, [stocks.length]);

  async function loadLivePrices() {
    try {
      setPricesLoading(true);
      const instruments = stocks
        .filter((s) => s.exchange && s.token)
        .map((s) => ({
          exchange: s.exchange,
          symboltoken: s.token,
          tradingsymbol: s.symbol,
        }));
      if (instruments.length === 0) return;
      const res = await api.post("/market/quote-batch", { instruments });
      const quotes = res.data?.quotes || [];
      const priceMap = {};
      quotes.forEach((q) => {
        const key = `${q.exchange}:${q.symboltoken}`;
        priceMap[key] = q;
      });
      setLivePrices(priceMap);
    } catch (err) {
      console.error("Live prices load failed:", err);
    } finally {
      setPricesLoading(false);
    }
  };

  const getLivePrice = (item) => {
    const key = `${item.exchange}:${item.token}`;
    return livePrices[key];
  };

  const formatMoney = (value) => {
    if (value === null || value === undefined) return "-";
    return Number(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  async function loadWatchlist() {
    try {
      setLoading(true);

      const res = await api.get("/watchlist/");

      setStocks(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load watchlist:", err);
      window.showToast?.("Unable to load watchlist.");
    } finally {
      setLoading(false);
    }
  };

  const removeFromWatchlist = async (symbol) => {
    const confirmed = await showConfirm(
      `Remove ${symbol} from watchlist?`,
      { title: "Remove from Watchlist", confirmLabel: "Remove", isDangerous: true }
    );

    if (!confirmed) return;

    try {
      setRemovingSymbol(symbol);

      await api.delete(`/watchlist/${encodeURIComponent(symbol)}`);

      window.showToast?.(`${symbol} removed from watchlist`);

      await loadWatchlist();
    } catch (err) {
      console.error("Remove failed:", err);
      window.showToast?.(err?.response?.data?.detail || "Remove failed");
    } finally {
      setRemovingSymbol(null);
    }
  };

  const openStock = (symbol) => {
    if (!symbol) return;
    navigate(`/stocks/${encodeURIComponent(symbol)}`);
  };

  const openStocksPage = () => {
    navigate("/stocks");
  };

  const formatNumber = (value) => {
    return Number(value || 0).toLocaleString("en-IN");
  };

  const filteredStocks = useMemo(() => {
    const cleanSearch = search.trim().toUpperCase();

    if (!cleanSearch) return stocks;

    return stocks.filter((item) => {
      const combinedText = `${item.symbol || ""} ${item.name || ""} ${
        item.exchange || ""
      } ${item.token || ""}`.toUpperCase();

      return combinedText.includes(cleanSearch);
    });
  }, [stocks, search]);

  const nseCount = stocks.filter(
    (item) => String(item.exchange || "").toUpperCase() === "NSE"
  ).length;

  const bseCount = stocks.filter(
    (item) => String(item.exchange || "").toUpperCase() === "BSE"
  ).length;

  const unknownExchangeCount = Math.max(
    0,
    stocks.length - nseCount - bseCount
  );

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <div className="dashboard-main">
        <Navbar />

        <div className="dashboard-content professional-dashboard">
          <div className="pro-dashboard-hero">
            <div>
              <p className="pro-eyebrow">Market Watch Center</p>

              <h1>
                My <span>Watchlist</span>
              </h1>

              <p>
                Track your favorite stocks, quickly open stock details, trade
                paper positions, and keep your most important instruments ready
                for action.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "16px",
                  flexWrap: "wrap",
                }}
              >
                <span className="status-pill status-success">
                  {formatNumber(stocks.length)} Tracked
                </span>

                <span className="status-pill status-warning">
                  {formatNumber(nseCount)} NSE
                </span>

                <span className="status-pill status-success">
                  {formatNumber(bseCount)} BSE
                </span>
              </div>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span className="status-pill status-success">
                  Active Watchlist
                </span>
                <p>Saved to your account</p>
              </div>

              <button
                className="primary-action"
                onClick={loadWatchlist}
                disabled={loading}
              >
                <FaRedo style={{ marginRight: "8px" }} />
                {loading ? "Refreshing..." : "Refresh"}
              </button>

              <button className="primary-action" onClick={openStocksPage}>
                <FaSearch style={{ marginRight: "8px" }} />
                Find Stocks
              </button>
            </div>
          </div>

          <div className="pro-kpi-grid">
            <div className="pro-kpi-card">
              <p>Total Watchlist</p>
              <h2>{formatNumber(stocks.length)}</h2>
              <span className="pro-muted">Saved instruments</span>
            </div>

            <div className="pro-kpi-card">
              <p>NSE Instruments</p>
              <h2>{formatNumber(nseCount)}</h2>
              <span className="pro-muted">National Stock Exchange</span>
            </div>

            <div className="pro-kpi-card">
              <p>BSE Instruments</p>
              <h2>{formatNumber(bseCount)}</h2>
              <span className="pro-muted">Bombay Stock Exchange</span>
            </div>

            <div className="pro-kpi-card">
              <p>Other / Unmapped</p>
              <h2>{formatNumber(unknownExchangeCount)}</h2>
              <span className="pro-muted">Symbols without exchange metadata</span>
            </div>
          </div>

          <div className="pro-dashboard-grid" style={{ marginTop: "24px" }}>
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaStar style={{ marginRight: "10px", color: "#2563eb" }} />
                    Watchlist Search
                  </h2>
                  <p>Search your saved symbols, names, exchanges, or tokens.</p>
                </div>

                <button
                  className="warning-action"
                  onClick={() => setSearch("")}
                  disabled={!search}
                  style={{
                    opacity: search ? 1 : 0.55,
                    cursor: search ? "pointer" : "not-allowed",
                  }}
                >
                  Clear Search
                </button>
              </div>

              <div style={{ position: "relative" }}>
                <FaSearch
                  style={{
                    position: "absolute",
                    left: "16px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#94a3b8",
                    fontSize: "14px",
                  }}
                />

                <input
                  type="text"
                  placeholder="Search watchlist, e.g. RELIANCE, TCS, INFY..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "14px 14px 14px 42px",
                    borderRadius: "14px",
                    border: "1px solid #d1d5db",
                    outline: "none",
                    fontSize: "15px",
                    background: "white",
                  }}
                />
              </div>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Quick Actions</h2>
                  <p>Use watchlist as your daily trading shortlist.</p>
                </div>
              </div>

              <div className="market-card-list">
                <button
                  type="button"
                  className="market-card-item market-clickable"
                  onClick={openStocksPage}
                >
                  <span>Add More Stocks</span>
                  <strong>Open Market</strong>
                </button>

                <button
                  type="button"
                  className="market-card-item market-clickable"
                  onClick={() => navigate("/portfolio")}
                >
                  <span>Portfolio</span>
                  <strong>View Holdings</strong>
                </button>

                <button
                  type="button"
                  className="market-card-item market-clickable"
                  onClick={() => navigate("/orders")}
                >
                  <span>Orders</span>
                  <strong>Review Execution</strong>
                </button>
              </div>
            </div>
          </div>

          <div className="table-card" style={{ marginTop: "30px" }}>
            <div
              className="pro-panel-header"
              style={{
                marginBottom: "20px",
              }}
            >
              <div>
                <h2>My Watchlist</h2>
                <p>
                  Showing {formatNumber(filteredStocks.length)} of{" "}
                  {formatNumber(stocks.length)} saved stocks.
                </p>
              </div>

              <button className="primary-action" onClick={openStocksPage}>
                Add Stock
              </button>
            </div>

            {loading ? (
              <SkeletonLoader rows={6} />
            ) : filteredStocks.length === 0 ? (
              <div className="empty-state">
                <h3>
                  {stocks.length === 0
                    ? "No stocks in watchlist"
                    : "No matching stocks found"}
                </h3>

                <p>
                  {stocks.length === 0
                    ? "Add stocks from the Stocks page to track them here."
                    : "Try a different symbol, name, exchange, or token."}
                </p>

                <button
                  className="primary-action"
                  onClick={openStocksPage}
                  style={{ marginTop: "18px" }}
                >
                  Explore Stocks
                </button>
              </div>
            ) : (
              <div className="table-scroll">
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Exchange</th>
                    <th>LTP</th>
                    <th>Change</th>
                    <th>Day High / Low</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredStocks.map((item) => {
                    const symbol = item.symbol || "-";
                    const rowKey = item.id || `${item.exchange}-${item.token}-${symbol}`;
                    const isRemoving = removingSymbol === symbol;
                    const live = getLivePrice(item);

                    return (
                      <tr
                        key={rowKey}
                        style={{ cursor: "pointer" }}
                        onClick={() => openStock(symbol)}
                      >
                        <td>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openStock(symbol);
                            }}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              color: "#2563eb",
                              fontWeight: "900",
                              cursor: "pointer",
                            }}
                          >
                            {symbol}
                          </button>
                        </td>

                        <td>
                          <strong>{item.name || "Watchlist Instrument"}</strong>
                          <p
                            style={{
                              margin: "4px 0 0",
                              color: "#64748b",
                              fontSize: "13px",
                              fontWeight: "700",
                            }}
                          >
                            Click row to open chart, stats, and order panel.
                          </p>
                        </td>

                        <td>
                          {item.exchange ? (
                            <span
                              className={
                                String(item.exchange).toUpperCase() === "NSE"
                                  ? "status-pill status-success"
                                  : "status-pill status-warning"
                              }
                            >
                              {item.exchange}
                            </span>
                          ) : (
                            <span className="status-pill">-</span>
                          )}
                        </td>

                        <td>
                          <strong style={{ fontSize: "16px" }}>
                            {live?.ltp != null ? `₹${formatMoney(live.ltp)}` : pricesLoading ? "..." : "-"}
                          </strong>
                        </td>

                        <td>
                          {live?.change != null ? (
                            <span style={{ color: Number(live.change) >= 0 ? "#16a34a" : "#dc2626", fontWeight: "800" }}>
                              {Number(live.change) >= 0 ? "+" : ""}₹{formatMoney(live.change)}
                              {live.change_percent != null && ` (${Number(live.change_percent).toFixed(2)}%)`}
                            </span>
                          ) : pricesLoading ? "..." : "-"}
                        </td>

                        <td>
                          <span style={{ color: "#475569", fontWeight: "700", fontSize: "13px" }}>
                            {live?.high != null ? `₹${formatMoney(live.high)}` : "-"} / {live?.low != null ? `₹${formatMoney(live.low)}` : "-"}
                          </span>
                        </td>

                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: "10px",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              className="primary-action"
                              onClick={(e) => {
                                e.stopPropagation();
                                openStock(symbol);
                              }}
                            >
                              <FaEye style={{ marginRight: "7px" }} />
                              View
                            </button>

                            <button
                              className="buy-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                openStock(symbol);
                              }}
                            >
                              <FaChartLine style={{ marginRight: "7px" }} />
                              Trade
                            </button>

                            <button
                              className="danger-action"
                              disabled={isRemoving}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromWatchlist(symbol);
                              }}
                              style={{
                                opacity: isRemoving ? 0.6 : 1,
                                cursor: isRemoving ? "not-allowed" : "pointer",
                              }}
                            >
                              <FaTrash style={{ marginRight: "7px" }} />
                              {isRemoving ? "Removing..." : "Remove"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}

            <div className="footer-note">
              Watchlist helps you keep your most important instruments ready for
              analysis and paper trading. Use the Stocks page to add more NSE/BSE
              symbols.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Watchlist;
