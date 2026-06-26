import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaExpand, FaCompress } from "react-icons/fa";
import api from "../api/api";
import { buildRealtimeUrl } from "../api/realtime";

const RANGE_OPTIONS = [
  { label: "1M", interval: "ONE_MINUTE", days: 1 },
  { label: "1D", interval: "FIVE_MINUTE", days: 1 },
  { label: "5D", interval: "FIFTEEN_MINUTE", days: 5 },
  { label: "1MO", interval: "ONE_DAY", days: 30 },
  { label: "6MO", interval: "ONE_DAY", days: 180 },
  { label: "1Y", interval: "ONE_DAY", days: 365 },
];

const formatMoney = (value) => {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
};

const parseMarketTime = (value) => {
  if (value instanceof Date) return value.getTime();

  const text = String(value || "").trim();
  if (!text) return 0;

  const isoLike = text.includes("T") ? text : text.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(isoLike);
  const parsed = Date.parse(hasTimezone ? isoLike : `${isoLike}+05:30`);

  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCandle = (candle) => {
  if (!candle) return null;

  return {
    ...candle,
    open: Number(candle.open || 0),
    high: Number(candle.high || 0),
    low: Number(candle.low || 0),
    close: Number(candle.close || 0),
    volume: Number(candle.volume || 0),
    _timeValue: parseMarketTime(candle.time),
  };
};

const mergeLiveCandle = (existing, incoming) => {
  if (!existing) return normalizeCandle(incoming);

  const live = normalizeCandle(incoming);

  return {
    ...existing,
    ...live,
    open: Number(existing.open),
    high: Math.max(Number(existing.high), Number(live.high)),
    low: Math.min(Number(existing.low), Number(live.low)),
    close: Number(live.close),
    volume: Math.max(Number(existing.volume || 0), Number(live.volume || 0)),
    is_live: true,
  };
};

const mergeLiveIntoSeries = (series, incoming, limit = 500) => {
  const live = normalizeCandle(incoming);
  if (!live || !live._timeValue) return series;

  const next = [...series];
  const matchingIndex = next.findIndex(
    (item) => parseMarketTime(item.time) === live._timeValue
  );

  if (matchingIndex >= 0) {
    next[matchingIndex] = mergeLiveCandle(next[matchingIndex], live);
  } else {
    next.push(live);
  }

  next.sort((a, b) => parseMarketTime(a.time) - parseMarketTime(b.time));
  return next.slice(-limit);
};

const mergeHistoricalSeries = (historical, current) => {
  const byTime = new Map();

  (historical || []).forEach((item) => {
    const candle = normalizeCandle(item);
    if (candle?._timeValue) byTime.set(candle._timeValue, candle);
  });

  (current || []).forEach((item) => {
    const candle = normalizeCandle(item);
    if (!candle?._timeValue || !candle.is_live) return;

    const historicalCandle = byTime.get(candle._timeValue);
    byTime.set(
      candle._timeValue,
      historicalCandle
        ? mergeLiveCandle(historicalCandle, candle)
        : candle
    );
  });

  return [...byTime.values()]
    .sort((a, b) => a._timeValue - b._timeValue)
    .slice(-500);
};

function TradingViewChart({
  symbol,
  exchange,
  tradingsymbol,
  symboltoken,
  displayName,
  onQuote,
}) {
  const [range, setRange] = useState(RANGE_OPTIONS[1]);
  const [candles, setCandles] = useState([]);
  const [selectedCandle, setSelectedCandle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chartError, setChartError] = useState("");
  const [cacheStatus, setCacheStatus] = useState("");
  const [wsStatus, setWsStatus] = useState("Connecting…");
  const [realtimeInfo, setRealtimeInfo] = useState("");
  const [liveLtp, setLiveLtp] = useState(null);
  const [liveChange, setLiveChange] = useState(null);
  const [liveChangePercent, setLiveChangePercent] = useState(null);
  const [isEnlarged, setIsEnlarged] = useState(false);
  const [hoverInfo, setHoverInfo] = useState(null);

  const loadingRef = useRef(false);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const onQuoteRef = useRef(onQuote);

  useEffect(() => {
    onQuoteRef.current = onQuote;
  }, [onQuote]);

  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(
    cleanSymbol
  )}`;

  const chartCacheKey = useMemo(
    () =>
      `chart_cache_${exchange || ""}_${symboltoken || ""}_${range.label}_${
        range.interval
      }_${range.days}`,
    [exchange, symboltoken, range]
  );

  const saveChartCache = useCallback(
    (data) => {
      try {
        sessionStorage.setItem(
          chartCacheKey,
          JSON.stringify({ createdAt: Date.now(), candles: data })
        );
      } catch {
        // Browser storage is an optional speed-up.
      }
    },
    [chartCacheKey]
  );

  const readChartCache = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(chartCacheKey);
      if (!raw) return false;

      const parsed = JSON.parse(raw);
      if (!parsed?.candles?.length) return false;

      const maxAge =
        range.interval === "ONE_DAY" ? 6 * 60 * 60 * 1000 : 5 * 60 * 1000;

      if (Date.now() - Number(parsed.createdAt || 0) > maxAge) {
        sessionStorage.removeItem(chartCacheKey);
        return false;
      }

      const cachedCandles = parsed.candles.map(normalizeCandle).filter(Boolean);
      setCandles(cachedCandles);
      setSelectedCandle(cachedCandles[cachedCandles.length - 1]);
      setCacheStatus("Showing cached candles while fresh data loads");
      return true;
    } catch {
      return false;
    }
  }, [chartCacheKey, range.interval]);

  const fetchCandles = useCallback(
    async (force = false) => {
      if (
        loadingRef.current ||
        !exchange ||
        !symboltoken ||
        !range.interval
      ) {
        return;
      }

      loadingRef.current = true;
      setLoading(true);

      try {
        const res = await api.get("/market/candles", {
          params: {
            exchange,
            tradingsymbol: tradingsymbol || "",
            symboltoken,
            interval: range.interval,
            days: range.days,
            limit: range.interval === "ONE_MINUTE" ? 180 : 300,
            force,
          },
        });

        const historical = res.data?.candles || [];

        if (!historical.length) {
          setChartError(
            res.data?.message || "No candle data is available for this range."
          );
          return;
        }

        setCandles((current) => {
          const merged = mergeHistoricalSeries(historical, current);
          saveChartCache(merged);
          setSelectedCandle(merged[merged.length - 1]);
          return merged;
        });
        setChartError("");
        setCacheStatus("");
      } catch (error) {
        setChartError(
          error?.response?.data?.detail ||
            "Unable to load historical candles from Angel One."
        );
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [
      exchange,
      range.days,
      range.interval,
      saveChartCache,
      symboltoken,
      tradingsymbol,
    ]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCandles([]);
      setSelectedCandle(null);
      setChartError("");
      readChartCache();
      fetchCandles(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchCandles, readChartCache]);

  useEffect(() => {
    if (!exchange || !symboltoken || !range.interval) return undefined;

    let disposed = false;

    const scheduleReconnect = () => {
      if (disposed) return;

      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 500);
      reconnectAttemptRef.current = Math.min(attempt + 1, 5);
      setWsStatus("Reconnecting…");

      reconnectTimerRef.current = window.setTimeout(
        connect,
        delay + jitter
      );
    };

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const quote = message.quote;
        const candle = message.candle;
        const feed = message.feed;

        if (message.type === "initial_data" && message.candles?.length) {
          setCandles((current) =>
            mergeHistoricalSeries(message.candles, current)
          );
        }

        if (quote) {
          const ltp = Number(quote.ltp);
          const prevClose = Number(quote.previous_close || 0);
          const change = prevClose ? ltp - prevClose : null;
          const changePercent = prevClose ? (change / prevClose) * 100 : null;

          setLiveLtp(ltp);
          setLiveChange(change);
          setLiveChangePercent(changePercent);

          onQuoteRef.current?.(quote);
          setRealtimeInfo(
            `₹${formatMoney(ltp)} • ${Number(
              quote.latency_ms || 0
            ).toLocaleString("en-IN")} ms feed latency`
          );
        }

        if (candle) {
          setCandles((current) => {
            const updated = mergeLiveIntoSeries(current, candle);
            saveChartCache(updated);
            return updated;
          });
          setSelectedCandle(normalizeCandle(candle));
        }

        if (feed?.connected && !feed?.feed_stale) {
          setWsStatus("Live");
        } else if (feed?.connected) {
          setWsStatus("Connected • waiting for market tick");
        } else {
          setWsStatus("Feed reconnecting…");
        }
      } catch (error) {
        console.error("Live market message could not be parsed:", error);
      }
    };

    function connect() {
      if (disposed) return;

      if (wsRef.current) {
        wsRef.current.close();
      }

      setWsStatus("Connecting…");

      const socket = new WebSocket(
        buildRealtimeUrl(
          `market-realtime/ws/candles/${encodeURIComponent(
            exchange
          )}/${encodeURIComponent(symboltoken)}`,
          { interval: range.interval }
        )
      );

      wsRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setWsStatus("Connected • waiting for market tick");
      };
      socket.onmessage = handleMessage;
      socket.onerror = () => {
        setWsStatus("Live feed connection error");
      };
      socket.onclose = () => {
        if (wsRef.current === socket) wsRef.current = null;
        scheduleReconnect();
      };

    }

    connect();

    const reconnectWhenOnline = () => {
      if (!disposed && !wsRef.current) connect();
    };
    window.addEventListener("online", reconnectWhenOnline);

    return () => {
      disposed = true;
      window.removeEventListener("online", reconnectWhenOnline);
      window.clearTimeout(reconnectTimerRef.current);

      if (wsRef.current) {
        const socket = wsRef.current;
        wsRef.current = null;
        socket.close(1000, "Chart changed");
      }
    };
  }, [exchange, range.interval, saveChartCache, symboltoken]);

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  }

  const chartData = useMemo(() => {
    const visibleCandles = candles.slice(-100);
    if (!visibleCandles.length) {
      return { visibleCandles: [], minPrice: 0, maxPrice: 0, priceRange: 1 };
    }

    const minPrice = Math.min(
      ...visibleCandles.map((item) => Number(item.low))
    );
    const maxPrice = Math.max(
      ...visibleCandles.map((item) => Number(item.high))
    );

    return {
      visibleCandles,
      minPrice,
      maxPrice,
      priceRange: maxPrice - minPrice || 1,
    };
  }, [candles]);

  const renderChart = () => {
    const { visibleCandles, maxPrice, priceRange } = chartData;
    if (!visibleCandles.length) return null;

    const width = 1000;
    const height = 430;
    const leftPad = 65;
    const rightPad = 30;
    const topPad = 28;
    const bottomPad = 42;
    const chartWidth = width - leftPad - rightPad;
    const chartHeight = height - topPad - bottomPad;
    const yForPrice = (price) =>
      topPad + ((maxPrice - price) / priceRange) * chartHeight;
    const step = chartWidth / visibleCandles.length;
    const candleWidth = Math.max(3, Math.min(12, step * 0.58));
    const lastClose = Number(
      visibleCandles[visibleCandles.length - 1]?.close || 0
    );

    const handleMouseMove = (e) => {
      const bounds = e.currentTarget.getBoundingClientRect();
      const svgY = ((e.clientY - bounds.top) / bounds.height) * height;
      const svgX = ((e.clientX - bounds.left) / bounds.width) * width;

      if (
        svgY >= topPad &&
        svgY <= height - bottomPad &&
        svgX >= leftPad &&
        svgX <= width - rightPad
      ) {
        const price = maxPrice - ((svgY - topPad) / chartHeight) * priceRange;
        const index = Math.min(
          visibleCandles.length - 1,
          Math.max(0, Math.round((svgX - leftPad - step / 2) / step))
        );
        const candle = visibleCandles[index];
        const snappedX = leftPad + index * step + step / 2;
        setHoverInfo({ x: snappedX, y: svgY, price, time: candle?.time });
        if (candle) {
          setSelectedCandle(candle);
        }
      } else {
        setHoverInfo(null);
      }
    };

    const handleMouseLeave = () => {
      setHoverInfo(null);
    };

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "430px", display: "block" }}
        aria-label={`${displayName || tradingsymbol} candlestick chart`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <rect width={width} height={height} fill="#ffffff" rx="16" />

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = topPad + ratio * chartHeight;
          const price = maxPrice - ratio * priceRange;

          return (
            <g key={ratio}>
              <line
                x1={leftPad}
                x2={width - rightPad}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="4 5"
              />
              <text
                x="8"
                y={y + 4}
                fontSize="12"
                fill="#64748b"
                fontWeight="700"
              >
                ₹{formatMoney(price)}
              </text>
            </g>
          );
        })}

        {visibleCandles.map((item, index) => {
          const open = Number(item.open);
          const high = Number(item.high);
          const low = Number(item.low);
          const close = Number(item.close);
          const isUp = close >= open;
          const x = leftPad + index * step + step / 2;
          const yOpen = yForPrice(open);
          const yClose = yForPrice(close);
          const bodyY = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(Math.abs(yClose - yOpen), 2);
          const color = isUp ? "#16a34a" : "#dc2626";

          return (
            <g key={`${item.time}-${index}`}>
              <line
                x1={x}
                x2={x}
                y1={yForPrice(high)}
                y2={yForPrice(low)}
                stroke={color}
                strokeWidth="2"
              />
              <rect
                x={x - candleWidth / 2}
                y={bodyY}
                width={candleWidth}
                height={bodyHeight}
                rx="2"
                fill={color}
                style={{ transition: "y 80ms linear, height 80ms linear" }}
              />
              <rect
                x={x - step / 2}
                y={topPad}
                width={step}
                height={chartHeight}
                fill="transparent"
                cursor="pointer"
                onMouseEnter={() => setSelectedCandle(item)}
              />
            </g>
          );
        })}

        {/* Live LTP horizontal line — updates with each WebSocket tick */}
        {liveLtp != null && (
          <>
            <line
              x1={leftPad}
              x2={width - rightPad}
              y1={yForPrice(liveLtp)}
              y2={yForPrice(liveLtp)}
              stroke={liveChange >= 0 ? "#16a34a" : "#dc2626"}
              strokeWidth="2"
              style={{ transition: "y 80ms linear, y2 80ms linear" }}
            />
            <rect
              x={width - rightPad - 85}
              y={yForPrice(liveLtp) - 10}
              width="85"
              height="20"
              rx="4"
              fill={liveChange >= 0 ? "#16a34a" : "#dc2626"}
            />
            <text
              x={width - rightPad - 80}
              y={yForPrice(liveLtp) + 4}
              fontSize="12"
              fill="white"
              fontWeight="900"
            >
              LTP ₹{formatMoney(liveLtp)}
            </text>
          </>
        )}

        {/* Previous close reference line */}
        <line
          x1={leftPad}
          x2={width - rightPad}
          y1={yForPrice(lastClose)}
          y2={yForPrice(lastClose)}
          stroke="#94a3b8"
          strokeDasharray="4 6"
          strokeWidth="1.5"
        />
        <text
          x={width - rightPad - 95}
          y={yForPrice(lastClose) - 6}
          fontSize="11"
          fill="#94a3b8"
          fontWeight="700"
        >
          PC ₹{formatMoney(lastClose)}
        </text>
        <text
          x={leftPad}
          y={height - 14}
          fontSize="12"
          fill="#64748b"
          fontWeight="700"
        >
          {visibleCandles[0]?.time}
        </text>
        <text
          x={width - rightPad - 220}
          y={height - 14}
          fontSize="12"
          fill="#64748b"
          fontWeight="700"
        >
          {visibleCandles[visibleCandles.length - 1]?.time}
        </text>
        {hoverInfo && (
          <g key="hover-guide">
            {/* Horizontal Line */}
            <line
              x1={leftPad}
              x2={width - rightPad}
              y1={hoverInfo.y}
              y2={hoverInfo.y}
              stroke="#6366f1"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
            <rect
              x="5"
              y={hoverInfo.y - 10}
              width="56"
              height="20"
              rx="4"
              fill="#6366f1"
            />
            <text
              x="8"
              y={hoverInfo.y + 4}
              fontSize="10"
              fill="#ffffff"
              fontWeight="900"
            >
              ₹{formatMoney(hoverInfo.price)}
            </text>

            {/* Vertical Line */}
            <line
              x1={hoverInfo.x}
              x2={hoverInfo.x}
              y1={topPad}
              y2={height - bottomPad}
              stroke="#6366f1"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
            {hoverInfo.time && (
              <g>
                <rect
                  x={Math.max(leftPad, Math.min(width - rightPad - 130, hoverInfo.x - 65))}
                  y={height - bottomPad + 4}
                  width="130"
                  height="20"
                  rx="4"
                  fill="#6366f1"
                />
                <text
                  x={Math.max(leftPad + 65, Math.min(width - rightPad - 65, hoverInfo.x))}
                  y={height - bottomPad + 18}
                  fontSize="10"
                  fill="#ffffff"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  {hoverInfo.time}
                </text>
              </g>
            )}
          </g>
        )}
      </svg>
    );
  };

  const isLive = wsStatus === "Live";

  return (
    <>
      {isEnlarged && (
        <div
          onClick={() => setIsEnlarged(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(4px)",
            zIndex: 99998,
          }}
        />
      )}
      <div
        style={isEnlarged ? {
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "95vw",
          maxWidth: "1200px",
          height: "auto",
          zIndex: 99999,
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          background: "#ffffff",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        } : {
          width: "100%",
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          background: "#ffffff",
          overflow: "hidden",
        }}
      >
      <div
        style={{
          padding: "18px 18px 14px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          gap: "18px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: "#0f172a" }}>
            {displayName || tradingsymbol || cleanSymbol}
          </h2>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "13px" }}>
            Live Angel One exchange ticks • forming candle updates continuously
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {RANGE_OPTIONS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setRange(item)}
              style={{
                padding: "8px 12px",
                borderRadius: "999px",
                border:
                  range.label === item.label
                    ? "2px solid #2563eb"
                    : "1px solid #d1d5db",
                background: range.label === item.label ? "#2563eb" : "white",
                color: range.label === item.label ? "white" : "#475569",
                fontWeight: "900",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => fetchCandles(true)}
            disabled={loading}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              background: loading ? "#e5e7eb" : "#f8fafc",
              color: "#475569",
              fontWeight: "900",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "12px",
            }}
          >
            {loading ? "Fetching…" : "Refresh history"}
          </button>
          <button
            type="button"
            onClick={() => setIsEnlarged(!isEnlarged)}
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              background: "#f8fafc",
              color: "#475569",
              fontWeight: "900",
              cursor: "pointer",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            title={isEnlarged ? "Collapse Chart" : "Enlarge Chart"}
          >
            {isEnlarged ? <FaCompress /> : <FaExpand />}
            {isEnlarged ? "Collapse" : "Enlarge"}
          </button>
        </div>
      </div>

      {/* Live price bar — updates with every WebSocket tick */}
      {liveLtp != null && (
        <div
          style={{
            padding: "12px 18px",
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: "10px",
            borderBottom: "1px solid #e5e7eb",
            background: liveChange >= 0 ? "#f0fdf4" : "#fef2f2",
            color: liveChange >= 0 ? "#166534" : "#991b1b",
            fontSize: "13px",
            fontWeight: "800",
          }}
        >
          <span>LIVE</span>
          <span>LTP ₹{formatMoney(liveLtp)}</span>
          <span>
            {liveChange != null
              ? `${liveChange >= 0 ? "+" : ""}₹${formatMoney(liveChange)}`
              : "-"}
          </span>
          <span>
            {liveChangePercent != null
              ? `${liveChangePercent >= 0 ? "+" : ""}${liveChangePercent.toFixed(
                  2
                )}%`
              : "-"}
          </span>
          <span>
            {liveChange >= 0 ? "▲" : "▼"} {formatMoney(Math.abs(liveChange))}
          </span>
          <span>
            {realtimeInfo || "Live"}
          </span>
        </div>
      )}

      {selectedCandle && !liveLtp && (
        <div
          style={{
            padding: "12px 18px",
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: "10px",
            borderBottom: "1px solid #e5e7eb",
            background: "#f8fafc",
            color: "#334155",
            fontSize: "13px",
            fontWeight: "800",
          }}
        >
          <span>{selectedCandle.time}</span>
          <span>O ₹{formatMoney(selectedCandle.open)}</span>
          <span>H ₹{formatMoney(selectedCandle.high)}</span>
          <span>L ₹{formatMoney(selectedCandle.low)}</span>
          <span>C ₹{formatMoney(selectedCandle.close)}</span>
          <span>
            Vol {Number(selectedCandle.volume || 0).toLocaleString("en-IN")}
          </span>
        </div>
      )}

      <div
        style={{
          padding: "8px 18px",
          background: isLive ? "#f0fdf4" : "#fffbeb",
          borderBottom: isLive ? "1px solid #bbf7d0" : "1px solid #fde68a",
          color: isLive ? "#166534" : "#92400e",
          fontWeight: "800",
          fontSize: "12px",
        }}
      >
        {isLive ? "● Live" : wsStatus}
        {realtimeInfo ? ` • ${realtimeInfo}` : ""}
      </div>

      {cacheStatus && (
        <div
          style={{
            padding: "8px 18px",
            background: "#eff6ff",
            borderBottom: "1px solid #bfdbfe",
            color: "#1d4ed8",
            fontWeight: "800",
            fontSize: "12px",
          }}
        >
          {cacheStatus}
        </div>
      )}

      <div
        style={{
          minHeight: "460px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "14px",
        }}
      >
        {loading && candles.length === 0 ? (
          <p style={{ color: "#64748b", fontWeight: "800" }}>
            Loading candles…
          </p>
        ) : chartError && candles.length === 0 ? (
          <div style={{ textAlign: "center", maxWidth: "620px", padding: "30px" }}>
            <h3 style={{ color: "#dc2626" }}>Chart data unavailable</h3>
            <p style={{ color: "#64748b", lineHeight: "1.7" }}>{chartError}</p>
            <a
              href={tradingViewUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                marginTop: "18px",
                padding: "11px 18px",
                background: "#2563eb",
                color: "#ffffff",
                borderRadius: "10px",
                textDecoration: "none",
                fontWeight: "900",
              }}
            >
              View on TradingView
            </a>
          </div>
        ) : (
          renderChart()
        )}
      </div>

      <div
        style={{
          padding: "12px 18px",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          gap: "14px",
          flexWrap: "wrap",
          color: "#64748b",
          fontSize: "12px",
          fontWeight: "700",
        }}
      >
        <span>
          {range.interval} • {candles.length} candles • Asia/Kolkata
        </span>
        <a
          href={tradingViewUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            color: "#2563eb",
            fontWeight: "900",
            textDecoration: "none",
          }}
        >
          TradingView →
        </a>
      </div>
    </div>
  </>
  );
}

export default TradingViewChart;
