import { useCallback, useEffect, useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import api from "../api/api";

function EquityCurve() {
  const [loading, setLoading] = useState(true);
  const [curvePoints, setCurvePoints] = useState([]);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const [summary, setSummary] = useState({
    startingCapital: 1000000,
    latestValue: 1000000,
    currentPnl: 0,
    bestValue: 1000000,
    worstValue: 1000000,
  });

  useEffect(() => {
    loadEquityCurve();
  }, []);

  const formatMoney = (value) => {
    return Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatShortDateTime = (value) => {
    if (!value) return "Start";

    const normalized =
      String(value).endsWith("Z") || String(value).includes("+")
        ? value
        : `${value}Z`;

    return new Date(normalized).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const buildFallbackCurve = (transactions = [], portfolio = {}) => {
    const STARTING_CAPITAL = 1000000;

    const sorted = [...transactions].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    let runningCash = STARTING_CAPITAL;

    const points = [
      {
        label: "Start",
        value: STARTING_CAPITAL,
        rawDate: null,
        event: "Initial Capital",
        cash: STARTING_CAPITAL,
        holdingsValue: 0,
        pnl: 0,
      },
    ];

    sorted.forEach((tx) => {
      const total = Number(tx.quantity || 0) * Number(tx.price || 0);
      const txType = String(tx.transaction_type || "").toUpperCase();

      if (txType === "BUY") {
        runningCash -= total;
      } else if (txType === "SELL") {
        runningCash += total;
      }

      points.push({
        label: formatShortDateTime(tx.created_at),
        value: runningCash,
        rawDate: tx.created_at,
        event: `${txType} ${tx.quantity} ${tx.symbol}`,
        cash: runningCash,
        holdingsValue: 0,
        pnl: runningCash - STARTING_CAPITAL,
      });
    });

    const latestValue =
      Number(portfolio.total_value) ||
      (points.length ? points[points.length - 1].value : STARTING_CAPITAL);

    const values = points.map((p) => Number(p.value || 0));

    return {
      points,
      summary: {
        startingCapital: STARTING_CAPITAL,
        latestValue,
        currentPnl: latestValue - STARTING_CAPITAL,
        bestValue: values.length ? Math.max(...values, latestValue) : latestValue,
        worstValue: values.length ? Math.min(...values, latestValue) : latestValue,
      },
    };
  };

  const loadEquityCurve = async () => {
    try {
      setLoading(true);
      setHoveredPoint(null);

      try {
        const [curveRes, portfolioRes] = await Promise.all([
          api.get("/analytics-extra/equity-curve"),
          api.get("/portfolio/"),
        ]);

        const data = curveRes.data || {};
        const portfolio = portfolioRes.data || {};
        const rawPoints = Array.isArray(data.points) ? data.points : [];

        const cleanedPoints = rawPoints.map((item, index) => ({
          label: item.label || `Point ${index + 1}`,
          value: Number(item.total_value || item.value || 0),
          rawDate: item.created_at || item.date || null,
          event: item.event || "Portfolio point",
          cash: Number(item.cash || 0),
          holdingsValue: Number(item.holdings_value || 0),
          pnl: Number(item.pnl || 0),
        }));

        if (cleanedPoints.length > 0) {
          const startingCapital =
            Number(data.starting_capital) || cleanedPoints[0].value || 1000000;

          const latestBackendValue =
            cleanedPoints[cleanedPoints.length - 1].value || startingCapital;

          const latestValue =
            Number(portfolio.total_value || 0) || latestBackendValue;

          const values = cleanedPoints.map((p) => p.value);

          setCurvePoints(cleanedPoints);
          setSummary({
            startingCapital,
            latestValue,
            currentPnl: latestValue - startingCapital,
            bestValue: Math.max(...values, latestValue),
            worstValue: Math.min(...values, latestValue),
          });

          setLoading(false);
          return;
        }
      } catch (curveError) {
        console.warn("Equity curve API fallback triggered:", curveError);
      }

      const [transactionsRes, portfolioRes] = await Promise.all([
        api.get("/transactions/"),
        api.get("/portfolio/"),
      ]);

      const fallback = buildFallbackCurve(
        transactionsRes.data || [],
        portfolioRes.data || {}
      );

      setCurvePoints(fallback.points);
      setSummary(fallback.summary);
    } catch (err) {
      console.error("Equity curve load failed:", err);
      alert("Unable to load equity curve.");
    } finally {
      setLoading(false);
    }
  };

  const interpolateCurve = useCallback((rawPoints) => {
    if (!rawPoints || rawPoints.length < 2) return rawPoints || [];

    const interpolated = [];

    for (let i = 0; i < rawPoints.length; i++) {
      const curr = rawPoints[i];

      // Always include the original point
      interpolated.push({ ...curr, isOriginal: true });

      // If not the last point, generate intermediate points
      if (i < rawPoints.length - 1) {
        const next = rawPoints[i + 1];
        const segments = 40; // 40 interpolated segments between each pair

        for (let s = 1; s < segments; s++) {
          const t = s / segments;
          // Smooth step: ease-in-out for a natural curve feel
          const smoothT = t * t * (3 - 2 * t);
          const val = curr.value + (next.value - curr.value) * smoothT;

          interpolated.push({
            label: "",
            value: val,
            rawDate: null,
            event: "",
            cash: 0,
            holdingsValue: 0,
            pnl: 0,
            isOriginal: false,
            isInterpolated: true,
          });
        }
      }
    }

    return interpolated;
  }, []);

  const chartData = useMemo(() => {
    if (!curvePoints.length) {
      return [
        {
          label: "Start",
          value: 1000000,
          event: "Initial Capital",
          cash: 1000000,
          holdingsValue: 0,
          pnl: 0,
          isOriginal: true,
        },
        {
          label: "Now",
          value: 1000000,
          event: "No trades yet",
          cash: 1000000,
          holdingsValue: 0,
          pnl: 0,
          isOriginal: false,
          isInterpolated: true,
        },
      ];
    }

    return interpolateCurve(curvePoints);
  }, [curvePoints, interpolateCurve]);

  const originalPoints = useMemo(() => {
    return chartData.filter((p) => p.isOriginal);
  }, [chartData]);

  const chartGeometry = useMemo(() => {
    const width = 980;
    const height = 430;

    const padding = {
      top: 28,
      right: 34,
      bottom: 58,
      left: 132,
    };

    const plotLeft = padding.left;
    const plotTop = padding.top;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const plotBottom = plotTop + plotHeight;

    // Use ALL points (interpolated) for value range
    const values = chartData.map((d) => Number(d.value || 0));
    const origValues = originalPoints.map((d) => Number(d.value || 0));

    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);

    if (minValue === maxValue) {
      minValue = minValue - 1000;
      maxValue = maxValue + 1000;
    } else {
      const spread = maxValue - minValue;
      minValue -= spread * 0.12;
      maxValue += spread * 0.12;
    }

    const getX = (index, total) => {
      if (total <= 1) return plotLeft + plotWidth / 2;
      return plotLeft + (index / (total - 1)) * plotWidth;
    };

    const getY = (value) => {
      const ratio = (value - minValue) / (maxValue - minValue);
      return plotBottom - ratio * plotHeight;
    };

    // Generate smooth points for ALL data (interpolated curve)
    const smoothPoints = chartData.map((point, index) => ({
      ...point,
      index,
      x: getX(index, chartData.length),
      y: getY(Number(point.value || 0)),
    }));

    // Generate original trade event points
    const eventPoints = originalPoints.map((point, index) => ({
      ...point,
      index,
      x: getX(
        chartData.indexOf(point),
        chartData.length
      ),
      y: getY(Number(point.value || 0)),
    }));

    // Smooth cubic bezier curve path
    const buildSmoothPath = (pts) => {
      if (!pts.length) return "";
      let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const cpx = (prev.x + curr.x) / 2;
        path += ` C ${cpx.toFixed(1)} ${prev.y.toFixed(1)}, ${cpx.toFixed(1)} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
      }
      return path;
    };

    const linePath = buildSmoothPath(smoothPoints);

    const areaPath = smoothPoints.length
      ? `${linePath} L ${smoothPoints[smoothPoints.length - 1].x.toFixed(1)} ${plotBottom.toFixed(1)} L ${smoothPoints[0].x.toFixed(1)} ${plotBottom.toFixed(1)} Z`
      : "";

    const yTicks = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const value = maxValue - ratio * (maxValue - minValue);
      const y = plotTop + ratio * plotHeight;
      return { value, y };
    });

    return {
      width,
      height,
      plotLeft,
      plotTop,
      plotWidth,
      plotHeight,
      plotBottom,
      smoothPoints,
      eventPoints,
      yTicks,
      linePath,
      areaPath,
    };
  }, [chartData, originalPoints]);

  const {
    width,
    height,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    plotBottom,
    smoothPoints,
    eventPoints,
    yTicks,
    linePath,
    areaPath,
  } = chartGeometry;

  const handleChartMouseMove = (event) => {
    if (!eventPoints.length) return;

    const svg = event.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();

    const scaleX = width / rect.width;
    const mouseX = (event.clientX - rect.left) * scaleX;

    let nearestPoint = eventPoints[0];
    let smallestDistance = Math.abs(mouseX - eventPoints[0].x);

    eventPoints.forEach((point) => {
      const distance = Math.abs(mouseX - point.x);

      if (distance < smallestDistance) {
        nearestPoint = point;
        smallestDistance = distance;
      }
    });

    setHoveredPoint(nearestPoint);
  };

  const getVisibleXAxisLabels = () => {
    if (eventPoints.length <= 2) return eventPoints;

    const visible = [];
    const step = Math.max(1, Math.floor((eventPoints.length - 1) / 3));

    eventPoints.forEach((point, index) => {
      if (index === 0 || index === eventPoints.length - 1 || index % step === 0) {
        visible.push(point);
      }
    });

    const unique = [];
    const seen = new Set();

    visible.forEach((item) => {
      const key = `${item.x}-${item.label}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    });

    return unique;
  };

  const xAxisLabels = getVisibleXAxisLabels();

  const tooltipBox = useMemo(() => {
    if (!hoveredPoint) return null;

    const boxWidth = 248;
    const boxHeight = 112;

    let x = hoveredPoint.x + 16;
    let y = hoveredPoint.y - boxHeight - 16;

    if (x + boxWidth > width - 8) {
      x = hoveredPoint.x - boxWidth - 16;
    }

    if (x < 8) {
      x = 8;
    }

    if (y < 8) {
      y = hoveredPoint.y + 18;
    }

    if (y + boxHeight > height - 8) {
      y = height - boxHeight - 8;
    }

    return {
      x,
      y,
      width: boxWidth,
      height: boxHeight,
    };
  }, [hoveredPoint, width, height]);

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <div className="dashboard-main">
        <Navbar />

        <div className="dashboard-content professional-dashboard">
          <div className="pro-dashboard-hero">
            <div>
              <p className="pro-eyebrow">Performance Tracking</p>

              <h1>
                P&amp;L <span>Equity Curve</span>
              </h1>

              <p>
                Track how your simulated portfolio value changes after every
                executed trade. Hover over the chart to inspect values.
              </p>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span className="status-pill status-success">
                  {chartData.length} Points
                </span>
                <p>Generated from transaction history.</p>
              </div>

              <button
                className="primary-action"
                onClick={loadEquityCurve}
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="dashboard-cards">
            <div className="stat-card">
              <h4>Starting Capital</h4>
              <h2>₹{formatMoney(summary.startingCapital)}</h2>
            </div>

            <div className="stat-card">
              <h4>Latest Portfolio Value</h4>
              <h2>₹{formatMoney(summary.latestValue)}</h2>
            </div>

            <div className="stat-card">
              <h4>Current P&amp;L</h4>
              <h2
                style={{
                  color:
                    Number(summary.currentPnl || 0) >= 0 ? "#16a34a" : "#dc2626",
                }}
              >
                ₹{formatMoney(summary.currentPnl)}
              </h2>
            </div>

            <div className="stat-card">
              <h4>Best Value</h4>
              <h2>₹{formatMoney(summary.bestValue)}</h2>
            </div>
          </div>

          <div className="table-card" style={{ marginTop: "24px" }}>
            <h2>Equity Curve</h2>

            <p style={{ color: "#64748b", marginTop: "6px" }}>
              Move your cursor over the chart to see the portfolio value at each
              point.
            </p>

            {loading ? (
              <p style={{ marginTop: "24px" }}>Loading equity curve...</p>
            ) : (
              <div
                style={{
                  width: "100%",
                  overflowX: "auto",
                  marginTop: "20px",
                }}
              >
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  style={{
                    width: "100%",
                    minWidth: "860px",
                    height: "auto",
                    display: "block",
                    cursor: "crosshair",
                  }}
                >
                  <defs>
                    <linearGradient
                      id="equityAreaGradient"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.20" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.03" />
                    </linearGradient>

                    <linearGradient
                      id="equityLineGradient"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="50%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#1d4ed8" />
                    </linearGradient>

                    <filter id="lineGlow">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>

                    <filter id="tooltipShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow
                        dx="0"
                        dy="8"
                        stdDeviation="8"
                        floodColor="#0f172a"
                        floodOpacity="0.18"
                      />
                    </filter>

                    <clipPath id="equityChartClip">
                      <rect
                        x={plotLeft}
                        y={plotTop}
                        width={plotWidth}
                        height={plotHeight}
                      />
                    </clipPath>
                  </defs>

                  {yTicks.map((tick, index) => (
                    <g key={index}>
                      <line
                        x1={plotLeft}
                        y1={tick.y}
                        x2={plotLeft + plotWidth}
                        y2={tick.y}
                        stroke="#e2e8f0"
                        strokeDasharray="5 6"
                        strokeWidth="1"
                      />

                      <text
                        x={plotLeft - 14}
                        y={tick.y + 4}
                        textAnchor="end"
                        fontSize="13"
                        fontWeight="800"
                        fill="#64748b"
                      >
                        ₹{formatMoney(tick.value)}
                      </text>
                    </g>
                  ))}

                  <line
                    x1={plotLeft}
                    y1={plotBottom}
                    x2={plotLeft + plotWidth}
                    y2={plotBottom}
                    stroke="#cbd5e1"
                    strokeWidth="1"
                  />

                  <g clipPath="url(#equityChartClip)">
                    <path d={areaPath} fill="url(#equityAreaGradient)" />

                    {/* Glow line behind */}
                    <path
                      d={linePath}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.15"
                      filter="url(#lineGlow)"
                    />

                    {/* Main gradient line */}
                    <path
                      d={linePath}
                      fill="none"
                      stroke="url(#equityLineGradient)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Event dots — small and subtle */}
                    {eventPoints.map((point) => (
                      <g key={point.index}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="5"
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth="2.5"
                        />
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="2.5"
                          fill="#2563eb"
                          opacity="0.8"
                        />
                      </g>
                    ))}
                  </g>

                  <rect
                    x={plotLeft}
                    y={plotTop}
                    width={plotWidth}
                    height={plotHeight}
                    fill="transparent"
                    onMouseMove={handleChartMouseMove}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />

                  {hoveredPoint && tooltipBox && (
                    <g>
                      <line
                        x1={hoveredPoint.x}
                        y1={plotTop}
                        x2={hoveredPoint.x}
                        y2={plotBottom}
                        stroke="#1d4ed8"
                        strokeWidth="1.5"
                        strokeDasharray="5 5"
                        opacity="0.85"
                      />

                      <circle
                        cx={hoveredPoint.x}
                        cy={hoveredPoint.y}
                        r="8"
                        fill="#2563eb"
                        stroke="#ffffff"
                        strokeWidth="3"
                      />

                      <g filter="url(#tooltipShadow)">
                        <rect
                          x={tooltipBox.x}
                          y={tooltipBox.y}
                          width={tooltipBox.width}
                          height={tooltipBox.height}
                          rx="14"
                          fill="#0f172a"
                        />

                        <text
                          x={tooltipBox.x + 16}
                          y={tooltipBox.y + 26}
                          fontSize="13"
                          fontWeight="800"
                          fill="#bfdbfe"
                        >
                          {hoveredPoint.label}
                        </text>

                        <text
                          x={tooltipBox.x + 16}
                          y={tooltipBox.y + 52}
                          fontSize="18"
                          fontWeight="900"
                          fill="#ffffff"
                        >
                          ₹{formatMoney(hoveredPoint.value)}
                        </text>

                        <text
                          x={tooltipBox.x + 16}
                          y={tooltipBox.y + 76}
                          fontSize="12"
                          fontWeight="700"
                          fill={
                            Number(hoveredPoint.pnl || 0) >= 0
                              ? "#86efac"
                              : "#fca5a5"
                          }
                        >
                          P&amp;L: ₹{formatMoney(hoveredPoint.pnl || 0)}
                        </text>

                        <text
                          x={tooltipBox.x + 16}
                          y={tooltipBox.y + 96}
                          fontSize="12"
                          fontWeight="700"
                          fill="#cbd5e1"
                        >
                          {hoveredPoint.event || "Portfolio point"}
                        </text>
                      </g>
                    </g>
                  )}

                  {xAxisLabels.map((point, index) => (
                    <text
                      key={`${point.label}-${index}`}
                      x={point.x}
                      y={height - 16}
                      textAnchor={
                        index === 0
                          ? "start"
                          : index === xAxisLabels.length - 1
                          ? "end"
                          : "middle"
                      }
                      fontSize="13"
                      fontWeight="800"
                      fill="#64748b"
                    >
                      {point.label}
                    </text>
                  ))}
                </svg>
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "20px",
              marginTop: "24px",
            }}
          >
            <div className="table-card">
              <h2>Best Point</h2>
              <p style={{ color: "#64748b", marginTop: "8px" }}>
                Highest portfolio value reached.
              </p>
              <h3 style={{ marginTop: "20px", color: "#16a34a" }}>
                ₹{formatMoney(summary.bestValue)}
              </h3>
            </div>

            <div className="table-card">
              <h2>Worst Point</h2>
              <p style={{ color: "#64748b", marginTop: "8px" }}>
                Lowest portfolio value reached.
              </p>
              <h3 style={{ marginTop: "20px", color: "#dc2626" }}>
                ₹{formatMoney(summary.worstValue)}
              </h3>
            </div>
          </div>

          <div className="footer-note">
            Hover inspection shows the exact portfolio value, P&amp;L, and trade
            event for the nearest point on the curve.
          </div>
        </div>
      </div>
    </div>
  );
}

export default EquityCurve;
