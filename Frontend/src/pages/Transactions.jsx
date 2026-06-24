import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaChartLine,
  FaChevronLeft,
  FaChevronRight,
  FaExchangeAlt,
  FaFilter,
  FaMoneyBillWave,
  FaSearch,
  FaSyncAlt,
} from "react-icons/fa";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SkeletonLoader from "../components/SkeletonLoader";
import api from "../api/api";

function Transactions() {
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [marketPrices, setMarketPrices] = useState({});

  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  const priceIntervalRef = useRef(null);
  const symbolsRef = useRef([]);

  const [pagination, setPagination] = useState({
    total: 0,
    total_pages: 1,
  });

  useEffect(() => {
    loadTransactions(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const loadTransactions = async (pageNumber = page) => {
    try {
      setLoading(true);

      const [paginatedRes, allRes] = await Promise.all([
        api.get("/transactions/paginated", {
          params: {
            page: pageNumber,
            limit,
          },
        }),
        api.get("/transactions/"),
      ]);

      setTransactions(paginatedRes.data.items || []);

      setPagination({
        total: paginatedRes.data.total || 0,
        total_pages: paginatedRes.data.total_pages || 1,
      });

      setAllTransactions(Array.isArray(allRes.data) ? allRes.data : []);
    } catch (err) {
      console.error("Transaction Error:", err);
      alert("Unable to load transactions.");
    } finally {
      setLoading(false);
    }
  };

  const fetchMarketPrices = async () => {
    const syms = symbolsRef.current;
    if (!syms.length) return;

    try {
      const res = await api.post("/market/ltp-by-symbols", { symbols: syms });
      const quotes = res.data?.quotes || {};
      if (Object.keys(quotes).length > 0) {
        setMarketPrices((prev) => ({ ...prev, ...quotes }));
      }
    } catch (err) {
      console.error("Failed to fetch market prices:", err);
    }
  };

  // Stable price polling — survives re-renders
  useEffect(() => {
    if (transactions.length > 0) {
      symbolsRef.current = [...new Set(transactions.map((t) => t.symbol))];
      fetchMarketPrices();

      if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
      priceIntervalRef.current = setInterval(fetchMarketPrices, 10000);
    }

    return () => {
      if (priceIntervalRef.current) {
        clearInterval(priceIntervalRef.current);
        priceIntervalRef.current = null;
      }
    };
  }, [transactions]);

  const formatMoney = (value) => {
    return Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatNumber = (value) => {
    return Number(value || 0).toLocaleString("en-IN");
  };

  const formatDate = (value) => {
    if (!value) return "-";

    const normalizedValue =
      String(value).endsWith("Z") || String(value).includes("+")
        ? value
        : `${value}Z`;

    return new Date(normalizedValue).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const getTransactionType = (tx) => {
    return String(tx.transaction_type || tx.side || "-").toUpperCase();
  };

  const getTransactionValue = (tx) => {
    return Number(tx.quantity || 0) * Number(tx.price || 0);
  };

  const openStock = (symbol) => {
    if (!symbol) return;
    navigate(`/stocks/${encodeURIComponent(symbol)}`);
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

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("ALL");
  };

  const summary = useMemo(() => {
    const totalBuy = allTransactions.filter(
      (tx) => getTransactionType(tx) === "BUY"
    ).length;

    const totalSell = allTransactions.filter(
      (tx) => getTransactionType(tx) === "SELL"
    ).length;

    const buyTurnover = allTransactions
      .filter((tx) => getTransactionType(tx) === "BUY")
      .reduce((sum, tx) => sum + getTransactionValue(tx), 0);

    const sellTurnover = allTransactions
      .filter((tx) => getTransactionType(tx) === "SELL")
      .reduce((sum, tx) => sum + getTransactionValue(tx), 0);

    const totalTurnover = allTransactions.reduce((sum, tx) => {
      return sum + getTransactionValue(tx);
    }, 0);

    const avgTradeValue =
      allTransactions.length > 0 ? totalTurnover / allTransactions.length : 0;

    return {
      totalBuy,
      totalSell,
      buyTurnover,
      sellTurnover,
      totalTurnover,
      avgTradeValue,
    };
  }, [allTransactions]);

  const filteredTransactions = useMemo(() => {
    const cleanSearch = search.trim().toUpperCase();

    return transactions.filter((tx) => {
      const type = getTransactionType(tx);

      const matchesType = typeFilter === "ALL" || type === typeFilter;

      const matchesSearch =
        !cleanSearch ||
        String(tx.symbol || "").toUpperCase().includes(cleanSearch) ||
        String(tx.id || "").includes(cleanSearch);

      return matchesType && matchesSearch;
    });
  }, [transactions, typeFilter, search]);

  const currentPageValue = transactions.reduce((sum, tx) => {
    return sum + getTransactionValue(tx);
  }, 0);

  const visibleRange = useMemo(() => {
    const start = pagination.total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, pagination.total || 0);

    return {
      start,
      end,
    };
  }, [page, limit, pagination.total]);

  const typeCards = [
    {
      label: "All Transactions",
      value: "ALL",
      count: pagination.total || allTransactions.length || 0,
      amount: summary.totalTurnover,
      className: "",
    },
    {
      label: "Buy Trades",
      value: "BUY",
      count: summary.totalBuy,
      amount: summary.buyTurnover,
      className: "pro-positive",
    },
    {
      label: "Sell Trades",
      value: "SELL",
      count: summary.totalSell,
      amount: summary.sellTurnover,
      className: "pro-negative",
    },
    {
      label: "Average Trade",
      value: "AVG",
      count: allTransactions.length,
      amount: summary.avgTradeValue,
      className: "",
      disabled: true,
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
              <p className="pro-eyebrow">Trade Ledger</p>

              <h1>
                Transaction <span>History</span>
              </h1>

              <p>
                Review executed buy and sell trades, turnover, trade size,
                symbols, timestamps, and complete simulated account activity.
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
                  {summary.totalBuy} Buy Trades
                </span>

                <span className="status-pill status-danger">
                  {summary.totalSell} Sell Trades
                </span>

                <span className="status-pill status-warning">
                  ₹{formatMoney(summary.totalTurnover)} Turnover
                </span>
              </div>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span className="status-pill status-success">
                  Executed Trades
                </span>
                <p>Only completed trades are recorded</p>
              </div>

              <button
                className="primary-action"
                onClick={() => loadTransactions(page)}
                disabled={loading}
              >
                <FaSyncAlt style={{ marginRight: "8px" }} />
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="dashboard-cards">
            {typeCards.map((item) => (
              <button
                key={item.value}
                type="button"
                className="stat-card"
                disabled={item.disabled}
                onClick={() => {
                  if (!item.disabled) {
                    setTypeFilter(item.value);
                  }
                }}
                style={{
                  textAlign: "left",
                  cursor: item.disabled ? "default" : "pointer",
                  border:
                    typeFilter === item.value
                      ? "2px solid #2563eb"
                      : "1px solid #e5e7eb",
                  opacity: item.disabled ? 0.95 : 1,
                }}
              >
                <h4>{item.label}</h4>

                <h2 className={item.className}>{formatNumber(item.count)}</h2>

                <p
                  style={{
                    margin: "10px 0 0",
                    color: "#64748b",
                    fontWeight: "800",
                    lineHeight: "1.5",
                  }}
                >
                  ₹{formatMoney(item.amount)}
                </p>
              </button>
            ))}
          </div>

          <div className="pro-dashboard-grid" style={{ marginTop: "24px" }}>
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaMoneyBillWave
                      style={{ marginRight: "10px", color: "#16a34a" }}
                    />
                    Turnover Snapshot
                  </h2>

                  <p>
                    Understand overall trading activity and current page value.
                  </p>
                </div>
              </div>

              <div className="activity-grid">
                <div>
                  <p>Total Turnover</p>
                  <h3>₹{formatMoney(summary.totalTurnover)}</h3>
                </div>

                <div>
                  <p>Buy Turnover</p>
                  <h3 className="pro-positive">
                    ₹{formatMoney(summary.buyTurnover)}
                  </h3>
                </div>

                <div>
                  <p>Sell Turnover</p>
                  <h3 className="pro-negative">
                    ₹{formatMoney(summary.sellTurnover)}
                  </h3>
                </div>

                <div>
                  <p>Current Page Value</p>
                  <h3>₹{formatMoney(currentPageValue)}</h3>
                </div>
              </div>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Filters</h2>
                  <p>Search current page by symbol or transaction ID.</p>
                </div>

                <button className="warning-action" onClick={clearFilters}>
                  Clear
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
                  placeholder="Search transaction ID or symbol..."
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

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  marginTop: "16px",
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
                  Active:
                </span>

                <button
                  type="button"
                  className={
                    typeFilter === "ALL"
                      ? "status-pill status-success"
                      : "status-pill"
                  }
                  onClick={() => setTypeFilter("ALL")}
                  style={{
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  ALL
                </button>

                <button
                  type="button"
                  className={
                    typeFilter === "BUY"
                      ? "status-pill status-success"
                      : "status-pill"
                  }
                  onClick={() => setTypeFilter("BUY")}
                  style={{
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  BUY
                </button>

                <button
                  type="button"
                  className={
                    typeFilter === "SELL"
                      ? "status-pill status-danger"
                      : "status-pill"
                  }
                  onClick={() => setTypeFilter("SELL")}
                  style={{
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  SELL
                </button>
              </div>
            </div>
          </div>

          <div className="table-card" style={{ marginTop: "30px" }}>
            <div
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
                  <FaExchangeAlt
                    style={{ marginRight: "10px", color: "#2563eb" }}
                  />
                  Transaction Ledger
                </h2>

                <p style={{ color: "#64748b", margin: 0 }}>
                  Showing {visibleRange.start}–{visibleRange.end} of{" "}
                  {pagination.total} records · Page {page} of{" "}
                  {pagination.total_pages}
                </p>
              </div>

              <div
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

            {loading ? (
              <SkeletonLoader rows={6} />
            ) : filteredTransactions.length === 0 ? (
              <div className="empty-state">
                <h3>No transactions found</h3>
                <p>
                  Executed trades will appear here. Clear filters or place a buy
                  or sell order from the Stocks page.
                </p>

                <button
                  className="primary-action"
                  onClick={() => navigate("/stocks")}
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
                    <th>Transaction ID</th>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Total Value</th>
                    <th>Cur. Value</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTransactions.map((tx) => {
                    const type = getTransactionType(tx);
                    const isBuy = type === "BUY";
                    const total = getTransactionValue(tx);

                    return (
                      <tr key={tx.id}>
                        <td>
                          <strong>#{tx.id}</strong>
                        </td>

                        <td>
                          <button
                            type="button"
                            onClick={() => openStock(tx.symbol)}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              color: "#2563eb",
                              fontWeight: "900",
                              cursor: "pointer",
                            }}
                          >
                            {tx.symbol}
                          </button>
                        </td>

                        <td>
                          <span
                            className={
                              isBuy
                                ? "status-pill status-success"
                                : "status-pill status-danger"
                            }
                          >
                            {type}
                          </span>
                        </td>

                        <td>{formatNumber(tx.quantity)}</td>

                        <td>₹{formatMoney(tx.price)}</td>

                        <td>
                          <strong>₹{formatMoney(total)}</strong>
                        </td>

                        <td>
                          {marketPrices[tx.symbol]?.ltp ? (
                            <span>
                              ₹{formatMoney(marketPrices[tx.symbol].ltp * (tx.quantity || 0))}
                              <span style={{
                                fontSize: "11px",
                                color: "#94a3b8",
                                display: "block",
                                fontWeight: "700",
                              }}>
                                @ ₹{formatMoney(marketPrices[tx.symbol].ltp)}
                              </span>
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontWeight: "700" }}>—</span>
                          )}
                        </td>

                        <td style={{ color: "#6b7280", fontWeight: "700" }}>
                          {formatDate(tx.created_at)}
                        </td>

                        <td>
                          <button
                            type="button"
                            className="primary-action"
                            onClick={() => openStock(tx.symbol)}
                          >
                            <FaChartLine style={{ marginRight: "7px" }} />
                            View Stock
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}

            <div className="footer-note">
              Transactions are created only after simulated buy/sell orders are
              executed. Use this page as your trade ledger for reviewing
              activity and turnover.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Transactions;