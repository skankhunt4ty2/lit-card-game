require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Store active game rooms
const gameRooms = new Map();

// Copy all the socket.io event handlers and helper functions from server.js
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  // ... (all the existing socket event handlers)
});

// Add all the helper functions
function createAndShuffleDeck() {
  // ... (existing function)
}

function isValidRequest(requestingPlayer, targetPlayer, requestedCard) {
  // ... (existing function)
}

function transferCard(fromPlayer, toPlayer, suit, rank, setType) {
  // ... (existing function)
}

function teamHasCompleteSet(players, team, suit, setType) {
  // ... (existing function)
}

function checkWinCondition(capturedSets) {
  // ... (existing function)
}

function getNextPlayer(currentPlayerId, players) {
  // ... (existing function)
}

// Get port from environment variable or use default
const PORT = process.env.PORT || 3002;

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

console.log(`Attempting to start server on port ${PORT}...`);

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
  console.log(`##################################`);
  console.log(`# Socket.io server active on port ${PORT} #`);
  console.log(`# Connect your client to this port #`);
  console.log(`##################################`);
}); 