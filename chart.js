import { Chart } from 'chart.js';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';

Chart.register(CandlestickController, CandlestickElement);

const ctx = document.getElementById('cryptoChart').getContext('2d');

// Create chart instance
const chart = new Chart(ctx, {
  type: 'candlestick',
  data: {
    datasets: [{
      label: 'Crypto Pair',
      data: []
    }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: 'top' }
    }
  }
});

let socket;

// Function to connect WebSocket
function connectSocket(pair) {
  if (socket) socket.close(); // close previous connection

  const url = `wss://stream.binance.com:9443/ws/${pair}@kline_1m`;
  socket = new WebSocket(url);

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const k = message.k;

    const candle = {
      x: new Date(k.t),
      o: parseFloat(k.o),
      h: parseFloat(k.h),
      l: parseFloat(k.l),
      c: parseFloat(k.c)
    };

    chart.data.datasets[0].label = pair.toUpperCase();
    chart.data.datasets[0].data.push(candle);

    if (chart.data.datasets[0].data.length > 50) {
      chart.data.datasets[0].data.shift();
    }

    chart.update();
  };
}

// Initial connection
connectSocket('btcusdt');

// Dropdown listener
document.getElementById('pairSelector').addEventListener('change', (e) => {
  chart.data.datasets[0].data = []; // reset chart data
  connectSocket(e.target.value);
});

