import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FaChartLine,
  FaChevronLeft,
  FaChevronRight,
  FaDatabase,
  FaFilter,
  FaSearch,
  FaSyncAlt,
} from "react-icons/fa";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import api from "../api/api";
import SkeletonLoader from "../components/SkeletonLoader";

function Stocks() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [stocks, setStocks] = useState([]);
  const [search, setSearch] = useState("");
  const [exchange, setExchange] = useState("ALL");

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [pagination, setPagination] = useState({
    total: 0,
    total_pages: 1,
  });

  const [stats, setStats] = useState({
    total: 0,
    nse_count: 0,
    bse_count: 0,
  });

  const STOCKS_CACHE_TTL = 60 * 1000;

  const formatNumber = (value) => {
    return Number(value || 0).toLocaleString("en-IN");
  };

  const getStocksCacheKey = (pageNumber, searchValue, exchangeValue) => {
    return `stocks_cache_v1_${pageNumber}_${exchangeValue}_${
      searchValue || ""
    }`;
  };

  const saveStocksCache = (key, data) => {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          timestamp: Date.now(),
          data,
        })
      );
    } catch {
      // Ignore cache errors
    }
  };

  const readStocksCache = (key) => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      if (!parsed?.timestamp || !parsed?.data) {
        sessionStorage.removeItem(key);
        return null;
      }

      const isFresh = Date.now() - parsed.timestamp < STOCKS_CACHE_TTL;

      return {
        data: parsed.data,
        isFresh,
      };
    } catch {
      sessionStorage.removeItem(key);
      return null;
    }
  };

  const loadStats = useCallback(async () => {
    try {
      const cachedStats = sessionStorage.getItem("stocks_stats_cache_v1");

      if (cachedStats) {
        const parsed = JSON.parse(cachedStats);
        const isFresh = Date.now() - parsed.timestamp < STOCKS_CACHE_TTL;

        if (isFresh) {
          setStats(parsed.data || {});
          return;
        }
      }

      const res = await api.get("/stocks/stats");

      setStats(res.data || {});

      sessionStorage.setItem(
        "stocks_stats_cache_v1",
        JSON.stringify({
          timestamp: Date.now(),
          data: res.data || {},
        })
      );
    } catch (err) {
      console.error("Failed to load stock stats:", err);
    }
  }, []);

  const loadStocks = useCallback(
    async (pageNumber = page, searchValue = search, exchangeValue = exchange) => {
      const cacheKey = getStocksCacheKey(
        pageNumber,
        searchValue,
        exchangeValue
      );

      try {
        const cached = readStocksCache(cacheKey);

        if (cached?.data) {
          setStocks(cached.data.items || []);

          setPagination({
            total: cached.data.total || 0,
            total_pages: cached.data.total_pages || 1,
          });

          if (cached.isFresh) {
            return;
          }
        }

        setLoading(true);

        const res = await api.get("/stocks/paginated", {
          params: {
            page: pageNumber,
            limit,
            exchange: exchangeValue,
            q: searchValue,
          },
        });

        const data = res.data || {};

        setStocks(data.items || []);

        setPagination({
          total: data.total || 0,
          total_pages: data.total_pages || 1,
        });

        saveStocksCache(cacheKey, data);
      } catch (err) {
        console.error("Failed to load stocks:", err);
        window.showToast?.("Unable to load stocks.");
      } finally {
        setLoading(false);
      }
    },
    [page, search, exchange, limit]
  );

  useEffect(() => {
    const urlSearch = searchParams.get("search") || "";

    if (urlSearch.trim()) {
      setSearch(urlSearch);
      setPage(1);
    }
  }, [searchParams]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStocks(page, search, exchange);
    }, 300);

    return () => clearTimeout(timer);
  }, [page, exchange, search, loadStocks]);

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  const handleExchangeChange = (value) => {
    setExchange(value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setExchange("ALL");
    setPage(1);
  };

  const clearStocksCache = () => {
    try {
      sessionStorage.removeItem("stocks_stats_cache_v1");

      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith("stocks_cache_v1_")) {
          sessionStorage.removeItem(key);
        }
      });
    } catch {
      // Ignore cache errors
    }
  };

  const syncStocks = async () => {
    try {
      setSyncing(true);

      const res = await api.post("/stocks/sync");

      clearStocksCache();

      window.showToast?.(
        `${res.data.message || "Stock master refreshed"} · Total: ${
          res.data.total_stocks || 0
        }`
      );

      setPage(1);
      await loadStats();
      await loadStocks(1, search, exchange);
    } catch (err) {
      console.error("Stock sync failed:", err);
      window.showToast?.(err?.response?.data?.detail || "Stock sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const addToWatchlist = async (e, stock) => {
    e.stopPropagation();

    try {
      await api.post("/watchlist/", {
        symbol: stock.symbol,
      });

      window.showToast?.(`${stock.symbol} added to watchlist!`);
    } catch (err) {
      console.error("Watchlist add failed:", err);
      window.showToast?.(
        err?.response?.data?.detail || "Failed to add to watchlist"
      );
    }
  };

  const viewStock = (stock) => {
    if (!stock?.symbol) return;
    navigate(`/stocks/${encodeURIComponent(stock.symbol)}`);
  };

  const goPrev = () => {
    if (page > 1 && !loading) {
      setPage((prev) => prev - 1);
    }
  };

  const goNext = () => {
    if (page < pagination.total_pages && !loading) {
      setPage((prev) => prev + 1);
    }
  };

  const popularSearches = [
    "RELIANCE",
    "TCS",
    "INFY",
    "HDFCBANK",
    "SBIN",
    "ICICIBANK",
  ];

  const visibleRange = useMemo(() => {
    const start = pagination.total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, pagination.total || 0);

    return {
      start,
      end,
    };
  }, [page, limit, pagination.total]);

  const exchangeCards = [
    {
      label: "All Stocks",
      value: "ALL",
      count: stats.total || 0,
      desc: "Complete NSE + BSE stock master",
    },
    {
      label: "NSE Stocks",
      value: "NSE",
      count: stats.nse_count || 0,
      desc: "National Stock Exchange instruments",
    },
    {
      label: "BSE Stocks",
      value: "BSE",
      count: stats.bse_count || 0,
      desc: "Bombay Stock Exchange instruments",
    },
  ];

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <div className="dashboard-main">
        <Navbar />

        <div className="dashboard-content professional-dashboard">
          <div className="pro-dashboard-hero">
            <div>
              <p className="pro-eyebrow">Market Discovery</p>

              <h1>
                Stocks <span>Market</span>
              </h1>

              <p>
                Search NSE/BSE stocks, open live-style charts, analyze market
                stats, add instruments to your watchlist, and place paper
                trades.
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
                  {formatNumber(stats.total)} Instruments
                </span>

                <span className="status-pill status-warning">
                  Angel One Tokens
                </span>

                <span className="status-pill status-success">
                  NSE + BSE Active
                </span>
              </div>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span className="status-pill status-success">Stock Master</span>
                <p>Database-backed instrument search</p>
              </div>

              <button
                className="primary-action"
                onClick={syncStocks}
                disabled={syncing}
              >
                <FaSyncAlt style={{ marginRight: "8px" }} />
                {syncing ? "Refreshing..." : "Refresh Stock Master"}
              </button>
            </div>
          </div>

          <div className="dashboard-cards">
            {exchangeCards.map((item) => (
              <button
                key={item.value}
                type="button"
                className="stat-card"
                onClick={() => handleExchangeChange(item.value)}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  border:
                    exchange === item.value
                      ? "2px solid #2563eb"
                      : "1px solid #e5e7eb",
                }}
              >
                <h4>{item.label}</h4>

                <h2>{formatNumber(item.count)}</h2>

                <p
                  style={{
                    margin: "10px 0 0",
                    color: "#64748b",
                    fontWeight: "700",
                    lineHeight: "1.5",
                  }}
                >
                  {item.desc}
                </p>
              </button>
            ))}

            <div className="stat-card">
              <h4>Selected Exchange</h4>
              <h2>{exchange}</h2>

              <p
                style={{
                  margin: "10px 0 0",
                  color: "#64748b",
                  fontWeight: "700",
                  lineHeight: "1.5",
                }}
              >
                Current active market filter
              </p>
            </div>
          </div>

          <div className="pro-panel" style={{ marginTop: "24px" }}>
            <div className="pro-panel-header">
              <div>
                <h2>Advanced Stock Search</h2>
                <p>
                  Filter by symbol, company name, exchange, or Angel One token.
                </p>
              </div>

              <button className="warning-action" onClick={clearFilters}>
                Clear Filters
              </button>
            </div>

            <div
              className="stocks-filter-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 190px",
                gap: "14px",
                marginBottom: "18px",
              }}
            >
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
                  placeholder="Search by symbol, company name, or token..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
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

              <select
                value={exchange}
                onChange={(e) => handleExchangeChange(e.target.value)}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "14px",
                  border: "1px solid #d1d5db",
                  outline: "none",
                  fontSize: "15px",
                  background: "white",
                  fontWeight: "800",
                }}
              >
                <option value="ALL">All Exchanges</option>
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
              </select>
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "6px",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#64748b",
                  fontWeight: "900",
                  fontSize: "13px",
                }}
              >
                <FaFilter />
                Popular:
              </span>

              {popularSearches.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="status-pill status-success"
                  onClick={() => handleSearch(item)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="table-card" style={{ marginTop: "24px" }}>
            <div
              className="stock-master-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "20px",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "18px",
              }}
            >
              <div>
                <h2>
                  <FaDatabase style={{ marginRight: "10px", color: "#2563eb" }} />
                  Stock Master
                </h2>

                <p style={{ color: "#64748b", margin: 0 }}>
                  Showing {visibleRange.start}–{visibleRange.end} of{" "}
                  {formatNumber(pagination.total)} records · Page {page} of{" "}
                  {pagination.total_pages}
                </p>
              </div>

              <div
                className="stock-pagination-actions"
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="primary-action"
                  onClick={goPrev}
                  disabled={page <= 1 || loading}
                  style={{
                    opacity: page <= 1 || loading ? 0.5 : 1,
                    cursor: page <= 1 || loading ? "not-allowed" : "pointer",
                  }}
                >
                  <FaChevronLeft style={{ marginRight: "7px" }} />
                  Previous
                </button>

                <span
                  style={{
                    fontWeight: "900",
                    color: "#334155",
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    padding: "10px 14px",
                    borderRadius: "12px",
                    textAlign: "center",
                  }}
                >
                  {page} / {pagination.total_pages}
                </span>

                <button
                  className="primary-action"
                  onClick={goNext}
                  disabled={page >= pagination.total_pages || loading}
                  style={{
                    opacity: page >= pagination.total_pages || loading ? 0.5 : 1,
                    cursor:
                      page >= pagination.total_pages || loading
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Next
                  <FaChevronRight style={{ marginLeft: "7px" }} />
                </button>
              </div>
            </div>

            {loading && stocks.length === 0 && <SkeletonLoader rows={6} />}

            {!loading && stocks.length === 0 ? (
              <div className="empty-state">
                <h3>No stocks found</h3>

                <p>
                  Try another symbol/company name, change exchange filter, or
                  refresh the stock master.
                </p>

                <button
                  className="primary-action"
                  onClick={syncStocks}
                  disabled={syncing}
                  style={{ marginTop: "18px" }}
                >
                  {syncing ? "Refreshing..." : "Refresh Stock Master"}
                </button>
              </div>
            ) : (
              stocks.length > 0 && (
                <div className="table-scroll">
                  <table className="pro-table stocks-mobile-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Name</th>
                        <th>Exchange</th>
                        <th>Token</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {stocks.map((stock) => (
                        <tr
                          key={`${stock.exchange}-${stock.token}-${stock.symbol}`}
                          className="stock-mobile-row"
                          style={{ cursor: "pointer" }}
                          onClick={() => viewStock(stock)}
                        >
                          <td data-label="Symbol">
                            <strong
                              style={{ color: "#0f172a", fontSize: "15px" }}
                            >
                              {stock.symbol}
                            </strong>
                          </td>

                          <td data-label="Company">
                            <div>
                              <strong>
                                {stock.name || "Stock Instrument"}
                              </strong>

                              <p
                                className="mobile-stock-subtext"
                                style={{
                                  margin: "4px 0 0",
                                  color: "#64748b",
                                  fontSize: "13px",
                                  fontWeight: "700",
                                }}
                              >
                                Tap to open chart, stats, and order panel.
                              </p>
                            </div>
                          </td>

                          <td data-label="Exchange">
                            <span
                              className={
                                stock.exchange === "NSE"
                                  ? "status-pill status-success"
                                  : "status-pill status-warning"
                              }
                            >
                              {stock.exchange}
                            </span>
                          </td>

                          <td data-label="Token">
                            <span
                              style={{
                                fontWeight: "800",
                                color: "#475569",
                              }}
                            >
                              {stock.token}
                            </span>
                          </td>

                          <td data-label="Action">
                            <div className="mobile-stock-actions">
                              <button
                                className="watch-btn"
                                onClick={(e) => addToWatchlist(e, stock)}
                              >
                                + Watchlist
                              </button>

                              <button
                                className="buy-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  viewStock(stock);
                                }}
                              >
                                <FaChartLine style={{ marginRight: "7px" }} />
                                Trade
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            <div className="footer-note">
              Total records: {formatNumber(pagination.total)}. Search examples:
              RELIANCE, TCS, INFY, HDFCBANK, SBIN, ICICIBANK, or BSE scripts.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Stocks;