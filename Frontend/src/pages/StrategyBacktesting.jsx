import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import api from "../api/api";

function StrategyBacktesting() {
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({
    exchange: searchParams.get("exchange") || "NSE",
    tradingsymbol: searchParams.get("symbol") || "RELIANCE-EQ",
    symboltoken: searchParams.get("token") || "",
    strategy: "SMA_CROSSOVER",
    interval: "ONE_DAY",
    days: 180,
    initial_capital: 100000,
    quantity: 1,
    short_window: 9,
    long_window: 21,
    rsi_period: 14,
    rsi_buy: 30,
    rsi_sell: 70,
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const name = searchParams.get("name");
    if (name && !document.title.includes(name)) {
      document.title = `Backtest: ${name} - Paper Trade Pro`;
    }
  }, [searchParams]);

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const runBacktest = async (e) => {
    e.preventDefault();

    try {
      if (!form.symboltoken.trim()) {
        window.showToast?.("Symbol token is required. Open a stock from Stocks page to see its token.");
        return;
      }

      setLoading(true);
      setResult(null);

      const res = await api.get("/backtesting/run", {
        params: {
          exchange: form.exchange,
          tradingsymbol: form.tradingsymbol,
          symboltoken: form.symboltoken,
          strategy: form.strategy,
          interval: form.interval,
          days: Number(form.days),
          initial_capital: Number(form.initial_capital),
          quantity: Number(form.quantity),
          short_window: Number(form.short_window),
          long_window: Number(form.long_window),
          rsi_period: Number(form.rsi_period),
          rsi_buy: Number(form.rsi_buy),
          rsi_sell: Number(form.rsi_sell),
        },
      });

      setResult(res.data || null);
    } catch (err) {
      console.error("Backtest failed:", err);
      window.showToast?.(err?.response?.data?.detail || "Unable to run backtest.");
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

  const chartData = useMemo(() => {
    const points = result?.equity_curve || [];

    if (!points.length) {
      return {
        points: [],
        minValue: 0,
        maxValue: 0,
      };
    }

    const values = points.map((item) => Number(item.total_value || 0));

    return {
      points,
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
    };
  }, [result]);

  const renderChart = () => {
    const { points, minValue, maxValue } = chartData;

    if (!points.length) return null;

    const width = 1000;
    const height = 420;

    const leftPad = 75;
    const rightPad = 35;
    const topPad = 30;
    const bottomPad = 54;

    const chartWidth = width - leftPad - rightPad;
    const chartHeight = height - topPad - bottomPad;
    const valueRange = maxValue - minValue || 1;

    const yForValue = (value) => {
      return topPad + ((maxValue - value) / valueRange) * chartHeight;
    };

    const xForIndex = (index) => {
      if (points.length <= 1) return leftPad;
      return leftPad + (index / (points.length - 1)) * chartWidth;
    };

    const linePath = points
      .map((item, index) => {
        const x = xForIndex(index);
        const y = yForValue(Number(item.total_value || 0));

        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");

    const areaPath = `${linePath} L ${xForIndex(points.length - 1)} ${
      height - bottomPad
    } L ${leftPad} ${height - bottomPad} Z`;

    const sampleStep = Math.max(1, Math.floor(points.length / 30));

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "420px", display: "block" }}
      >
        <rect width={width} height={height} rx="18" fill="#ffffff" />

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = topPad + ratio * chartHeight;
          const value = maxValue - ratio * valueRange;

          return (
            <g key={ratio}>
              <line
                x1={leftPad}
                x2={width - rightPad}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="5 5"
              />

              <text
                x="10"
                y={y + 4}
                fontSize="12"
                fill="#64748b"
                fontWeight="800"
              >
                ₹{formatMoney(value)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="#dbeafe" opacity="0.75" />
        <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="4" />

        {points
          .filter((_, index) => index % sampleStep === 0)
          .map((item) => {
            const realIndex = points.indexOf(item);
            const x = xForIndex(realIndex);
            const y = yForValue(Number(item.total_value || 0));

            return (
              <circle
                key={`${item.time}-${realIndex}`}
                cx={x}
                cy={y}
                r="4"
                fill="#2563eb"
              >
                <title>
                  {item.time} • ₹{formatMoney(item.total_value)}
                </title>
              </circle>
            );
          })}

        <text
          x={leftPad}
          y={height - 18}
          fontSize="12"
          fill="#64748b"
          fontWeight="800"
        >
          {points[0]?.time}
        </text>

        <text
          x={width - rightPad - 190}
          y={height - 18}
          fontSize="12"
          fill="#64748b"
          fontWeight="800"
        >
          {points[points.length - 1]?.time}
        </text>
      </svg>
    );
  };

  const summary = result?.summary || {};

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <div className="dashboard-main">
        <Navbar />

        <div className="dashboard-content professional-dashboard">
          <div className="pro-dashboard-hero">
            <div>
              <p className="pro-eyebrow">Strategy Lab</p>

              <h1>
                Strategy <span>Backtesting</span>
              </h1>

              <p>
                Test SMA crossover and RSI strategies on Angel One historical
                candle data before using the idea in paper trading.
              </p>
            </div>

            <div className="pro-status-card">
              <span className="status-pill status-success">Simulation Only</span>
              <p>Backtesting does not place real or paper orders.</p>
            </div>
          </div>

          <div className="pro-dashboard-grid">
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Backtest Setup</h2>
                  <p>
                    Use exchange, tradingsymbol, and Angel One token from Stock
                    Details.
                  </p>
                </div>
              </div>

              <form onSubmit={runBacktest}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "14px",
                  }}
                >
                  <div>
                    <label style={labelStyle}>Exchange</label>
                    <select
                      style={inputStyle}
                      value={form.exchange}
                      onChange={(e) => handleChange("exchange", e.target.value)}
                    >
                      <option value="NSE">NSE</option>
                      <option value="BSE">BSE</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Strategy</label>
                    <select
                      style={inputStyle}
                      value={form.strategy}
                      onChange={(e) => handleChange("strategy", e.target.value)}
                    >
                      <option value="SMA_CROSSOVER">SMA Crossover</option>
                      <option value="RSI">RSI Strategy</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Trading Symbol</label>
                    <input
                      style={inputStyle}
                      value={form.tradingsymbol}
                      placeholder="RELIANCE-EQ"
                      onChange={(e) =>
                        handleChange("tradingsymbol", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Symbol Token</label>
                    <input
                      style={inputStyle}
                      value={form.symboltoken}
                      placeholder="Example: 2885"
                      onChange={(e) =>
                        handleChange("symboltoken", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Interval</label>
                    <select
                      style={inputStyle}
                      value={form.interval}
                      onChange={(e) => handleChange("interval", e.target.value)}
                    >
                      <option value="ONE_DAY">ONE DAY</option>
                      <option value="ONE_HOUR">ONE HOUR</option>
                      <option value="THIRTY_MINUTE">30 MINUTE</option>
                      <option value="FIFTEEN_MINUTE">15 MINUTE</option>
                      <option value="FIVE_MINUTE">5 MINUTE</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Days</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min="30"
                      max="365"
                      value={form.days}
                      onChange={(e) => handleChange("days", e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Initial Capital</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min="1"
                      value={form.initial_capital}
                      onChange={(e) =>
                        handleChange("initial_capital", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Quantity Per Trade</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min="1"
                      value={form.quantity}
                      onChange={(e) => handleChange("quantity", e.target.value)}
                    />
                  </div>
                </div>

                {form.strategy === "SMA_CROSSOVER" ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "14px",
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Short SMA</label>
                      <input
                        style={inputStyle}
                        type="number"
                        min="2"
                        value={form.short_window}
                        onChange={(e) =>
                          handleChange("short_window", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Long SMA</label>
                      <input
                        style={inputStyle}
                        type="number"
                        min="3"
                        value={form.long_window}
                        onChange={(e) =>
                          handleChange("long_window", e.target.value)
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: "14px",
                    }}
                  >
                    <div>
                      <label style={labelStyle}>RSI Period</label>
                      <input
                        style={inputStyle}
                        type="number"
                        min="2"
                        value={form.rsi_period}
                        onChange={(e) =>
                          handleChange("rsi_period", e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Buy Below RSI</label>
                      <input
                        style={inputStyle}
                        type="number"
                        min="1"
                        max="99"
                        value={form.rsi_buy}
                        onChange={(e) => handleChange("rsi_buy", e.target.value)}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Sell Above RSI</label>
                      <input
                        style={inputStyle}
                        type="number"
                        min="1"
                        max="99"
                        value={form.rsi_sell}
                        onChange={(e) =>
                          handleChange("rsi_sell", e.target.value)
                        }
                      />
                    </div>
                  </div>
                )}

                <button className="primary-action" type="submit" disabled={loading}>
                  {loading ? "Running Backtest..." : "Run Backtest"}
                </button>
              </form>
            </div>

            <div className="pro-panel">
              <h2>Backtesting Notes</h2>

              <div className="market-card-list" style={{ marginTop: "16px" }}>
                <div className="market-card-item">
                  <strong>SMA Crossover</strong>
                  <span>Trend</span>
                </div>

                <div className="market-card-item">
                  <strong>RSI Strategy</strong>
                  <span>Momentum</span>
                </div>

                <div className="market-card-item">
                  <strong>No real orders placed</strong>
                  <span>Safe</span>
                </div>

                <div className="market-card-item">
                  <strong>Uses historical candles</strong>
                  <span>Angel One</span>
                </div>
              </div>

              <div className="footer-note">
                Backtest results are educational. Past performance does not
                guarantee future results.
              </div>
            </div>
          </div>

          {result && (
            <>
              <div className="dashboard-cards" style={{ marginTop: "24px" }}>
                <div className="stat-card">
                  <h4>Final Value</h4>
                  <h2>₹{formatMoney(summary.final_value)}</h2>
                </div>

                <div className="stat-card">
                  <h4>Total P&amp;L</h4>
                  <h2
                    style={{
                      color:
                        Number(summary.total_pnl || 0) >= 0
                          ? "#16a34a"
                          : "#dc2626",
                    }}
                  >
                    ₹{formatMoney(summary.total_pnl)}
                  </h2>
                </div>

                <div className="stat-card">
                  <h4>Return</h4>
                  <h2
                    style={{
                      color:
                        Number(summary.return_percent || 0) >= 0
                          ? "#16a34a"
                          : "#dc2626",
                    }}
                  >
                    {Number(summary.return_percent || 0).toFixed(2)}%
                  </h2>
                </div>

                <div className="stat-card">
                  <h4>Trades</h4>
                  <h2>{result.trade_count || 0}</h2>
                </div>
              </div>

              <div className="pro-panel" style={{ marginTop: "24px" }}>
                <div className="pro-panel-header">
                  <div>
                    <h2>Backtest Equity Curve</h2>
                    <p>
                      Strategy: {result.strategy} · Candles:{" "}
                      {result.candle_count}
                    </p>
                  </div>
                </div>

                {renderChart()}
              </div>

              <div className="table-card" style={{ marginTop: "24px" }}>
                <h2>Backtest Trades</h2>

                {!result.trades?.length ? (
                  <div className="empty-state">
                    <h3>No trades generated</h3>
                    <p>Try changing strategy parameters or increasing days.</p>
                  </div>
                ) : (
                  <table className="pro-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Side</th>
                        <th>Price</th>
                        <th>Qty</th>
                        <th>P&amp;L</th>
                        <th>Reason</th>
                      </tr>
                    </thead>

                    <tbody>
                      {result.trades.map((trade, index) => (
                        <tr key={`${trade.time}-${index}`}>
                          <td>{trade.time}</td>

                          <td>
                            <span
                              className={
                                trade.side === "BUY"
                                  ? "status-pill status-success"
                                  : "status-pill status-danger"
                              }
                            >
                              {trade.side}
                            </span>
                          </td>

                          <td>₹{formatMoney(trade.price)}</td>
                          <td>{trade.quantity}</td>

                          <td
                            style={{
                              color:
                                Number(trade.pnl || 0) >= 0
                                  ? "#16a34a"
                                  : "#dc2626",
                              fontWeight: "900",
                            }}
                          >
                            {trade.pnl !== undefined
                              ? `₹${formatMoney(trade.pnl)}`
                              : "-"}
                          </td>

                          <td>{trade.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          <div className="footer-note">
            Strategy backtesting is a simulated research tool. Use it to compare
            ideas before paper trading them.
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontWeight: "800",
  marginBottom: "8px",
  color: "#334155",
};

const inputStyle = {
  width: "100%",
  padding: "13px 14px",
  marginBottom: "18px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "15px",
  background: "white",
};

export default StrategyBacktesting;
