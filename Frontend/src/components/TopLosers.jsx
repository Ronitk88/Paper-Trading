function TopLosers() {

const stocks = [
{ name: "WIPRO", change: "-1.65%" },
{ name: "TECHM", change: "-1.20%" },
{ name: "SBIN", change: "-0.70%" }
];

return ( <div className="market-card"> <h3>Top Losers</h3>


  {stocks.map((stock, index) => (
    <div key={index} className="market-row">
      <span>{stock.name}</span>
      <span style={{color:"red"}}>
        {stock.change}
      </span>
    </div>
  ))}
</div>


);
}

export default TopLosers;
