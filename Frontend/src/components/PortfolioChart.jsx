import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

const data = [
  { day: "Mon", value: 100000 },
  { day: "Tue", value: 101500 },
  { day: "Wed", value: 100700 },
  { day: "Thu", value: 102200 },
  { day: "Fri", value: 103000 }
];

function PortfolioChart() {
  return (
    <div className="chart-card">
      <h3>Portfolio Performance</h3>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PortfolioChart;