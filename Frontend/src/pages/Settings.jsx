import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaDatabase,
  FaKey,
  FaRedo,
  FaShieldAlt,
  FaSignOutAlt,
  FaTrashAlt,
  FaUserCog,
  FaWallet,
} from "react-icons/fa";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import BrokerConfiguration from "../components/BrokerConfiguration";
import SkeletonLoader from "../components/SkeletonLoader";
import { useConfirm } from "../components/ConfirmProvider";
import api from "../api/api";

function Settings() {
  const navigate = useNavigate();
  const { showConfirm } = useConfirm();

  const [profile, setProfile] = useState({
    id: "",
    username: localStorage.getItem("username") || "Trader",
    email: localStorage.getItem("email") || "",
    phone: localStorage.getItem("phone") || "",
  });

  const [profileForm, setProfileForm] = useState({
    username: "",
    email: "",
    phone: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
  });

  const [portfolio, setPortfolio] = useState({
    cash_balance: 0,
    invested_value: 0,
    current_holdings_value: 0,
    total_value: 0,
    total_pnl: 0,
    total_holdings: 0,
  });

  const [orderSummary, setOrderSummary] = useState({
    total_orders: 0,
    executed_orders: 0,
    pending_orders: 0,
    cancelled_orders: 0,
    rejected_orders: 0,
  });

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [resettingPortfolio, setResettingPortfolio] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const formatName = (name) => {
    if (!name) return "Trader";

    return name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const loadSettings = async () => {
    try {
      setLoading(true);

      const [profileRes, portfolioRes, orderSummaryRes] = await Promise.all([
        api.get("/auth/me"),
        api.get("/portfolio/"),
        api.get("/orders/summary"),
      ]);

      const profileData = profileRes.data || {};
      const displayName = formatName(profileData.username || "Trader");

      const updatedProfile = {
        ...profileData,
        username: displayName,
        email: profileData.email || "",
        phone: profileData.phone || "",
      };

      setProfile(updatedProfile);

      setProfileForm({
        username: displayName,
        email: profileData.email || "",
        phone: profileData.phone || "",
      });

      setPortfolio(portfolioRes.data || {});
      setOrderSummary(orderSummaryRes.data || {});

      localStorage.setItem("username", displayName);
      localStorage.setItem("email", profileData.email || "");
      localStorage.setItem("phone", profileData.phone || "");

      sessionStorage.setItem("username", displayName);
      sessionStorage.setItem("email", profileData.email || "");
      sessionStorage.setItem("phone", profileData.phone || "");
    } catch (err) {
      console.error("Settings load failed:", err);
      alert("Unable to load settings.");
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

  const handleLogout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("email");
    sessionStorage.removeItem("phone");

    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("email");
    localStorage.removeItem("phone");

    navigate("/");
  };

  const handleProfileChange = (field, value) => {
    setProfileForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveProfile = async () => {
    try {
      if (!profileForm.username.trim()) {
        alert("Username is required");
        return;
      }

      if (!profileForm.email.trim() && !profileForm.phone.trim()) {
        alert("At least email or phone number is required");
        return;
      }

      setSavingProfile(true);

      const res = await api.patch("/auth/profile", {
        username: profileForm.username.trim(),
        email: profileForm.email.trim() || null,
        phone: profileForm.phone.trim() || null,
      });

      const updatedUser = res.data.user;
      const displayName = formatName(updatedUser.username || "Trader");

      setProfile((prev) => ({
        ...prev,
        username: displayName,
        email: updatedUser.email || "",
        phone: updatedUser.phone || "",
      }));

      setProfileForm({
        username: displayName,
        email: updatedUser.email || "",
        phone: updatedUser.phone || "",
      });

      localStorage.setItem("username", displayName);
      localStorage.setItem("email", updatedUser.email || "");
      localStorage.setItem("phone", updatedUser.phone || "");

      sessionStorage.setItem("username", displayName);
      sessionStorage.setItem("email", updatedUser.email || "");
      sessionStorage.setItem("phone", updatedUser.phone || "");

      alert("Profile updated successfully!");
    } catch (err) {
      console.error("Profile update failed:", err);
      alert(err?.response?.data?.detail || "Profile update failed");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async () => {
    try {
      if (!passwordForm.current_password.trim()) {
        alert("Current password is required");
        return;
      }

      if (!passwordForm.new_password.trim()) {
        alert("New password is required");
        return;
      }

      if (passwordForm.new_password.length < 6) {
        alert("New password must be at least 6 characters");
        return;
      }

      setChangingPassword(true);

      await api.post("/auth/change-password", {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });

      setPasswordForm({
        current_password: "",
        new_password: "",
      });

      alert("Password changed successfully!");
    } catch (err) {
      console.error("Password change failed:", err);
      alert(err?.response?.data?.detail || "Password change failed");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleResetPortfolio = async () => {
    const confirmed = await showConfirm(
      "Are you sure you want to reset your portfolio? This will delete all holdings, orders, and transactions. Your watchlist will remain safe.",
      { title: "Reset Portfolio", confirmLabel: "Reset", isDangerous: true }
    );

    if (!confirmed) return;

    const secondConfirm = await showConfirm(
      'Type "RESET" to confirm you want to reset portfolio to ₹10,00,000 virtual cash.',
      { title: "Final Confirmation", confirmLabel: "RESET", cancelLabel: "Cancel", isDangerous: true }
    );

    if (!secondConfirm) return;

    try {
      setResettingPortfolio(true);

      await api.post("/portfolio/reset");

      alert("Portfolio reset successfully!");
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Portfolio reset failed:", err);
      alert(err?.response?.data?.detail || "Portfolio reset failed");
    } finally {
      setResettingPortfolio(false);
    }
  };

  const portfolioPnl = Number(portfolio.total_pnl || 0);

  const accountMetrics = useMemo(() => {
    const totalOrders = Number(orderSummary.total_orders || 0);
    const executedOrders = Number(orderSummary.executed_orders || 0);
    const rejectedOrders = Number(orderSummary.rejected_orders || 0);

    const executionRate = totalOrders > 0 ? (executedOrders / totalOrders) * 100 : 0;
    const rejectionRate = totalOrders > 0 ? (rejectedOrders / totalOrders) * 100 : 0;

    return {
      executionRate,
      rejectionRate,
    };
  }, [orderSummary]);

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <div className="dashboard-main">
        <Navbar />

        <div className="dashboard-content professional-dashboard">
          <div className="pro-dashboard-hero">
            <div>
              <p className="pro-eyebrow">Account Control Center</p>

              <h1>
                Platform <span>Settings</span>
              </h1>

              <p>
                Manage your profile, account security, trading controls, portfolio
                reset, platform information, and paper trading safety settings.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "16px",
                  flexWrap: "wrap",
                }}
              >
                <span className="status-pill status-success">Active Account</span>
                <span className="status-pill status-warning">Paper Mode</span>
                <span className="status-pill status-success">JWT Protected</span>
              </div>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span className="status-pill status-success">Secure Access</span>
                <p>Profile and trading controls</p>
              </div>

              <button className="primary-action" onClick={loadSettings} disabled={loading}>
                <FaRedo style={{ marginRight: "8px" }} />
                {loading ? "Refreshing..." : "Refresh Settings"}
              </button>
            </div>
          </div>

          <div className="pro-kpi-grid">
            <div className="pro-kpi-card">
              <p>Virtual Cash</p>
              <h2>₹{formatMoney(portfolio.cash_balance)}</h2>
              <span className="pro-muted">Available paper balance</span>
            </div>

            <div className="pro-kpi-card">
              <p>Total Portfolio Value</p>
              <h2>₹{formatMoney(portfolio.total_value)}</h2>
              <span className="pro-muted">Cash + holdings</span>
            </div>

            <div className="pro-kpi-card">
              <p>Total P&amp;L</p>
              <h2 className={portfolioPnl >= 0 ? "pro-positive" : "pro-negative"}>
                ₹{formatMoney(portfolioPnl)}
              </h2>
              <span className="pro-muted">Current account performance</span>
            </div>

            <div className="pro-kpi-card">
              <p>Execution Rate</p>
              <h2>{accountMetrics.executionRate.toFixed(2)}%</h2>
              <span className="pro-muted">Executed orders / total orders</span>
            </div>
          </div>

          {loading ? (
            <div className="table-card">
              <SkeletonLoader rows={6} />
            </div>
          ) : (
            <>
              <div className="pro-dashboard-grid large-left">
                <div className="pro-panel">
                  <div className="pro-panel-header">
                    <div>
                      <h2>
                        <FaUserCog style={{ marginRight: "10px", color: "#2563eb" }} />
                        Profile Overview
                      </h2>
                      <p>Your account identity and contact information.</p>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      marginBottom: "22px",
                    }}
                  >
                    <div
                      style={{
                        width: "66px",
                        height: "66px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "28px",
                        fontWeight: "900",
                        flexShrink: 0,
                      }}
                    >
                      {(profile.username || "T").charAt(0).toUpperCase()}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: 0 }}>{profile.username || "Trader"}</h3>
                      <p
                        style={{
                          color: "#6b7280",
                          margin: "6px 0 0",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {profile.email || profile.phone || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="info-row">
                    <span className="info-label">User ID</span>
                    <span className="info-value">{profile.id || "-"}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Email</span>
                    <span className="info-value" style={safeTextStyle}>
                      {profile.email || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Phone</span>
                    <span className="info-value" style={safeTextStyle}>
                      {profile.phone || "-"}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Account Type</span>
                    <span className="info-value">Paper Trading</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Account Status</span>
                    <span className="status-pill status-success">Active</span>
                  </div>
                </div>

                <div className="pro-panel">
                  <div className="pro-panel-header">
                    <div>
                      <h2>Edit Profile</h2>
                      <p>Update your display name and contact information.</p>
                    </div>
                  </div>

                  <label style={labelStyle}>Username</label>
                  <input
                    type="text"
                    value={profileForm.username}
                    onChange={(e) => handleProfileChange("username", e.target.value)}
                    style={inputStyle}
                  />

                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => handleProfileChange("email", e.target.value)}
                    style={inputStyle}
                  />

                  <label style={labelStyle}>Phone</label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => handleProfileChange("phone", e.target.value)}
                    style={inputStyle}
                  />

                  <button
                    className="primary-action"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    style={{ marginTop: "8px" }}
                  >
                    {savingProfile ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </div>

              {/* ═══════ BROKER CONFIGURATION ═══════ */}
              <div style={{ marginTop: "24px" }}>
                <BrokerConfiguration />
              </div>

              <div className="pro-dashboard-grid">
                <div className="pro-panel">
                  <div className="pro-panel-header">
                    <div>
                      <h2>
                        <FaKey style={{ marginRight: "10px", color: "#2563eb" }} />
                        Change Password
                      </h2>
                      <p>Change your password for email/phone login.</p>
                    </div>
                  </div>

                  <label style={labelStyle}>Current Password</label>
                  <input
                    type="password"
                    value={passwordForm.current_password}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        current_password: e.target.value,
                      }))
                    }
                    style={inputStyle}
                  />

                  <label style={labelStyle}>New Password</label>
                  <input
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        new_password: e.target.value,
                      }))
                    }
                    style={inputStyle}
                  />

                  <button
                    className="primary-action"
                    onClick={handlePasswordChange}
                    disabled={changingPassword}
                    style={{ marginTop: "8px" }}
                  >
                    {changingPassword ? "Updating..." : "Change Password"}
                  </button>
                </div>

                <div className="pro-panel">
                  <div className="pro-panel-header">
                    <div>
                      <h2>
                        <FaWallet style={{ marginRight: "10px", color: "#16a34a" }} />
                        Trading Account
                      </h2>
                      <p>Paper trading capital and order execution summary.</p>
                    </div>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Virtual Cash</span>
                    <span className="info-value">₹{formatMoney(portfolio.cash_balance)}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Invested Value</span>
                    <span className="info-value">₹{formatMoney(portfolio.invested_value)}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Holdings Value</span>
                    <span className="info-value">
                      ₹{formatMoney(portfolio.current_holdings_value)}
                    </span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Total Value</span>
                    <span className="info-value">₹{formatMoney(portfolio.total_value)}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Total P&amp;L</span>
                    <span className={portfolioPnl >= 0 ? "pro-positive" : "pro-negative"}>
                      ₹{formatMoney(portfolioPnl)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pro-dashboard-grid large-left">
                <div className="pro-panel">
                  <div className="pro-panel-header">
                    <div>
                      <h2>
                        <FaShieldAlt style={{ marginRight: "10px", color: "#2563eb" }} />
                        Order Controls & Risk
                      </h2>
                      <p>Simulation safety rules currently active on your account.</p>
                    </div>
                  </div>

                  <div className="activity-grid">
                    <div>
                      <p>Total Orders</p>
                      <h3>{formatNumber(orderSummary.total_orders)}</h3>
                    </div>

                    <div>
                      <p>Executed</p>
                      <h3 className="pro-positive">
                        {formatNumber(orderSummary.executed_orders)}
                      </h3>
                    </div>

                    <div>
                      <p>Pending</p>
                      <h3>{formatNumber(orderSummary.pending_orders)}</h3>
                    </div>

                    <div>
                      <p>Rejected</p>
                      <h3 className="pro-negative">
                        {formatNumber(orderSummary.rejected_orders)}
                      </h3>
                    </div>
                  </div>

                  <div style={{ marginTop: "18px" }}>
                    <div className="info-row">
                      <span className="info-label">Execution Mode</span>
                      <span className="status-pill status-success">Paper Execution</span>
                    </div>

                    <div className="info-row">
                      <span className="info-label">Market Orders</span>
                      <span className="status-pill status-success">Enabled</span>
                    </div>

                    <div className="info-row">
                      <span className="info-label">Limit Orders</span>
                      <span className="status-pill status-success">Enabled</span>
                    </div>

                    <div className="info-row">
                      <span className="info-label">Short Selling</span>
                      <span className="status-pill status-danger">Blocked</span>
                    </div>

                    <div className="info-row">
                      <span className="info-label">Rejection Rate</span>
                      <span
                        className={
                          accountMetrics.rejectionRate <= 10
                            ? "pro-positive"
                            : "pro-negative"
                        }
                      >
                        {accountMetrics.rejectionRate.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pro-panel">
                  <div className="pro-panel-header">
                    <div>
                      <h2>
                        <FaDatabase style={{ marginRight: "10px", color: "#2563eb" }} />
                        Platform Information
                      </h2>
                      <p>Technical stack and system details.</p>
                    </div>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Application</span>
                    <span className="info-value">Paper Trading Platform</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Frontend</span>
                    <span className="info-value">React + Vite</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Backend</span>
                    <span className="info-value">FastAPI + PostgreSQL</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Market Data</span>
                    <span className="info-value">Angel One API</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Authentication</span>
                    <span className="status-pill status-success">JWT Based</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">Version</span>
                    <span className="info-value">1.0.0</span>
                  </div>
                </div>
              </div>

              <div className="pro-dashboard-grid">
                <div className="pro-panel">
                  <div className="pro-panel-header">
                    <div>
                      <h2>Security</h2>
                      <p>Account protection and route security status.</p>
                    </div>
                  </div>

                  <div className="market-card-list">
                    <div className="market-card-item">
                      <span>Password Storage</span>
                      <strong className="pro-positive">Hashed</strong>
                    </div>

                    <div className="market-card-item">
                      <span>Protected Routes</span>
                      <strong className="pro-positive">Enabled</strong>
                    </div>

                    <div className="market-card-item">
                      <span>Real Money Trading</span>
                      <strong className="pro-negative">Disabled</strong>
                    </div>

                    <button
                      type="button"
                      className="market-card-item market-clickable"
                      onClick={handleLogout}
                    >
                      <span>Logout Session</span>
                      <strong>
                        <FaSignOutAlt style={{ marginRight: "7px" }} /> Logout
                      </strong>
                    </button>
                  </div>
                </div>

                <div className="pro-panel">
                  <div className="pro-panel-header">
                    <div>
                      <h2>Account Actions</h2>
                      <p>Danger-zone controls protected by confirmations.</p>
                    </div>
                  </div>

                  <p style={{ color: "#64748b", lineHeight: "1.7", marginTop: 0 }}>
                    Resetting your portfolio will delete all holdings, orders, and
                    transactions, then restore your virtual cash to ₹10,00,000.
                    Your watchlist remains safe.
                  </p>

                  <button
                    className="danger-action"
                    onClick={handleResetPortfolio}
                    disabled={resettingPortfolio}
                  >
                    <FaTrashAlt style={{ marginRight: "8px" }} />
                    {resettingPortfolio ? "Resetting..." : "Reset Portfolio"}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="footer-note">
            This platform is for paper trading and education only. All trades are
            simulated, and no real money is involved.
          </div>
        </div>
      </div>
    </div>
  );
}

const safeTextStyle = {
  minWidth: 0,
  maxWidth: "100%",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  textAlign: "right",
};

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
};

export default Settings;
