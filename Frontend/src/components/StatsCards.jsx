import {
  FaWallet,
  FaMoneyBillWave,
  FaChartLine,
  FaBriefcase,
} from "react-icons/fa";

function StatsCards({ portfolio, holdings }) {
  if (!portfolio) return null;

  const cards = [
    {
      title: "Portfolio Value",
      value: `₹${portfolio.total_value}`,
      icon: <FaWallet />,
      color: "#22c55e",
    },
    {
      title: "Cash Balance",
      value: `₹${portfolio.cash_balance}`,
      icon: <FaMoneyBillWave />,
      color: "#3b82f6",
    },
    {
      title: "Total P&L",
      value: `₹${portfolio.total_pnl}`,
      icon: <FaChartLine />,
      color: "#22c55e",
    },
    {
  title: "Holdings",
  value: holdings?.length || 0,
  icon: <FaBriefcase />,
  color: "#8b5cf6",
}
  ];

  return (
    <div className="stats-grid">
      {cards.map((card) => (
        <div className="stat-card" key={card.title}>
          <div className="stat-top">
            <div>
              <h4>{card.title}</h4>
              <h2>{card.value}</h2>
            </div>

            <div
              className="stat-icon"
              style={{
                background: `${card.color}20`,
                color: card.color,
              }}
            >
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default StatsCards;