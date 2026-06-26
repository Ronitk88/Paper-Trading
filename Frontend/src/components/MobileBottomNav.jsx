import { NavLink } from "react-router-dom";
import {
  FaHome,
  FaSearch,
  FaStar,
  FaBriefcase,
  FaClipboardList,
} from "react-icons/fa";

function MobileBottomNav() {
  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/dashboard">
        <div className="nav-icon-wrapper">
          <FaHome />
        </div>
        <span>Dashboard</span>
      </NavLink>

      <NavLink to="/stocks">
        <div className="nav-icon-wrapper">
          <FaSearch />
        </div>
        <span>Stocks</span>
      </NavLink>

      <NavLink to="/watchlist">
        <div className="nav-icon-wrapper">
          <FaStar />
        </div>
        <span>Watchlist</span>
      </NavLink>

      <NavLink to="/portfolio">
        <div className="nav-icon-wrapper">
          <FaBriefcase />
        </div>
        <span>Portfolio</span>
      </NavLink>

      <NavLink to="/orders">
        <div className="nav-icon-wrapper">
          <FaClipboardList />
        </div>
        <span>Orders</span>
      </NavLink>
    </nav>
  );
}

export default MobileBottomNav;