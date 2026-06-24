import { createContext, useEffect, useState } from "react";

export const ToastContext = createContext(null);

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

function getServices() {
  try {
    const saved = localStorage.getItem("paper_trading_services");

    if (!saved) return defaultServices;

    return {
      ...defaultServices,
      ...JSON.parse(saved),
    };
  } catch {
    return defaultServices;
  }
}

function shouldShowToast(message) {
  const services = getServices();
  const text = String(message || "").toLowerCase();

  const isOrderAlert =
    text.includes("buy") ||
    text.includes("sell") ||
    text.includes("order") ||
    text.includes("trade");

  const isRejectedAlert =
    text.includes("failed") ||
    text.includes("rejected") ||
    text.includes("not enough") ||
    text.includes("insufficient") ||
    text.includes("unable");

  const isPortfolioAlert =
    text.includes("portfolio") ||
    text.includes("holding") ||
    text.includes("reset");

  const isPriceAlert =
    text.includes("ltp") ||
    text.includes("price") ||
    text.includes("refresh");

  if (isRejectedAlert && !services.rejectedOrderAlerts) return false;
  if (isOrderAlert && !services.orderAlerts) return false;
  if (isPortfolioAlert && !services.portfolioAlerts) return false;
  if (isPriceAlert && !services.priceAlerts) return false;

  return true;
}

function playSoundIfEnabled() {
  const services = getServices();

  if (!services.soundAlerts) return;

  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.frequency.value = 780;
    oscillator.type = "sine";

    gain.gain.setValueAtTime(0.08, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.18
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.18);
  } catch {
    // Browser may block sound until user interaction. Safe to ignore.
  }
}

function getToastType(message) {
  const text = String(message || "").toLowerCase();

  if (
    text.includes("failed") ||
    text.includes("rejected") ||
    text.includes("not enough") ||
    text.includes("insufficient") ||
    text.includes("unable") ||
    text.includes("invalid")
  ) {
    return "error";
  }

  if (
    text.includes("success") ||
    text.includes("executed") ||
    text.includes("added") ||
    text.includes("updated") ||
    text.includes("cancelled")
  ) {
    return "success";
  }

  if (
    text.includes("warning") ||
    text.includes("risk") ||
    text.includes("pending")
  ) {
    return "warning";
  }

  return "info";
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = null) => {
    if (!shouldShowToast(message)) return;

    const id = Date.now() + Math.random();
    const toastType = type || getToastType(message);

    setToasts((prev) => [
      ...prev,
      {
        id,
        message: String(message),
        type: toastType,
      },
    ]);

    playSoundIfEnabled();

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3500);
  };

  useEffect(() => {
    window.showToast = showToast;

    const originalAlert = window.alert;

    window.alert = (message) => {
      showToast(message);
    };

    return () => {
      window.alert = originalAlert;
      delete window.showToast;
    };
     
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            onClick={() => removeToast(toast.id)}
          >
            <div className="toast-icon">
              {toast.type === "success"
                ? "✓"
                : toast.type === "error"
                ? "!"
                : toast.type === "warning"
                ? "⚠"
                : "i"}
            </div>

            <div className="toast-message">{toast.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;