import { useEffect, useMemo, useState } from "react";
import {
  FaBell,
  FaBellSlash,
  FaChartLine,
  FaEnvelope,
  FaExclamationTriangle,
  FaRedo,
  FaShieldAlt,
  FaVolumeUp,
} from "react-icons/fa";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import api from "../api/api";

const defaultServices = {
  orderAlerts: true,
  rejectedOrderAlerts: true,
  portfolioAlerts: true,
  priceAlerts: true,
  dailySummary: true,
  riskWarnings: true,
  emailNotifications: false,
  soundAlerts: true,
};

const serviceLabelMap = {
  orderAlerts: "Order alerts",
  rejectedOrderAlerts: "Rejected order alerts",
  portfolioAlerts: "Portfolio alerts",
  priceAlerts: "Price alerts",
  dailySummary: "Daily summary",
  riskWarnings: "Risk warnings",
  emailNotifications: "Email notifications",
  soundAlerts: "Sound alerts",
};

const frontendKeyToBackendKey = {
  orderAlerts: "order_alerts",
  rejectedOrderAlerts: "rejected_order_alerts",
  portfolioAlerts: "portfolio_alerts",
  priceAlerts: "price_alerts",
  dailySummary: "daily_summary",
  riskWarnings: "risk_warnings",
  emailNotifications: "email_notifications",
  soundAlerts: "sound_alerts",
};

