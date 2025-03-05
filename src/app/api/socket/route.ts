import { NextRequest, NextResponse } from 'next/server';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { 
  Player, 
  GameState, 
  Team, 
  CardRequest, 
  SetDeclaration,
  Suit,
  SetType,
  RoomConfig
} from '@/types/game';
import { 
  dealCards, 
  isValidRequest, 
  transferCard, 
  teamHasCompleteSet, 
  checkWinCondition, 
  shuffleTeams,
  getNextPlayer
} from '@/utils/gameUtils';

// Store active game rooms
const gameRooms = new Map<string, GameState>();

// For Next.js App Router, we need to use a different approach
// This is a workaround to make Socket.io work with Next.js App Router
// We'll use a global variable to store the Socket.io server instance
// @ts-ignore
const io = global.io || new SocketIOServer({ 
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// @ts-ignore
if (!global.io) {
  // @ts-ignore
  global.io = io;
  
  io.on('connection', (socket: Socket) => {
    console.log('New connection:', socket.id);
    
    // Player joining a room
    socket.on('joinRoom', ({ playerName, roomName }: { playerName: string, roomName: string }) => {
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
      
      // Create player
      const player: Player = {
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
    socket.on('createRoom', ({ playerName, roomName, playerCount }: { playerName: string, roomName: string, playerCount: 6 | 8 }) => {
      // Check if room already exists
      if (gameRooms.has(roomName)) {
        socket.emit('error', { message: 'Room already exists' });
        return;
      }
      
      // Create player
      const player: Player = {
        id: socket.id,
        name: playerName,
        team: 'unassigned',
        hand: [],
        connected: true
      };
      
      // Create new room
      const newRoom: GameState = {
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
    socket.on('joinTeam', ({ roomName, team }: { roomName: string, team: Team }) => {
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
    socket.on('shuffleTeams', ({ roomName }: { roomName: string }) => {
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
      const shuffledPlayers = shuffleTeams(room.players, room.playerCount);
      room.players = shuffledPlayers;
      
      // Update room
      gameRooms.set(roomName, room);
      
      // Broadcast updated room state
      io.to(roomName).emit('roomUpdate', room);
    });
    
    // Admin starts game
    socket.on('startGame', ({ roomName }: { roomName: string }) => {
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
      const playersWithCards = dealCards(room.players, room.playerCount);
      room.players = playersWithCards;
      
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
    socket.on('requestCard', ({ roomName, request }: { roomName: string, request: CardRequest }) => {
      const room = gameRooms.get(roomName);
      if (!room || room.gameStatus !== 'playing') return;
      
      // Check if it's the player's turn
      if (room.currentTurnPlayerId !== socket.id) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }
      
      // Find players
      const requestingPlayer = room.players.find(p => p.id === socket.id);
      const targetPlayer = room.players.find(p => p.id === request.targetPlayerId);
      
      if (!requestingPlayer || !targetPlayer) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }
      
      // Check if request is valid
      if (!isValidRequest(
        requestingPlayer,
        targetPlayer,
        request.requestedCard.suit,
        request.requestedCard.setType
      )) {
        socket.emit('error', { message: 'Invalid request' });
        return;
      }
      
      // Try to transfer the card
      const result = transferCard(
        targetPlayer,
        requestingPlayer,
        request.requestedCard.suit,
        request.requestedCard.rank,
        request.requestedCard.setType
      );
      
      if (result.success) {
        // Update players
        const requestingPlayerIndex = room.players.findIndex(p => p.id === socket.id);
        const targetPlayerIndex = room.players.findIndex(p => p.id === request.targetPlayerId);
        
        room.players[requestingPlayerIndex] = result.toPlayer;
        room.players[targetPlayerIndex] = result.fromPlayer;
        
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
        io.to(requestingPlayer.id).emit('updateHand', { hand: result.toPlayer.hand });
        io.to(targetPlayer.id).emit('updateHand', { hand: result.fromPlayer.hand });
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
    socket.on('declareSet', ({ roomName, declaration }: { roomName: string, declaration: SetDeclaration }) => {
      const room = gameRooms.get(roomName);
      if (!room || room.gameStatus !== 'playing') return;
      
      // Find declaring player
      const declaringPlayer = room.players.find(p => p.id === socket.id);
      if (!declaringPlayer) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }
      
      // Check if team has the complete set
      const hasSet = teamHasCompleteSet(
        room.players,
        declaringPlayer.team,
        declaration.suit,
        declaration.setType
      );
      
      // Determine which team gets the set
      const setWinner = hasSet ? declaringPlayer.team : (declaringPlayer.team === 'red' ? 'blue' : 'red');
      
      // Add to captured sets
      room.capturedSets.push({
        suit: declaration.suit,
        setType: declaration.setType,
        team: setWinner
      });
      
      // Update last action
      if (hasSet) {
        room.lastAction = `${declaringPlayer.name} correctly declared ${declaration.setType} ${declaration.suit} for the ${declaringPlayer.team} team`;
      } else {
        room.lastAction = `${declaringPlayer.name} incorrectly declared ${declaration.setType} ${declaration.suit}, giving it to the ${setWinner} team`;
      }
      
      // Check win condition
      const winner = checkWinCondition(room.capturedSets);
      if (winner) {
        room.winner = winner;
        room.gameStatus = 'finished';
        room.lastAction = winner === 'draw'
          ? 'Game ended in a draw!' 
          : `${winner} team wins the game!`;
      } else {
        // Next turn goes to a player on the team that won the set
        const teamPlayers = room.players.filter(p => p.team === setWinner);
        room.currentTurnPlayerId = teamPlayers[0].id;
      }
      
      // Update room
      gameRooms.set(roomName, room);
      
      // Broadcast updates
      io.to(roomName).emit('gameUpdate', room);
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
}

// This is a simple endpoint that will be used to establish the WebSocket connection
export async function GET(req: NextRequest) {
  // Return a simple response to acknowledge the request
  // The actual WebSocket connection will be handled by the Socket.io server
  return NextResponse.json({ ok: true });
} 