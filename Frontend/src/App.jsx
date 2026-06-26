import { useEffect } from "react";
import api from "./api/api";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ToastProvider from "./components/ToastProvider";
import ConfirmProvider from "./components/ConfirmProvider";
import ErrorBoundary from "./components/ErrorBoundary";

import "./styles/dashboard.css";
import "./styles/mobile-polish.css";
import "./styles/animations.css";
import "./styles/login.css";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Stocks = lazy(() => import("./pages/Stocks"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const StockDetails = lazy(() => import("./pages/StockDetails"));
const Orders = lazy(() => import("./pages/Orders"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Services = lazy(() => import("./pages/Services"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const TradingJournal = lazy(() => import("./pages/TradingJournal"));
const Reports = lazy(() => import("./pages/Reports"));
const EquityCurve = lazy(() => import("./pages/EquityCurve"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const StrategyBacktesting = lazy(() => import("./pages/StrategyBacktesting"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageLoader() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "24px",
        background:
          "radial-gradient(circle at 30% 20%, rgba(37,99,235,0.08), transparent 40%), radial-gradient(circle at 70% 80%, rgba(124,58,237,0.06), transparent 35%), linear-gradient(135deg, #f8fafc, #eef4ff)",
      }}
    >
      {/* Premium loader ring */}
      <div
        style={{
          position: "relative",
          width: "48px",
          height: "48px",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "3px solid rgba(37,99,235,0.1)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "3px solid transparent",
            borderTopColor: "#2563eb",
            borderRightColor: "#7c3aed",
            animation: "luxeSpin 0.9s cubic-bezier(0.16, 1, 0.3, 1) infinite",
          }}
        />
      </div>

      {/* Loading dots */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          alignItems: "center",
        }}
      >
        <span
          style={{
            color: "#64748b",
            fontWeight: "800",
            fontSize: "15px",
            letterSpacing: "0.02em",
          }}
        >
          Loading
        </span>
        <span style={{ display: "flex", gap: "3px" }}>
          <span style={dotStyle(0)} />
          <span style={dotStyle(0.15)} />
          <span style={dotStyle(0.3)} />
        </span>
      </div>

      <style>{`
        @keyframes luxeSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

const dotStyle = (delay) => ({
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  background: "#94a3b8",
  display: "inline-block",
  animation: `dotPulse 1.2s cubic-bezier(0.16, 1, 0.3, 1) infinite`,
  animationDelay: `${delay}s`,
});

function ProtectedRoute({ children }) {
  const token = sessionStorage.getItem("token") || localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function PublicRoute({ children }) {
  const token = sessionStorage.getItem("token") || localStorage.getItem("token");

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function App() {
  useMemo(() => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      const localToken = localStorage.getItem("token");
      const expiry = localStorage.getItem("session_expiry");
      if (localToken && expiry) {
        const expTime = Number(expiry);
        if (Date.now() < expTime) {
          // Restore session to sessionStorage
          sessionStorage.setItem("token", localToken);
          sessionStorage.setItem("username", localStorage.getItem("username") || "");
          sessionStorage.setItem("email", localStorage.getItem("email") || "");
          sessionStorage.setItem("phone", localStorage.getItem("phone") || "");
        } else {
          // Session expired
          localStorage.removeItem("token");
          localStorage.removeItem("username");
          localStorage.removeItem("email");
          localStorage.removeItem("phone");
          localStorage.removeItem("session_expiry");
        }
      }
    }
  }, []);

  useEffect(() => {
    api.get("/health").catch(() => {});
  }, []);
  
  return (
    <ToastProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <ErrorBoundary>
              <Routes>
                <Route
                  path="/"
                  element={
                    <PublicRoute>
                      <Login />
                    </PublicRoute>
                  }
                />

                <Route
                  path="/login"
                  element={
                    <PublicRoute>
                      <Login />
                    </PublicRoute>
                  }
                />

                <Route path="/reset-password" element={<ResetPassword />} />

                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/stocks"
                  element={
                    <ProtectedRoute>
                      <Stocks />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/stocks/:symbol"
                  element={
                    <ProtectedRoute>
                      <StockDetails />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/watchlist"
                  element={
                    <ProtectedRoute>
                      <Watchlist />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/portfolio"
                  element={
                    <ProtectedRoute>
                      <Portfolio />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/transactions"
                  element={
                    <ProtectedRoute>
                      <Transactions />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/orders"
                  element={
                    <ProtectedRoute>
                      <Orders />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/analytics"
                  element={
                    <ProtectedRoute>
                      <Analytics />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/journal"
                  element={
                    <ProtectedRoute>
                      <TradingJournal />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute>
                      <Reports />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/strategy-backtesting"
                  element={
                    <ProtectedRoute>
                      <StrategyBacktesting />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/equity-curve"
                  element={
                    <ProtectedRoute>
                      <EquityCurve />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/services"
                  element={
                    <ProtectedRoute>
                      <Services />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  }
                />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </Suspense>
        </BrowserRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
