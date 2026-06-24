function HoldingsTable({ holdings = [] }) {
  return (
    <div className="table-card">
      <h3>Holdings</h3>

      <table>
        <thead>
          <tr>
            <th>Stock</th>
            <th>Qty</th>
            <th>Avg Price</th>
          </tr>
        </thead>

        <tbody>
          {holdings.map((item) => (
            <tr key={item.id}>
              <td>{item.symbol}</td>
              <td>{item.quantity}</td>
              <td>₹{item.avg_price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default HoldingsTable;