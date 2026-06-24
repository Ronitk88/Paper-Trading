import { useCallback, useEffect, useState } from "react";
import api from "../api/api";
import { useConfirm } from "./ConfirmProvider";

function BrokerConfiguration() {
  const { showConfirm } = useConfirm();

  const [credentials, setCredentials] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const [form, setForm] = useState({
    api_key: "",
    client_code: "",
    password: "",
    totp_secret: "",
    secret_key: "",
  });

  const [showPassword, setShowPassword] = useState(false);

  const loadCredentials = useCallback(async () => {
    try {
      setLoading(true);
      const [credRes, statusRes] = await Promise.all([
        api.get("/broker/credentials"),
        api.get("/broker/status"),
      ]);
      setCredentials(credRes.data || null);
      setStatus(statusRes.data || null);
    } catch (err) {
      console.error("Broker credentials load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const hasAnyValue = Object.values(form).some((v) => v.trim());
    if (!hasAnyValue) {
      return;
    }

    setSaving(true);
    try {
      const payload = {};
      for (const [key, value] of Object.entries(form)) {
        if (value.trim()) {
          payload[key] = value.trim();
        }
      }

      const res = await api.put("/broker/credentials", payload);
      setCredentials(res.data?.credentials || null);
      setForm({ api_key: "", client_code: "", password: "", totp_secret: "", secret_key: "" });
      await loadCredentials();
    } catch (err) {
      console.error("Broker credentials save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await api.post("/broker/test-connection");
      setStatus((prev) => ({
        ...(prev || {}),
        connection_status: res.data?.connection_status || "error",
      }));
    } catch (err) {
      console.error("Broker connection test failed:", err);
    } finally {
      setTesting(false);
    }
  };

  const handleReconnect = async () => {
    const confirmed = await showConfirm(
      "Reconnect to Angel One? This will restart the WebSocket market data feed.",
      { title: "Reconnect Broker", confirmLabel: "Reconnect" }
    );
    if (!confirmed) return;

    setReconnecting(true);
    try {
      const res = await api.post("/broker/reconnect");
      setStatus((prev) => ({
        ...(prev || {}),
        connection_status: res.data?.connection_status || "error",
        last_connected_at: res.data?.last_connected_at,
      }));
    } catch (err) {
      console.error("Broker reconnect failed:", err);
    } finally {
      setReconnecting(false);
    }
  };

  const statusIcon = (connStatus) => {
    switch (connStatus) {
      case "connected":
        return { icon: "✅", label: "Connected", color: "#16a34a" };
      case "disconnected":
        return { icon: "❌", label: "Disconnected", color: "#dc2626" };
      case "error":
        return { icon: "❌", label: "Connection Error", color: "#dc2626" };
      case "updated":
        return { icon: "⚠️", label: "Updated, not tested", color: "#f97316" };
      default:
        return { icon: "❌", label: "Not Configured", color: "#94a3b8" };
    }
  };

  const connInfo = statusIcon(status?.connection_status || credentials?.connection_status);

  return (
    <div className="pro-panel">
      <div className="pro-panel-header">
        <div>
          <h2>Broker Configuration</h2>
          <p>Manage Angel One API credentials. Values are encrypted at rest.</p>
        </div>
        <button className="primary-action" onClick={loadCredentials} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="skeleton-card">
          <div className="skeleton-line long" />
          <div className="skeleton-line long" />
          <div className="skeleton-line medium" />
        </div>
      ) : (
        <>
          {/* Connection Status */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              padding: "18px",
              marginBottom: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "14px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <span style={{ fontSize: "24px" }}>{connInfo.icon}</span>
                <strong style={{ color: connInfo.color, fontSize: "18px" }}>{connInfo.label}</strong>
              </div>
              {status?.last_connected_at && (
                <p style={{ margin: 0, color: "#64748b", fontWeight: "700", fontSize: "13px" }}>
                  Last connected: {new Date(status.last_connected_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </p>
              )}
              <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: "700", fontSize: "13px" }}>
                WebSocket: {status?.websocket_connected ? "● Connected" : "○ Disconnected"}
                {status?.websocket_subscriptions > 0 && ` (${status.websocket_subscriptions} subscriptions)`}
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-action" onClick={handleTestConnection} disabled={testing}>
                {testing ? "Testing..." : "Test Connection"}
              </button>
              <button className="warning-action" onClick={handleReconnect} disabled={reconnecting}>
                {reconnecting ? "Reconnecting..." : "Reconnect"}
              </button>
            </div>
          </div>

          {/* Current Credentials (masked) */}
          {credentials && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "16px",
                padding: "16px",
                marginBottom: "20px",
              }}
            >
              <strong style={{ color: "#166534" }}>Current Configuration</strong>
              <p style={{ margin: "8px 0 0", color: "#166534", fontWeight: "700", fontSize: "14px" }}>
                Provider: {credentials.provider}
              </p>
              <p style={{ margin: "4px 0", color: "#166534", fontWeight: "700", fontSize: "14px" }}>
                API Key: {credentials.api_key_masked || "Not set"}
              </p>
              <p style={{ margin: "4px 0", color: "#166534", fontWeight: "700", fontSize: "14px" }}>
                Client Code: {credentials.client_code_masked || "Not set"}
              </p>
              <p style={{ margin: "0", color: "#166534", fontWeight: "700", fontSize: "14px" }}>
                Last updated: {credentials.updated_at ? new Date(credentials.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Never"}
              </p>
            </div>
          )}

          {/* Update Credentials Form */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              padding: "18px",
              marginBottom: "20px",
            }}
          >
            <strong style={{ display: "block", marginBottom: "14px", color: "#0f172a" }}>
              Update Credentials
            </strong>
            <p style={{ margin: "-10px 0 16px", color: "#64748b", fontSize: "13px", fontWeight: "700" }}>
              Fill in the fields you want to update. Leave blank to keep existing values.
            </p>

            <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", color: "#334155", fontSize: "14px" }}>
              Angel One API Key
            </label>
            <input
              type="text"
              value={form.api_key}
              onChange={(e) => handleChange("api_key", e.target.value)}
              style={inputStyle}
              placeholder="Enter new API key (leave blank to keep)"
            />

            <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", color: "#334155", fontSize: "14px" }}>
              Client Code
            </label>
            <input
              type="text"
              value={form.client_code}
              onChange={(e) => handleChange("client_code", e.target.value)}
              style={inputStyle}
              placeholder="Enter client code"
            />

            <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", color: "#334155", fontSize: "14px" }}>
              Password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => handleChange("password", e.target.value)}
              style={inputStyle}
              placeholder="Enter password"
            />

            <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", color: "#334155", fontSize: "14px" }}>
              TOTP Secret
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={form.totp_secret}
              onChange={(e) => handleChange("totp_secret", e.target.value)}
              style={inputStyle}
              placeholder="Enter TOTP secret"
            />

            <label style={{ display: "block", fontWeight: "800", marginBottom: "6px", color: "#334155", fontSize: "14px" }}
            >Secret Key</label>
            <input
              type={showPassword ? "text" : "password"}
              value={form.secret_key}
              onChange={(e) => handleChange("secret_key", e.target.value)}
              style={inputStyle}
              placeholder="Enter secret key (optional)"
            />

            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "12px", flexWrap: "wrap" }}>
              <button className="primary-action" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Update Credentials"}
              </button>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "700", color: "#64748b" }}>
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={() => setShowPassword(!showPassword)}
                />
                Show passwords
              </label>
            </div>
          </div>

          <div
            style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: "14px",
              padding: "14px",
              color: "#9a3412",
              fontWeight: "700",
              fontSize: "13px",
              lineHeight: "1.7",
            }}
          >
            Credentials are encrypted using CREDENTIAL_ENCRYPTION_KEY from .env before storage.
            After updating credentials, click <strong>Reconnect</strong> to apply them immediately.
          </div>
        </>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  marginBottom: "16px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "15px",
  background: "white",
};

export default BrokerConfiguration;