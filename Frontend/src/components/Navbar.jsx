import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaBell, FaCalendarAlt, FaSearch, FaUserCog } from "react-icons/fa";
import LiveMarketTicker from "./LiveMarketTicker";
import MobileBottomNav from "./MobileBottomNav";
import api from "../api/api";

function Navbar() {
  const navigate = useNavigate();
  const searchRef = useRef(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const formatName = (name) => {
    if (!name) return "Trader";

    return name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const username = formatName(
    localStorage.getItem("username") ||
      sessionStorage.getItem("username") ||
      "Trader"
  );

  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  useEffect(() => {
    const cleanQuery = query.trim();

    if (cleanQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true);

        const res = await api.get("/stocks/search", {
          params: {
            q: cleanQuery,
            limit: 6,
          },
        });

        setSuggestions(Array.isArray(res.data) ? res.data : []);
        setShowSuggestions(true);
      } catch (error) {
        console.error("Navbar search failed:", error);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();

    const cleanQuery = query.trim();

    if (!cleanQuery) {
      navigate("/stocks");
      return;
    }

    setShowSuggestions(false);
    navigate(`/stocks?search=${encodeURIComponent(cleanQuery)}`);
  };

  const openStock = (stock) => {
    if (!stock?.symbol) return;

    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);

    navigate(`/stocks/${encodeURIComponent(stock.symbol)}`);
  };

  return (
    <>
      <div className="navbar">
        <div className="navbar-ticker-wrap">
          <LiveMarketTicker variant="strip" />
        </div>

        <form
          className="search-box"
          onSubmit={handleSearch}
          ref={searchRef}
          style={{ position: "relative" }}
        >
          <FaSearch
            style={{
              position: "absolute",
              left: "16px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#94a3b8",
              fontSize: "14px",
              zIndex: 2,
            }}
          />

          <input
            type="text"
            placeholder="Search stocks, e.g. TCS, INFY, RELIANCE..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            style={{
              paddingLeft: "42px",
            }}
          />

          {showSuggestions && (
            <div
              style={{
                position: "absolute",
                top: "52px",
                left: 0,
                right: 0,
                background: "rgba(255, 255, 255, 0.98)",
                border: "1px solid #e5e7eb",
                borderRadius: "18px",
                boxShadow: "0 24px 70px rgba(15, 23, 42, 0.16)",
                overflow: "hidden",
                zIndex: 20000,
                backdropFilter: "blur(18px)",
              }}
            >
              {searchLoading ? (
                <div
                  style={{
                    padding: "16px",
                    color: "#64748b",
                    fontWeight: "800",
                  }}
                >
                  Searching stocks...
                </div>
              ) : suggestions.length > 0 ? (
                suggestions.map((stock) => (
                  <button
                    key={`${stock.exchange}-${stock.token}-${stock.symbol}`}
                    type="button"
                    onClick={() => openStock(stock)}
                    style={{
                      width: "100%",
                      border: "none",
                      background: "transparent",
                      padding: "14px 16px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "14px",
                      alignItems: "center",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f8fbff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div>
                      <strong style={{ color: "#0f172a" }}>
                        {stock.symbol}
                      </strong>

                      <p
                        style={{
                          margin: "4px 0 0",
                          color: "#64748b",
                          fontSize: "13px",
                        }}
                      >
                        {stock.name || "Stock Instrument"}
                      </p>
                    </div>

                    <span
                      className="status-pill status-success"
                      style={{
                        fontSize: "12px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {stock.exchange || "-"}
                    </span>
                  </button>
                ))
              ) : (
                <div
                  style={{
                    padding: "16px",
                    color: "#64748b",
                    fontWeight: "800",
                  }}
                >
                  No stocks found.
                </div>
              )}
            </div>
          )}
        </form>

        <div className="navbar-right">
          <div
            className="navbar-date"
            style={{
              color: "#64748b",
              fontWeight: "800",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              whiteSpace: "nowrap",
            }}
          >
            <FaCalendarAlt />
            {today}
          </div>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowNotifications((prev) => !prev)}
              title="Notification services"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#475569",
                cursor: "pointer",
                position: "relative",
                boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
              }}
            >
              <FaBell />

              <span
                style={{
                  position: "absolute",
                  top: "7px",
                  right: "8px",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#ef4444",
                  border: "2px solid white",
                }}
              />
            </button>

            {showNotifications && (
              <div
                style={{
                  position: "absolute",
                  top: "52px",
                  right: 0,
                  width: "310px",
                  maxWidth: "calc(100vw - 24px)",
                  background: "rgba(255, 255, 255, 0.98)",
                  border: "1px solid #e5e7eb",
                  borderRadius: "18px",
                  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.16)",
                  zIndex: 20000,
                  overflow: "hidden",
                  backdropFilter: "blur(18px)",
                }}
              >
                <div
                  style={{
                    padding: "16px",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <strong style={{ color: "#0f172a" }}>Notifications</strong>

                  <p
                    style={{
                      margin: "5px 0 0",
                      color: "#64748b",
                      fontSize: "13px",
                      lineHeight: "1.5",
                    }}
                  >
                    Manage order alerts, price alerts, reports, and sound alerts.
                  </p>
                </div>

                <div style={{ padding: "14px" }}>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => {
                      setShowNotifications(false);
                      navigate("/services");
                    }}
                    style={{ width: "100%" }}
                  >
                    Open Services
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="user-box user-box-clickable"
            onClick={() => navigate("/settings")}
            title="Open profile settings"
          >
            <div className="avatar">{username.charAt(0).toUpperCase()}</div>

            <span>{username}</span>

            <FaUserCog
              style={{
                color: "#64748b",
                fontSize: "14px",
                marginLeft: "2px",
              }}
            />
          </button>
        </div>
      </div>

      <MobileBottomNav />
    </>
  );
}

export default Navbar;