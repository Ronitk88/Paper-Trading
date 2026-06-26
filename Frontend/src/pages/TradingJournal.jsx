import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import api from "../api/api";
import SkeletonLoader from "../components/SkeletonLoader";
import { useConfirm } from "../components/ConfirmProvider";

function TradingJournal() {
  const { showConfirm } = useConfirm();
  const emptyForm = {
    symbol: "",
    trade_type: "REVIEW",
    quantity: "",
    entry_price: "",
    exit_price: "",
    reason: "",
    strategy: "",
    mistake: "",
    learning: "",
    mood: "Calm",
    tags: "",
  };

  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  const [pagination, setPagination] = useState({
    total: 0,
    total_pages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadJournal(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function loadJournal(pageNumber = page, searchValue = search) {
    try {
      setLoading(true);

      const res = await api.get("/journal/paginated", {
        params: {
          page: pageNumber,
          limit,
          symbol: searchValue,
        },
      });

      setEntries(res.data.items || []);
      setPagination({
        total: res.data.total || 0,
        total_pages: res.data.total_pages || 1,
      });
    } catch (err) {
      console.error("Journal load failed:", err);
      alert(err?.response?.data?.detail || "Unable to load trading journal.");
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (value) => {
    if (value === null || value === undefined || value === "") return "-";

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
      hour12: false,
    });
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const buildPayload = () => {
    return {
      symbol: form.symbol.trim().toUpperCase(),
      trade_type: form.trade_type,
      quantity: form.quantity ? Number(form.quantity) : null,
      entry_price: form.entry_price ? Number(form.entry_price) : null,
      exit_price: form.exit_price ? Number(form.exit_price) : null,
      reason: form.reason.trim() || null,
      strategy: form.strategy.trim() || null,
      mistake: form.mistake.trim() || null,
      learning: form.learning.trim() || null,
      mood: form.mood.trim() || null,
      tags: form.tags.trim() || null,
    };
  };

  const saveEntry = async (e) => {
    e.preventDefault();

    try {
      if (!form.symbol.trim()) {
        alert("Symbol is required.");
        return;
      }

      setSaving(true);

      const payload = buildPayload();

      if (editingId) {
        await api.patch(`/journal/${editingId}`, payload);
        alert("Journal entry updated successfully.");
      } else {
        await api.post("/journal/", payload);
        alert("Journal entry saved successfully.");
      }

      resetForm();
      setPage(1);
      await loadJournal(1, search);
    } catch (err) {
      console.error("Journal save failed:", err);
      alert(err?.response?.data?.detail || "Unable to save journal entry.");
    } finally {
      setSaving(false);
    }
  };

  const editEntry = (entry) => {
    setEditingId(entry.id);

    setForm({
      symbol: entry.symbol || "",
      trade_type: entry.trade_type || "REVIEW",
      quantity: entry.quantity ?? "",
      entry_price: entry.entry_price ?? "",
      exit_price: entry.exit_price ?? "",
      reason: entry.reason || "",
      strategy: entry.strategy || "",
      mistake: entry.mistake || "",
      learning: entry.learning || "",
      mood: entry.mood || "Calm",
      tags: entry.tags || "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const deleteEntry = async (entry) => {
    const confirmed = await showConfirm(
      `Delete journal entry for ${entry.symbol}?`,
      { title: "Delete Journal Entry", confirmLabel: "Delete", isDangerous: true }
    );

    if (!confirmed) return;

    try {
      await api.delete(`/journal/${entry.id}`);
      window.showToast?.("Journal entry deleted successfully.");
      await loadJournal(page, search);
    } catch (err) {
      console.error("Journal delete failed:", err);
      window.showToast?.(err?.response?.data?.detail || "Unable to delete journal entry.");
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setPage(1);
    await loadJournal(1, search);
  };

  const totalEntries = pagination.total || 0;
  const buyReviews = entries.filter((item) => item.trade_type === "BUY").length;
  const sellReviews = entries.filter((item) => item.trade_type === "SELL").length;
  const mistakeCount = entries.filter((item) => item.mistake).length;

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <div className="dashboard-main">
        <Navbar />

        <div className="dashboard-content professional-dashboard">
          <div className="pro-dashboard-hero">
            <div>
              <p className="pro-eyebrow">Trading Discipline</p>

              <h1>
                Trading <span>Journal</span>
              </h1>

              <p>
                Record trade reasons, strategy, mistakes, emotions, and lessons.
                A journal turns paper trades into real learning.
              </p>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span className="status-pill status-success">Learning Mode</span>
                <p>Review every decision like a professional trader.</p>
              </div>

              <button className="primary-action" onClick={resetForm}>
                New Entry
              </button>
            </div>
          </div>

          <div className="dashboard-cards">
            <div className="stat-card">
              <h4>Total Entries</h4>
              <h2>{totalEntries}</h2>
            </div>

            <div className="stat-card">
              <h4>Buy Reviews</h4>
              <h2 style={{ color: "#16a34a" }}>{buyReviews}</h2>
            </div>

            <div className="stat-card">
              <h4>Sell Reviews</h4>
              <h2 style={{ color: "#dc2626" }}>{sellReviews}</h2>
            </div>

            <div className="stat-card">
              <h4>Mistakes Logged</h4>
              <h2 style={{ color: "#ca8a04" }}>{mistakeCount}</h2>
            </div>
          </div>

          <div className="pro-dashboard-grid" style={{ marginTop: "24px" }}>
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>{editingId ? "Edit Journal Entry" : "Create Journal Entry"}</h2>
                  <p>Write down the reason behind the trade and what you learned.</p>
                </div>
              </div>

              <form onSubmit={saveEntry}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "14px",
                  }}
                >
                  <div>
                    <label style={labelStyle}>Symbol</label>
                    <input
                      style={inputStyle}
                      value={form.symbol}
                      placeholder="RELIANCE"
                      onChange={(e) => handleChange("symbol", e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Trade Type</label>
                    <select
                      style={inputStyle}
                      value={form.trade_type}
                      onChange={(e) => handleChange("trade_type", e.target.value)}
                    >
                      <option value="REVIEW">REVIEW</option>
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Quantity</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min="0"
                      value={form.quantity}
                      onChange={(e) => handleChange("quantity", e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Mood</label>
                    <select
                      style={inputStyle}
                      value={form.mood}
                      onChange={(e) => handleChange("mood", e.target.value)}
                    >
                      <option value="Calm">Calm</option>
                      <option value="Confident">Confident</option>
                      <option value="Fearful">Fearful</option>
                      <option value="Greedy">Greedy</option>
                      <option value="Impulsive">Impulsive</option>
                      <option value="Disciplined">Disciplined</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Entry Price</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min="0"
                      value={form.entry_price}
                      onChange={(e) => handleChange("entry_price", e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Exit Price</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min="0"
                      value={form.exit_price}
                      onChange={(e) => handleChange("exit_price", e.target.value)}
                    />
                  </div>
                </div>

                <label style={labelStyle}>Reason for Trade</label>
                <textarea
                  style={textAreaStyle}
                  value={form.reason}
                  placeholder="Why did you enter or review this trade?"
                  onChange={(e) => handleChange("reason", e.target.value)}
                />

                <label style={labelStyle}>Strategy</label>
                <textarea
                  style={textAreaStyle}
                  value={form.strategy}
                  placeholder="Breakout, support/resistance, moving average, trend-following..."
                  onChange={(e) => handleChange("strategy", e.target.value)}
                />

                <label style={labelStyle}>Mistake</label>
                <textarea
                  style={textAreaStyle}
                  value={form.mistake}
                  placeholder="What went wrong or what could be improved?"
                  onChange={(e) => handleChange("mistake", e.target.value)}
                />

                <label style={labelStyle}>Learning</label>
                <textarea
                  style={textAreaStyle}
                  value={form.learning}
                  placeholder="What did this trade teach you?"
                  onChange={(e) => handleChange("learning", e.target.value)}
                />

                <label style={labelStyle}>Tags</label>
                <input
                  style={inputStyle}
                  value={form.tags}
                  placeholder="breakout, intraday, discipline"
                  onChange={(e) => handleChange("tags", e.target.value)}
                />

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <button className="primary-action" type="submit" disabled={saving}>
                    {saving ? "Saving..." : editingId ? "Update Entry" : "Save Entry"}
                  </button>

                  {editingId && (
                    <button
                      className="warning-action"
                      type="button"
                      onClick={resetForm}
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Journal Rules</h2>
                  <p>Use this checklist before and after every paper trade.</p>
                </div>
              </div>

              <div className="market-card-list">
                {[
                  "Did I enter with a clear setup?",
                  "Was risk controlled before entry?",
                  "Did I chase price emotionally?",
                  "Was the exit planned?",
                  "What mistake should I avoid next time?",
                  "What did the chart teach me?",
                ].map((item) => (
                  <div className="market-card-item" key={item}>
                    <strong>{item}</strong>
                    <span>Review</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="table-card" style={{ marginTop: "24px" }}>
            <div className="pro-panel-header">
              <div>
                <h2>Journal History</h2>
                <p style={{ color: "#64748b" }}>
                  Showing page {page} of {pagination.total_pages}
                </p>
              </div>

              <form
                onSubmit={handleSearch}
                style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}
              >
                <input
                  style={{
                    ...inputStyle,
                    marginBottom: 0,
                    minWidth: "220px",
                  }}
                  value={search}
                  placeholder="Filter by symbol..."
                  onChange={(e) => setSearch(e.target.value)}
                />

                <button className="primary-action" type="submit">
                  Search
                </button>

                <button
                  className="warning-action"
                  type="button"
                  onClick={async () => {
                    setSearch("");
                    setPage(1);
                    await loadJournal(1, "");
                  }}
                >
                  Clear
                </button>
              </form>
            </div>

            {loading ? (
              <SkeletonLoader rows={6} />
            ) : entries.length === 0 ? (
              <div className="empty-state">
                <h3>No journal entries found</h3>
                <p>Create your first journal entry to start improving your trades.</p>
              </div>
            ) : (
              <div className="table-scroll">
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Mood</th>
                    <th>Learning</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <strong>{entry.symbol}</strong>
                      </td>

                      <td>
                        <span
                          className={
                            entry.trade_type === "BUY"
                              ? "status-pill status-success"
                              : entry.trade_type === "SELL"
                              ? "status-pill status-danger"
                              : "status-pill status-warning"
                          }
                        >
                          {entry.trade_type}
                        </span>
                      </td>

                      <td>{entry.quantity || "-"}</td>
                      <td>₹{formatMoney(entry.entry_price)}</td>
                      <td>₹{formatMoney(entry.exit_price)}</td>
                      <td>{entry.mood || "-"}</td>

                      <td style={{ maxWidth: "280px", color: "#64748b" }}>
                        {entry.learning || entry.reason || "-"}
                      </td>

                      <td style={{ color: "#64748b" }}>
                        {formatDate(entry.created_at)}
                      </td>

                      <td>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            className="primary-action"
                            onClick={() => editEntry(entry)}
                          >
                            Edit
                          </button>

                          <button
                            className="danger-action"
                            onClick={() => deleteEntry(entry)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}

            <div
              style={{
                marginTop: "18px",
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <button
                className="primary-action"
                disabled={page <= 1 || loading}
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                style={{ opacity: page <= 1 ? 0.5 : 1 }}
              >
                Previous
              </button>

              <strong>
                {page} / {pagination.total_pages}
              </strong>

              <button
                className="primary-action"
                disabled={page >= pagination.total_pages || loading}
                onClick={() =>
                  setPage((prev) => Math.min(prev + 1, pagination.total_pages))
                }
                style={{ opacity: page >= pagination.total_pages ? 0.5 : 1 }}
              >
                Next
              </button>
            </div>
          </div>

          <div className="footer-note">
            Trading journals are for discipline and learning. Review them weekly
            to find repeated mistakes and improve your process.
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

const textAreaStyle = {
  ...inputStyle,
  minHeight: "88px",
  resize: "vertical",
};

export default TradingJournal;
