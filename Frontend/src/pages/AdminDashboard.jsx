import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import api from "../api/api";
import SkeletonLoader from "../components/SkeletonLoader";

function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    loadAdmin();
  }, []);

  const loadAdmin = async () => {
    try {
      setLoading(true);

      const res = await api.get("/admin/summary");

      setSummary(res.data || null);
    } catch (err) {
      console.error("Admin summary failed:", err);
      setSummary(null);
      alert(
        err?.response?.data?.detail ||
          "Unable to load admin dashboard. Check ADMIN_EMAILS in backend .env."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);

      const res = await api.get("/admin/users");

      setUsers(res.data || []);
    } catch (err) {
      console.error("Admin users failed:", err);
      alert(err?.response?.data?.detail || "Unable to load users.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const formatMoney = (value) => {
    return Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  if (loading) {
    return (
      <div className="dashboard-layout">
        <Sidebar />

        <div className="dashboard-main">
          <Navbar />

          <div className="dashboard-content">
            <div className="table-card">
              <h2>Loading admin dashboard...</h2>
              <SkeletonLoader rows={6} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="dashboard-layout">
        <Sidebar />

        <div className="dashboard-main">
          <Navbar />

          <div className="dashboard-content">
            <div className="empty-state">
              <h3>Admin access unavailable</h3>
              <p>
                Add your login email to ADMIN_EMAILS in backend .env, restart
                backend, and try again.
              </p>

              <button
                className="primary-action"
                onClick={loadAdmin}
                style={{ marginTop: "16px" }}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "Total Users",
      value: summary.users?.total_users || 0,
    },
    {
      label: "Total Stocks",
      value: summary.stocks?.total_stocks || 0,
    },
    {
      label: "Total Orders",
      value: summary.orders?.total_orders || 0,
    },
    {
      label: "Transactions",
      value: summary.activity?.total_transactions || 0,
    },
    {
      label: "Executed Orders",
      value: summary.orders?.executed_orders || 0,
      color: "#16a34a",
    },
    {
      label: "Pending Orders",
      value: summary.orders?.pending_orders || 0,
      color: "#ca8a04",
    },
    {
      label: "Rejected Orders",
      value: summary.orders?.rejected_orders || 0,
      color: "#dc2626",
    },
    {
      label: "Watchlist Items",
      value: summary.activity?.total_watchlist_items || 0,
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
              <p className="pro-eyebrow">System Control</p>

              <h1>
                Admin <span>Dashboard</span>
              </h1>

              <p>
                View platform users, orders, activity, stock master count, and
                overall simulated portfolio value.
              </p>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span className="status-pill status-success">
                  {summary.status || "healthy"}
                </span>
                <p>Logged in as {summary.admin?.email}</p>
              </div>

              <button className="primary-action" onClick={loadAdmin}>
                Refresh
              </button>
            </div>
          </div>

          <div className="dashboard-cards">
            {cards.map((card) => (
              <div className="stat-card" key={card.label}>
                <h4>{card.label}</h4>

                <h2 style={{ color: card.color || "#0f172a" }}>
                  {card.value}
                </h2>
              </div>
            ))}
          </div>

          <div className="pro-dashboard-grid" style={{ marginTop: "24px" }}>
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Platform Value</h2>
                  <p>Aggregated simulated capital across all users.</p>
                </div>
              </div>

              <div className="info-row">
                <span className="info-label">Total Virtual Cash</span>
                <span className="info-value">
                  ₹{formatMoney(summary.platform_value?.total_virtual_cash)}
                </span>
              </div>

              <div className="info-row">
                <span className="info-label">Total Platform Value</span>
                <span className="info-value">
                  ₹{formatMoney(summary.platform_value?.total_platform_value)}
                </span>
              </div>

              <div className="info-row">
                <span className="info-label">Total Platform P&amp;L</span>
                <span
                  className="info-value"
                  style={{
                    color:
                      Number(summary.platform_value?.total_platform_pnl || 0) >= 0
                        ? "#16a34a"
                        : "#dc2626",
                  }}
                >
                  ₹{formatMoney(summary.platform_value?.total_platform_pnl)}
                </span>
              </div>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Admin User</h2>
                  <p>Current admin session information.</p>
                </div>
              </div>

              <div className="info-row">
                <span className="info-label">Username</span>
                <span className="info-value">{summary.admin?.username}</span>
              </div>

              <div className="info-row">
                <span className="info-label">Email</span>
                <span className="info-value">{summary.admin?.email}</span>
              </div>

              <div className="info-row">
                <span className="info-label">Access</span>
                <span className="status-pill status-success">Admin</span>
              </div>
            </div>
          </div>

          <div className="table-card" style={{ marginTop: "24px" }}>
            <div className="pro-panel-header">
              <div>
                <h2>Recent Users</h2>
                <p style={{ color: "#64748b" }}>
                  Loads up to 100 latest registered users.
                </p>
              </div>

              <button
                className="primary-action"
                onClick={loadUsers}
                disabled={loadingUsers}
              >
                {loadingUsers ? "Loading..." : "Load Users"}
              </button>
            </div>

            {loadingUsers ? (
              <SkeletonLoader rows={6} />
            ) : users.length === 0 ? (
              <div className="empty-state">
                <h3>No users loaded</h3>
                <p>Click Load Users to view registered accounts.</p>
              </div>
            ) : (
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Phone</th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>#{user.id}</strong>
                      </td>
                      <td>{user.username}</td>
                      <td>{user.email || "-"}</td>
                      <td>{user.phone || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="footer-note">
            Admin access is controlled by ADMIN_EMAILS in backend .env. Do not
            expose admin routes publicly without authentication.
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
