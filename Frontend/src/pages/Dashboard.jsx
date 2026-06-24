import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaArrowDown,
  FaArrowUp,
  FaBook,
  FaChartLine,
  FaClipboardList,
  FaDownload,
  FaExchangeAlt,
  FaFlask,
  FaHistory,
  FaShieldAlt,
  FaSyncAlt,
  FaWallet,
} from "react-icons/fa";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import LiveMarketTicker from "../components/LiveMarketTicker";
import api from "../api/api";

function Dashboard() {
  const navigate = useNavigate();

  const [portfolio, setPortfolio] = useState({
    cash_balance: 0,
    invested_value: 0,
    current_holdings_value: 0,
    total_value: 0,
    total_pnl: 0,
    total_holdings: 0,
  });

  const [holdings, setHoldings] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [orderSummary, setOrderSummary] = useState({
    total_orders: 0,
    executed_orders: 0,
    pending_orders: 0,
    cancelled_orders: 0,
    rejected_orders: 0,
  });

  const [marketStatus, setMarketStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recentStocks, setRecentStocks] = useState([]);
  const [marketPrices, setMarketPrices] = useState({});
  const priceIntervalRef = useRef(null);
  const symbolsRef = useRef([]);

  useEffect(() => {
    try {
      const recent = JSON.parse(localStorage.getItem("recent_stocks") || "[]");
      setRecentStocks(recent);
    } catch {}
  }, []);

  const tradingQuotes = [
    "Discipline beats prediction in trading.",
    "Protect capital first, profit comes second.",
    "Plan the trade, then trade the plan.",
    "Small consistent wins build long-term skill.",
    "Patience is also a trading strategy.",
    "Risk management keeps traders in the game.",
    "Do not chase candles; wait for confirmation.",
    "The best trade is sometimes no trade.",
    "Trade less, analyze more.",
    "Confidence comes from process, not luck.",
    "A trading journal turns mistakes into lessons.",
    "Do not trade to recover losses quickly.",
    "Control risk before thinking about reward.",
    "Follow your system, not your fear.",
    "Trading is a game of probabilities.",
    "Do not let one trade damage your account.",
    "Wait for clarity before entering a position.",
    "Overtrading is the enemy of consistency.",
    "Learn to accept small losses gracefully.",
    "Strong traders are patient traders.",
    "Every trade needs entry, exit, and risk.",
    "Paper trading is where habits are built.",
    "Good risk control creates long-term freedom.",
    "Trade what you see, not what you hope.",
    "One good setup is better than ten random trades.",
    "Professional traders manage uncertainty.",
    "Focus on process, profits will follow.",
    "Risk small enough to think clearly.",
    "A trader’s job is to manage risk, not predict perfectly.",
    "A simple strategy followed well beats a complex one ignored.",
  ];

  const [dailyQuote] = useState(() => {
    const index = Math.floor(Math.random() * tradingQuotes.length);
    return tradingQuotes[index];
  });

  useEffect(() => {
    loadDashboard();
  }, []);

  const formatName = (name) => {
    if (!name) return "Trader";

    return name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const username = formatName(
    sessionStorage.getItem("username") ||
      localStorage.getItem("username") ||
      "Trader"
  );

  const hour = new Date().getHours();

  let greeting = "Good Morning";

  if (hour >= 12) greeting = "Good Afternoon";
  if (hour >= 17) greeting = "Good Evening";

  const loadDashboard = async () => {
    try {
      setLoading(true);

      const res = await api.get("/dashboard/summary");

      const data = res.data || {};

      setPortfolio({
        cash_balance: data.portfolio?.cash_balance || 0,
        invested_value: data.portfolio?.invested_value || 0,
        current_holdings_value: data.portfolio?.current_holdings_value || 0,
        total_value: data.portfolio?.total_value || 0,
        total_pnl: data.portfolio?.total_pnl || 0,
        total_holdings: data.portfolio?.total_holdings || 0,
      });

      setHoldings(Array.isArray(data.holdings) ? data.holdings : []);

      // Dashboard shows only recent 8 transactions
      setTransactions(
        Array.isArray(data.recent_transactions) ? data.recent_transactions : []
      );

      setOrderSummary({
        total_orders: data.order_summary?.total_orders || 0,
        executed_orders: data.order_summary?.executed_orders || 0,
        pending_orders: data.order_summary?.pending_orders || 0,
        cancelled_orders: data.order_summary?.cancelled_orders || 0,
        rejected_orders: data.order_summary?.rejected_orders || 0,
      });

      setMarketStatus({
        is_open: data.market_status?.is_open ?? false,
        status: data.market_status?.status || "UNKNOWN",
        reason: data.market_status?.reason || "",
      });
    } catch (error) {
      console.error("Dashboard Error:", error);
      window.showToast?.(error?.response?.data?.detail || "Unable to load dashboard data.");
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

  // Stable price polling — collects symbols from holdings + transactions
  useEffect(() => {
    const allSymbols = [
      ...holdings.map((h) => h.symbol),
      ...transactions.map((t) => t.symbol),
    ];

    if (allSymbols.length > 0) {
      symbolsRef.current = [...new Set(allSymbols)];
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
  }, [holdings, transactions]);

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
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const getTransactionType = (tx) => {
    return String(tx.transaction_type || tx.side || "").toUpperCase();
  };

  const analytics = useMemo(() => {
    const cashBalance = Number(portfolio.cash_balance || 0);

    const fallbackInvestedValue = holdings.reduce((sum, item) => {
      return (
        sum + Number(item.quantity || 0) * Number(item.avg_price || 0)
      );
    }, 0);

    const fallbackHoldingsValue = holdings.reduce((sum, item) => {
      return (
        sum + Number(item.quantity || 0) * Number(item.current_price || 0)
      );
    }, 0);

    const investedValue =
      Number(portfolio.invested_value || 0) || fallbackInvestedValue;

    const holdingsValue =
      Number(portfolio.current_holdings_value || 0) || fallbackHoldingsValue;

    const totalValue =
      Number(portfolio.total_value || 0) || cashBalance + holdingsValue;

    const totalPnl =
      Number(portfolio.total_pnl || 0) || holdingsValue - investedValue;

    const pnlPercent = investedValue > 0 ? (totalPnl / investedValue) * 100 : 0;

    const totalTurnover = transactions.reduce((sum, tx) => {
      return sum + Number(tx.quantity || 0) * Number(tx.price || 0);
    }, 0);

    const buyTrades = transactions.filter(
      (tx) => getTransactionType(tx) === "BUY"
    ).length;

    const sellTrades = transactions.filter(
      (tx) => getTransactionType(tx) === "SELL"
    ).length;

    const totalOrders = Number(orderSummary.total_orders || 0);
    const executedOrders = Number(orderSummary.executed_orders || 0);
    const rejectedOrders = Number(orderSummary.rejected_orders || 0);
    const pendingOrders = Number(orderSummary.pending_orders || 0);
    const cancelledOrders = Number(orderSummary.cancelled_orders || 0);

    const executionRate =
      totalOrders > 0 ? (executedOrders / totalOrders) * 100 : 0;

    const rejectionRate =
      totalOrders > 0 ? (rejectedOrders / totalOrders) * 100 : 0;

    const profitableHoldings = holdings.filter(
      (item) => Number(item.pnl || 0) > 0
    ).length;

    const losingHoldings = holdings.filter(
      (item) => Number(item.pnl || 0) < 0
    ).length;

    const flatHoldings = holdings.filter(
      (item) => Number(item.pnl || 0) === 0
    ).length;

    const holdingWinRate =
      holdings.length > 0 ? (profitableHoldings / holdings.length) * 100 : 0;

    const cashPercent =
      totalValue > 0 ? Math.min((cashBalance / totalValue) * 100, 100) : 0;

    const holdingsPercent =
      totalValue > 0 ? Math.min((holdingsValue / totalValue) * 100, 100) : 0;

    const topHoldings = [...holdings]
      .sort(
        (a, b) =>
          Number(b.current_value || 0) - Number(a.current_value || 0)
      )
      .slice(0, 5);

    const bestHolding =
      holdings.length > 0
        ? [...holdings].sort(
            (a, b) => Number(b.pnl || 0) - Number(a.pnl || 0)
          )[0]
        : null;

    const worstHolding =
      holdings.length > 0
        ? [...holdings].sort(
            (a, b) => Number(a.pnl || 0) - Number(b.pnl || 0)
          )[0]
        : null;

    return {
      cashBalance,
      investedValue,
      holdingsValue,
      totalValue,
      totalPnl,
      pnlPercent,
      totalTurnover,
      buyTrades,
      sellTrades,
      totalOrders,
      executedOrders,
      rejectedOrders,
      pendingOrders,
      cancelledOrders,
      executionRate,
      rejectionRate,
      profitableHoldings,
      losingHoldings,
      flatHoldings,
      holdingWinRate,
      cashPercent,
      holdingsPercent,
      topHoldings,
      bestHolding,
      worstHolding,
    };
  }, [portfolio, holdings, transactions, orderSummary]);

  const recentTransactions = transactions.slice(0, 8);

  const liveHoldingsValue = holdings.reduce((sum, item) => {
    const livePrice = marketPrices[item.symbol]?.ltp;
    const qty = Number(item.quantity || 0);
    if (livePrice) return sum + qty * Number(livePrice);
    return sum + qty * Number(item.current_price || 0);
  }, 0);

  const liveTotalValue = Number(portfolio.cash_balance || 0) + liveHoldingsValue;
  const liveTotalPnl = liveHoldingsValue - analytics.investedValue;
  const livePnlPercent = analytics.investedValue > 0 ? (liveTotalPnl / analytics.investedValue) * 100 : 0;

  const quickActions = [
    {
      title: "Search Stocks",
      desc: "Explore NSE/BSE instruments and place paper trades.",
      icon: <FaChartLine />,
      path: "/stocks",
    },
    {
      title: "Trading Journal",
      desc: "Record strategy, mistakes, emotions, and lessons.",
      icon: <FaBook />,
      path: "/journal",
    },
    {
      title: "Reports",
      desc: "Download transactions, orders, holdings, and portfolio reports.",
      icon: <FaDownload />,
      path: "/reports",
    },
    {
      title: "Backtesting",
      desc: "Test SMA and RSI strategies using historical candles.",
      icon: <FaFlask />,
      path: "/strategy-backtesting",
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
              <p className="pro-eyebrow">Professional Trading Workspace</p>

              <h1>
                {greeting}, <span>{username}</span> 👋
              </h1>

              <p>
                Monitor virtual capital, holdings, orders, transactions, risk,
                journal discipline, and strategy performance from one dashboard.
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
                  Paper Trading Mode
                </span>

                <span
                  className={
                    marketStatus?.is_open
                      ? "status-pill status-success"
                      : "status-pill status-danger"
                  }
                >
                  {marketStatus?.status || "Market Status"}
                </span>

                <span className="status-pill status-warning">
                  No Real Money
                </span>
              </div>

              <div
                style={{
                  marginTop: "18px",
                  padding: "14px 16px",
                  borderRadius: "16px",
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#e0f2fe",
                  fontWeight: "800",
                  lineHeight: "1.6",
                }}
              >
                “{dailyQuote}”
              </div>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span
                  className={
                    marketStatus?.is_open
                      ? "status-pill status-success"
                      : "status-pill status-danger"
                  }
                >
                  {marketStatus?.is_open ? "Market Open" : "Market Closed"}
                </span>

                <p>
                  {marketStatus?.reason ||
                    "Trading is controlled by market-hours protection."}
                </p>
              </div>

              <button
                className="primary-action"
                onClick={loadDashboard}
                disabled={loading}
              >
                <FaSyncAlt style={{ marginRight: "8px" }} />
                {loading ? "Refreshing..." : "Refresh Dashboard"}
              </button>
            </div>
          </div>

          <div className="pro-kpi-grid">
            <div className="pro-kpi-card">
              <p>Total Portfolio Value</p>
              <h2>₹{formatMoney(liveTotalValue)}</h2>
              <span className="pro-muted">Cash + holdings value</span>
            </div>

            <div className="pro-kpi-card">
              <p>Available Cash</p>
              <h2>₹{formatMoney(analytics.cashBalance)}</h2>
              <span className="pro-muted">Buying power available</span>
            </div>

            <div className="pro-kpi-card">
              <p>Holdings Value</p>
              <h2>₹{formatMoney(liveHoldingsValue)}</h2>
              <span className="pro-muted">Current open exposure</span>
            </div>

            <div className="pro-kpi-card">
              <p>Total P&amp;L</p>
              <h2
                className={
                  liveTotalPnl >= 0 ? "pro-positive" : "pro-negative"
                }
              >
                ₹{formatMoney(liveTotalPnl)}
              </h2>

              <span
                className={
                  livePnlPercent >= 0 ? "pro-positive" : "pro-negative"
                }
              >
                {livePnlPercent.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="pro-dashboard-grid">
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaWallet style={{ marginRight: "10px", color: "#2563eb" }} />
                    Portfolio Allocation
                  </h2>
                  <p>Capital split between cash balance and open positions.</p>
                </div>
              </div>

              <div className="allocation-block">
                <div className="allocation-row">
                  <div>
                    <strong>Available Cash</strong>
                    <p>₹{formatMoney(analytics.cashBalance)}</p>
                  </div>

                  <span>{analytics.cashPercent.toFixed(2)}%</span>
                </div>

                <div className="allocation-bar">
                  <div
                    className="allocation-fill cash-fill"
                    style={{ width: `${analytics.cashPercent}%` }}
                  />
                </div>

                <div className="allocation-row">
                  <div>
                    <strong>Holdings Value</strong>
                    <p>₹{formatMoney(liveHoldingsValue)}</p>
                  </div>

                  <span>{analytics.holdingsPercent.toFixed(2)}%</span>
                </div>

                <div className="allocation-bar">
                  <div
                    className="allocation-fill holdings-fill"
                    style={{ width: `${analytics.holdingsPercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaClipboardList
                      style={{ marginRight: "10px", color: "#2563eb" }}
                    />
                    Order Quality
                  </h2>
                  <p>Execution, rejection, and pending order health.</p>
                </div>
              </div>

              <div className="activity-grid">
                <div>
                  <p>Total Orders</p>
                  <h3>{analytics.totalOrders}</h3>
                </div>

                <div>
                  <p>Executed</p>
                  <h3 className="pro-positive">{analytics.executedOrders}</h3>
                </div>

                <div>
                  <p>Pending</p>
                  <h3 style={{ color: "#ca8a04" }}>{analytics.pendingOrders}</h3>
                </div>

                <div>
                  <p>Rejected</p>
                  <h3 className="pro-negative">{analytics.rejectedOrders}</h3>
                </div>
              </div>

              <div style={{ marginTop: "20px" }}>
                <div className="info-row">
                  <span className="info-label">Execution Rate</span>
                  <span className="info-value">
                    {analytics.executionRate.toFixed(2)}%
                  </span>
                </div>

                <div className="allocation-bar">
                  <div
                    className="allocation-fill cash-fill"
                    style={{
                      width: `${Math.min(analytics.executionRate, 100)}%`,
                    }}
                  />
                </div>

                <div className="info-row" style={{ marginTop: "16px" }}>
                  <span className="info-label">Rejection Rate</span>
                  <span
                    className={
                      analytics.rejectionRate <= 10
                        ? "pro-positive"
                        : "pro-negative"
                    }
                  >
                    {analytics.rejectionRate.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pro-dashboard-grid">
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaExchangeAlt
                      style={{ marginRight: "10px", color: "#2563eb" }}
                    />
                    Trading Activity
                  </h2>
                  <p>Buy/sell activity and total simulated turnover.</p>
                </div>
              </div>

              <div className="activity-grid">
                <div>
                  <p>Buy Trades</p>
                  <h3 className="pro-positive">
                    <FaArrowUp style={{ marginRight: "6px" }} />
                    {analytics.buyTrades}
                  </h3>
                </div>

                <div>
                  <p>Sell Trades</p>
                  <h3 className="pro-negative">
                    <FaArrowDown style={{ marginRight: "6px" }} />
                    {analytics.sellTrades}
                  </h3>
                </div>

                <div>
                  <p>Total Transactions</p>
                  <h3>{transactions.length}</h3>
                </div>

                <div>
                  <p>Total Turnover</p>
                  <h3>₹{formatMoney(analytics.totalTurnover)}</h3>
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
                    Holdings Quality
                  </h2>
                  <p>Profitable, losing, and flat positions.</p>
                </div>
              </div>

              <div className="activity-grid">
                <div>
                  <p>Profitable</p>
                  <h3 className="pro-positive">
                    {analytics.profitableHoldings}
                  </h3>
                </div>

                <div>
                  <p>Losing</p>
                  <h3 className="pro-negative">{analytics.losingHoldings}</h3>
                </div>

                <div>
                  <p>Flat</p>
                  <h3>{analytics.flatHoldings}</h3>
                </div>

                <div>
                  <p>Win Rate</p>
                  <h3
                    className={
                      analytics.holdingWinRate >= 50
                        ? "pro-positive"
                        : "pro-negative"
                    }
                  >
                    {analytics.holdingWinRate.toFixed(2)}%
                  </h3>
                </div>
              </div>
            </div>
          </div>

          <div className="pro-panel" style={{ marginTop: "24px" }}>
            <div className="pro-panel-header">
              <div>
                <h2>Quick Actions</h2>
                <p>Jump into the most important professional workflows.</p>
              </div>
            </div>

            <div className="dashboard-cards">
              {quickActions.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  className="stat-card"
                  onClick={() => navigate(item.path)}
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      width: "46px",
                      height: "46px",
                      borderRadius: "16px",
                      background: "#eff6ff",
                      color: "#2563eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: "14px",
                      fontSize: "20px",
                    }}
                  >
                    {item.icon}
                  </div>

                  <h4>{item.title}</h4>
                  <p
                    style={{
                      color: "#64748b",
                      fontWeight: "700",
                      lineHeight: "1.6",
                      margin: "8px 0 0",
                    }}
                  >
                    {item.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* ═══════ RECENTLY VIEWED STOCKS ═══════ */}
          {recentStocks.length > 0 && (
            <div className="pro-panel" style={{ marginTop: "24px" }}>
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaHistory style={{ marginRight: "10px", color: "#2563eb" }} />
                    Recently Viewed
                  </h2>
                  <p>Quick navigation to your last 10 viewed stocks.</p>
                </div>
              </div>

              <div className="dashboard-cards">
                {recentStocks.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    className="stat-card"
                    onClick={() => navigate(`/stocks/${encodeURIComponent(item.symbol)}`)}
                    style={{
                      textAlign: "left",
                      cursor: "pointer",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <h4>{item.symbol}</h4>
                    <p style={{ color: "#64748b", fontWeight: "700", margin: "4px 0 0", fontSize: "13px" }}>
                      {item.name || item.exchange}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pro-dashboard-grid large-left" style={{ marginTop: "24px" }}>
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Top Holdings</h2>
                  <p>Your largest open positions by current value.</p>
                </div>

                <button
                  className="primary-action"
                  onClick={() => navigate("/portfolio")}
                >
                  View Portfolio
                </button>
              </div>

              {analytics.topHoldings.length === 0 ? (
                <div className="empty-state">
                  <h3>No holdings yet</h3>
                  <p>Buy stocks from the Stocks page to see positions here.</p>

                  <button
                    className="primary-action"
                    onClick={() => navigate("/stocks")}
                    style={{ marginTop: "16px" }}
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
                      <th>Current Value</th>
                      <th>P&amp;L</th>
                    </tr>
                  </thead>

                  <tbody>
                    {analytics.topHoldings.map((item) => {
                      const livePrice = marketPrices[item.symbol]?.ltp;
                      const qty = Number(item.quantity || 0);

                      const invested =
                        Number(item.invested_value) ||
                        qty * Number(item.avg_price || 0);

                      const current = livePrice
                        ? qty * Number(livePrice)
                        : Number(item.current_value) || qty * Number(item.current_price || 0);

                      const pnl = current - invested;

                      return (
                        <tr key={item.id || `${item.symbol}-${item.quantity}`}>
                          <td>
                            <strong>{item.symbol}</strong>
                          </td>
                          <td>{item.quantity}</td>
                          <td>₹{formatMoney(item.avg_price)}</td>
                          <td>
                            ₹{formatMoney(current)}
                            {livePrice && (
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
                          <td
                            className={pnl >= 0 ? "pro-positive" : "pro-negative"}
                          >
                            ₹{formatMoney(pnl)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Live Market Overview</h2>
                  <p>Index and market ticker snapshot.</p>
                </div>
              </div>

              <LiveMarketTicker variant="cards" />
            </div>
          </div>

          <div className="pro-dashboard-grid" style={{ marginTop: "24px" }}>
            <div className="pro-panel">
              <h2>Best Holding</h2>

              {analytics.bestHolding ? (
                <>
                  <div className="info-row">
                    <span className="info-label">Symbol</span>
                    <span className="info-value">
                      {analytics.bestHolding.symbol}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Quantity</span>
                    <span className="info-value">
                      {analytics.bestHolding.quantity}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Current Value</span>
                    <span className="info-value">
                      ₹{formatMoney(
                        marketPrices[analytics.bestHolding.symbol]?.ltp
                          ? Number(analytics.bestHolding.quantity || 0) * Number(marketPrices[analytics.bestHolding.symbol].ltp)
                          : Number(analytics.bestHolding.current_value || 0) ||
                            Number(analytics.bestHolding.quantity || 0) * Number(analytics.bestHolding.current_price || 0)
                      )}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">P&amp;L</span>
                    <span className="pro-positive">
                      ₹{formatMoney(analytics.bestHolding.pnl)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <h3>No best holding yet</h3>
                  <p>Your best position appears after you buy stocks.</p>
                </div>
              )}
            </div>

            <div className="pro-panel">
              <h2>Worst Holding</h2>

              {analytics.worstHolding ? (
                <>
                  <div className="info-row">
                    <span className="info-label">Symbol</span>
                    <span className="info-value">
                      {analytics.worstHolding.symbol}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Quantity</span>
                    <span className="info-value">
                      {analytics.worstHolding.quantity}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Current Value</span>
                    <span className="info-value">
                      ₹{formatMoney(
                        marketPrices[analytics.worstHolding.symbol]?.ltp
                          ? Number(analytics.worstHolding.quantity || 0) * Number(marketPrices[analytics.worstHolding.symbol].ltp)
                          : Number(analytics.worstHolding.current_value || 0) ||
                            Number(analytics.worstHolding.quantity || 0) * Number(analytics.worstHolding.current_price || 0)
                      )}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">P&amp;L</span>
                    <span
                      className={
                        Number(analytics.worstHolding.pnl || 0) >= 0
                          ? "pro-positive"
                          : "pro-negative"
                      }
                    >
                      ₹{formatMoney(analytics.worstHolding.pnl)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <h3>No worst holding yet</h3>
                  <p>Risk review appears after positions are available.</p>
                </div>
              )}
            </div>
          </div>

          <div className="pro-panel" style={{ marginTop: "24px" }}>
            <div className="pro-panel-header">
              <div>
                <h2>Recent Transactions</h2>
                <p>Latest executed trades from your paper trading account.</p>
              </div>

              <button
                className="primary-action"
                onClick={() => navigate("/transactions")}
              >
                View All
              </button>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="empty-state">
                <h3>No transactions found</h3>
                <p>Executed buy/sell trades will appear here.</p>
              </div>
            ) : (
              <div className="table-scroll">
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total Value</th>
                    <th>Cur. Value</th>
                    <th>Time</th>
                  </tr>
                </thead>

                <tbody>
                  {recentTransactions.map((tx) => {
                    const type = getTransactionType(tx);
                    const isBuy = type === "BUY";
                    const total =
                      Number(tx.quantity || 0) * Number(tx.price || 0);

                    return (
                      <tr key={tx.id}>
                        <td>
                          <strong>{tx.symbol}</strong>
                        </td>

                        <td>
                          <span
                            className={
                              isBuy
                                ? "status-pill status-success"
                                : "status-pill status-danger"
                            }
                          >
                            {type || "-"}
                          </span>
                        </td>

                        <td>{tx.quantity}</td>
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

                        <td style={{ color: "#64748b" }}>
                          {formatDate(tx.created_at)}
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
            This is a paper trading platform. All trades are simulated and no real
            money is involved.
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;