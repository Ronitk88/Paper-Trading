import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaChartPie,
  FaExchangeAlt,
  FaEye,
  FaMoneyBillWave,
  FaRedo,
  FaShieldAlt,
  FaWallet,
} from "react-icons/fa";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import api from "../api/api";
import SkeletonLoader from "../components/SkeletonLoader";
import { useConfirm } from "../components/ConfirmProvider";

function Portfolio() {
  const navigate = useNavigate();
  const { showConfirm } = useConfirm();

  const [loading, setLoading] = useState(true);
  const [sellingId, setSellingId] = useState(null);
  const [marketPrices, setMarketPrices] = useState({});

  const [summary, setSummary] = useState({
    cash_balance: 1000000,
    invested_value: 0,
    current_holdings_value: 0,
    total_value: 1000000,
    total_pnl: 0,
    total_holdings: 0,
  });

  const [holdings, setHoldings] = useState([]);
  const priceIntervalRef = useRef(null);
  const symbolsRef = useRef([]);

  useEffect(() => {
    loadPortfolio();
  }, []);

  const formatMoney = (value) => {
    const number = Number(value || 0);

    return number.toLocaleString("en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  };

  const formatNumber = (value) => {
    return Number(value || 0).toLocaleString("en-IN");
  };

  const loadPortfolio = async () => {
    try {
      setLoading(true);

      const [portfolioRes, holdingsRes] = await Promise.all([
        api.get("/portfolio/"),
        api.get("/holdings/"),
      ]);

      setSummary(portfolioRes.data || {});
      setHoldings(Array.isArray(holdingsRes.data) ? holdingsRes.data : []);
    } catch (err) {
      console.error("Portfolio load failed:", err);
      alert("Unable to load portfolio.");
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
    if (holdings.length > 0) {
      symbolsRef.current = [...new Set(holdings.map((h) => h.symbol))];
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
  }, [holdings]);

  const getInvestedValue = (item) => {
    return (
      Number(item.invested_value || 0) ||
      Number(item.quantity || 0) * Number(item.avg_price || 0)
    );
  };

  const getCurrentValue = (item) => {
    const livePrice = marketPrices[item.symbol]?.ltp;
    const qty = Number(item.quantity || 0);

    if (livePrice) return qty * Number(livePrice);

    return (
      Number(item.current_value || 0) ||
      qty * Number(item.current_price || item.avg_price || 0)
    );
  };

  const getLivePrice = (item) => {
    return marketPrices[item.symbol]?.ltp || item.current_price || item.avg_price || 0;
  };

  const getHoldingPnl = (item) => {
    const liveVal = getCurrentValue(item);
    const invested = getInvestedValue(item);
    return liveVal - invested;
  };

  const getHoldingPnlPercent = (item) => {
    const invested = getInvestedValue(item);
    const pnl = getHoldingPnl(item);

    if (invested <= 0) return 0;

    return (pnl / invested) * 100;
  };

  const sellHolding = async (item) => {
    const currentPrice = getLivePrice(item);

    if (currentPrice <= 0) {
      window.showToast?.("Current price unavailable. Please refresh portfolio.");
      return;
    }

    const confirmed = await showConfirm(
      `Sell all ${item.quantity} shares of ${item.symbol} at ₹${formatMoney(currentPrice)}?`,
      { title: "Sell Holding", confirmLabel: `Sell ${item.quantity}`, isDangerous: true }
    );

    if (!confirmed) return;

    try {
      setSellingId(item.id || item.symbol);

      await api.post("/trade/sell", {
        symbol: item.symbol,
        quantity: Number(item.quantity),
        price: currentPrice,
        market_price: currentPrice,
        order_type: "MARKET",
      });

      window.showToast?.(`${item.symbol} sold successfully!`);

      await loadPortfolio();
    } catch (err) {
      console.error("Sell holding failed:", err);
      window.showToast?.(err?.response?.data?.detail || "Unable to sell holding.");
    } finally {
      setSellingId(null);
    }
  };

  const openStock = (symbol) => {
    if (!symbol) return;
    navigate(`/stocks/${encodeURIComponent(symbol)}`);
  };

  const derived = useMemo(() => {
    const cashBalance = Number(summary.cash_balance || 0);

    const investedValue =
      Number(summary.invested_value || 0) ||
      holdings.reduce((sum, item) => sum + getInvestedValue(item), 0);

    const holdingsValue =
      Number(summary.current_holdings_value || 0) ||
      holdings.reduce((sum, item) => sum + getCurrentValue(item), 0);

    const totalValue =
      Number(summary.total_value || 0) || cashBalance + holdingsValue;

    const totalPnl =
      Number(summary.total_pnl || 0) ||
      holdings.reduce((sum, item) => sum + getHoldingPnl(item), 0);

    const pnlPercent = investedValue > 0 ? (totalPnl / investedValue) * 100 : 0;

    const cashPercent =
      totalValue > 0 ? Math.min((cashBalance / totalValue) * 100, 100) : 0;

    const holdingsPercent =
      totalValue > 0 ? Math.min((holdingsValue / totalValue) * 100, 100) : 0;

    const profitableHoldings = holdings.filter(
      (item) => getHoldingPnl(item) >= 0
    ).length;

    const losingHoldings = holdings.filter((item) => getHoldingPnl(item) < 0).length;

    const bestHolding =
      holdings.length > 0
        ? [...holdings].sort((a, b) => getHoldingPnl(b) - getHoldingPnl(a))[0]
        : null;

    const worstHolding =
      holdings.length > 0
        ? [...holdings].sort((a, b) => getHoldingPnl(a) - getHoldingPnl(b))[0]
        : null;

    const exposureLevel =
      holdingsPercent <= 35
        ? "Low"
        : holdingsPercent <= 70
        ? "Balanced"
        : "High";

    return {
      cashBalance,
      investedValue,
      holdingsValue,
      totalValue,
      totalPnl,
      pnlPercent,
      cashPercent,
      holdingsPercent,
      profitableHoldings,
      losingHoldings,
      bestHolding,
      worstHolding,
      exposureLevel,
    };
  }, [summary, holdings]);

  const sortedHoldings = [...holdings].sort(
    (a, b) => getCurrentValue(b) - getCurrentValue(a)
  );

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <div className="dashboard-main">
        <Navbar />

        <div className="dashboard-content professional-dashboard">
          <div className="pro-dashboard-hero">
            <div>
              <p className="pro-eyebrow">Portfolio Command Center</p>

              <h1>
                Portfolio <span>Overview</span>
              </h1>

              <p>
                Track your virtual capital, active holdings, exposure, risk,
                unrealized P&amp;L, and exit positions directly from one
                professional portfolio dashboard.
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
                  {formatNumber(holdings.length)} Holdings
                </span>

                <span
                  className={
                    derived.totalPnl >= 0
                      ? "status-pill status-success"
                      : "status-pill status-danger"
                  }
                >
                  {derived.totalPnl >= 0 ? "Profitable" : "In Loss"}
                </span>

                <span className="status-pill status-warning">
                  {derived.exposureLevel} Exposure
                </span>
              </div>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span className="status-pill status-success">
                  Paper Portfolio
                </span>
                <p>All values are simulated</p>
              </div>

              <button
                className="primary-action"
                onClick={loadPortfolio}
                disabled={loading}
              >
                <FaRedo style={{ marginRight: "8px" }} />
                {loading ? "Refreshing..." : "Refresh Portfolio"}
              </button>
            </div>
          </div>

          <div className="pro-kpi-grid">
            <div className="pro-kpi-card">
              <p>Total Portfolio Value</p>
              <h2>₹{formatMoney(derived.totalValue)}</h2>
              <span className="pro-muted">Cash + holdings value</span>
            </div>

            <div className="pro-kpi-card">
              <p>Available Cash</p>
              <h2>₹{formatMoney(derived.cashBalance)}</h2>
              <span className="pro-muted">Ready buying power</span>
            </div>

            <div className="pro-kpi-card">
              <p>Invested Value</p>
              <h2>₹{formatMoney(derived.investedValue)}</h2>
              <span className="pro-muted">Capital deployed</span>
            </div>

            <div className="pro-kpi-card">
              <p>Total P&amp;L</p>
              <h2
                className={
                  derived.totalPnl >= 0 ? "pro-positive" : "pro-negative"
                }
              >
                ₹{formatMoney(derived.totalPnl)}
              </h2>
              <span
                className={
                  derived.pnlPercent >= 0 ? "pro-positive" : "pro-negative"
                }
              >
                {derived.pnlPercent.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="pro-dashboard-grid">
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaChartPie style={{ marginRight: "10px", color: "#2563eb" }} />
                    Capital Allocation
                  </h2>
                  <p>Understand your portfolio exposure and idle cash balance.</p>
                </div>
              </div>

              <div className="allocation-block">
                <div className="allocation-row">
                  <div>
                    <strong>Cash Balance</strong>
                    <p>₹{formatMoney(derived.cashBalance)}</p>
                  </div>

                  <span>{derived.cashPercent.toFixed(2)}%</span>
                </div>

                <div className="allocation-bar">
                  <div
                    className="allocation-fill cash-fill"
                    style={{ width: `${derived.cashPercent}%` }}
                  />
                </div>

                <div className="allocation-row">
                  <div>
                    <strong>Holdings Exposure</strong>
                    <p>₹{formatMoney(derived.holdingsValue)}</p>
                  </div>

                  <span>{derived.holdingsPercent.toFixed(2)}%</span>
                </div>

                <div className="allocation-bar">
                  <div
                    className="allocation-fill holdings-fill"
                    style={{ width: `${derived.holdingsPercent}%` }}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: "18px",
                  padding: "16px",
                  borderRadius: "16px",
                  background: "#f8fafc",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div className="info-row">
                  <span className="info-label">Exposure Level</span>
                  <span
                    className={
                      derived.exposureLevel === "Low"
                        ? "status-pill status-success"
                        : derived.exposureLevel === "Balanced"
                        ? "status-pill status-warning"
                        : "status-pill status-danger"
                    }
                  >
                    {derived.exposureLevel}
                  </span>
                </div>

                <div className="info-row">
                  <span className="info-label">Holdings Value</span>
                  <span className="info-value">
                    ₹{formatMoney(derived.holdingsValue)}
                  </span>
                </div>
              </div>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaShieldAlt
                      style={{ marginRight: "10px", color: "#16a34a" }}
                    />
                    Risk & Performance
                  </h2>
                  <p>Quick quality check of your current portfolio state.</p>
                </div>
              </div>

              <div className="activity-grid">
                <div>
                  <p>Profitable Holdings</p>
                  <h3 className="pro-positive">{derived.profitableHoldings}</h3>
                </div>

                <div>
                  <p>Losing Holdings</p>
                  <h3 className="pro-negative">{derived.losingHoldings}</h3>
                </div>

                <div>
                  <p>Total Holdings</p>
                  <h3>{summary.total_holdings || holdings.length || 0}</h3>
                </div>

                <div>
                  <p>P&amp;L %</p>
                  <h3
                    className={
                      derived.pnlPercent >= 0 ? "pro-positive" : "pro-negative"
                    }
                  >
                    {derived.pnlPercent.toFixed(2)}%
                  </h3>
                </div>
              </div>

              <div className="turnover-box">
                <p>Current Holdings Value</p>
                <h2>₹{formatMoney(derived.holdingsValue)}</h2>
              </div>
            </div>
          </div>

          <div className="pro-dashboard-grid large-left">
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaWallet style={{ marginRight: "10px", color: "#2563eb" }} />
                    Best / Worst Positions
                  </h2>
                  <p>Quick view of your strongest and weakest holdings.</p>
                </div>
              </div>

              <div className="market-card-list">
                <div className="market-card-item">
                  <div>
                    <span>Best Holding</span>
                    <strong>
                      {derived.bestHolding
                        ? derived.bestHolding.symbol
                        : "No holding yet"}
                    </strong>
                  </div>

                  <strong className="pro-positive">
                    {derived.bestHolding
                      ? `₹${formatMoney(getHoldingPnl(derived.bestHolding))}`
                      : "-"}
                  </strong>
                </div>

                <div className="market-card-item">
                  <div>
                    <span>Worst Holding</span>
                    <strong>
                      {derived.worstHolding
                        ? derived.worstHolding.symbol
                        : "No holding yet"}
                    </strong>
                  </div>

                  <strong
                    className={
                      derived.worstHolding &&
                      getHoldingPnl(derived.worstHolding) < 0
                        ? "pro-negative"
                        : "pro-positive"
                    }
                  >
                    {derived.worstHolding
                      ? `₹${formatMoney(getHoldingPnl(derived.worstHolding))}`
                      : "-"}
                  </strong>
                </div>
              </div>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaMoneyBillWave
                      style={{ marginRight: "10px", color: "#16a34a" }}
                    />
                    Portfolio Actions
                  </h2>
                  <p>Continue managing your virtual trading account.</p>
                </div>
              </div>

              <div className="market-card-list">
                <button
                  type="button"
                  className="market-card-item market-clickable"
                  onClick={() => navigate("/stocks")}
                >
                  <span>Explore Stocks</span>
                  <strong>Find Trades</strong>
                </button>

                <button
                  type="button"
                  className="market-card-item market-clickable"
                  onClick={() => navigate("/orders")}
                >
                  <span>Order Book</span>
                  <strong>Review Orders</strong>
                </button>

                <button
                  type="button"
                  className="market-card-item market-clickable"
                  onClick={() => navigate("/transactions")}
                >
                  <span>Transactions</span>
                  <strong>Trade History</strong>
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
                <h2>
                  <FaExchangeAlt
                    style={{ marginRight: "10px", color: "#2563eb" }}
                  />
                  My Holdings
                </h2>
                <p>
                  Click any symbol to open stock details, charts, stats, and
                  trading panel.
                </p>
              </div>

              <button
                className="primary-action"
                onClick={() => navigate("/stocks")}
              >
                Add More Holdings
              </button>
            </div>

            {loading ? (
              <SkeletonLoader rows={6} />
            ) : sortedHoldings.length === 0 ? (
              <div className="empty-state">
                <h3>No holdings found</h3>
                <p>Buy stocks from the Stocks page to see them here.</p>

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
                    <th>Symbol</th>
                    <th>Qty</th>
                    <th>Avg Price</th>
                    <th>Current Price</th>
                    <th>Invested</th>
                    <th>Current Value</th>
                    <th>P&amp;L</th>
                    <th>P&amp;L %</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedHoldings.map((item) => {
                    const invested = getInvestedValue(item);
                    const current = getCurrentValue(item);
                    const pnl = getHoldingPnl(item);
                    const pnlPercent = getHoldingPnlPercent(item);
                    const rowId = item.id || item.symbol;

                    return (
                      <tr
                        key={rowId}
                        style={{ cursor: "pointer" }}
                        onClick={() => openStock(item.symbol)}
                      >
                        <td>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openStock(item.symbol);
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
                            {item.symbol}
                          </button>
                        </td>

                        <td>{formatNumber(item.quantity)}</td>

                        <td>₹{formatMoney(item.avg_price)}</td>

                        <td>
                          ₹{formatMoney(getLivePrice(item))}
                          {marketPrices[item.symbol]?.ltp && (
                            <span style={{
                              fontSize: "11px",
                              color: "#94a3b8",
                              display: "block",
                              fontWeight: "700",
                            }}>
                              Live
                            </span>
                          )}
                        </td>

                        <td>₹{formatMoney(invested)}</td>

                        <td>₹{formatMoney(current)}</td>

                        <td
                          className={pnl >= 0 ? "pro-positive" : "pro-negative"}
                        >
                          ₹{formatMoney(pnl)}
                        </td>

                        <td
                          className={
                            pnlPercent >= 0 ? "pro-positive" : "pro-negative"
                          }
                        >
                          {pnlPercent.toFixed(2)}%
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
                                openStock(item.symbol);
                              }}
                            >
                              <FaEye style={{ marginRight: "7px" }} />
                              View
                            </button>

                            <button
                              className="danger-action"
                              onClick={(e) => {
                                e.stopPropagation();
                                sellHolding(item);
                              }}
                              disabled={sellingId === rowId}
                              style={{
                                opacity: sellingId === rowId ? 0.6 : 1,
                                cursor:
                                  sellingId === rowId
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                            >
                              {sellingId === rowId ? "Selling..." : "Sell All"}
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
          </div>

          <div className="footer-note">
            Selling from portfolio creates a simulated market sell order and
            updates holdings, transactions, orders, and cash balance. All values
            are part of your paper trading account.
          </div>
        </div>
      </div>
    </div>
  );
}

export default Portfolio;