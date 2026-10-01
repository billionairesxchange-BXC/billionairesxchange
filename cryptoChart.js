const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Update chart with data.price
};
// Function to place a buy order
async function placeBuyOrder() {
  try {
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'BTCUSDT',   // trading pair
        side: 'BUY',         // BUY or SELL
        type: 'MARKET',      // MARKET order for instant execution
        quantity: 0.001      // example: 0.001 BTC
      })
    });

    const result = await response.json();
    console.log('Order result:', result);

    alert(`Buy order placed! Order ID: ${result.orderId}`);
  } catch (error) {
    console.error('Error placing order:', error);
    alert('Failed to place order');
  }
}

// Attach event listener to button
document.getElementById('buyBtn').addEventListener('click', placeBuyOrder);
