import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaFlask } from "react-icons/fa";
import api from "../api/api";
import { buildRealtimeUrl, getSymbolKey } from "../api/realtime";
import { resolveIndexByRoute } from "../api/indexMapping";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import TradingViewChart from "../components/TradingViewChart";
import LiveHoldingsTable from "../components/LiveHoldingsTable";
import { useConfirm } from "../components/ConfirmProvider";

function StockDetails() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const { showConfirm } = useConfirm();

  const [stock, setStock] = useState(null);
  const [ltp, setLtp] = useState(null);
  const [marketStats, setMarketStats] = useState(null);
  const [advancedStats, setAdvancedStats] = useState(null);
  const [marketStatus, setMarketStatus] = useState(null);
  const [currentHolding, setCurrentHolding] = useState(null);
  const [portfolioCash, setPortfolioCash] = useState(0);
  const [clockTime, setClockTime] = useState("");

  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState("MARKET");
  const [limitPrice, setLimitPrice] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingAdvancedStats, setLoadingAdvancedStats] = useState(false);
  const [loadingMarketStatus, setLoadingMarketStatus] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [allHoldings, setAllHoldings] = useState([]);

  const [ltpFlash, setLtpFlash] = useState("");
  const [prevLtp, setPrevLtp] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [liveLatency, setLiveLatency] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [angeloneSessionExpired, setAngeloneSessionExpired] = useState(false);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const onQuoteRef = useRef(null);

  useEffect(() => {
    setAdvancedStats(null);
    setMarketStats(null);
    setLtp(null);
    setCurrentHolding(null);
    setShowChart(false);
    setLtpFlash("");
    setPrevLtp(null);
    setWsConnected(false);
    setReconnectAttempt(0);
    setAngeloneSessionExpired(false);

    loadStock();
    loadMarketStatus();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // ── Live Ticking Market Clock ──
  useEffect(() => {
    if (!marketStatus?.current_time) return;

    const serverTimeMs = new Date(marketStatus.current_time).getTime();
    if (isNaN(serverTimeMs)) {
      setClockTime(marketStatus.current_time);
      return;
    }

    const offset = serverTimeMs - Date.now();

    const updateClock = () => {
      const d = new Date(Date.now() + offset);
      const day = String(d.getDate()).padStart(2, "0");
      const monthStr = d.toLocaleString("en-GB", { month: "short" });
      const year = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      setClockTime(`${day} ${monthStr} ${year}, ${hh}:${mm}:${ss}`);
    };

    updateClock(); // Set immediately
    const timer = setInterval(updateClock, 1000);

    return () => clearInterval(timer);
  }, [marketStatus?.current_time]);

  const formatMoney = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    return Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    return Number(value || 0).toLocaleString("en-IN");
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    return `${Number(value || 0).toFixed(2)}%`;
  };

  const getIndexFallbackStock = (value) => {
    const text = String(value || "").toUpperCase().trim();

    // Indian indexes
    if (text === "NIFTY" || text === "NIFTY 50" || text.includes("NIFTY 50")) {
      return { symbol: "NIFTY", name: "Nifty 50 Index", exchange: "NSE", token: "99926000", is_index: true };
    }
    if (text === "SENSEX" || text.includes("SENSEX")) {
      return { symbol: "SENSEX", name: "BSE Sensex Index", exchange: "BSE", token: "99919000", is_index: true };
    }
    if (text === "BANKNIFTY" || text === "BANK NIFTY" || text.includes("NIFTY BANK")) {
      return { symbol: "BANKNIFTY", name: "Nifty Bank Index", exchange: "NSE", token: "99926009", is_index: true };
    }

    // Global indexes — resolved via the TradingView symbol mapping
    const resolved = resolveIndexByRoute(text);
    if (resolved) {
      return {
        symbol: resolved.route,
        name: resolved.label,
        exchange: "TV",
        token: null,
        is_index: true,
        global: true,
        tvSymbol: resolved.tvSymbol,
      };
    }

    return null;
  };

  // ── Refs to prevent duplicate reconnects and reset spam ──
  const reconnectGenerationRef = useRef(0);
  const resetInFlightRef = useRef(false);
  const lastResetTimeRef = useRef(0);
  const wsClosedRef = useRef(false);

  // ── Persistent WebSocket with Angel One auto-reconnect ──
  // When Angel One credentials change (password/TOTP/API key), this
  // detects the failure, triggers a backend re-login, and reconnects.
  const connectLiveLtp = useCallback(async (stockData) => {
    if (!stockData || stockData.is_index) return;

    const generation = ++reconnectGenerationRef.current;
    let heartbeatTimer = null;

    const scheduleReconnect = (reason) => {
      if (reconnectGenerationRef.current !== generation) return;

      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      reconnectAttemptRef.current = Math.min(attempt + 1, 8);
      setReconnectAttempt(reconnectAttemptRef.current);

      if (reconnectAttemptRef.current >= 3 && !resetInFlightRef.current) {
        const now = Date.now();
        if (now - lastResetTimeRef.current > 30000) {
          lastResetTimeRef.current = now;
          resetInFlightRef.current = true;
          api.post("/market/reset").finally(() => {
            resetInFlightRef.current = false;
          });
        }
      }

      reconnectTimerRef.current = window.setTimeout(() => {
        if (reconnectGenerationRef.current === generation) {
          connectLiveLtp(stockData);
        }
      }, delay + Math.floor(Math.random() * 500));
    };

    wsClosedRef.current = false;

    const wsUrl = buildRealtimeUrl(
      `market-realtime/ws/ltp/${encodeURIComponent(stockData.exchange)}/${encodeURIComponent(stockData.token)}`,
      { symbol: stockData.symbol }
    );

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      if (reconnectGenerationRef.current !== generation) {
        socket.close(1000, "Stale");
        return;
      }
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      setWsConnected(true);
      setAngeloneSessionExpired(false);

      // ── Heartbeat: ping every 25s to keep connection alive ──
      heartbeatTimer = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Ignore heartbeat pong responses
        if (msg.type === "pong") return;

        if (msg.ltp !== undefined && msg.ltp !== null) {
          const newLtp = Number(msg.ltp);
          setLtp(newLtp);

          setPrevLtp((current) => {
            if (current !== null) {
              if (newLtp > current) setLtpFlash("up");
              else if (newLtp < current) setLtpFlash("down");
              else setLtpFlash("");
              setTimeout(() => setLtpFlash(""), 600);
            }
            return current;
          });

          setLimitPrice((current) => {
            if (!current && (orderType === "LIMIT" || orderType === "STOP_LOSS" || orderType === "TARGET")) {
              return String(newLtp);
            }
            return current;
          });

          setMarketStats((current) => ({
            ...(current || {}),
            ltp: newLtp,
            change: msg.change ?? current?.change ?? null,
            change_percent: msg.change_percent ?? current?.change_percent ?? null,
            source: "angel_one_websocket_live",
            exchange_timestamp: msg.exchange_timestamp,
          }));

          if (msg.latency_ms !== undefined) setLiveLatency(msg.latency_ms);
        }
      } catch (err) {
        console.error("Live LTP parse error:", err);
      }
    };

    socket.onclose = (event) => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (wsRef.current === socket) wsRef.current = null;
      setWsConnected(false);

      // NEVER stop reconnecting — always reconnect on any close
      if (!wsClosedRef.current) {
        wsClosedRef.current = true;
        if (event.code !== 1000 && event.code !== 1001) {
          setAngeloneSessionExpired(true);
        }
        scheduleReconnect("WebSocket closed — reconnecting");
      }
    };

    socket.onerror = () => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      setWsConnected(false);
      wsClosedRef.current = true;
      scheduleReconnect("WebSocket error — reconnecting");
    };
  }, [orderType]);

  // Connect when stock loads
  useEffect(() => {
    if (stock && !stock.is_index) {
      // Reset state for new connection
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      setWsConnected(false);
      setAngeloneSessionExpired(false);
      connectLiveLtp(stock);
    }
    return () => {
      // Prevent further reconnections
      reconnectGenerationRef.current += 100;
      if (wsRef.current) {
        wsRef.current.close(1000, "Unmounted");
        wsRef.current = null;
      }
      window.clearTimeout(reconnectTimerRef.current);
    };
  }, [stock]);

  // ── Receive live quotes from TradingViewChart ──
  const handleLiveQuote = useCallback((quote) => {
    if (!quote || quote.ltp === undefined || quote.ltp === null) return;

    const liveLtp = Number(quote.ltp);
    setLtp(liveLtp);

    setPrevLtp((prev) => {
      if (prev !== null) {
        if (liveLtp > prev) setLtpFlash("up");
        else if (liveLtp < prev) setLtpFlash("down");
        else setLtpFlash("");
        setTimeout(() => setLtpFlash(""), 600);
      }
      return prev;
    });

    setLimitPrice((current) => {
      if (!current && (orderType === "LIMIT" || orderType === "STOP_LOSS" || orderType === "TARGET")) return String(liveLtp);
      return current;
    });

    setMarketStats((current) => ({
      ...(current || {}),
      status: true,
      ltp: liveLtp,
      open: quote.open ?? current?.open ?? null,
      day_high: quote.high ?? current?.day_high ?? null,
      day_low: quote.low ?? current?.day_low ?? null,
      previous_close: quote.previous_close ?? current?.previous_close ?? null,
      volume: quote.volume ?? current?.volume ?? null,
      change: quote.change ?? current?.change ?? null,
      change_percent: quote.change_percent ?? current?.change_percent ?? null,
      source: quote.source || "angel_one_websocket_v2",
      exchange_timestamp: quote.exchange_timestamp,
    }));
  }, [orderType, ltp]);

  const loadMarketStatus = async () => {
    try {
      setLoadingMarketStatus(true);
      const res = await api.get("/market/status");
      setMarketStatus(res.data || null);
    } catch (err) {
      console.error("Market status load failed:", err);
      setMarketStatus(null);
    } finally {
      setLoadingMarketStatus(false);
    }
  };

  const loadStock = async () => {
    try {
      let stockData;
      const indexFallback = getIndexFallbackStock(symbol);

      if (indexFallback) {
        stockData = indexFallback;
      } else {
        try {
          const res = await api.get(`/stocks/${encodeURIComponent(symbol)}`);
          stockData = res.data;
        } catch {
          const res = await api.get("/stocks/search", {
            params: { q: symbol, limit: 10 },
          });
          if (!res.data.length) throw new Error("Stock not found");
          stockData = res.data.find(
            (item) => String(item.symbol || "").toUpperCase() === String(symbol || "").toUpperCase()
          ) || res.data[0];
        }
      }

      setStock(stockData);

      // Track recently viewed
      try {
        const recent = JSON.parse(localStorage.getItem("recent_stocks") || "[]");
        const updated = [{ symbol: stockData.symbol, name: stockData.name, exchange: stockData.exchange }, ...recent.filter((s) => s.symbol !== stockData.symbol)].slice(0, 10);
        localStorage.setItem("recent_stocks", JSON.stringify(updated));
      } catch {}

      // Fire all data loads in parallel — page renders immediately
      Promise.all([
        loadMarketStats(stockData),
        loadCurrentHolding(stockData.symbol),
        loadPortfolioCash(),
        loadAllHoldings(), // for LiveHoldingsTable
      ]).catch(console.error);

      loadAdvancedStatsInBackground(stockData);

      window.setTimeout(() => setShowChart(true), 250);
    } catch (err) {
      console.error("Stock load failed:", err);
      window.showToast?.("Unable to load stock details.");
    }
  };

  const loadCurrentHolding = async (stockSymbol) => {
    try {
      const res = await api.get(`/holdings/by-symbol/${encodeURIComponent(stockSymbol)}`);
      const holding = res.data?.holding || null;
      setCurrentHolding(holding);
    } catch (err) {
      console.error("Current holding load failed:", err);
      setCurrentHolding(null);
    }
  };

  const loadAllHoldings = async () => {
    try {
      const res = await api.get("/holdings/");
      setAllHoldings(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("All holdings load failed:", err);
      setAllHoldings([]);
    }
  };

  const loadMarketStats = async (stockData = stock) => {
    try {
      if (!stockData) return;
      setLoadingStats(true);
      const res = await api.get("/market/quote-fast", {
        params: {
          exchange: stockData.exchange,
          tradingsymbol: stockData.symbol,
          symboltoken: stockData.token,
        },
      });
      setMarketStats(res.data || null);
      if (res.data?.ltp !== undefined && res.data?.ltp !== null) setLtp(res.data.ltp);
    } catch (err) {
      console.error("Market stats load failed:", err);
      setMarketStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  // ── Load available cash ──
  const loadPortfolioCash = async () => {
    try {
      const res = await api.get("/portfolio/cash");
      setPortfolioCash(Number(res.data?.cash_balance || 0));
    } catch {
      setPortfolioCash(0);
    }
  };

  useEffect(() => {
    loadPortfolioCash();
  }, []);

  // ── Advanced stats cache ──
  const getAdvancedStatsCacheKey = (stockData) => {
    if (!stockData) return "";
    return `advanced_stats_${stockData.exchange}_${stockData.token}_${stockData.symbol}`;
  };

  const readAdvancedStatsCache = (stockData) => {
    try {
      const cacheKey = getAdvancedStatsCacheKey(stockData);
      if (!cacheKey) return false;
      const raw = sessionStorage.getItem(cacheKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed?.data) return false;
      const ageMs = Date.now() - Number(parsed.createdAt || 0);
      if (ageMs > 6 * 60 * 60 * 1000) return false;
      setAdvancedStats({ ...parsed.data, cached_frontend: true });
      return true;
    } catch {
      return false;
    }
  };

  const saveAdvancedStatsCache = (stockData, data) => {
    try {
      const cacheKey = getAdvancedStatsCacheKey(stockData);
      if (!cacheKey || !data) return;
      sessionStorage.setItem(cacheKey, JSON.stringify({ createdAt: Date.now(), data }));
    } catch {}
  };

  const loadAdvancedStatsInBackground = (stockData = stock, force = false) => {
    if (!stockData || stockData.is_index) return;
    if (!force) readAdvancedStatsCache(stockData);
    window.setTimeout(() => loadAdvancedStats(stockData, force), force ? 0 : 900);
  };

  const loadAdvancedStats = async (stockData = stock, force = false) => {
    try {
      if (!stockData || stockData.is_index) {
        setAdvancedStats(null);
        return;
      }
      if (!force && readAdvancedStatsCache(stockData)) return;
      setLoadingAdvancedStats(true);
      const res = await api.get("/market/advanced-stats", {
        params: {
          exchange: stockData.exchange,
          tradingsymbol: stockData.symbol,
          symboltoken: stockData.token,
          force,
        },
      });
      const data = res.data || null;
      setAdvancedStats(data);
      if (data?.status) saveAdvancedStatsCache(stockData, data);
    } catch (err) {
      console.error("Advanced stats load failed:", err);
      if (!readAdvancedStatsCache(stockData)) setAdvancedStats(null);
    } finally {
      setLoadingAdvancedStats(false);
    }
  };

  const refreshAll = async () => {
    if (!stock) return;
    await Promise.all([loadMarketStatus(), loadMarketStats(stock), loadCurrentHolding(stock.symbol)]);
    loadAdvancedStatsInBackground(stock, true);
  };

  // ── TradingView symbol resolution ──
  const getTradingViewSymbol = () => {
    if (!stock) return "";

    // Global indexes pass their tvSymbol directly
    if (stock.global && stock.tvSymbol) return stock.tvSymbol;

    const exchange = String(stock.exchange || "").toUpperCase() === "BSE" ? "BSE" : "NSE";
    const rawSymbol = String(stock.symbol || "").trim().toUpperCase();
    const rawName = String(stock.name || "").trim().toUpperCase();
    const combined = `${rawSymbol} ${rawName}`;

    if (rawSymbol === "SENSEX" || rawName.includes("SENSEX") || combined.includes("SENSEX")) return "BSE:SENSEX";
    if (rawSymbol === "NIFTY" || rawName === "NIFTY" || rawSymbol === "NIFTY 50" || rawName === "NIFTY 50" || combined.includes("NIFTY 50")) return "NSE:NIFTY";
    if (rawSymbol === "BANKNIFTY" || rawName === "BANKNIFTY" || rawSymbol === "NIFTY BANK" || rawName === "NIFTY BANK" || combined.includes("NIFTY BANK")) return "NSE:BANKNIFTY";
    if (rawSymbol === "FINNIFTY" || rawName === "FINNIFTY" || combined.includes("FINNIFTY")) return "NSE:FINNIFTY";

    let ticker = rawSymbol.replace("-EQ", "").replace(/&/g, "_").replace(/-/g, "_").replace(/\s+/g, "");
    return `${exchange}:${ticker}`;
  };

  const handleAddToWatchlist = async () => {
    try {
      if (!stock) { window.showToast?.("Stock data unavailable"); return; }
      await api.post("/watchlist/", { symbol: stock.symbol });
      window.showToast?.(`${stock.symbol} added to watchlist!`);
    } catch (err) {
      console.error(err);
      window.showToast?.(err?.response?.data?.detail || "Failed to add to watchlist");
    }
  };

  const getOrderPrice = () => (orderType === "MARKET" ? Number(ltp || 0) : Number(limitPrice || 0));

  const isMarketClosed = marketStatus && marketStatus.is_open === false;
  const buyOrderTypes = ["MARKET", "LIMIT"];
  const sellOrderTypes = ["MARKET", "LIMIT", "STOP_LOSS", "TARGET"];

  const getOrderTypeLabel = () => {
    if (orderType === "STOP_LOSS") return "Stop-Loss Trigger";
    if (orderType === "TARGET") return "Target Trigger";
    if (orderType === "LIMIT") return "Limit Price";
    return "Market Price";
  };

  const isExitTriggerOrder = orderType === "STOP_LOSS" || orderType === "TARGET";
  const isTradingDisabled = loading || stock?.is_index || isMarketClosed || loadingMarketStatus;

  const getDisabledReason = () => {
    if (stock?.is_index) return "Index trading is disabled. Use this page for viewing index chart and stats only.";
    if (loadingMarketStatus) return "Checking market status...";
    if (isMarketClosed) return marketStatus?.reason || "Market is closed.";
    return "";
  };

  const validateOrder = (side) => {
    if (!stock) { window.showToast?.("Stock data unavailable"); return false; }
    if (stock.is_index) { window.showToast?.("Index trading is disabled. Please trade stocks only."); return false; }
    if (marketStatus && !marketStatus.is_open) { window.showToast?.(marketStatus.reason || "Market is closed."); return false; }
    if (ltp == null) { window.showToast?.("LTP unavailable. Please refresh price."); return false; }
    if (Number(quantity) <= 0) { window.showToast?.("Quantity must be greater than 0"); return false; }
    if (side === "BUY" && !buyOrderTypes.includes(orderType)) { window.showToast?.("Stop-loss and target orders are available for SELL only."); return false; }
    if (!sellOrderTypes.includes(orderType)) { window.showToast?.("Invalid order type selected."); return false; }
    if ((orderType === "LIMIT" || isExitTriggerOrder) && Number(limitPrice) <= 0) { window.showToast?.(`${getOrderTypeLabel()} must be greater than 0`); return false; }
    if (side === "BUY" && portfolioCash > 0 && estimatedValue > portfolioCash) { window.showToast?.("Insufficient cash for this order."); return false; }
    return true;
  };

  const placeOrder = async (side) => {
    if (!validateOrder(side)) return;

    const confirmMsg = side === "SELL" && orderType !== "MARKET"
      ? `Place ${orderType} SELL order for ${quantity} ${stock.symbol} at ₹${formatMoney(limitPrice)}?`
      : `Place ${side} order for ${quantity} ${stock.symbol} at ~₹${formatMoney(getOrderPrice())}?`;

    const confirmed = await showConfirm(confirmMsg, {
      title: `Confirm ${side} Order`,
      confirmLabel: side === "SELL" ? "Sell" : "Buy",
      isDangerous: side === "SELL",
    });

    if (!confirmed) return;
    try {
      setLoading(true);
      const endpoint = side === "BUY" ? "/trade/buy" : "/trade/sell";
      const res = await api.post(endpoint, {
        symbol: stock.symbol,
        quantity: Number(quantity),
        price: getOrderPrice(),
        market_price: Number(ltp),
        order_type: orderType,
      });
      window.showToast?.(res.data.message || `${side} order placed successfully`);
      await refreshAll();
    } catch (err) {
      console.error(err);
      window.showToast?.(err?.response?.data?.detail || `${side} failed`);
    } finally {
      setLoading(false);
    }
  };

  if (!stock) {
    return (
      <div className="dashboard-layout">
        <Sidebar />
        <div className="dashboard-main">
          <Navbar />
          <div className="dashboard-content">
            <div className="table-card">
              <h2>Loading stock details...</h2>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tvSymbol = getTradingViewSymbol();
  const orderPrice = getOrderPrice();
  const estimatedValue = orderPrice > 0 ? Number(quantity || 0) * Number(orderPrice || 0) : 0;
  const statsLtp = marketStats?.ltp ?? ltp;
  const change = Number(marketStats?.change || 0);
  const changePercent = Number(marketStats?.change_percent || 0);
  const isPositive = change >= 0;
  const disabledReason = getDisabledReason();

  const getStatValue = (primaryValue, fallbackValue) => {
    if (primaryValue != null && primaryValue !== "") return primaryValue;
    if (fallbackValue != null && fallbackValue !== "") return fallbackValue;
    return null;
  };

  const statOpen = getStatValue(marketStats?.open, advancedStats?.open);
  const statPreviousClose = getStatValue(marketStats?.previous_close, advancedStats?.previous_close);
  const statDayHigh = getStatValue(marketStats?.day_high, advancedStats?.day_high);
  const statDayLow = getStatValue(marketStats?.day_low, advancedStats?.day_low);
  const statWeek52High = getStatValue(marketStats?.week_52_high, advancedStats?.week_52_high);
  const statWeek52Low = getStatValue(marketStats?.week_52_low, advancedStats?.week_52_low);
  const statVolume = getStatValue(marketStats?.volume, advancedStats?.volume);

  const statsCards = [
    { label: "Last Traded Price", value: statsLtp != null ? `₹${formatMoney(statsLtp)}` : "Unavailable", positive: true },
    {
      label: "Change",
      value: marketStats?.change !== undefined && marketStats?.change !== null ? `₹${formatMoney(change)}` : "-",
      positive: isPositive,
      negative: !isPositive,
    },
    {
      label: "Change %",
      value: marketStats?.change_percent !== undefined && marketStats?.change_percent !== null ? formatPercent(changePercent) : "-",
      positive: isPositive,
      negative: !isPositive,
    },
    { label: "Volume", value: statVolume != null ? formatNumber(statVolume) : "-" },
  ];

  const detailedStats = [
    { label: "Open", value: statOpen != null ? `₹${formatMoney(statOpen)}` : "-" },
    { label: "Previous Close", value: statPreviousClose != null ? `₹${formatMoney(statPreviousClose)}` : "-" },
    { label: "Day High", value: statDayHigh != null ? `₹${formatMoney(statDayHigh)}` : "-" },
    { label: "Day Low", value: statDayLow != null ? `₹${formatMoney(statDayLow)}` : "-" },
    {
      label: "52 Week High",
      value: loadingAdvancedStats ? "Loading..." : statWeek52High ? `₹${formatMoney(statWeek52High)}` : "-",
    },
    {
      label: "52 Week Low",
      value: loadingAdvancedStats ? "Loading..." : statWeek52Low ? `₹${formatMoney(statWeek52Low)}` : "-",
    },
    {
      label: "PE Ratio",
      value: marketStats?.pe_ratio !== undefined && marketStats?.pe_ratio !== null && marketStats?.pe_available
        ? Number(marketStats.pe_ratio).toFixed(2)
        : "Not available",
    },
    { label: "Angel One Token", value: stock.token || "-" },
  ];

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="dashboard-main">
        <Navbar />
        <div className="dashboard-content">

          {/* ═══════ HERO SECTION ═══════ */}
          <div className="welcome-section stock-details-hero">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <p className="pro-eyebrow">Stock Command Center</p>
                <h1 style={{ color: "#ffffff", textShadow: "0 2px 10px rgba(0,0,0,0.2)", fontWeight: "900", letterSpacing: "-0.5px" }}>
                  {stock.name || stock.symbol}{" "}
                  <span style={{ color: "#93c5fd", fontSize: "22px", textShadow: "0 1px 6px rgba(0,0,0,0.15)" }}>({stock.symbol})</span>
                </h1>
                <p style={{ color: "#dbeafe", textShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                  Live-style quote, market statistics, chart, holdings, and paper order execution.
                </p>

                {/* Live LTP Ticker — auto-updates from Angel One */}
                {ltp != null && (
                  <div
                    style={{
                      marginTop: "14px",
                      padding: "12px 16px",
                      borderRadius: "14px",
                      background: ltpFlash === "up" ? "rgba(22,163,74,0.22)" : ltpFlash === "down" ? "rgba(220,38,38,0.22)" : "rgba(0,0,0,0.25)",
                      border: `1px solid ${ltpFlash === "up" ? "rgba(74,222,128,0.35)" : ltpFlash === "down" ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.12)"}`,
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      flexWrap: "wrap",
                      transition: "all 0.2s ease",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: wsConnected ? "#22c55e" : angeloneSessionExpired ? "#ef4444" : "#f59e0b",
                          boxShadow: wsConnected ? "0 0 8px rgba(34,197,94,0.6)" : "none",
                        }}
                      />
                      <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: "700" }}>
                        {wsConnected ? "Live" : angeloneSessionExpired ? "Reconnecting..." : "Connecting"}
                      </span>
                    </div>

                    <strong
                      style={{
                        color: "#ffffff",
                        fontSize: "28px",
                        fontWeight: "900",
                        letterSpacing: "-0.5px",
                        textShadow: "0 1px 4px rgba(0,0,0,0.15)",
                      }}
                    >
                      ₹{formatMoney(ltp)}
                    </strong>

                    <span style={{ color: change >= 0 ? "#4ade80" : "#f87171", fontWeight: "800", fontSize: "14px", textShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                      {change >= 0 ? "+" : ""}₹{formatMoney(Math.abs(change))}
                    </span>

                    <span style={{ color: changePercent >= 0 ? "#4ade80" : "#f87171", fontWeight: "800", fontSize: "14px", textShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                      {changePercent >= 0 ? "+" : ""}{formatPercent(Math.abs(changePercent))}
                    </span>

                    {reconnectAttempt > 0 && (
                      <span style={{ color: "#fbbf24", fontWeight: "800", fontSize: "12px", textShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                        Reconnect #{reconnectAttempt}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
                  <span className="status-pill status-success">{stock.exchange}</span>
                  <span className="status-pill status-warning">{stock.is_index ? "Index" : "Equity"}</span>
                  <span className="status-pill status-success">{loadingStats ? "Stats Loading" : "Stats Active"}</span>
                  <span className="status-pill status-warning">
                    {loadingAdvancedStats ? "52W Loading" : advancedStats?.cached_frontend ? "52W Cached" : advancedStats?.status ? "52W Ready" : "52W Pending"}
                  </span>
                  <span className={marketStatus?.is_open ? "status-pill status-success" : "status-pill status-danger"}>
                    {loadingMarketStatus ? "Checking" : marketStatus?.status || "Market Status"}
                  </span>
                </div>

                {(clockTime || marketStatus?.current_time) && (
                  <p style={{ color: "#bfdbfe", marginTop: "10px", fontWeight: "700" }}>
                    Market clock: {clockTime || marketStatus.current_time}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button className="primary-action" onClick={() => navigate("/stocks")}>Back to Stocks</button>
                <button className="primary-action" onClick={refreshAll} disabled={loadingStats || loadingMarketStatus}>
                  {loadingStats || loadingMarketStatus ? "Refreshing..." : "Refresh Data"}
                </button>
                <button className="warning-action" onClick={loadMarketStatus} disabled={loadingMarketStatus}>
                  {loadingMarketStatus ? "Checking..." : "Market Status"}
                </button>
              </div>
            </div>
          </div>

          {/* ═══════ KPI CARDS ═══════ */}
          <div className="pro-kpi-grid">
            {loadingStats ? (
              <>
                <div className="pro-kpi-card skeleton-pulse"><p>&nbsp;</p><h2>₹--.--</h2><span className="pro-muted">&nbsp;</span></div>
                <div className="pro-kpi-card skeleton-pulse"><p>&nbsp;</p><h2>₹--.--</h2><span className="pro-muted">&nbsp;</span></div>
                <div className="pro-kpi-card skeleton-pulse"><p>&nbsp;</p><h2>₹--.--</h2><span className="pro-muted">&nbsp;</span></div>
                <div className="pro-kpi-card skeleton-pulse"><p>&nbsp;</p><h2>₹--.--</h2><span className="pro-muted">&nbsp;</span></div>
              </>
            ) : (
              statsCards.map((item) => (
                <div className="pro-kpi-card" key={item.label}>
                  <p>{item.label}</p>
                  <h2 className={item.positive ? "pro-positive" : item.negative ? "pro-negative" : ""}>
                    {item.value}
                  </h2>
                  <span className="pro-muted">Market stats</span>
                </div>
              ))
            )}
          </div>

          {/* ═══════ CHART + ORDER PANEL ═══════ */}
          <div className="pro-dashboard-grid">
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Price Chart</h2>
                  <p>In-app historical OHLC candle chart using Angel One candle data.</p>
                </div>
              </div>

              {showChart ? (
                <TradingViewChart
                  key={`${stock.exchange}-${stock.token}-${tvSymbol}`}
                  symbol={tvSymbol}
                  exchange={stock.exchange}
                  tradingsymbol={stock.symbol}
                  symboltoken={stock.token}
                  displayName={stock.name || stock.symbol}
                  onQuote={handleLiveQuote}
                />
              ) : (
                <div style={{ minHeight: "460px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #e5e7eb", borderRadius: "16px", background: "#ffffff", color: "#64748b", fontWeight: "900" }}>
                  Preparing fast chart...
                </div>
              )}
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Place Order</h2>
                  <p>Choose market or limit simulated execution. LTP updates automatically from live feed.</p>
                </div>
              </div>

              {/* Live LTP Status */}
              {ltp != null && (
                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1px solid #bbf7d0",
                    borderRadius: "14px",
                    padding: "14px",
                    marginBottom: "18px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong style={{ color: "#166534" }}>Current LTP</strong>
                    <p style={{ margin: "4px 0 0", color: "#166534", fontWeight: "800", fontSize: "18px" }}>
                      ₹{formatMoney(ltp)}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ color: "#166534" }}>Live Feed</strong>
                    <p style={{ margin: "4px 0 0", color: "#166534", fontSize: "13px", fontWeight: "700" }}>
                      {wsConnected ? "● Connected" : angeloneSessionExpired ? "○ Reconnecting" : "○ Connecting"}
                    </p>
                  </div>
                </div>
              )}

              {/* Market Status */}
              {marketStatus && (
                <div
                  style={{
                    background: marketStatus.is_open ? "#ecfdf5" : "#fef2f2",
                    border: marketStatus.is_open ? "1px solid #bbf7d0" : "1px solid #fecaca",
                    borderRadius: "14px",
                    padding: "14px",
                    marginBottom: "18px",
                  }}
                >
                  <strong style={{ color: marketStatus.is_open ? "#166534" : "#991b1b" }}>
                    {marketStatus.is_open ? "Market Open" : "Market Closed"}
                  </strong>
                  <p style={{ margin: "6px 0 0", color: marketStatus.is_open ? "#166534" : "#991b1b", fontWeight: "700", lineHeight: "1.6" }}>
                    {marketStatus.reason}
                  </p>
                </div>
              )}

              {/* Current Holding */}
              {currentHolding ? (
                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1px solid #bbf7d0",
                    borderRadius: "14px",
                    padding: "14px",
                    marginBottom: "18px",
                  }}
                >
                  <strong style={{ color: "#166534" }}>Current Holding</strong>
                  <div className="info-row">
                    <span className="info-label">Quantity</span>
                    <span className="info-value">{currentHolding.quantity}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Average Price</span>
                    <span className="info-value">₹{formatMoney(currentHolding.avg_price)}</span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: "14px",
                    padding: "14px",
                    marginBottom: "18px",
                    color: "#64748b",
                    fontWeight: "700",
                  }}
                >
                  No current holding for this stock.
                </div>
              )}

              {/* Order Type */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{ ...labelStyle, color: "#0f172a" }}>Order Type</label>
                <select
                  value={orderType}
                  onChange={(e) => {
                    const selectedType = e.target.value;
                    setOrderType(selectedType);

                    // Auto-fill limit price with current LTP when switching
                    if ((selectedType === "LIMIT" || selectedType === "STOP_LOSS" || selectedType === "TARGET") && ltp && !limitPrice) {
                      setLimitPrice(String(ltp));
                    } else if (selectedType === "MARKET") {
                      setLimitPrice("");
                    }
                  }}
                  style={inputStyle}
                  disabled={stock.is_index || isMarketClosed}
                >
                  <option value="MARKET">MARKET</option>
                  <option value="LIMIT">LIMIT</option>
                  <option value="STOP_LOSS">STOP LOSS</option>
                  <option value="TARGET">TARGET</option>
                </select>
                <p style={{ margin: "-8px 0 0", color: "#64748b", fontSize: "13px", fontWeight: "700", lineHeight: "1.6" }}>
                  Stop-loss and target are SELL exit orders. Buy supports MARKET and LIMIT only.
                </p>
              </div>

              {/* Quantity */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{ ...labelStyle, color: "#0f172a" }}>Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  style={inputStyle}
                  disabled={stock.is_index || isMarketClosed}
                />
                <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                  {[1, 5, 10, 25, 50, 100].map((qty) => (
                    <button
                      key={qty}
                      onClick={() => setQuantity(qty)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "8px",
                        border: Number(quantity) === qty ? "2px solid #2563eb" : "1px solid #d1d5db",
                        background: Number(quantity) === qty ? "#eff6ff" : "white",
                        color: Number(quantity) === qty ? "#2563eb" : "#475569",
                        fontWeight: "800",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      {qty}
                    </button>
                  ))}
                </div>
              </div>

              {/* Limit Price — auto-fills with LTP */}
              {(orderType === "LIMIT" || isExitTriggerOrder) && (
                <div style={{ marginBottom: "18px" }}>
                  <label style={{ ...labelStyle, color: "#0f172a" }}>{getOrderTypeLabel()}</label>
                  <input
                    type="number"
                    min="1"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    style={inputStyle}
                    disabled={stock.is_index || isMarketClosed}
                    placeholder={`Auto-filled: ₹${formatMoney(ltp)}`}
                  />
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px", fontWeight: "700" }}>
                    Current LTP: ₹{formatMoney(ltp || 0)}
                  </p>
                </div>
              )}

              {/* Order Summary */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e5e7eb",
                  borderRadius: "16px",
                  padding: "16px",
                  marginBottom: "20px",
                  lineHeight: "1.9",
                }}
              >
                <div className="info-row">
                  <span className="info-label">Order Type</span>
                  <span className="info-value">{orderType}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Quantity</span>
                  <span className="info-value">{quantity}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">LTP</span>
                  <span className="info-value">{ltp != null ? `₹${formatMoney(ltp)}` : "-"}</span>
                </div>
                {(orderType === "LIMIT" || isExitTriggerOrder) && (
                  <div className="info-row">
                    <span className="info-label">{getOrderTypeLabel()}</span>
                    <span className="info-value">₹{formatMoney(limitPrice)}</span>
                  </div>
                )}
                <div className="info-row">
                  <span className="info-label">Estimated Value</span>
                  <span className="info-value">₹{formatMoney(estimatedValue)}</span>
                </div>
              </div>

              {/* ═══════ RISK MANAGEMENT ═══════ */}
              {ltp != null && Number(quantity) > 0 && !stock?.is_index && (
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "16px",
                    padding: "16px",
                    marginBottom: "20px",
                  }}
                >
                  <strong style={{ color: "#166534" }}>Risk Management</strong>
                  <div className="info-row">
                    <span className="info-label">Entry Value</span>
                    <span className="info-value">₹{formatMoney(estimatedValue)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Suggested Stop-Loss (2%)</span>
                    <span className="info-value">₹{formatMoney(Number(ltp) * 0.98)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Suggested Target (5%)</span>
                    <span className="info-value">₹{formatMoney(Number(ltp) * 1.05)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Max Loss (2%)</span>
                    <span className="info-value pro-negative">₹{formatMoney(estimatedValue * 0.02)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Max Profit (5%)</span>
                    <span className="info-value pro-positive">₹{formatMoney(estimatedValue * 0.05)}</span>
                  </div>
                  {portfolioCash > 0 && (
                    <div className="info-row">
                      <span className="info-label">Available Cash</span>
                      <span className="info-value">₹{formatMoney(portfolioCash)}</span>
                    </div>
                  )}
                  {estimatedValue > portfolioCash && portfolioCash > 0 && (
                    <div
                      style={{
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        color: "#dc2626",
                        borderRadius: "10px",
                        padding: "10px",
                        marginTop: "10px",
                        fontWeight: "800",
                        fontSize: "13px",
                      }}
                    >
                      Insufficient cash! Required: ₹{formatMoney(estimatedValue)}, Available: ₹{formatMoney(portfolioCash)}
                    </div>
                  )}
                </div>
              )}

              {disabledReason && (
                <div
                  style={{
                    background: isMarketClosed ? "#fef2f2" : "#fff7ed",
                    border: isMarketClosed ? "1px solid #fecaca" : "1px solid #fed7aa",
                    color: isMarketClosed ? "#991b1b" : "#9a3412",
                    borderRadius: "14px",
                    padding: "14px",
                    marginBottom: "16px",
                    fontWeight: "800",
                    lineHeight: "1.6",
                  }}
                >
                  {disabledReason}
                </div>
              )}

              {isExitTriggerOrder && !disabledReason && (
                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#1d4ed8",
                    borderRadius: "14px",
                    padding: "14px",
                    marginBottom: "16px",
                    fontWeight: "800",
                    lineHeight: "1.6",
                  }}
                >
                  {orderType === "STOP_LOSS"
                    ? "Stop-loss will remain pending and sell when LTP is less than or equal to your trigger price."
                    : "Target will remain pending and sell when LTP is greater than or equal to your target price."}
                </div>
              )}

              {/* Buy/Sell Buttons */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <button
                  className="buy-btn"
                  disabled={isTradingDisabled || isExitTriggerOrder}
                  onClick={() => placeOrder("BUY")}
                  style={{
                    width: "100%",
                    opacity: isTradingDisabled || isExitTriggerOrder ? 0.55 : 1,
                    cursor: isTradingDisabled || isExitTriggerOrder ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Processing..." : isMarketClosed ? "Market Closed" : isExitTriggerOrder ? "Sell Only" : "Buy"}
                </button>
                <button
                  disabled={isTradingDisabled}
                  onClick={() => placeOrder("SELL")}
                  style={{
                    width: "100%",
                    border: "none",
                    borderRadius: "10px",
                    padding: "11px 16px",
                    fontWeight: "800",
                    cursor: isTradingDisabled ? "not-allowed" : "pointer",
                    background: "#dc2626",
                    color: "white",
                    opacity: isTradingDisabled ? 0.55 : 1,
                  }}
                >
                  {loading ? "Processing..." : isMarketClosed ? "Market Closed" : orderType === "STOP_LOSS" ? "Place Stop-Loss" : orderType === "TARGET" ? "Place Target" : "Sell"}
                </button>
              </div>

              <button className="watch-btn" disabled={loading} onClick={handleAddToWatchlist} style={{ width: "100%" }}>
                + Add to Watchlist
              </button>
            </div>
          </div>

          {/* ═══════ MARKET STATISTICS ═══════ */}
          <div className="pro-dashboard-grid large-left">
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Market Statistics</h2>
                  <p>Professional stock stats fetched from the backend market stats endpoint.</p>
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-action" onClick={() => loadMarketStats(stock)} disabled={loadingStats}>
                    {loadingStats ? "Loading..." : "Refresh Stats"}
                  </button>
                  <button className="warning-action" onClick={() => loadAdvancedStats(stock, true)} disabled={loadingAdvancedStats}>
                    {loadingAdvancedStats ? "Loading 52W..." : "Refresh 52W"}
                  </button>
                </div>
              </div>

              <div className="dashboard-cards">
                {detailedStats.map((item) => (
                  <div className="stat-card" key={item.label}>
                    <h4>{item.label}</h4>
                    <h2>{item.value}</h2>
                  </div>
                ))}
              </div>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Instrument Information</h2>
                  <p>Backend stock master details used for trading.</p>
                </div>
              </div>

              <div className="info-row">
                <span className="info-label">Display Symbol</span>
                <span className="info-value">{stock.symbol}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Company / Instrument Name</span>
                <span className="info-value">{stock.name}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Exchange</span>
                <span className="status-pill status-success">{stock.exchange}</span>
              </div>
              <div className="info-row">
                <span className="info-label">TradingView Symbol</span>
                <span className="info-value">{tvSymbol}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Market Status</span>
                <span className={marketStatus?.is_open ? "status-pill status-success" : "status-pill status-danger"}>
                  {marketStatus?.status || "Unknown"}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Data Status</span>
                <span className="status-pill status-success">
                  {marketStats?.status && advancedStats?.status
                    ? "Full Stats Loaded"
                    : marketStats?.status
                    ? "Fast Stats Loaded"
                    : "Basic Loaded"}
                </span>
              </div>

              <button
                className="warning-action"
                style={{ width: "100%", marginTop: "16px" }}
                onClick={() => navigate(`/strategy-backtesting?symbol=${encodeURIComponent(stock.symbol)}&exchange=${encodeURIComponent(stock.exchange)}&token=${encodeURIComponent(stock.token)}&name=${encodeURIComponent(stock.name || stock.symbol)}`)}
              >
                <FaFlask style={{ marginRight: "8px" }} />
                Run Backtest
              </button>
            </div>
          </div>

          {/* ═══════ LIVE HOLDINGS TABLE ═══════ */}
          {allHoldings.length > 0 && (
            <div className="pro-panel" style={{ marginTop: "24px" }}>
              <LiveHoldingsTable holdings={allHoldings} onQuote={handleLiveQuote} />
            </div>
          )}

          <div className="footer-note">
            This is a paper trading platform. Market statistics are used for learning and analysis. All trades are simulated and no real money is involved. Trading actions are disabled outside official market hours.
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
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "15px",
  background: "white",
};

export default StockDetails;