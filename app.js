import React, { useState } from 'react';
import Chart from './Chart';

function App() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [quantity, setQuantity] = useState(0.01);

  const placeTrade = async (side) => {
    const res = await fetch('http://localhost:3001/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, side, quantity }),
    });
    const data = await res.json();
    console.log(data);
  };

  return (
    <div>
      <h1>Trading Dashboard</h1>
      <select onChange={(e) => setSymbol(e.target.value)}>
        <option value="BTCUSDT">BTC/USDT</option>
        <option value="ETHUSDT">ETH/USDT</option>
        <option value="XAUUSDT">Gold</option>
        <option value="XAGUSDT">Silver</option>
        <option value="OILUSDT">Oil</option>
        <option value="GASUSDT">Gas</option>
      </select>

      <Chart symbol={symbol} />

      <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />

      <button onClick={() => placeTrade('BUY')}>Buy</button>
      <button onClick={() => placeTrade('SELL')}>Sell</button>
    </div>
  );
}

export default App;


