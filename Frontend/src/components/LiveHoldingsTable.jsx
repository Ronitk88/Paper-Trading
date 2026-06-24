import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/api";
import { buildRealtimeUrl, getSymbolKey } from "../api/realtime";

function LiveHoldingsTable({ holdings = [], onQuote }) {
  const [livePrices, setLivePrices] = useState({});
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const onQuoteRef = useRef(onQuote);

  useEffect(() => {
    onQuoteRef.current = onQuote;
  }, [onQuote]);

  useEffect(() => {
    if (!holdings.length) return;

    let disposed = false;

    const connect = () => {
      if (disposed) return;

      const instruments = holdings
        .map((h) => `${h.exchange || "NSE"}:${h.token || h.symboltoken || ""}`)
        .filter(Boolean)
        .join(",");

      if (!instruments) return;

      const socket = new WebSocket(
        buildRealtimeUrl("market-realtime/ws/quotes", { instruments })
      );

      wsRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === "quote_batch") {
            const byKey = new Map(
              (message.quotes || []).map((q) => [
                getSymbolKey(q.exchange, q.symboltoken),
                q,
              ])
            );

            setLivePrices((prev) => {
              const next = { ...prev };

              for (const q of message.quotes || []) {
                const key = getSymbolKey(q.exchange, q.symboltoken);
                next[key] = {
                  ltp: Number(q.ltp),
                  change: Number(q.change || 0),
                  changePercent: Number(q.change_percent || 0),
                  open: Number(q.open || 0),
                  high: Number(q.high || 0),
                  low: Number(q.low || 0),
                  close: Number(q.close || 0),
                  volume: Number(q.volume || 0),
                };
              }

              return next;
            });
          }
        } catch (error) {
          console.error("Live holdings feed error:", error);
        }
      };

      socket.onclose = () => {
        if (socket === wsRef.current) wsRef.current = null;
        scheduleReconnect();
      };

      socket.onerror = () => {
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (disposed) return;

      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      reconnectAttemptRef.current = Math.min(attempt + 1, 5);
      reconnectTimerRef.current = window.setTimeout(
        connect,
        delay + Math.floor(Math.random() * 500)
      );
    };

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimerRef.current);

      if (wsRef.current) {
        const socket = wsRef.current;
        wsRef.current = null;
        socket.close(1000, "Unmounted");
      }
    };
  }, [holdings]);

  const formatMoney = (value) => {
    return Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  };

  const getLivePrice = (holding) => {
    const key = getSymbolKey(
      holding.exchange || "NSE",
      holding.token || holding.symboltoken || ""
    );
    return livePrices[key]?.ltp ?? holding.current_price;
  };

  const getLivePnl = (holding) => {
    const ltp = getLivePrice(holding);
    const avgPrice = Number(holding.avg_price || 0);
    const quantity = Number(holding.quantity || 0);
    const currentValue = ltp * quantity;
    const investedValue = avgPrice * quantity;
    return currentValue - investedValue;
  };

  if (!holdings.length) {
    return (
      <div className="empty-state" style={{ padding: "24px", textAlign: "center" }}>
        <h3 style={{ color: "#64748b" }}>No holdings to display</h3>
        <p style={{ color: "#94a3b8" }}>
          Buy stocks to see your live holdings here.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        overflow: "hidden",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid #e5e7eb",
          background: "#f8fafc",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: 0, color: "#0f172a", fontWeight: "800" }}>
          Live Holdings
        </h3>
        <span
          style={{
            fontSize: "12px",
            color: livePrices ? "#16a34a" : "#94a3b8",
            fontWeight: "700",
          }}
        >
          {Object.keys(livePrices).length > 0 ? "● Live" : "○ Connecting"}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="pro-table" style={{ width: "100%", minWidth: "600px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "12px 14px" }}>Symbol</th>
              <th style={{ textAlign: "right", padding: "12px 14px" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "12px 14px" }}>Avg Price</th>
              <th style={{ textAlign: "right", padding: "12px 14px" }}>LTP</th>
              <th style={{ textAlign: "right", padding: "12px 14px" }}>Invested</th>
              <th style={{ textAlign: "right", padding: "12px 14px" }}>Current</th>
              <th style={{ textAlign: "right", padding: "12px 14px" }}>P&amp;L</th>
            </tr>
          </thead>

          <tbody>
            {holdings.map((h) => {
              const ltp = getLivePrice(h);
              const qty = Number(h.quantity || 0);
              const avgPrice = Number(h.avg_price || 0);
              const investedValue = avgPrice * qty;
              const currentValue = ltp * qty;
              const pnl = currentValue - investedValue;

              return (
                <tr key={h.id || h.symbol}>
                  <td style={{ padding: "10px 14px", fontWeight: "800" }}>
                    {h.symbol}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    {qty}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    ₹{formatMoney(avgPrice)}
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      textAlign: "right",
                      fontWeight: "800",
                      color: "#0f172a",
                    }}
                  >
                    ₹{formatMoney(ltp)}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    ₹{formatMoney(investedValue)}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    ₹{formatMoney(currentValue)}
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      textAlign: "right",
                      fontWeight: "800",
                      color: pnl >= 0 ? "#16a34a" : "#dc2626",
                    }}
                  >
                    {pnl >= 0 ? "+" : ""}₹{formatMoney(pnl)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LiveHoldingsTable;