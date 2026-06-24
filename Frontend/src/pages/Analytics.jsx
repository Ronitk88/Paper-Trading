import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaChartBar,
  FaChartLine,
  FaExclamationTriangle,
  FaEye,
  FaRedo,
  FaShieldAlt,
  FaSignal,
  FaWallet,
} from "react-icons/fa";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SkeletonLoader from "../components/SkeletonLoader";
import api from "../api/api";

function Analytics() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

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
  const [orders, setOrders] = useState([]);

  const [orderSummary, setOrderSummary] = useState({
    total_orders: 0,
    executed_orders: 0,
    pending_orders: 0,
    cancelled_orders: 0,
    rejected_orders: 0,
  });

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);

      const [
        portfolioRes,
        holdingsRes,
        transactionsRes,
        ordersRes,
        orderSummaryRes,
      ] = await Promise.all([
        api.get("/portfolio/"),
        api.get("/holdings/"),
        api.get("/transactions/"),
        api.get("/orders/"),
        api.get("/orders/summary"),
      ]);

      setPortfolio(portfolioRes.data || {});
      setHoldings(Array.isArray(holdingsRes.data) ? holdingsRes.data : []);
      setTransactions(
        Array.isArray(transactionsRes.data) ? transactionsRes.data : []
      );
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
      setOrderSummary(orderSummaryRes.data || {});
    } catch (err) {
      console.error("Analytics load failed:", err);
      alert("Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (value) => {
    return Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatNumber = (value) => {
    return Number(value || 0).toLocaleString("en-IN");
  };

  const formatPercent = (value) => {
    return Number(value || 0).toFixed(2);
  };

  const getTransactionType = (tx) => {
    return String(tx.transaction_type || tx.side || "-").toUpperCase();
  };

  const getTransactionValue = (tx) => {
    return Number(tx.quantity || 0) * Number(tx.price || 0);
  };

  const getHoldingInvestedValue = (holding) => {
    return (
      Number(holding?.invested_value || 0) ||
      Number(holding?.quantity || 0) * Number(holding?.avg_price || 0)
    );
  };

  const getHoldingCurrentValue = (holding) => {
    return (
      Number(holding?.current_value || 0) ||
      Number(holding?.quantity || 0) *
        Number(holding?.current_price || holding?.avg_price || 0)
    );
  };

  const getHoldingPnl = (holding) => {
    if (!holding) return 0;

    return (
      Number(holding.pnl || 0) ||
      getHoldingCurrentValue(holding) - getHoldingInvestedValue(holding)
    );
  };

  const openStock = (symbol) => {
    if (!symbol) return;
    navigate(`/stocks/${encodeURIComponent(symbol)}`);
  };

  const analytics = useMemo(() => {
    const cashBalance = Number(portfolio.cash_balance || 0);

    const investedValue =
      Number(portfolio.invested_value || 0) ||
      holdings.reduce((sum, item) => {
        return sum + getHoldingInvestedValue(item);
      }, 0);

    const currentValue =
      Number(portfolio.current_holdings_value || 0) ||
      holdings.reduce((sum, item) => {
        return sum + getHoldingCurrentValue(item);
      }, 0);

    const totalValue =
      Number(portfolio.total_value || 0) || cashBalance + currentValue;

    const totalPnl =
      Number(portfolio.total_pnl || 0) ||
      holdings.reduce((sum, item) => {
        return sum + getHoldingPnl(item);
      }, 0);

    const pnlPercent = investedValue > 0 ? (totalPnl / investedValue) * 100 : 0;

    const buyTrades = transactions.filter(
      (tx) => getTransactionType(tx) === "BUY"
    );

    const sellTrades = transactions.filter(
      (tx) => getTransactionType(tx) === "SELL"
    );

    const buyTurnover = buyTrades.reduce((sum, tx) => {
      return sum + getTransactionValue(tx);
    }, 0);

    const sellTurnover = sellTrades.reduce((sum, tx) => {
      return sum + getTransactionValue(tx);
    }, 0);

    const totalTurnover = transactions.reduce((sum, tx) => {
      return sum + getTransactionValue(tx);
    }, 0);

    const averageTradeValue =
      transactions.length > 0 ? totalTurnover / transactions.length : 0;

    const profitableHoldings = holdings.filter(
      (holding) => getHoldingPnl(holding) > 0
    ).length;

    const lossHoldings = holdings.filter(
      (holding) => getHoldingPnl(holding) < 0
    ).length;

    const flatHoldings = holdings.filter(
      (holding) => getHoldingPnl(holding) === 0
    ).length;

    const holdingWinRate =
      holdings.length > 0 ? (profitableHoldings / holdings.length) * 100 : 0;

    const bestHolding =
      holdings.length > 0
        ? [...holdings].sort((a, b) => getHoldingPnl(b) - getHoldingPnl(a))[0]
        : null;

    const worstHolding =
      holdings.length > 0
        ? [...holdings].sort((a, b) => getHoldingPnl(a) - getHoldingPnl(b))[0]
        : null;

    const topHoldings = [...holdings]
      .sort((a, b) => getHoldingCurrentValue(b) - getHoldingCurrentValue(a))
      .slice(0, 5);

    const rejectedOrders = orders.filter(
      (order) => String(order.status || "").toUpperCase() === "REJECTED"
    );

    const executedOrders =
      Number(orderSummary.executed_orders || 0) ||
      orders.filter(
        (order) => String(order.status || "").toUpperCase() === "EXECUTED"
      ).length;

    const totalOrders =
      Number(orderSummary.total_orders || 0) || orders.length || 0;

    const rejectedOrderCount =
      Number(orderSummary.rejected_orders || 0) || rejectedOrders.length;

    const pendingOrderCount =
      Number(orderSummary.pending_orders || 0) ||
      orders.filter(
        (order) => String(order.status || "").toUpperCase() === "PENDING"
      ).length;

    const orderExecutionRate =
      totalOrders > 0 ? (executedOrders / totalOrders) * 100 : 0;

    const rejectionRate =
      totalOrders > 0 ? (rejectedOrderCount / totalOrders) * 100 : 0;

    const cashPercent =
      totalValue > 0 ? Math.min((cashBalance / totalValue) * 100, 100) : 0;

    const holdingsPercent =
      totalValue > 0 ? Math.min((currentValue / totalValue) * 100, 100) : 0;

    const exposureLevel =
      holdingsPercent <= 35
        ? "Low"
        : holdingsPercent <= 70
        ? "Balanced"
        : "High";

    const disciplineScore = Math.max(
      0,
      Math.min(100, orderExecutionRate - rejectionRate + holdingWinRate / 4)
    );

    return {
      cashBalance,
      investedValue,
      currentValue,
      totalValue,
      totalPnl,
      pnlPercent,
      buyTrades,
      sellTrades,
      buyTurnover,
      sellTurnover,
      totalTurnover,
      averageTradeValue,
      profitableHoldings,
      lossHoldings,
      flatHoldings,
      holdingWinRate,
      bestHolding,
      worstHolding,
      topHoldings,
      rejectedOrders,
      executedOrders,
      totalOrders,
      rejectedOrderCount,
      pendingOrderCount,
      orderExecutionRate,
      rejectionRate,
      cashPercent,
      holdingsPercent,
      exposureLevel,
      disciplineScore,
    };
  }, [portfolio, holdings, transactions, orders, orderSummary]);

  const allocationRows = [
    {
      label: "Cash",
      value: analytics.cashBalance,
      percent: analytics.cashPercent,
      className: "cash-fill",
    },
    {
      label: "Holdings",
      value: analytics.currentValue,
      percent: analytics.holdingsPercent,
      className: "holdings-fill",
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
              <p className="pro-eyebrow">Performance Intelligence</p>

              <h1>
                Trading <span>Analytics</span>
              </h1>

              <p>
                Analyze portfolio performance, order quality, turnover,
                exposure, holdings strength, and trading behavior from one
                professional analytics dashboard.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "16px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  className={
                    analytics.totalPnl >= 0
                      ? "status-pill status-success"
                      : "status-pill status-danger"
                  }
                >
                  {analytics.totalPnl >= 0 ? "Profitable" : "In Loss"}
                </span>

                <span className="status-pill status-warning">
                  {analytics.exposureLevel} Exposure
                </span>

                <span className="status-pill status-success">
                  {formatPercent(analytics.orderExecutionRate)}% Execution Rate
                </span>
              </div>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span className="status-pill status-success">
                  Paper Analytics
                </span>
                <p>Insights based on simulated trades</p>
              </div>

              <button
                className="primary-action"
                onClick={loadAnalytics}
                disabled={loading}
              >
                <FaRedo style={{ marginRight: "8px" }} />
                {loading ? "Refreshing..." : "Refresh Analytics"}
              </button>
            </div>
          </div>

          <div className="pro-kpi-grid">
            <div className="pro-kpi-card">
              <p>Total Portfolio Value</p>
              <h2>₹{formatMoney(analytics.totalValue)}</h2>
              <span className="pro-muted">Cash + holdings value</span>
            </div>

            <div className="pro-kpi-card">
              <p>Total P&amp;L</p>
              <h2
                className={
                  analytics.totalPnl >= 0 ? "pro-positive" : "pro-negative"
                }
              >
                ₹{formatMoney(analytics.totalPnl)}
              </h2>
              <span
                className={
                  analytics.pnlPercent >= 0 ? "pro-positive" : "pro-negative"
                }
              >
                {formatPercent(analytics.pnlPercent)}%
              </span>
            </div>

            <div className="pro-kpi-card">
              <p>Total Turnover</p>
              <h2>₹{formatMoney(analytics.totalTurnover)}</h2>
              <span className="pro-muted">Buy + sell executed value</span>
            </div>

            <div className="pro-kpi-card">
              <p>Discipline Score</p>
              <h2
                className={
                  analytics.disciplineScore >= 70
                    ? "pro-positive"
                    : analytics.disciplineScore >= 40
                    ? ""
                    : "pro-negative"
                }
              >
                {formatPercent(analytics.disciplineScore)}
              </h2>
              <span className="pro-muted">
                Execution + rejection + win quality
              </span>
            </div>
          </div>

          <div className="pro-dashboard-grid">
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaChartBar
                      style={{ marginRight: "10px", color: "#2563eb" }}
                    />
                    Capital Allocation
                  </h2>
                  <p>Cash versus holdings exposure across the portfolio.</p>
                </div>
              </div>

              <div className="allocation-block">
                {allocationRows.map((row) => (
                  <div key={row.label}>
                    <div className="allocation-row">
                      <div>
                        <strong>{row.label}</strong>
                        <p>₹{formatMoney(row.value)}</p>
                      </div>

                      <span>{formatPercent(row.percent)}%</span>
                    </div>

                    <div className="allocation-bar">
                      <div
                        className={`allocation-fill ${row.className}`}
                        style={{ width: `${Math.min(row.percent, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
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
                      analytics.exposureLevel === "Low"
                        ? "status-pill status-success"
                        : analytics.exposureLevel === "Balanced"
                        ? "status-pill status-warning"
                        : "status-pill status-danger"
                    }
                  >
                    {analytics.exposureLevel}
                  </span>
                </div>

                <div className="info-row">
                  <span className="info-label">Invested Capital</span>
                  <span className="info-value">
                    ₹{formatMoney(analytics.investedValue)}
                  </span>
                </div>
              </div>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaSignal
                      style={{ marginRight: "10px", color: "#16a34a" }}
                    />
                    Trading Activity
                  </h2>
                  <p>Buy/sell behavior and average trade size.</p>
                </div>
              </div>

              <div className="activity-grid">
                <div>
                  <p>Buy Trades</p>
                  <h3 className="pro-positive">
                    {formatNumber(analytics.buyTrades.length)}
                  </h3>
                </div>

                <div>
                  <p>Sell Trades</p>
                  <h3 className="pro-negative">
                    {formatNumber(analytics.sellTrades.length)}
                  </h3>
                </div>

                <div>
                  <p>Average Trade</p>
                  <h3>₹{formatMoney(analytics.averageTradeValue)}</h3>
                </div>

                <div>
                  <p>Total Transactions</p>
                  <h3>{formatNumber(transactions.length)}</h3>
                </div>
              </div>

              <div className="turnover-box">
                <p>Total Turnover</p>
                <h2>₹{formatMoney(analytics.totalTurnover)}</h2>
              </div>
            </div>
          </div>

          <div className="pro-dashboard-grid large-left">
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaShieldAlt
                      style={{ marginRight: "10px", color: "#2563eb" }}
                    />
                    Order Quality
                  </h2>
                  <p>Measure execution, rejection, and pending order quality.</p>
                </div>
              </div>

              <div className="activity-grid">
                <div>
                  <p>Total Orders</p>
                  <h3>{formatNumber(analytics.totalOrders)}</h3>
                </div>

                <div>
                  <p>Executed Orders</p>
                  <h3 className="pro-positive">
                    {formatNumber(analytics.executedOrders)}
                  </h3>
                </div>

                <div>
                  <p>Pending Orders</p>
                  <h3>{formatNumber(analytics.pendingOrderCount)}</h3>
                </div>

                <div>
                  <p>Rejected Orders</p>
                  <h3 className="pro-negative">
                    {formatNumber(analytics.rejectedOrderCount)}
                  </h3>
                </div>
              </div>

              <div
                style={{
                  marginTop: "18px",
                  padding: "16px",
                  borderRadius: "16px",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                }}
              >
                <div className="info-row">
                  <span className="info-label">Execution Rate</span>
                  <span className="info-value">
                    {formatPercent(analytics.orderExecutionRate)}%
                  </span>
                </div>

                <div className="allocation-bar">
                  <div
                    className="allocation-fill cash-fill"
                    style={{
                      width: `${Math.min(analytics.orderExecutionRate, 100)}%`,
                    }}
                  />
                </div>

                <div className="info-row">
                  <span className="info-label">Rejection Rate</span>
                  <span
                    className={
                      analytics.rejectionRate <= 10
                        ? "pro-positive"
                        : "pro-negative"
                    }
                  >
                    {formatPercent(analytics.rejectionRate)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaWallet
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
                  <h3 className="pro-negative">{analytics.lossHoldings}</h3>
                </div>

                <div>
                  <p>Flat</p>
                  <h3>{analytics.flatHoldings}</h3>
                </div>

                <div>
                  <p>Holding Win Rate</p>
                  <h3
                    className={
                      analytics.holdingWinRate >= 50
                        ? "pro-positive"
                        : "pro-negative"
                    }
                  >
                    {formatPercent(analytics.holdingWinRate)}%
                  </h3>
                </div>
              </div>
            </div>
          </div>

          <div className="pro-dashboard-grid large-left">
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Best / Worst Holding</h2>
                  <p>Your strongest and weakest current positions.</p>
                </div>
              </div>

              {holdings.length === 0 ? (
                <div className="empty-state">
                  <h3>No holdings yet</h3>
                  <p>Buy stocks to start generating analytics.</p>

                  <button
                    className="primary-action"
                    onClick={() => navigate("/stocks")}
                    style={{ marginTop: "18px" }}
                  >
                    Explore Stocks
                  </button>
                </div>
              ) : (
                <div className="market-card-list">
                  <button
                    type="button"
                    className="market-card-item market-clickable"
                    onClick={() => openStock(analytics.bestHolding?.symbol)}
                  >
                    <div>
                      <span>Best Holding</span>
                      <strong>{analytics.bestHolding?.symbol}</strong>
                    </div>

                    <strong className="pro-positive">
                      ₹{formatMoney(getHoldingPnl(analytics.bestHolding))}
                    </strong>
                  </button>

                  <button
                    type="button"
                    className="market-card-item market-clickable"
                    onClick={() => openStock(analytics.worstHolding?.symbol)}
                  >
                    <div>
                      <span>Worst Holding</span>
                      <strong>{analytics.worstHolding?.symbol}</strong>
                    </div>

                    <strong
                      className={
                        getHoldingPnl(analytics.worstHolding) >= 0
                          ? "pro-positive"
                          : "pro-negative"
                      }
                    >
                      ₹{formatMoney(getHoldingPnl(analytics.worstHolding))}
                    </strong>
                  </button>
                </div>
              )}
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>
                    <FaChartLine
                      style={{ marginRight: "10px", color: "#2563eb" }}
                    />
                    Turnover Split
                  </h2>
                  <p>Buy turnover versus sell turnover.</p>
                </div>
              </div>

              <div className="market-card-list">
                <div className="market-card-item">
                  <span>Buy Turnover</span>
                  <strong className="pro-positive">
                    ₹{formatMoney(analytics.buyTurnover)}
                  </strong>
                </div>

                <div className="market-card-item">
                  <span>Sell Turnover</span>
                  <strong className="pro-negative">
                    ₹{formatMoney(analytics.sellTurnover)}
                  </strong>
                </div>

                <div className="market-card-item">
                  <span>Net Activity</span>
                  <strong>₹{formatMoney(analytics.totalTurnover)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="table-card" style={{ marginTop: "30px" }}>
            <div className="pro-panel-header">
              <div>
                <h2>Top Holdings by Value</h2>
                <p>Your largest positions based on current value.</p>
              </div>
            </div>

            {loading ? (
              <SkeletonLoader rows={6} />
            ) : analytics.topHoldings.length === 0 ? (
              <div className="empty-state">
                <h3>No holdings found</h3>
                <p>Your largest positions will appear here.</p>
              </div>
            ) : (
              <div className="table-scroll">
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Qty</th>
                    <th>Invested</th>
                    <th>Current Value</th>
                    <th>P&amp;L</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {analytics.topHoldings.map((item) => {
                    const pnl = getHoldingPnl(item);

                    return (
                      <tr key={item.id || item.symbol}>
                        <td>
                          <strong>{item.symbol}</strong>
                        </td>

                        <td>{formatNumber(item.quantity)}</td>

                        <td>₹{formatMoney(getHoldingInvestedValue(item))}</td>

                        <td>₹{formatMoney(getHoldingCurrentValue(item))}</td>

                        <td
                          className={pnl >= 0 ? "pro-positive" : "pro-negative"}
                        >
                          ₹{formatMoney(pnl)}
                        </td>

                        <td>
                          <button
                            className="primary-action"
                            onClick={() => openStock(item.symbol)}
                          >
                            <FaEye style={{ marginRight: "7px" }} />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>

          <div className="table-card" style={{ marginTop: "30px" }}>
            <div className="pro-panel-header">
              <div>
                <h2>Rejected Orders Review</h2>
                <p>Review failed trades and improve order quality.</p>
              </div>

              <button
                className="primary-action"
                onClick={() => navigate("/orders")}
              >
                Open Orders
              </button>
            </div>

            {analytics.rejectedOrders.length === 0 ? (
              <div className="empty-state">
                <h3>No rejected orders</h3>
                <p>Your order quality looks clean.</p>
              </div>
            ) : (
              <div className="table-scroll">
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Qty</th>
                    <th>Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {analytics.rejectedOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.symbol}</strong>
                      </td>

                      <td>
                        <span
                          className={
                            order.side === "BUY"
                              ? "status-pill status-success"
                              : "status-pill status-danger"
                          }
                        >
                          {order.side}
                        </span>
                      </td>

                      <td>{formatNumber(order.quantity)}</td>

                      <td
                        style={{
                          color: "#dc2626",
                          fontWeight: "800",
                        }}
                      >
                        <FaExclamationTriangle style={{ marginRight: "7px" }} />
                        {order.rejection_reason || "Rejected"}
                      </td>

                      <td>
                        <button
                          className="primary-action"
                          onClick={() => openStock(order.symbol)}
                        >
                          View Stock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          <div className="footer-note">
            Analytics are based on paper trades, simulated orders, holdings, and
            transaction history. Use this page to review behavior, risk,
            execution discipline, and performance quality.
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
