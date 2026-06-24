function TransactionsTable({
  transactions = [],
}) {
  return (
    <div className="table-card">
      <h3>Recent Transactions</h3>

      <table>
        <thead>
          <tr>
            <th>Stock</th>
            <th>Type</th>
            <th>Qty</th>
            <th>Price</th>
          </tr>
        </thead>

        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id}>
              <td>{tx.symbol}</td>
              <td>{tx.transaction_type}</td>
              <td>{tx.quantity}</td>
              <td>₹{tx.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TransactionsTable;