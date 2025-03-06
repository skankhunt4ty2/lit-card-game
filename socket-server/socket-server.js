require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Add detailed logging
console.log('Starting server initialization...');
console.log('Environment variables:', {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  CORS_ORIGIN: process.env.CORS_ORIGIN
});

const app = express();

// Configure CORS for both Express and Socket.IO
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "https://lit-card-game.vercel.app",
  methods: ["GET", "POST"],
  credentials: true,
  allowedHeaders: ["*"]
};

app.use(cors(corsOptions));

const server = http.createServer(app);

try {
  const io = new Server(server, {
    cors: corsOptions,
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    path: '/socket.io/',
    connectTimeout: 45000,
    allowEIO3: true,
    allowUpgrades: true,
    cookie: false
  });

  console.log('Socket.IO server initialized successfully');
  console.log('CORS origin:', process.env.CORS_ORIGIN || "https://lit-card-game.vercel.app");
  console.log('Server port:', process.env.PORT || 3002);

  // Store active game rooms
  const gameRooms = new Map();

  // Helper function to create and shuffle deck
  function createAndShuffleDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const lowerRanks = ['ace', '2', '3', '4', '5', '6'];
    const upperRanks = ['8', '9', '10', 'jack', 'queen', 'king'];
    const deck = [];

    // Create lower set cards
    suits.forEach(suit => {
      lowerRanks.forEach(rank => {
        deck.push({ suit, rank, setType: 'lower' });
      });
    });

    // Create upper set cards
    suits.forEach(suit => {
      upperRanks.forEach(rank => {
        deck.push({ suit, rank, setType: 'upper' });
      });
    });

    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  // Helper function to check if a card request is valid
  function isValidRequest(requestingPlayer, targetPlayer, requestedCard) {
    // Can't request from yourself
    if (requestingPlayer.id === targetPlayer.id) return false;

    // Can't request from a teammate
    if (requestingPlayer.team === targetPlayer.team) return false;

    // Can't request if you don't have any cards
    if (requestingPlayer.hand.length === 0) return false;

    // Can't request if target doesn't have any cards
    if (targetPlayer.hand.length === 0) return false;

    // Can't request if you don't have any cards from the same set
    const hasCardFromSet = requestingPlayer.hand.some(card => 
      card.suit === requestedCard.suit && card.setType === requestedCard.setType
    );
    if (!hasCardFromSet) return false;

    // Can't request if you already have the card
    const hasRequestedCard = requestingPlayer.hand.some(card =>
      card.suit === requestedCard.suit &&
      card.rank === requestedCard.rank &&
      card.setType === requestedCard.setType
    );
    if (hasRequestedCard) return false;

    return true;
  }

  // Helper function to transfer a card between players
  function transferCard(fromPlayer, toPlayer, suit, rank, setType) {
    const cardIndex = fromPlayer.hand.findIndex(card =>
      card.suit === suit &&
      card.rank === rank &&
      card.setType === setType
    );

    if (cardIndex === -1) return false;

    const card = fromPlayer.hand.splice(cardIndex, 1)[0];
    toPlayer.hand.push(card);
    return true;
  }

  // Helper function to check if a team has a complete set
  function teamHasCompleteSet(players, team, suit, setType) {
    const teamPlayers = players.filter(p => p.team === team);
    const teamCards = teamPlayers.flatMap(p => p.hand);
    
    const ranks = setType === 'lower' 
      ? ['ace', '2', '3', '4', '5', '6']
      : ['8', '9', '10', 'jack', 'queen', 'king'];

    return ranks.every(rank =>
      teamCards.some(card =>
        card.suit === suit &&
        card.rank === rank &&
        card.setType === setType
      )
    );
  }

  // Helper function to check win condition
  function checkWinCondition(capturedSets) {
    const redSets = capturedSets.filter(set => set.team === 'red').length;
    const blueSets = capturedSets.filter(set => set.team === 'blue').length;

    if (redSets >= 3 && redSets > blueSets) return 'red';
    if (blueSets >= 3 && blueSets > redSets) return 'blue';
    if (redSets >= 3 && blueSets >= 3 && redSets === blueSets) return 'draw';
    return null;
  }

  // Helper function to get next player
  function getNextPlayer(currentPlayerId, players) {
    const currentIndex = players.findIndex(p => p.id === currentPlayerId);
    const nextIndex = (currentIndex + 1) % players.length;
    return players[nextIndex];
  }

  // Socket.IO event handlers
  io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // Create a new room
    socket.on('createRoom', ({ playerName, roomName, playerCount }) => {
      if (gameRooms.has(roomName)) {
        socket.emit('error', { message: 'Room already exists' });
        return;
      }

      const playerId = socket.id;
      const room = {
        name: roomName,
        playerCount,
        players: [{
          id: playerId,
          name: playerName,
          hand: [],
          team: 'unassigned',
          connected: true,
          canClaimTurn: false
        }],
        gameStatus: 'waiting',
        currentTurnPlayerId: null,
        capturedSets: [],
        adminId: playerId
      };

      gameRooms.set(roomName, room);
      socket.join(roomName);
      socket.emit('roomCreated', { roomName, playerId });
    });

    // Join an existing room
    socket.on('joinRoom', ({ playerName, roomName }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      if (room.players.length >= room.playerCount) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      const playerId = socket.id;
      const player = {
        id: playerId,
        name: playerName,
        hand: [],
        team: 'unassigned',
        connected: true,
        canClaimTurn: false
      };

      room.players.push(player);
      socket.join(roomName);
      socket.emit('joinedRoom', { roomName, playerId });
    });

    // Join a team
    socket.on('joinTeam', ({ roomName, team }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const player = room.players.find(p => p.id === socket.id);
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      player.team = team;
      io.to(roomName).emit('roomUpdate', room);
    });

    // Start the game
    socket.on('startGame', ({ roomName }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      if (socket.id !== room.adminId) {
        socket.emit('error', { message: 'Only the admin can start the game' });
        return;
      }

      if (room.players.length !== room.playerCount) {
        socket.emit('error', { message: 'Room is not full' });
        return;
      }

      const redTeam = room.players.filter(p => p.team === 'red');
      const blueTeam = room.players.filter(p => p.team === 'blue');

      if (redTeam.length !== blueTeam.length) {
        socket.emit('error', { message: 'Teams must be balanced' });
        return;
      }

      // Deal cards
      const deck = createAndShuffleDeck();
      room.players.forEach(player => {
        player.hand = deck.splice(0, 6);
      });

      // Set initial turn
      room.currentTurnPlayerId = room.players[0].id;
      room.gameStatus = 'playing';

      io.to(roomName).emit('gameStarted', room);
    });

    // Request a card
    socket.on('requestCard', ({ roomName, targetPlayerId, suit, rank, setType }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const requestingPlayer = room.players.find(p => p.id === socket.id);
      const targetPlayer = room.players.find(p => p.id === targetPlayerId);

      if (!requestingPlayer || !targetPlayer) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      if (requestingPlayer.id !== room.currentTurnPlayerId) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }

      const requestedCard = { suit, rank, setType };

      if (!isValidRequest(requestingPlayer, targetPlayer, requestedCard)) {
        socket.emit('error', { message: 'Invalid card request' });
        return;
      }

      const hasCard = targetPlayer.hand.some(card =>
        card.suit === suit &&
        card.rank === rank &&
        card.setType === setType
      );

      if (hasCard) {
        transferCard(targetPlayer, requestingPlayer, suit, rank, setType);
        room.lastAction = `${requestingPlayer.name} got the ${rank} of ${suit} from ${targetPlayer.name}`;
      } else {
        room.lastAction = `${requestingPlayer.name} asked ${targetPlayer.name} for the ${rank} of ${suit} but they didn't have it`;
      }

      room.currentTurnPlayerId = targetPlayer.id;
      io.to(roomName).emit('gameUpdate', room);
    });

    // Declare a set
    socket.on('declareSet', ({ roomName, suit, setType }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const declaringPlayer = room.players.find(p => p.id === socket.id);
      if (!declaringPlayer) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      if (declaringPlayer.id !== room.currentTurnPlayerId) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }

      const isCorrect = teamHasCompleteSet(room.players, declaringPlayer.team, suit, setType);

      if (isCorrect) {
        room.capturedSets.push({
          team: declaringPlayer.team,
          suit,
          setType
        });

        room.lastAction = `${declaringPlayer.name} correctly declared the ${setType} ${suit} set for the ${declaringPlayer.team} team`;
      } else {
        const opposingTeam = declaringPlayer.team === 'red' ? 'blue' : 'red';
        room.capturedSets.push({
          team: opposingTeam,
          suit,
          setType
        });

        room.lastAction = `${declaringPlayer.name} incorrectly declared the ${setType} ${suit} set, giving it to the ${opposingTeam} team`;
      }

      const winner = checkWinCondition(room.capturedSets);
      if (winner) {
        room.gameStatus = 'finished';
        room.winner = winner;
        io.to(roomName).emit('gameUpdate', room);
        return;
      }

      // Set next turn
      room.currentTurnPlayerId = getNextPlayer(declaringPlayer.id, room.players).id;
      io.to(roomName).emit('gameUpdate', room);
    });

    // Claim turn
    socket.on('claimTurn', ({ roomName }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const player = room.players.find(p => p.id === socket.id);
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      if (!player.canClaimTurn) {
        socket.emit('error', { message: 'You cannot claim the turn' });
        return;
      }

      player.canClaimTurn = false;
      room.currentTurnPlayerId = player.id;
      io.to(roomName).emit('gameUpdate', room);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);

      // Find and update player in all rooms
      gameRooms.forEach((room, roomName) => {
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
          player.connected = false;
          io.to(roomName).emit('roomUpdate', room);
        }
      });
    });
  });

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
} catch (error) {
  console.error('Error during server initialization:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}

// Add uncaught exception handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
}); 