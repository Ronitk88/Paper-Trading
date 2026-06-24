function MarketOverview() {
  return (
    <div className="market-card">
      <h3>Market Overview</h3>

      <div className="market-row">
        <span>NIFTY 50</span>
        <span className="green">+0.62%</span>
      </div>

      <div className="market-row">
        <span>SENSEX</span>
        <span className="green">+0.58%</span>
      </div>

      <div className="market-row">
        <span>BANK NIFTY</span>
        <span className="green">+0.71%</span>
      </div>

      {/* BUY SELL BUTTONS */}

      <div className="trade-buttons">
        <button className="buy-btn">
          Buy
        </button>

        <button className="sell-btn">
          Sell
        </button>
      </div>
    </div>
  );
}

export default MarketOverview;