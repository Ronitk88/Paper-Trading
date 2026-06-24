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

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [cashBalance, setCashBalance] = useState(0);
  const [isAdmin, setIsAdmin] = useState(null);

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

  const logout = () => {
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
    <aside className="sidebar">
      <div className="sidebar-top">
        <div
          className="logo"
          onClick={() => navigate("/dashboard")}
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
              onClick={() => navigate(item.path)}
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

        <button className="logout-btn" onClick={logout}>
          <FaSignOutAlt style={{ marginRight: "8px" }} />
          Logout
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
