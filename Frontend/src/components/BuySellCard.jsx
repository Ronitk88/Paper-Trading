import { useState } from "react";

function BuySellCard() {

  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");

  const handleBuy = () => {
    alert(
      `${quantity} shares of ${symbol} @ ₹${price}`
    );
  };

  return (
    <div className="buy-card">

      <h3>Trade Stock</h3>

      <input
        placeholder="Symbol"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
      />

      <input
        placeholder="Quantity"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />

      <input
        placeholder="Price"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />

      <button onClick={handleBuy}>
        Buy
      </button>

    </div>
  );
}

export default BuySellCard;