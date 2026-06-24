function TopGainers() {

const stocks = [
{ name: "RELIANCE", change: "+2.32%" },
{ name: "TCS", change: "+1.85%" },
{ name: "INFY", change: "+1.25%" }
];

return ( <div className="market-card"> <h3>Top Gainers</h3>


  {stocks.map((stock, index) => (
    <div key={index} className="market-row">
      <span>{stock.name}</span>
      <span style={{color:"green"}}>
        {stock.change}
      </span>
    </div>
  ))}
</div>

);
}

export default TopGainers;
