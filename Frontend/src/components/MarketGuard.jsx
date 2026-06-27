import React, { useEffect, useState } from "react";
import { FaLock, FaClock, FaSyncAlt, FaSignOutAlt, FaUserShield } from "react-icons/fa";
import api from "../api/api";
import { useNavigate } from "react-router-dom";

const isWithinTradingHours = (date) => {
  if (!date) return false;

  // Format the date specifically to Asia/Kolkata timezone to get the current time parts in India.
  const options = { timeZone: 'Asia/Kolkata', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(date);

  let weekday = '';
  let hour = 0;
  let minute = 0;

  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value; // "Mon", "Tue", etc.
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }

  // Check if weekend (Saturday or Sunday)
  if (weekday === 'Sat' || weekday === 'Sun') {
    return false;
  }

  // Convert hour and minute to minutes of the day
  const timeInMinutes = hour * 60 + minute;
  const startInMinutes = 9 * 60 + 15; // 09:15
  const endInMinutes = 15 * 60 + 30;  // 15:30 (3:30 PM)

  return timeInMinutes >= startInMinutes && timeInMinutes <= endInMinutes;
};

export default function MarketGuard({ children }) {
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [statusData, setStatusData] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminBypass, setAdminBypass] = useState(() => {
    return sessionStorage.getItem("admin_market_bypass") === "true";
  });
  const [localTime, setLocalTime] = useState(null);
  const [error, setError] = useState(null);
  
  const navigate = useNavigate();

  const checkMarketStatus = async () => {
    try {
      setError(null);
      const res = await api.get("/market-calendar/status");
      setStatusData(res.data);
      setIsOpen(res.data.is_open);
      
      // Parse the server time (IST timezone)
      if (res.data.current_time) {
        const cleanStr = res.data.current_time.replace(',', '');
        const parsed = new Date(cleanStr);
        if (!isNaN(parsed.getTime())) {
          setLocalTime(parsed);
        } else {
          setLocalTime(new Date());
        }
      }
    } catch (err) {
      console.error("Failed to check market status:", err);
      setError("Unable to connect to the trading server. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  const checkAdminStatus = async () => {
    try {
      const res = await api.get("/auth/me");
      setIsAdmin(res.data?.is_admin === true);
    } catch {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    checkMarketStatus();
    checkAdminStatus();

    // Check status every 30 seconds
    const statusInterval = setInterval(checkMarketStatus, 30000);
    return () => clearInterval(statusInterval);
  }, []);

  // Tick the clock local time every second
  useEffect(() => {
    if (!localTime) return;
    const tick = setInterval(() => {
      setLocalTime((prev) => new Date(prev.getTime() + 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [localTime]);

  const handleLogout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("email");
    sessionStorage.removeItem("phone");
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("email");
    localStorage.removeItem("phone");
    localStorage.removeItem("session_expiry");
    navigate("/");
  };

  const handleBypassToggle = (e) => {
    const bypass = e.target.checked;
    setAdminBypass(bypass);
    sessionStorage.setItem("admin_market_bypass", bypass ? "true" : "false");
  };

  const formatTime = (date) => {
    if (!date) return "";
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let seconds = date.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 is 12
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;
    return `${hours}:${minutes}:${seconds} ${ampm}`;
  };

  const formatDate = (date) => {
    if (!date) return "";
    return date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading && !statusData) {
    return (
      <div className="market-guard-loader">
        <div className="luxe-spinner" />
        <p>Verifying Market Session...</p>
        <style>{`
          .market-guard-loader {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            background: linear-gradient(135deg, #0f172a, #1e293b);
            color: #94a3b8;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
          }
          .luxe-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(59, 130, 246, 0.1);
            border-top-color: #3b82f6;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  const tradingHoursOpen = localTime ? isWithinTradingHours(localTime) : isOpen;
  const showApp = (tradingHoursOpen && isOpen) || (isAdmin && adminBypass);

  // If market is open, or bypassed by admin, allow access
  if (showApp) {
    return (
      <>
        {/* Subtle ribbon indicator for bypassed admin */}
        {isAdmin && adminBypass && (
          <div className="admin-bypass-ribbon">
            <FaUserShield style={{ marginRight: '6px' }} />
            <span>Admin Bypass Active — Outside Market Hours</span>
            <button onClick={() => {
              setAdminBypass(false);
              sessionStorage.setItem("admin_market_bypass", "false");
            }}>Lock Screen</button>
            <style>{`
              .admin-bypass-ribbon {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 36px;
                background: linear-gradient(90deg, #b45309, #d97706);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 13px;
                font-weight: 600;
                z-index: 999999;
                font-family: 'Inter', sans-serif;
                box-shadow: 0 2px 8px rgba(0,0,0,0.25);
              }
              .admin-bypass-ribbon button {
                margin-left: 12px;
                background: rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.4);
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 700;
                transition: all 0.2s;
              }
              .admin-bypass-ribbon button:hover {
                background: white;
                color: #b45309;
              }
              /* Offset application top if bypass banner is active */
              body {
                margin-top: 36px !important;
              }
            `}</style>
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="market-guard-fullscreen">
      <div className="ambient-glow" />
      <div className="glass-card">
        <div className="lock-icon-container">
          <div className="pulse-ring red" />
          <div className="pulse-ring amber" />
          <div className="icon-badge">
            <FaLock className="lock-icon" />
          </div>
        </div>

        <div className="market-badge">
          <span className="dot" />
          Market Closed
        </div>

        <h1 className="title">Session Suspended</h1>
        <p className="subtitle">
          The Indian Stock Market is currently closed. Trading operations are restricted outside market hours.
        </p>

        {error ? (
          <div className="error-alert">
            <p>{error}</p>
            <button className="btn-retry" onClick={checkMarketStatus}>
              <FaSyncAlt style={{ marginRight: '6px' }} /> Retry
            </button>
          </div>
        ) : (
          <>
            <div className="clock-section">
              <span className="clock-label">CURRENT MARKET TIME (IST)</span>
              <div className="time-display">{formatTime(localTime)}</div>
              <div className="date-display">{formatDate(localTime)}</div>
            </div>

            <div className="info-box">
              <div className="info-item">
                <span className="label">Trading Hours:</span>
                <span className="value">09:15 AM - 03:30 PM (IST)</span>
              </div>
              <div className="info-item">
                <span className="label">Trading Days:</span>
                <span className="value">Monday to Friday</span>
              </div>
              {statusData?.reason && (
                <div className="reason-alert">
                  <strong>Notice:</strong> {statusData.reason}
                </div>
              )}
            </div>
          </>
        )}

        <div className="actions-section">
          <button className="btn-action btn-refresh" onClick={checkMarketStatus}>
            <FaSyncAlt className="icon-spin-on-hover" /> Check Again
          </button>
          <button className="btn-action btn-logout" onClick={handleLogout}>
            <FaSignOutAlt /> Log Out
          </button>
        </div>

        {isAdmin && (
          <div className="admin-bypass-container">
            <div className="admin-divider" />
            <label className="bypass-switch-label">
              <FaUserShield className="admin-icon" />
              <span>Admin Mode Bypass</span>
              <div className="switch-wrapper">
                <input
                  type="checkbox"
                  checked={adminBypass}
                  onChange={handleBypassToggle}
                  className="bypass-checkbox"
                />
                <span className="switch-slider" />
              </div>
            </label>
          </div>
        )}
      </div>

      <style>{`
        .market-guard-fullscreen {
          min-height: 100vh;
          width: 100vw;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 50% 30%, #1e293b 0%, #0f172a 100%);
          color: #f8fafc;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          padding: 24px;
          box-sizing: border-box;
          position: fixed;
          inset: 0;
          z-index: 99999;
          overflow-y: auto;
        }

        .ambient-glow {
          position: absolute;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(239, 68, 68, 0.08) 0%, transparent 65%);
          top: 15%;
          left: 50%;
          transform: translateX(-50%);
          pointer-events: none;
          z-index: 0;
        }

        .glass-card {
          background: rgba(30, 41, 59, 0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 28px;
          width: 100%;
          max-width: 480px;
          padding: 40px 32px;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          position: relative;
          z-index: 10;
          animation: cardSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes cardSlideUp {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .lock-icon-container {
          position: relative;
          width: 80px;
          height: 80px;
          margin: 0 auto 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-badge {
          background: linear-gradient(135deg, #ef4444, #b91c1c);
          width: 64px;
          height: 64px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 16px rgba(239, 68, 68, 0.3);
          z-index: 2;
          transition: transform 0.3s ease;
        }

        .lock-icon-container:hover .icon-badge {
          transform: scale(1.08) rotate(-10deg);
        }

        .lock-icon {
          font-size: 24px;
          color: #ffffff;
        }

        .pulse-ring {
          position: absolute;
          border-radius: 50%;
          animation: pulse 3s ease-out infinite;
          z-index: 1;
          pointer-events: none;
        }

        .pulse-ring.red {
          width: 80px;
          height: 80px;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .pulse-ring.amber {
          width: 96px;
          height: 96px;
          border: 1px solid rgba(245, 158, 11, 0.15);
          animation-delay: 1.5s;
        }

        @keyframes pulse {
          0% {
            transform: scale(0.85);
            opacity: 1;
          }
          100% {
            transform: scale(1.3);
            opacity: 0;
          }
        }

        .market-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 20px;
        }

        .market-badge .dot {
          width: 6px;
          height: 6px;
          background-color: #ef4444;
          border-radius: 50%;
          animation: dotBlink 1.5s ease-in-out infinite;
        }

        @keyframes dotBlink {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }

        .title {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #f8fafc;
          margin: 0 0 10px;
        }

        .subtitle {
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.6;
          margin: 0 0 28px;
          padding: 0 10px;
        }

        .clock-section {
          background: rgba(15, 23, 42, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 18px;
          padding: 20px;
          margin-bottom: 24px;
        }

        .clock-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.1em;
          display: block;
          margin-bottom: 6px;
        }

        .time-display {
          font-size: 32px;
          font-weight: 800;
          color: #3b82f6;
          letter-spacing: -0.01em;
          font-family: 'Courier New', Courier, monospace;
          text-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
          margin-bottom: 4px;
        }

        .date-display {
          font-size: 13px;
          color: #cbd5e1;
          font-weight: 500;
        }

        .info-box {
          text-align: left;
          background: rgba(15, 23, 42, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 18px;
          padding: 20px;
          margin-bottom: 32px;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .info-item:last-of-type {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }

        .info-item .label {
          color: #64748b;
          font-weight: 500;
        }

        .info-item .value {
          color: #e2e8f0;
          font-weight: 600;
        }

        .reason-alert {
          margin-top: 14px;
          background: rgba(245, 158, 11, 0.1);
          border-left: 3px solid #f59e0b;
          color: #fcd34d;
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 12.5px;
          line-height: 1.5;
        }

        .error-alert {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fca5a5;
          padding: 16px;
          border-radius: 16px;
          margin-bottom: 24px;
          font-size: 13.5px;
        }

        .btn-retry {
          margin-top: 12px;
          background: #ef4444;
          color: white;
          border: none;
          padding: 6px 16px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s;
        }

        .btn-retry:hover {
          background: #dc2626;
        }

        .actions-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .btn-action {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 48px;
          border-radius: 14px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          border: 1px solid transparent;
        }

        .btn-refresh {
          background: #3b82f6;
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
        }

        .btn-refresh:hover {
          background: #2563eb;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
        }

        .icon-spin-on-hover {
          transition: transform 0.4s ease;
        }

        .btn-refresh:hover .icon-spin-on-hover {
          transform: rotate(180deg);
        }

        .btn-logout {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
        }

        .btn-logout:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #f8fafc;
          transform: translateY(-2px);
        }

        .admin-bypass-container {
          margin-top: 28px;
        }

        .admin-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
          margin-bottom: 20px;
        }

        .bypass-switch-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          font-weight: 600;
          color: #f59e0b;
          cursor: pointer;
          background: rgba(245, 158, 11, 0.05);
          border: 1px solid rgba(245, 158, 11, 0.15);
          padding: 10px 16px;
          border-radius: 12px;
        }

        .admin-icon {
          font-size: 16px;
          margin-right: 2px;
        }

        .switch-wrapper {
          position: relative;
          width: 44px;
          height: 24px;
        }

        .bypass-checkbox {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .switch-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          transition: 0.3s;
          border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .switch-slider:before {
          position: absolute;
          content: "";
          height: 16px;
          width: 16px;
          left: 3px;
          bottom: 3px;
          background-color: #94a3b8;
          border-radius: 50%;
          transition: 0.3s;
        }

        .bypass-checkbox:checked + .switch-slider {
          background-color: #d97706;
          border-color: #f59e0b;
        }

        .bypass-checkbox:checked + .switch-slider:before {
          transform: translateX(20px);
          background-color: #ffffff;
          box-shadow: 0 0 8px #f59e0b;
        }
      `}</style>
    </div>
  );
}
