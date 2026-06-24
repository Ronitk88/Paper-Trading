import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaBan,
  FaCheckCircle,
  FaChevronLeft,
  FaChevronRight,
  FaClock,
  FaExclamationTriangle,
  FaFilter,
  FaListAlt,
  FaSearch,
  FaSyncAlt,
  FaTimesCircle,
} from "react-icons/fa";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import api from "../api/api";
import SkeletonLoader from "../components/SkeletonLoader";
import { useConfirm } from "../components/ConfirmProvider";

function Orders() {
  const navigate = useNavigate();
  const { showConfirm } = useConfirm();

  const [orders, setOrders] = useState([]);

  const [summary, setSummary] = useState({
    total_orders: 0,
    executed_orders: 0,
    pending_orders: 0,
    cancelled_orders: 0,
    rejected_orders: 0,
  });

  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const [processingPending, setProcessingPending] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [marketPrices, setMarketPrices] = useState({});

  const [statusFilter, setStatusFilter] = useState("ALL");
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
    loadOrders(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const loadOrders = async (pageNumber = page) => {
    try {
      setLoading(true);

      const [ordersRes, summaryRes] = await Promise.all([
        api.get("/orders/paginated", {
          params: {
            page: pageNumber,
            limit,
          },
        }),
        api.get("/orders/summary"),
      ]);

      setOrders(ordersRes.data.items || []);

      setPagination({
        total: ordersRes.data.total || 0,
        total_pages: ordersRes.data.total_pages || 1,
      });

      setSummary(summaryRes.data || {});
    } catch (err) {
      console.error("Orders load failed:", err);
      window.showToast?.("Unable to load orders.");
    } finally {
      setLoading(false);
    }
  };

  const processPendingOrders = async () => {
    try {
      setProcessingPending(true);

      const res = await api.post("/orders/process-pending");

      window.showToast?.(
        `Pending orders processed. Checked: ${res.data.checked}, Executed: ${res.data.executed}, Rejected: ${res.data.rejected}, Still Pending: ${res.data.still_pending}`
      );

      await loadOrders(page);
    } catch (err) {
      console.error("Process pending orders failed:", err);
      window.showToast?.(err?.response?.data?.detail || "Unable to process pending orders.");
    } finally {
      setProcessingPending(false);
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

  // Separate price polling — stays alive independent of orders changing
  useEffect(() => {
    if (orders.length > 0) {
      symbolsRef.current = [...new Set(orders.map((o) => o.symbol))];
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
  }, [orders]);

  const cancelOrder = async (order) => {
    if (order.status !== "PENDING") {
      window.showToast?.("Only pending orders can be cancelled.");
      return;
    }

    const confirmed = await showConfirm(
      `Cancel pending order #${order.id} for ${order.symbol}?`,
      { title: "Cancel Order", confirmLabel: "Cancel Order", isDangerous: true }
    );

    if (!confirmed) return;

    try {
      setCancellingId(order.id);

      await api.post(`/orders/${order.id}/cancel`);

      window.showToast?.("Order cancelled successfully!");

      await loadOrders(page);
    } catch (err) {
      console.error("Cancel order failed:", err);
      window.showToast?.(err?.response?.data?.detail || "Unable to cancel order.");
    } finally {
      setCancellingId(null);
    }
  };

  const formatMoney = (value) => {
    return Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
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

  const getStatusClass = (status) => {
    if (status === "EXECUTED") return "status-pill status-success";
    if (status === "PENDING") return "status-pill status-warning";
    if (status === "CANCELLED") return "status-pill";
    return "status-pill status-danger";
  };

  const getSideClass = (side) => {
    return side === "BUY"
      ? "status-pill status-success"
      : "status-pill status-danger";
  };

  const getOrderValue = (order) => {
    return Number(order.quantity || 0) * Number(order.price || 0);
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

  const openStock = (symbol) => {
    if (!symbol) return;
    navigate(`/stocks/${encodeURIComponent(symbol)}`);
  };

  const toggleTimeline = (orderId) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  const orderTimeline = (order) => {
    const steps = [
      { label: "Placed", time: order.created_at, done: true },
      { label: "Pending", time: order.created_at, done: order.status === "PENDING" || order.status === "EXECUTED" || order.status === "REJECTED" || order.status === "CANCELLED", active: order.status === "PENDING" },
    ];

    if (order.status === "EXECUTED") {
      steps.push({ label: "Executed", time: order.executed_at || order.updated_at, done: true, active: false });
    } else if (order.status === "REJECTED") {
      steps.push({ label: "Rejected", time: order.updated_at, done: true, error: true, reason: order.rejection_reason });
    } else if (order.status === "CANCELLED") {
      steps.push({ label: "Cancelled", time: order.updated_at, done: true, error: true });
    }

    return (
      <div style={{ display: "flex", gap: "0", padding: "16px 0", alignItems: "flex-start" }}>
        {steps.map((step, idx) => (
          <div key={step.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", minWidth: "80px" }}>
            {idx < steps.length - 1 && (
              <div style={{ position: "absolute", top: "12px", left: "calc(50% + 14px)", right: "calc(-50% + 14px)", height: "2px", background: step.done ? (step.error ? "#dc2626" : "#16a34a") : "#e5e7eb", zIndex: 0 }} />
            )}
            <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: step.done ? (step.error ? "#dc2626" : step.active ? "#f97316" : "#16a34a") : "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "12px", fontWeight: "900", zIndex: 1 }}>
              {step.error ? "✕" : step.done ? "✓" : "○"}
            </div>
            <div style={{ textAlign: "center", marginTop: "8px" }}>
              <strong style={{ fontSize: "12px", color: step.done ? (step.error ? "#dc2626" : "#16a34a") : "#94a3b8" }}>{step.label}</strong>
              {step.time && <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#64748b", fontWeight: "700" }}>{formatDate(step.time)}</p>}
              {step.reason && <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#dc2626", fontWeight: "700", maxWidth: "120px" }}>{step.reason}</p>}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
  };

  const filteredOrders = useMemo(() => {
    const cleanSearch = search.trim().toUpperCase();

    return orders.filter((order) => {
      const matchesStatus =
        statusFilter === "ALL" || order.status === statusFilter;

      const matchesSearch =
        !cleanSearch ||
        String(order.symbol || "").toUpperCase().includes(cleanSearch) ||
        String(order.id || "").includes(cleanSearch);

      return matchesStatus && matchesSearch;
    });
  }, [orders, statusFilter, search]);

  const totalPageOrderValue = orders.reduce((sum, order) => {
    return sum + getOrderValue(order);
  }, 0);

  const statusTabs = [
    {
      label: "All",
      value: "ALL",
      count: summary.total_orders || 0,
      icon: <FaListAlt />,
    },
    {
      label: "Executed",
      value: "EXECUTED",
      count: summary.executed_orders || 0,
      icon: <FaCheckCircle />,
    },
    {
      label: "Pending",
      value: "PENDING",
      count: summary.pending_orders || 0,
      icon: <FaClock />,
    },
    {
      label: "Cancelled",
      value: "CANCELLED",
      count: summary.cancelled_orders || 0,
      icon: <FaBan />,
    },
    {
      label: "Rejected",
      value: "REJECTED",
      count: summary.rejected_orders || 0,
      icon: <FaTimesCircle />,
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
              <p className="pro-eyebrow">Execution Control Center</p>

              <h1>
                Orders <span>Book</span>
              </h1>

              <p>
                Track market orders, limit orders, pending orders, cancelled
                orders, rejected trades, and simulated execution quality from
                one professional order dashboard.
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
                  {summary.executed_orders || 0} Executed
                </span>

                <span className="status-pill status-warning">
                  {summary.pending_orders || 0} Pending
                </span>

                <span className="status-pill status-danger">
                  {summary.rejected_orders || 0} Rejected
                </span>
              </div>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span className="status-pill status-success">
                  Paper Execution
                </span>
                <p>Orders are simulated</p>
              </div>

              <button
                className="primary-action"
                onClick={processPendingOrders}
                disabled={processingPending}
              >
                <FaSyncAlt style={{ marginRight: "8px" }} />
                {processingPending ? "Processing..." : "Process Pending"}
              </button>

              <button
                className="primary-action"
                onClick={() => loadOrders(page)}
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="dashboard-cards">
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className="stat-card"
                onClick={() => setStatusFilter(tab.value)}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  border:
                    statusFilter === tab.value
                      ? "2px solid #2563eb"
                      : "1px solid #e5e7eb",
                }}
              >
                <h4
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </h4>

                <h2
                  className={
                    tab.value === "EXECUTED"
                      ? "pro-positive"
                      : tab.value === "REJECTED"
                      ? "pro-negative"
                      : ""
                  }
                >
                  {tab.count}
                </h2>
              </button>
            ))}
          </div>

          <div className="pro-dashboard-grid" style={{ marginTop: "24px" }}>
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Order Quality Snapshot</h2>
                  <p>Quick view of execution quality and current page value.</p>
                </div>
              </div>

              <div className="activity-grid">
                <div>
                  <p>Total Orders</p>
                  <h3>{summary.total_orders || 0}</h3>
                </div>

                <div>
                  <p>Executed</p>
                  <h3 className="pro-positive">
                    {summary.executed_orders || 0}
                  </h3>
                </div>

                <div>
                  <p>Rejected</p>
                  <h3 className="pro-negative">
                    {summary.rejected_orders || 0}
                  </h3>
                </div>

                <div>
                  <p>Current Page Value</p>
                  <h3>₹{formatMoney(totalPageOrderValue)}</h3>
                </div>
              </div>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Filters</h2>
                  <p>Search current page by symbol or order ID.</p>
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
                  placeholder="Search order ID or symbol..."
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

                <span className="status-pill status-success">
                  {statusFilter}
                </span>
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
                <h2>Order Book</h2>

                <p style={{ color: "#64748b", margin: 0 }}>
                  Showing page {page} of {pagination.total_pages} · Total
                  records: {pagination.total}
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
            ) : filteredOrders.length === 0 ? (
              <div className="empty-state">
                <h3>No orders found</h3>
                <p>
                  Place buy/sell orders or clear filters to view more order
                  records.
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
                    <th style={{ width: "32px" }}></th>
                    <th>Order ID</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Qty × Price</th>
                    <th>Value</th>
                    <th>Cur. Value</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOrders.map((order) => {
                    const orderValue = getOrderValue(order);
                    const isExpanded = expandedOrderId === order.id;
                    const livePrice = marketPrices[order.symbol]?.ltp;
                    const curValue = livePrice ? livePrice * order.quantity : null;
                    const pnl = curValue ? curValue - orderValue : null;

                    return (
                      <React.Fragment key={order.id}>
                        <tr
                          onClick={() => toggleTimeline(order.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <td style={{ textAlign: "center" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "22px",
                                height: "22px",
                                borderRadius: "6px",
                                background: isExpanded ? "#eff6ff" : "transparent",
                                color: isExpanded ? "#2563eb" : "#94a3b8",
                                fontSize: "11px",
                                fontWeight: "900",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {isExpanded ? "▼" : "▶"}
                            </span>
                          </td>

                          <td>
                            <strong>#{order.id}</strong>
                          </td>

                          <td>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openStock(order.symbol); }}
                              style={{
                                border: "none",
                                background: "transparent",
                                padding: 0,
                                color: "#2563eb",
                                fontWeight: "900",
                                cursor: "pointer",
                              }}
                            >
                              {order.symbol}
                            </button>
                          </td>

                          <td>
                            <span className={getSideClass(order.side)}>
                              {order.side}
                            </span>
                          </td>

                          <td style={{ whiteSpace: "nowrap" }}>
                            <strong>{order.quantity}</strong>
                            <span style={{ color: "#94a3b8", margin: "0 4px" }}>×</span>
                            <span>₹{formatMoney(order.price)}</span>
                            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "700" }}>
                              {order.order_type}
                            </div>
                          </td>

                          <td>₹{formatMoney(orderValue)}</td>

                          <td>
                            {livePrice ? (
                              <span>
                                <span>₹{formatMoney(curValue)}</span>
                                {pnl != null && pnl !== 0 && (
                                  <span
                                    style={{
                                      display: "block",
                                      fontSize: "11px",
                                      fontWeight: "800",
                                      color: pnl >= 0 ? "#16a34a" : "#dc2626",
                                    }}
                                  >
                                    {pnl >= 0 ? "+" : ""}₹{formatMoney(pnl)}
                                    <span style={{ color: "#94a3b8", fontWeight: "700", marginLeft: "4px" }}>
                                      @ ₹{formatMoney(livePrice)}
                                    </span>
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: "#94a3b8", fontWeight: "700" }}>—</span>
                            )}
                          </td>

                          <td>
                            <span className={getStatusClass(order.status)}>
                              {order.status}
                            </span>
                          </td>

                          <td style={{ color: "#6b7280", fontWeight: "700", fontSize: "13px", whiteSpace: "nowrap" }}>
                            {formatDate(order.created_at)}
                          </td>

                          <td>
                            {order.status === "PENDING" ? (
                              <button
                                className="danger-action"
                                onClick={(e) => { e.stopPropagation(); cancelOrder(order); }}
                                disabled={cancellingId === order.id}
                                style={{
                                  padding: "6px 14px",
                                  fontSize: "12px",
                                  opacity: cancellingId === order.id ? 0.6 : 1,
                                  cursor: cancellingId === order.id ? "not-allowed" : "pointer",
                                }}
                              >
                                {cancellingId === order.id ? "..." : "Cancel"}
                              </button>
                            ) : (
                              <span style={{ color: "#94a3b8", fontWeight: "900" }}>—</span>
                            )}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan="10" style={{ padding: "0 16px", background: "#f8fafc" }}>
                              {orderTimeline(order)}
                              {order.rejection_reason && (
                                <div
                                  style={{
                                    padding: "10px 16px 16px",
                                    color: "#dc2626",
                                    fontSize: "13px",
                                    fontWeight: "800",
                                    lineHeight: "1.6",
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: "8px",
                                  }}
                                >
                                  <FaExclamationTriangle style={{ marginTop: "2px", flexShrink: 0 }} />
                                  <span>{order.rejection_reason}</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}

            <div className="footer-note">
              Pending limit orders can be processed manually from this page.
              Rejected orders show the reason directly in the order book. All
              orders are simulated paper trades.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Orders;