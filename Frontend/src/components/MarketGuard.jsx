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

  return <>{children}</>;
}
