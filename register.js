  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyBue8CgOU3cd8wjt9oeMDqaNkpBiraDNYw",
    authDomain: "billionaires-87519.firebaseapp.com",
    projectId: "billionaires-87519",
    storageBucket: "billionaires-87519.firebasestorage.app",
    messagingSenderId: "799625535151",
    appId: "1:799625535151:web:283629136b45f40afc7e5a",
    measurementId: "G-X16NGMSE4B"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
//inputs
const email = document.getElementById("email").value; 
const phone = document.getElementById("phone").value;
const password = document.getElementById("password").value;
//submit button

const submit = document.getElementById("submit");
submit.addEventListener("click",function(event) {
  event.preventDefault()
  alert(5)
  // Handle form submission logic here
})

const jwt = require('jsonwebtoken');

// Login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  // Verify password hash from DB
  const user = await User.findOne({ email });
  if (!user) return res.status(401).send("Invalid credentials");

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

// Middleware to protect routes
function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).send("No token provided");

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send("Unauthorized");
    req.userId = decoded.id;
    next();
  });
}
