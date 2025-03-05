const http = require('http');
const { Server } = require('socket.io');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res);
  });

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

  io.on('connection', (socket) => {
    console.log('New connection:', socket.id);
    
    // Player joining a room
    socket.on('joinRoom', ({ playerName, roomName }) => {
      // Check if room exists
      let room = gameRooms.get(roomName);
      
      if (!room) {
        socket.emit('error', { message: 'Room does not exist' });
        return;
      }
      
      // Check if room is full
      if (room.players.length >= room.playerCount) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }
      
      // Check if player with the same name already exists
      const existingPlayer = room.players.find(p => p.name === playerName);
      if (existingPlayer) {
        // If player with same name exists but is disconnected, take over that player
        if (!existingPlayer.connected) {
          console.log(`Reconnecting player "${playerName}" with new socket ID: ${socket.id}`);
          
          // Update the player with the new socket ID and mark as connected
          existingPlayer.id = socket.id;
          existingPlayer.connected = true;
          
          // Join socket room
          socket.join(roomName);
          
          // Update room
          gameRooms.set(roomName, room);
          
          // Broadcast updated room state
          io.to(roomName).emit('roomUpdate', room);
          
          socket.emit('joinedRoom', { roomName, playerId: socket.id });
          return;
        } else {
          // If player with same name exists and is connected, reject the join
          socket.emit('error', { message: `A player with the name "${playerName}" is already in this room` });
          return;
        }
      }
      
      // Create player
      const player = {
        id: socket.id,
        name: playerName,
        team: 'unassigned',
        hand: [],
        connected: true
      };
      
      // Add player to room
      room.players.push(player);
      
      // Join socket room
      socket.join(roomName);
      
      // Update room
      gameRooms.set(roomName, room);
      
      // Broadcast updated room state
      io.to(roomName).emit('roomUpdate', room);
      
      socket.emit('joinedRoom', { roomName, playerId: socket.id });
    });
    
    // Create a new room
    socket.on('createRoom', ({ playerName, roomName, playerCount }) => {
      // Check if room already exists
      if (gameRooms.has(roomName)) {
        const existingRoom = gameRooms.get(roomName);
        
        // Check if player with the same name already exists in the room
        const existingPlayer = existingRoom.players.find(p => p.name === playerName);
        if (existingPlayer) {
          // If player with same name exists but is disconnected, take over that player
          if (!existingPlayer.connected) {
            console.log(`Reconnecting player "${playerName}" in existing room with new socket ID: ${socket.id}`);
            
            // Update the player with the new socket ID and mark as connected
            existingPlayer.id = socket.id;
            existingPlayer.connected = true;
            
            // Join socket room
            socket.join(roomName);
            
            // Update room
            gameRooms.set(roomName, existingRoom);
            
            // Broadcast updated room state
            io.to(roomName).emit('roomUpdate', existingRoom);
            
            socket.emit('joinedRoom', { roomName, playerId: socket.id });
            return;
          } else {
            // If player with same name exists and is connected, reject the join
            socket.emit('error', { message: `A player with the name "${playerName}" is already in this room` });
            return;
          }
        } else {
          // Room exists but player doesn't, so just emit error about room existing
          socket.emit('error', { message: 'Room already exists' });
          return;
        }
      }
      
      // Create player
      const player = {
        id: socket.id,
        name: playerName,
        team: 'unassigned',
        hand: [],
        connected: true
      };
      
      // Create new room
      const newRoom = {
        roomName,
        players: [player],
        currentTurnPlayerId: null,
        capturedSets: [],
        gameStatus: 'waiting',
        winner: null,
        adminId: socket.id,
        lastAction: null,
        playerCount
      };
      
      // Store room
      gameRooms.set(roomName, newRoom);
      
      // Join socket room
      socket.join(roomName);
      
      // Emit room created event
      socket.emit('roomCreated', { roomName, playerId: socket.id });
      
      // Broadcast room update
      io.to(roomName).emit('roomUpdate', newRoom);
    });
    
    // Join a team
    socket.on('joinTeam', ({ roomName, team }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room does not exist' });
        return;
      }
      
      // Find player
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Player not found in room' });
        return;
      }
      
      // Check team balance
      const teamCount = room.players.filter(p => p.team === team).length;
      const maxTeamSize = room.playerCount === 6 ? 3 : 4;
      
      if (teamCount >= maxTeamSize) {
        socket.emit('error', { message: `${team} team is already full` });
        return;
      }
      
      // Update player's team
      room.players[playerIndex].team = team;
      
      // Update room
      gameRooms.set(roomName, room);
      
      // Broadcast updated room state
      io.to(roomName).emit('roomUpdate', room);
    });
    
    // Admin shuffles teams
    socket.on('shuffleTeams', ({ roomName }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room does not exist' });
        return;
      }
      
      // Check if user is admin
      if (room.adminId !== socket.id) {
        socket.emit('error', { message: 'Only room admin can shuffle teams' });
        return;
      }
      
      // Shuffle teams
      const shuffledPlayers = [...room.players];
      // Fisher-Yates shuffle
      for (let i = shuffledPlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
      }
      
      // Assign teams
      const teamsSize = room.playerCount === 6 ? 3 : 4;
      for (let i = 0; i < shuffledPlayers.length; i++) {
        shuffledPlayers[i].team = i < teamsSize ? 'red' : 'blue';
      }
      
      room.players = shuffledPlayers;
      
      // Update room
      gameRooms.set(roomName, room);
      
      // Broadcast updated room state
      io.to(roomName).emit('roomUpdate', room);
    });
    
    // Admin starts game
    socket.on('startGame', ({ roomName }) => {
      const room = gameRooms.get(roomName);
      if (!room) {
        socket.emit('error', { message: 'Room does not exist' });
        return;
      }
      
      // Check if user is admin
      if (room.adminId !== socket.id) {
        socket.emit('error', { message: 'Only room admin can start the game' });
        return;
      }
      
      // Check if we have the correct number of players
      if (room.players.length !== room.playerCount) {
        socket.emit('error', { message: `Need exactly ${room.playerCount} players to start` });
        return;
      }
      
      // Check team balance
      const redTeamCount = room.players.filter(p => p.team === 'red').length;
      const blueTeamCount = room.players.filter(p => p.team === 'blue').length;
      const teamSize = room.playerCount === 6 ? 3 : 4;
      
      if (redTeamCount !== teamSize || blueTeamCount !== teamSize) {
        socket.emit('error', { message: 'Teams must be balanced' });
        return;
      }
      
      // Deal cards
      const deck = createAndShuffleDeck();
      const cardsPerPlayer = room.playerCount === 6 ? 8 : 6;
      
      for (let i = 0; i < room.players.length; i++) {
        room.players[i].hand = deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer);
      }
      
      // Pick a random player to start
      const randomIndex = Math.floor(Math.random() * room.players.length);
      room.currentTurnPlayerId = room.players[randomIndex].id;
      
      // Update game status
      room.gameStatus = 'playing';
      
      // Update room
      gameRooms.set(roomName, room);
      
      // Notify all players that the game has started
      io.to(roomName).emit('gameStarted', room);
      
      // Send private hand information to each player
      room.players.forEach(player => {
        io.to(player.id).emit('updateHand', { hand: player.hand });
      });
    });
    
    // Player requests a card
    socket.on('requestCard', ({ roomName, request }) => {
      const room = gameRooms.get(roomName);
      if (!room || room.gameStatus !== 'playing') return;
      
      // Check if it's the player's turn
      if (room.currentTurnPlayerId !== socket.id) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }
      
      // Reset claim turn eligibility for all players since a new action is starting
      room.players.forEach(player => {
        player.canClaimTurn = false;
      });
      
      // Find players
      const requestingPlayer = room.players.find(p => p.id === socket.id);
      const targetPlayer = room.players.find(p => p.id === request.targetPlayerId);
      
      if (!requestingPlayer || !targetPlayer) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }
      
      // Check if request is valid
      const result = isValidRequest(requestingPlayer, targetPlayer, request.requestedCard);
      if (!result.valid) {
        socket.emit('error', { message: result.reason });
        return;
      }
      
      // Try to transfer the card
      const transferResult = transferCard(targetPlayer, requestingPlayer, request.requestedCard.suit, request.requestedCard.rank, request.requestedCard.setType);
      
      if (transferResult.success) {
        // Update players
        const requestingPlayerIndex = room.players.findIndex(p => p.id === socket.id);
        const targetPlayerIndex = room.players.findIndex(p => p.id === request.targetPlayerId);
        
        room.players[requestingPlayerIndex] = transferResult.toPlayer;
        room.players[targetPlayerIndex] = transferResult.fromPlayer;
        
        // Update last action
        room.lastAction = `${requestingPlayer.name} received ${request.requestedCard.rank} of ${request.requestedCard.suit} (${request.requestedCard.setType}) from ${targetPlayer.name}`;
        
        // Keep same player's turn
        
        // Update room
        gameRooms.set(roomName, room);
        
        // Broadcast updates
        io.to(roomName).emit('actionUpdate', { 
          lastAction: room.lastAction,
          currentTurnPlayerId: room.currentTurnPlayerId
        });
        
        // Send updated hands to the players
        io.to(requestingPlayer.id).emit('updateHand', { hand: transferResult.toPlayer.hand });
        io.to(targetPlayer.id).emit('updateHand', { hand: transferResult.fromPlayer.hand });
        
        // Broadcast updated game state to all players
        io.to(roomName).emit('roomUpdate', room);
      } else {
        // Card not found, turn goes to target player
        room.currentTurnPlayerId = request.targetPlayerId;
        
        // Update last action
        room.lastAction = `${requestingPlayer.name} asked for ${request.requestedCard.rank} of ${request.requestedCard.suit} (${request.requestedCard.setType}) from ${targetPlayer.name}, but they didn't have it`;
        
        // Update room
        gameRooms.set(roomName, room);
        
        // Broadcast updates
        io.to(roomName).emit('actionUpdate', {
          lastAction: room.lastAction,
          currentTurnPlayerId: room.currentTurnPlayerId
        });
      }
    });
    
    // Player declares a set
    socket.on('declareSet', ({ roomName, declaration }) => {
      const room = gameRooms.get(roomName);
      if (!room || room.gameStatus !== 'playing') {
        socket.emit('error', { message: 'Game is not in progress' });
        return;
      }
      
      // Reset claim turn eligibility at the start of declaration
      room.players.forEach(player => {
        player.canClaimTurn = false;
      });
      
      // Find declaring player
      const declaringPlayer = room.players.find(p => p.id === socket.id);
      if (!declaringPlayer || !declaringPlayer.connected) {
        socket.emit('error', { message: 'Player not found or disconnected' });
        return;
      }

      // Check if declaring player has at least one card from the set
      const hasCardFromSet = declaringPlayer.hand.some(card => 
        card.suit === declaration.suit && 
        card.setType === declaration.setType
      );

      if (!hasCardFromSet) {
        socket.emit('error', { message: 'You must have at least one card from the set you are declaring' });
        return;
      }
      
      // Check if team has the complete set
      const hasSet = teamHasCompleteSet(room.players, declaringPlayer.team, declaration.suit, declaration.setType);
      
      // Determine which team gets the set
      const setWinner = hasSet ? declaringPlayer.team : (declaringPlayer.team === 'red' ? 'blue' : 'red');

      if (hasSet) {
        // For successful declaration, current player keeps turn and teammates with cards can claim
        room.currentTurnPlayerId = declaringPlayer.id;
        room.lastAction = `${declaringPlayer.name} correctly declared ${declaration.setType} ${declaration.suit} for the ${declaringPlayer.team} team\n${declaringPlayer.name}'s turn (${declaringPlayer.team} team)`;
        
        // Mark team members who have cards as eligible to claim turn
        room.players.forEach(player => {
          if (player.team === declaringPlayer.team && player.id !== declaringPlayer.id && player.connected && player.hand.length > 0) {
            player.canClaimTurn = true;
          }
        });
      } else {
        // For incorrect declarations, verify opposing team has cards before proceeding
        const contributingPlayers = room.players.filter(player => 
          player.team === setWinner && 
          player.connected && 
          player.hand.length > 0 && // Only include players who have cards
          player.hand.some(card => 
            card.suit === declaration.suit && 
            card.setType === declaration.setType
          )
        );

        // Get all opposing team players who have cards
        const opposingTeamPlayersWithCards = room.players.filter(player =>
          player.team === setWinner &&
          player.connected &&
          player.hand.length > 0
        );

        if (contributingPlayers.length > 0) {
          // If there are contributing players with cards, randomly select one to start
          const randomIndex = Math.floor(Math.random() * contributingPlayers.length);
          const nextPlayer = contributingPlayers[randomIndex];
          
          room.currentTurnPlayerId = nextPlayer.id;
          room.lastAction = `${declaringPlayer.name} incorrectly declared ${declaration.setType} ${declaration.suit}, giving it to the ${setWinner} team\n${nextPlayer.name}'s turn (${setWinner} team)`;

          // All other opposing team players with cards can claim turn
          room.players.forEach(player => {
            if (player.team === setWinner && player.id !== nextPlayer.id && player.hand.length > 0) {
              player.canClaimTurn = true;
            }
          });
        } else if (opposingTeamPlayersWithCards.length > 0) {
          // If no contributing players but team has players with cards, randomly select one
          const randomIndex = Math.floor(Math.random() * opposingTeamPlayersWithCards.length);
          const nextPlayer = opposingTeamPlayersWithCards[randomIndex];
          
          room.currentTurnPlayerId = nextPlayer.id;
          room.lastAction = `${declaringPlayer.name} incorrectly declared ${declaration.setType} ${declaration.suit}, giving it to the ${setWinner} team\n${nextPlayer.name}'s turn (${setWinner} team)`;

          // All other opposing team players with cards can claim turn
          room.players.forEach(player => {
            if (player.team === setWinner && player.id !== nextPlayer.id && player.hand.length > 0) {
              player.canClaimTurn = true;
            }
          });
        } else {
          socket.emit('error', { message: 'Invalid declaration: no players from the opposing team have any cards left' });
          return;
        }
      }
      
      // Add to captured sets
      room.capturedSets.push({
        suit: declaration.suit,
        setType: declaration.setType,
        team: setWinner
      });
      
      console.log('Set captured:', {
        suit: declaration.suit,
        setType: declaration.setType,
        team: setWinner,
        totalSets: room.capturedSets.length
      });
      
      // Check win condition after adding the set
      const winner = checkWinCondition(room.capturedSets);
      console.log('Win condition check result:', { winner });
      
      if (winner) {
        console.log('Game finished:', { winner });
        room.gameStatus = 'finished';
        room.winner = winner;
        room.lastAction = winner === 'draw' 
          ? 'Game ended in a draw!' 
          : `${winner.toUpperCase()} team wins the game!`;
        
        // Reset turn and claim eligibility since game is over
        room.currentTurnPlayerId = null;
        room.players.forEach(player => {
          player.canClaimTurn = false;
        });
        
        // Ensure the game end is broadcast
        io.to(roomName).emit('gameEnd', {
          winner,
          message: room.lastAction
        });
      }
      
      // Remove all cards from this set from all players' hands
      const requiredRanks = declaration.setType === 'lower' 
        ? ['ace', '2', '3', '4', '5', '6'] 
        : ['8', '9', '10', 'jack', 'queen', 'king'];
      
      room.players.forEach(player => {
        player.hand = player.hand.filter(card => 
          !(card.suit === declaration.suit && 
            requiredRanks.includes(card.rank) && 
            card.setType === declaration.setType)
        );
      });
      
      // Update room
      gameRooms.set(roomName, room);
      
      // Broadcast updates
      io.to(roomName).emit('gameUpdate', room);
      
      // Send updated hands to all players
      room.players.forEach(player => {
        io.to(player.id).emit('updateHand', { hand: player.hand });
      });
    });
    
    // Player claims turn after set declaration
    socket.on('claimTurn', ({ roomName }) => {
      try {
        console.log('Claim turn request received:', { roomName, socketId: socket.id });
        
        const room = gameRooms.get(roomName);
        if (!room || room.gameStatus !== 'playing') {
          console.log('Game not in progress:', { room: !!room, status: room?.gameStatus });
          socket.emit('error', { message: 'Game is not in progress' });
          return;
        }
        
        // Find claiming player
        const claimingPlayer = room.players.find(p => p.id === socket.id);
        console.log('Claiming player:', { found: !!claimingPlayer, connected: claimingPlayer?.connected });
        
        if (!claimingPlayer || !claimingPlayer.connected) {
          socket.emit('error', { message: 'Player not found or disconnected' });
          return;
        }
        
        // Check if player is eligible to claim turn
        console.log('Checking eligibility:', { canClaimTurn: claimingPlayer.canClaimTurn });
        if (!claimingPlayer.canClaimTurn) {
          socket.emit('error', { message: 'You are not eligible to claim the turn' });
          return;
        }
        
        // Update turn to claiming player
        room.currentTurnPlayerId = claimingPlayer.id;
        room.lastAction = `${claimingPlayer.name} claimed the turn (${claimingPlayer.team} team)`;
        
        // Reset claim turn eligibility for all players
        room.players.forEach(player => {
          player.canClaimTurn = false;
        });
        
        // Update room
        gameRooms.set(roomName, room);
        
        // Broadcast updates
        io.to(roomName).emit('gameUpdate', room);
        io.to(roomName).emit('actionUpdate', {
          lastAction: room.lastAction,
          currentTurnPlayerId: room.currentTurnPlayerId
        });
      } catch (error) {
        console.error('Error in claimTurn:', error);
        socket.emit('error', { message: 'Internal server error in claimTurn' });
      }
    });
    
    // Disconnection handling
    socket.on('disconnect', () => {
      console.log('Disconnected:', socket.id);
      
      // Update all rooms where this player is present
      gameRooms.forEach((room, roomName) => {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
          // Mark player as disconnected
          room.players[playerIndex].connected = false;
          
          // If it was this player's turn, move to next player
          if (room.currentTurnPlayerId === socket.id && room.gameStatus === 'playing') {
            room.currentTurnPlayerId = getNextPlayer(socket.id, room.players);
          }
          
          // If this was the admin, assign a new admin
          if (room.adminId === socket.id) {
            const connectedPlayers = room.players.filter(p => p.connected);
            if (connectedPlayers.length > 0) {
              room.adminId = connectedPlayers[0].id;
            }
          }
          
          // Update room
          gameRooms.set(roomName, room);
          
          // Broadcast updated room state
          io.to(roomName).emit('roomUpdate', room);
        }
      });
    });
  });

  // Helper functions
  function createAndShuffleDeck() {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const lowerRanks = ['ace', '2', '3', '4', '5', '6'];
    const upperRanks = ['8', '9', '10', 'jack', 'queen', 'king'];
    
    const deck = [];
    
    for (const suit of suits) {
      for (const rank of lowerRanks) {
        deck.push({
          suit,
          rank,
          setType: 'lower',
          id: Math.random().toString(36).substring(2, 15)
        });
      }
      
      for (const rank of upperRanks) {
        deck.push({
          suit,
          rank,
          setType: 'upper',
          id: Math.random().toString(36).substring(2, 15)
        });
      }
    }
    
    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
  }

  function isValidRequest(requestingPlayer, targetPlayer, requestedCard) {
    // 1. Player can only request from opposing team
    if (requestingPlayer.team === targetPlayer.team || targetPlayer.team === 'unassigned') {
      return { valid: false, reason: "You can only request cards from opponents" };
    }
    
    // 2. Check if target player has any cards
    if (targetPlayer.hand.length === 0) {
      return { valid: false, reason: "This player has no cards left" };
    }
    
    // 3. Player cannot request a card they already have
    const alreadyHasCard = requestingPlayer.hand.some(
      card => card.suit === requestedCard.suit && card.rank === requestedCard.rank && card.setType === requestedCard.setType
    );
    
    if (alreadyHasCard) {
      return { valid: false, reason: "You cannot request a card that you already have" };
    }
    
    // 4. Player must have at least one card from the same set (Lower or Upper) as the card being requested
    const hasCardFromSameSet = requestingPlayer.hand.some(
      card => card.suit === requestedCard.suit && card.setType === requestedCard.setType
    );
    
    if (!hasCardFromSameSet) {
      return { valid: false, reason: `You must have at least one card from the ${requestedCard.setType} ${requestedCard.suit} set to request from it` };
    }
    
    return { valid: true };
  }

  function transferCard(fromPlayer, toPlayer, suit, rank, setType) {
    const updatedFromPlayer = { ...fromPlayer };
    const updatedToPlayer = { ...toPlayer };
    
    const cardIndex = updatedFromPlayer.hand.findIndex(
      card => card.suit === suit && card.rank === rank && card.setType === setType
    );
    
    if (cardIndex === -1) {
      return { fromPlayer: updatedFromPlayer, toPlayer: updatedToPlayer, success: false };
    }
    
    const [card] = updatedFromPlayer.hand.splice(cardIndex, 1);
    updatedToPlayer.hand.push(card);
    
    return {
      fromPlayer: updatedFromPlayer,
      toPlayer: updatedToPlayer,
      success: true
    };
  }

  function teamHasCompleteSet(players, team, suit, setType) {
    const teamPlayers = players.filter(player => player.team === team);
    const teamCards = teamPlayers.flatMap(player => player.hand);
    
    const requiredRanks = setType === 'lower' 
      ? ['ace', '2', '3', '4', '5', '6'] 
      : ['8', '9', '10', 'jack', 'queen', 'king'];
    
    return requiredRanks.every(rank => 
      teamCards.some(card => card.suit === suit && card.rank === rank)
    );
  }

  function checkWinCondition(capturedSets) {
    const redSets = capturedSets.filter(set => set.team === 'red').length;
    const blueSets = capturedSets.filter(set => set.team === 'blue').length;
    const totalSets = redSets + blueSets;
    
    console.log('Checking win condition:', {
      redSets,
      blueSets,
      totalSets,
      capturedSets: JSON.stringify(capturedSets)
    });
    
    if (redSets > 4) {
      console.log('Red team wins with more than 4 sets');
      return 'red';
    }
    if (blueSets > 4) {
      console.log('Blue team wins with more than 4 sets');
      return 'blue';
    }
    if (totalSets === 8) {
      console.log('All sets claimed, determining winner');
      if (redSets > blueSets) {
        console.log('Red team wins with more sets');
        return 'red';
      }
      if (blueSets > redSets) {
        console.log('Blue team wins with more sets');
        return 'blue';
      }
      console.log('Game ends in a draw');
      return 'draw';
    }
    
    console.log('Game continues - no winner yet');
    return null;
  }

  function getNextPlayer(currentPlayerId, players) {
    const currentPlayerIndex = players.findIndex(player => player.id === currentPlayerId);
    if (currentPlayerIndex === -1) return players[0].id;
    
    // Find the next connected player
    let nextIndex = (currentPlayerIndex + 1) % players.length;
    while (!players[nextIndex].connected) {
      nextIndex = (nextIndex + 1) % players.length;
      // If we've looped through all players and none are connected, return the current player
      if (nextIndex === currentPlayerIndex) return currentPlayerId;
    }
    
    return players[nextIndex].id;
  }

  const PORT = process.env.PORT || 3002;
  console.log(`Attempting to start server on port ${PORT}...`);
  
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`##################################`);
    console.log(`# Socket.io server active on port ${PORT} #`);
    console.log(`# Connect your client to this port #`);
    console.log(`##################################`);
  });
}); 