function Services() {
  const [services, setServices] = useState(defaultServices);

  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  const [dailyReport, setDailyReport] = useState({
    portfolioValue: 0,
    cashBalance: 0,
    totalPnl: 0,
    totalOrders: 0,
    executedOrders: 0,
    rejectedOrders: 0,
    totalTransactions: 0,
    buyTrades: 0,
    sellTrades: 0,
  });

  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    loadServicePreferences();
    loadDailyReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backendToFrontend = (data) => {
    return {
      orderAlerts: data?.order_alerts ?? true,
      rejectedOrderAlerts: data?.rejected_order_alerts ?? true,
      portfolioAlerts: data?.portfolio_alerts ?? true,
      priceAlerts: data?.price_alerts ?? true,
      dailySummary: data?.daily_summary ?? true,
      riskWarnings: data?.risk_warnings ?? true,
      emailNotifications: data?.email_notifications ?? false,
      soundAlerts: data?.sound_alerts ?? true,
    };
  };

  const saveToLocalServiceCache = (values) => {
    localStorage.setItem("paper_trading_services", JSON.stringify(values));
  };

  const loadServicePreferences = async () => {
    try {
      setLoadingPreferences(true);

      const res = await api.get("/services/preferences");
      const frontendValues = backendToFrontend(res.data);

      setServices(frontendValues);
      saveToLocalServiceCache(frontendValues);
    } catch (err) {
      console.error("Backend service preference load failed:", err);

      const saved = localStorage.getItem("paper_trading_services");

      if (saved) {
        setServices({
          ...defaultServices,
          ...JSON.parse(saved),
        });
      } else {
        setServices(defaultServices);
        saveToLocalServiceCache(defaultServices);
      }

      alert(
        "Unable to load service preferences from backend. Using local preferences for now."
      );
    } finally {
      setLoadingPreferences(false);
    }
  };

  const loadDailyReport = async () => {
    try {
      setLoadingReport(true);

      const [portfolioRes, ordersRes, transactionsRes] = await Promise.all([
        api.get("/portfolio/"),
        api.get("/orders/summary"),
        api.get("/transactions/"),
      ]);

      const txs = Array.isArray(transactionsRes.data) ? transactionsRes.data : [];

      setDailyReport({
        portfolioValue: portfolioRes.data?.total_value || 0,
        cashBalance: portfolioRes.data?.cash_balance || 0,
        totalPnl: portfolioRes.data?.total_pnl || 0,
        totalOrders: ordersRes.data?.total_orders || 0,
        executedOrders: ordersRes.data?.executed_orders || 0,
        rejectedOrders: ordersRes.data?.rejected_orders || 0,
        totalTransactions: txs.length,
        buyTrades: txs.filter((tx) => tx.transaction_type === "BUY").length,
        sellTrades: txs.filter((tx) => tx.transaction_type === "SELL").length,
      });
    } catch (err) {
      console.error("Daily report load failed:", err);
    } finally {
      setLoadingReport(false);
    }
  };

  const formatMoney = (value) => {
    return Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const updateService = async (key) => {
    const backendKey = frontendKeyToBackendKey[key];

    if (!backendKey) {
      alert("Invalid service setting.");
      return;
    }

    const previousValues = services;
    const optimisticValues = {
      ...services,
      [key]: !services[key],
    };

    try {
      setSavingKey(key);
      setServices(optimisticValues);
      saveToLocalServiceCache(optimisticValues);

      const res = await api.patch("/services/preferences", {
        [backendKey]: optimisticValues[key],
      });

      const updatedValues = backendToFrontend(res.data);

      setServices(updatedValues);
      saveToLocalServiceCache(updatedValues);

      alert(
        `${serviceLabelMap[key] || "Service"} ${
          updatedValues[key] ? "enabled" : "disabled"
        }.`
      );
    } catch (err) {
      console.error("Service update failed:", err);

      setServices(previousValues);
      saveToLocalServiceCache(previousValues);

      alert(err?.response?.data?.detail || "Unable to update service setting.");
    } finally {
      setSavingKey(null);
    }
  };

  const enableAllServices = async () => {
    const enabledValues = {
      orderAlerts: true,
      rejectedOrderAlerts: true,
      portfolioAlerts: true,
      priceAlerts: true,
      dailySummary: true,
      riskWarnings: true,
      emailNotifications: false,
      soundAlerts: true,
    };

    try {
      setSavingKey("all");

      const res = await api.patch("/services/preferences", {
        order_alerts: true,
        rejected_order_alerts: true,
        portfolio_alerts: true,
        price_alerts: true,
        daily_summary: true,
        risk_warnings: true,
        email_notifications: false,
        sound_alerts: true,
      });

      const updatedValues = backendToFrontend(res.data);

      setServices(updatedValues);
      saveToLocalServiceCache(updatedValues);

      alert("All available services enabled. Email notifications will be connected after SMTP setup.");
    } catch (err) {
      console.error("Enable all services failed:", err);

      setServices(enabledValues);
      saveToLocalServiceCache(enabledValues);

      alert("Backend update failed, but frontend service cache has been enabled.");
    } finally {
      setSavingKey(null);
    }
  };

  const playTestSound = () => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        /** @type {typeof AudioContext} */ (window).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.frequency.value = 880;
      oscillator.type = "sine";

      gain.gain.setValueAtTime(0.08, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.25);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.25);

      alert("Sound alert tested successfully.");
    } catch {
      alert("Browser blocked sound. Click anywhere on page and try again.");
    }
  };

  const requestBrowserNotification = async () => {
    try {
      if (typeof Notification === "undefined") {
        alert("Browser notifications are not supported.");
        return;
      }

      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === "granted") {
        new Notification("Paper Trading Notifications Enabled", {
          body: "You will receive browser alerts while the app is open.",
        });

        alert("Browser notifications enabled.");
      } else {
        alert("Browser notification permission was not granted.");
      }
    } catch (err) {
      console.error(err);
      alert("Unable to enable browser notifications.");
    }
  };

  const sendTestNotification = () => {
    if (typeof Notification === "undefined") {
      alert("Browser notifications are not supported.");
      return;
    }

    if (Notification.permission !== "granted") {
      alert("Please enable browser notifications first.");
      return;
    }

    new Notification("Paper Trading Test Alert", {
      body: "This is how order, price, and portfolio alerts can appear.",
    });

    alert("Test browser notification sent.");
  };

  const activeServiceCount = useMemo(() => {
    return Object.values(services).filter(Boolean).length;
  }, [services]);

  const serviceRows = [
    {
      key: "orderAlerts",
      icon: <FaBell />,
      title: "Order Execution Alerts",
      desc: "Alerts when buy or sell paper orders are placed, executed, or updated.",
      functional: "Connected to app notification preferences",
    },
    {
      key: "rejectedOrderAlerts",
      icon: <FaExclamationTriangle />,
      title: "Rejected Order Alerts",
      desc: "Alerts for rejected trades, failed execution, and insufficient balance cases.",
      functional: "Useful for improving order quality",
    },
    {
      key: "portfolioAlerts",
      icon: <FaChartLine />,
      title: "Portfolio Movement Alerts",
      desc: "Controls portfolio update messages, holding changes, and account refresh alerts.",
      functional: "Linked to portfolio activity settings",
    },
    {
      key: "priceAlerts",
      icon: <FaChartLine />,
      title: "Price Alert Service",
      desc: "Controls LTP refresh messages and future custom stock price alerts.",
      functional: "Prepared for price alert workflows",
    },
    {
      key: "dailySummary",
      icon: <FaShieldAlt />,
      title: "Daily Trading Summary",
      desc: "Shows a daily account summary based on portfolio, orders, and transactions.",
      functional: "Live daily report available below",
    },
    {
      key: "riskWarnings",
      icon: <FaExclamationTriangle />,
      title: "Risk Warning Service",
      desc: "Keeps warnings visible for risky trades, rejected orders, and exposure insights.",
      functional: "Recommended to keep enabled",
    },
    {
      key: "emailNotifications",
      icon: <FaEnvelope />,
      title: "Email Notifications",
      desc: "Controls SMTP-based email alerts for order, portfolio, risk, and account notifications.",
      functional: "SMTP email delivery connected. Preference is saved to your account.",
    },
    {
      key: "soundAlerts",
      icon: <FaVolumeUp />,
      title: "Sound Alerts",
      desc: "Plays a short sound when supported alerts are shown in the browser.",
      functional: "Test sound available above",
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
              <p className="pro-eyebrow">Notification Control Center</p>

              <h1>
                Platform <span>Services</span>
              </h1>

              <p>
                Manage alerts, browser notifications, sound feedback, risk warnings,
                email preference, and daily trading summaries from one professional
                service center.
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
                  {activeServiceCount} Active Services
                </span>

                <span className="status-pill status-warning">
                  Browser: {notificationPermission}
                </span>

                <span className="status-pill status-success">
                  Backend Preferences
                </span>
              </div>
            </div>

            <div className="pro-hero-actions">
              <div className="pro-status-card">
                <span className="status-pill status-success">Services Ready</span>
                <p>Preferences are saved to your account</p>
              </div>

              <button
                className="primary-action"
                onClick={loadServicePreferences}
                disabled={loadingPreferences}
              >
                <FaRedo style={{ marginRight: "8px" }} />
                {loadingPreferences ? "Loading..." : "Refresh Preferences"}
              </button>

              <button
                className="primary-action"
                onClick={enableAllServices}
                disabled={savingKey === "all"}
              >
                {savingKey === "all" ? "Saving..." : "Enable All"}
              </button>
            </div>
          </div>

          <div className="pro-kpi-grid">
            <div className="pro-kpi-card">
              <p>Active Services</p>
              <h2>{activeServiceCount}</h2>
              <span className="pro-muted">Enabled alert preferences</span>
            </div>

            <div className="pro-kpi-card">
              <p>Browser Permission</p>
              <h2>{notificationPermission}</h2>
              <span className="pro-muted">Chrome notification status</span>
            </div>

            <div className="pro-kpi-card">
              <p>Sound Alerts</p>
              <h2>{services.soundAlerts ? "On" : "Off"}</h2>
              <span className="pro-muted">Audio feedback setting</span>
            </div>

            <div className="pro-kpi-card">
              <p>Daily Summary</p>
              <h2>{services.dailySummary ? "On" : "Off"}</h2>
              <span className="pro-muted">Trading report visibility</span>
            </div>
          </div>

          <div className="pro-dashboard-grid">
            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Notification Testing</h2>
                  <p>Check browser permissions and sound feedback before using alerts.</p>
                </div>
              </div>

              <div className="market-card-list">
                <button
                  type="button"
                  className="market-card-item market-clickable"
                  onClick={playTestSound}
                >
                  <span>Sound Test</span>
                  <strong>Play Alert</strong>
                </button>

                <button
                  type="button"
                  className="market-card-item market-clickable"
                  onClick={requestBrowserNotification}
                >
                  <span>Browser Permission</span>
                  <strong>Enable Alerts</strong>
                </button>

                <button
                  type="button"
                  className="market-card-item market-clickable"
                  onClick={sendTestNotification}
                >
                  <span>Test Browser Alert</span>
                  <strong>Send Test</strong>
                </button>
              </div>
            </div>

            <div className="pro-panel">
              <div className="pro-panel-header">
                <div>
                  <h2>Service Health</h2>
                  <p>Current state of communication and app-level alert systems.</p>
                </div>
              </div>

              <div className="activity-grid">
                <div>
                  <p>Order Alerts</p>
                  <h3 className={services.orderAlerts ? "pro-positive" : "pro-negative"}>
                    {services.orderAlerts ? "On" : "Off"}
                  </h3>
                </div>

                <div>
                  <p>Risk Warnings</p>
                  <h3 className={services.riskWarnings ? "pro-positive" : "pro-negative"}>
                    {services.riskWarnings ? "On" : "Off"}
                  </h3>
                </div>

                <div>
                  <p>Email Preference</p>
                  <h3 className={services.emailNotifications ? "pro-positive" : ""}>
                    {services.emailNotifications ? "On" : "Off"}
                  </h3>
                </div>

                <div>
                  <p>Browser Alerts</p>
                  <h3>{notificationPermission}</h3>
                </div>
              </div>
            </div>
          </div>

          <div className="table-card" style={{ marginTop: "30px" }}>
            <div className="pro-panel-header">
              <div>
                <h2>Functional Notification Controls</h2>
                <p>
                  These toggles control how alerts behave in the app and are saved
                  to your backend account preferences.
                </p>
              </div>
            </div>

            <div className="market-card-list">
              {serviceRows.map((item) => (
                <div className="market-card-item" key={item.key}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "14px",
                    }}
                  >
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "14px",
                        background:
                          item.disabledUntilBackend || services[item.key]
                            ? "#eff6ff"
                            : "#f8fafc",
                        color:
                          item.disabledUntilBackend || services[item.key]
                            ? "#2563eb"
                            : "#94a3b8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </div>

                    <div>
                      <strong>{item.title}</strong>

                      <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                        {item.desc}
                      </p>

                      <p
                        style={{
                          margin: "6px 0 0",
                          color: item.disabledUntilBackend
                            ? "#2563eb"
                            : services[item.key]
                            ? "#16a34a"
                            : "#ca8a04",
                          fontWeight: "800",
                        }}
                      >
                        {item.functional}
                      </p>
                    </div>
                  </div>

                  <button
                    className={
                      item.disabledUntilBackend
                        ? "warning-action"
                        : services[item.key]
                        ? "primary-action"
                        : "warning-action"
                    }
                    onClick={() => {
                      if (!item.disabledUntilBackend) {
                        updateService(item.key);
                      }
                    }}
                    disabled={item.disabledUntilBackend || savingKey === item.key}
                    style={{
                      opacity: item.disabledUntilBackend || savingKey === item.key ? 0.75 : 1,
                      cursor:
                        item.disabledUntilBackend || savingKey === item.key
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {item.disabledUntilBackend ? (
                      <>
                        <FaEnvelope style={{ marginRight: "7px" }} /> SMTP Pending
                      </>
                    ) : savingKey === item.key ? (
                      "Saving..."
                    ) : services[item.key] ? (
                      <>
                        <FaBell style={{ marginRight: "7px" }} /> Enabled
                      </>
                    ) : (
                      <>
                        <FaBellSlash style={{ marginRight: "7px" }} /> Disabled
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {services.dailySummary && (
            <div className="table-card" style={{ marginTop: "30px" }}>
              <div className="pro-panel-header">
                <div>
                  <h2>Daily Trading Report</h2>
                  <p>
                    Live summary generated from your portfolio, orders, and
                    transactions.
                  </p>
                </div>

                <button
                  className="primary-action"
                  onClick={loadDailyReport}
                  disabled={loadingReport}
                >
                  {loadingReport ? "Refreshing..." : "Refresh Report"}
                </button>
              </div>

              <div className="dashboard-cards">
                <div className="stat-card">
                  <h4>Portfolio Value</h4>
                  <h2>₹{formatMoney(dailyReport.portfolioValue)}</h2>
                </div>

                <div className="stat-card">
                  <h4>Cash Balance</h4>
                  <h2>₹{formatMoney(dailyReport.cashBalance)}</h2>
                </div>

                <div className="stat-card">
                  <h4>Total P&amp;L</h4>
                  <h2
                    className={
                      Number(dailyReport.totalPnl || 0) >= 0
                        ? "pro-positive"
                        : "pro-negative"
                    }
                  >
                    ₹{formatMoney(dailyReport.totalPnl)}
                  </h2>
                </div>

                <div className="stat-card">
                  <h4>Executed Orders</h4>
                  <h2>{dailyReport.executedOrders}</h2>
                </div>

                <div className="stat-card">
                  <h4>Rejected Orders</h4>
                  <h2 className="pro-negative">{dailyReport.rejectedOrders}</h2>
                </div>

                <div className="stat-card">
                  <h4>Buy / Sell Trades</h4>
                  <h2>
                    {dailyReport.buyTrades} / {dailyReport.sellTrades}
                  </h2>
                </div>
              </div>
            </div>
          )}

          <div className="footer-note">
            Service preferences are saved to your account and cached locally. Browser
            notifications work only after Chrome permission is granted. Email
            notifications require valid SMTP credentials in backend .env.
          </div>
        </div>
      </div>
    </div>
  );
}

export default Services;
