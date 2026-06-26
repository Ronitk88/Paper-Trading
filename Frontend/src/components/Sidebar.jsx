import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FaBell,
  FaBook,
  FaChartArea,
  FaChartLine,
  FaCog,
  FaDatabase,
  FaDownload,
  FaFlask,
  FaHome,
  FaList,
  FaMoneyBillWave,
  FaShieldAlt,
  FaSignOutAlt,
  FaStar,
  FaUserShield,
  FaWallet,
} from "react-icons/fa";

import api from "../api/api";
import LogoutModal from "./LogoutModal";

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [cashBalance, setCashBalance] = useState(0);
  const [isAdmin, setIsAdmin] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    const handleToggle = () => setIsOpen((prev) => !prev);
    const handleClose = () => setIsOpen(false);

    window.addEventListener("toggle-sidebar", handleToggle);
    window.addEventListener("close-sidebar", handleClose);

    return () => {
      window.removeEventListener("toggle-sidebar", handleToggle);
      window.removeEventListener("close-sidebar", handleClose);
    };
  }, []);

  useEffect(() => {
    loadCashBalance();
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const res = await api.get("/auth/me");
      setIsAdmin(res.data?.is_admin === true);
    } catch {
      setIsAdmin(false);
    }
  };

  const loadCashBalance = async () => {
    try {
      const res = await api.get("/portfolio/");
      setCashBalance(res.data?.cash_balance || 0);
    } catch (err) {
      console.error("Sidebar portfolio load failed:", err);
      setCashBalance(0);
    }
  };

  const formatMoney = (value) => {
    return Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  };

  const handleItemClick = (path) => {
    navigate(path);
    setIsOpen(false);
  };

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
    setIsOpen(false);
  };

  const handleLogoutNow = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("email");
    sessionStorage.removeItem("phone");

    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("email");
    localStorage.removeItem("phone");
    localStorage.removeItem("session_expiry");

    setShowLogoutModal(false);
    navigate("/");
  };

  const handleStayLoggedIn = (selectedTimestamp) => {
    const token = sessionStorage.getItem("token") || localStorage.getItem("token");
    const username = sessionStorage.getItem("username") || localStorage.getItem("username");
    const email = sessionStorage.getItem("email") || localStorage.getItem("email");
    const phone = sessionStorage.getItem("phone") || localStorage.getItem("phone");

    localStorage.setItem("token", token || "");
    localStorage.setItem("username", username || "");
    localStorage.setItem("email", email || "");
    localStorage.setItem("phone", phone || "");
    localStorage.setItem("session_expiry", String(selectedTimestamp));

    setShowLogoutModal(false);
    alert(`Session will remain active until: ${new Date(selectedTimestamp).toLocaleString("en-IN")}`);
  };

  const menuItems = [
    {
      label: "Dashboard",
      path: "/dashboard",
      icon: <FaHome />,
    },
    {
      label: "Stocks",
      path: "/stocks",
      icon: <FaChartLine />,
    },
    {
      label: "Watchlist",
      path: "/watchlist",
      icon: <FaStar />,
    },
    {
      label: "Portfolio",
      path: "/portfolio",
      icon: <FaWallet />,
    },
    {
      label: "Orders",
      path: "/orders",
      icon: <FaList />,
    },
    {
      label: "Transactions",
      path: "/transactions",
      icon: <FaMoneyBillWave />,
    },
    {
      label: "Analytics",
      path: "/analytics",
      icon: <FaChartArea />,
    },
    {
      label: "Equity Curve",
      path: "/equity-curve",
      icon: <FaChartArea />,
    },
    {
      label: "Journal",
      path: "/journal",
      icon: <FaBook />,
    },
    {
      label: "Reports",
      path: "/reports",
      icon: <FaDownload />,
    },
    {
      label: "Backtesting",
      path: "/strategy-backtesting",
      icon: <FaFlask />,
    },
    {
      label: "Services",
      path: "/services",
      icon: <FaBell />,
    },
    {
      label: "Settings",
      path: "/settings",
      icon: <FaCog />,
    },
    ...(isAdmin === true
      ? [
          {
            label: "Admin",
            path: "/admin",
            icon: <FaUserShield />,
          },
        ]
      : []),
  ];

  const isActive = (path) => {
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }

    return location.pathname.startsWith(path);
  };

  return (
    <>
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(4px)",
            zIndex: 99990,
          }}
        />
      )}
      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <div
            className="logo"
            onClick={() => handleItemClick("/dashboard")}
            style={{ cursor: "pointer" }}
          >
            <FaShieldAlt style={{ marginRight: "8px" }} />
            PaperTrade Pro
          </div>

          <ul>
            {menuItems.map((item) => (
              <li
                key={item.path}
                className={isActive(item.path) ? "active" : ""}
                onClick={() => handleItemClick(item.path)}
              >
                {item.icon}
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-footer">
          <div className="cash-box">
            <div>
              <p>Available Cash</p>
              <h3>₹{formatMoney(cashBalance)}</h3>
            </div>

            <div>
              <p>Mode</p>
              <h4>Paper Trading</h4>
            </div>
          </div>

          <button className="logout-btn" onClick={handleLogoutClick}>
            <FaSignOutAlt style={{ marginRight: "8px" }} />
            Logout
          </button>
        </div>
      </aside>

      <LogoutModal
        open={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onLogoutNow={handleLogoutNow}
        onStayLoggedIn={handleStayLoggedIn}
      />
    </>
  );
}

export default Sidebar;
