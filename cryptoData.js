const WebSocket = require('ws');

// Connect to Binance WebSocket
const socket = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');

socket.on('open', () => {
  console.log('Connected to Binance WebSocket');
});

socket.on('message', (data) => {
  const trade = JSON.parse(data);
  console.log(`Price: ${trade.p}, Quantity: ${trade.q}`);
  // Push this data into your chart or HTML element
  document.getElementById('price').innerText = `Price: ${trade.p}`;
});
