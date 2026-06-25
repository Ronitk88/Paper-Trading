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
        <FaHome />
        <span>Home</span>
      </NavLink>

      <NavLink to="/stocks">
        <FaSearch />
        <span>Stocks</span>
      </NavLink>

      <NavLink to="/watchlist">
        <FaStar />
        <span>Watch</span>
      </NavLink>

      <NavLink to="/portfolio">
        <FaBriefcase />
        <span>Portfolio</span>
      </NavLink>

      <NavLink to="/orders">
        <FaClipboardList />
        <span>Orders</span>
      </NavLink>
    </nav>
  );
}

export default MobileBottomNav;