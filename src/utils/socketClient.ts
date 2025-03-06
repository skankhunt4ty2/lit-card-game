import { io, Socket } from 'socket.io-client';
import { GameState, Player, Team, CardRequest, SetDeclaration } from '@/types/game';

// Add persistent flags to track connection state
let isCleaningUp = false;
let isConnecting = false;
let socket: Socket | null = null;
let connectionAttempts = 0;
let connectionTimeout: NodeJS.Timeout | null = null;
const MAX_ATTEMPTS = 5;
const CONNECTION_TIMEOUT_MS = 4000; // 4 seconds
const PORTS_TO_TRY = [3002, 3003, 3004, 3005, 3006, 3007];

// Track current player information to prevent duplicate connections
let currentPlayerId: string | null = null;
let currentPlayerName: string | null = null;
let currentRoomName: string | null = null;
let hasJoinedRoom = false;

// Global socket instance
let socketInitialized = false;
let socketInitializing = false;
let socketInitPromise: Promise<Socket> | null = null;

// Initialize socket connection with a simpler approach
export function initSocket(): Socket {
  console.log('initSocket called');
  
  if (socket) {
    console.log('Socket already exists, returning existing socket');
    return socket;
  }
  
  console.log('Initializing new socket connection...');
  const serverUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3002';
  console.log('Connecting to server URL:', serverUrl);
  
  socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 45000,
    forceNew: true,
    path: '/socket.io',
    withCredentials: true,
    secure: true,
    rejectUnauthorized: false,
    upgrade: true,
    rememberUpgrade: true,
    extraHeaders: {
      'Origin': process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'https://lit-card-game.vercel.app',
      'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'https://lit-card-game.vercel.app',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin'
    }
  });
  
  socket.on('connect', () => {
    console.log('Socket connected successfully');
  });
  
  socket.on('connect_error', (error) => {
    console.error('Socket connect error:', error);
    if (socket) {
      console.log('Trying polling transport...');
      socket.io.opts.transports = ['polling'];
      socket.connect();
    }
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
  
  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    if (reason === 'io server disconnect' && socket) {
      socket.connect();
    }
  });

  // Add more detailed error logging
  socket.io.on('reconnect_attempt', (attempt) => {
    console.log('reconnection attempt', attempt);
  });

  socket.io.on('reconnect_failed', () => {
    console.log('reconnection failed');
  });
  
  return socket;
}

// Get the current socket instance
export function getSocket(): Socket | null {
  return socket;
}

// Join an existing room
export function joinRoom(
  playerName: string, 
  roomName: string,
  onJoined: (data: { roomName: string, playerId: string }) => void,
  onError: (error: { message: string }) => void
): void {
  // Don't try to join if we're in cleanup mode
  if (isCleaningUp) {
    console.log('Not joining room - in cleanup mode');
    onError({ message: 'Connection is being cleaned up, please try again in a moment' });
    return;
  }
  
  // Don't join with empty name or room
  if (!playerName || !roomName) {
    console.error('Cannot join room with empty player name or room name');
    onError({ message: 'Player name and room name are required' });
    return;
  }
  
  console.log(`Attempting to join room ${roomName} as ${playerName}`);
  
  const socket = initSocket();
  
  // Skip if already joined with the same parameters
  if (hasJoinedRoom && currentPlayerName === playerName && currentRoomName === roomName) {
    console.log(`Already joined room ${roomName} as ${playerName}, skipping duplicate join`);
    // If we have the playerId, we can simulate the onJoined callback
    if (currentPlayerId) {
      onJoined({ roomName, playerId: currentPlayerId });
    }
    return;
  }
  
  // Remove any existing listeners to prevent duplicates
  socket.off('joinedRoom');
  socket.off('error');
  socket.off('connect_error');
  
  // Add a timeout to handle cases where the server never responds
  const joinTimeout = setTimeout(() => {
    console.error(`Timed out waiting to join room ${roomName}`);
    socket.off('joinedRoom');
    socket.off('error');
    socket.off('connect_error');
    onError({ message: 'Timed out waiting to join room. The server may be offline.' });
  }, 10000); // 10 second timeout
  
  // Handle connection errors
  socket.on('connect_error', (error) => {
    clearTimeout(joinTimeout);
    console.error(`Connection error while joining room ${roomName}:`, error.message);
    socket.off('joinedRoom');
    socket.off('error');
    socket.off('connect_error');
    onError({ message: `Connection error: ${error.message}` });
  });
  
  // Emit join event
  try {
    socket.emit('joinRoom', { playerName, roomName });
  } catch (e) {
    clearTimeout(joinTimeout);
    console.error(`Error emitting joinRoom event:`, e);
    onError({ message: 'Failed to send join request' });
    return;
  }
  
  socket.on('joinedRoom', (data) => {
    clearTimeout(joinTimeout);
    socket.off('connect_error');
    
    // Store the player information
    currentPlayerId = data.playerId;
    currentPlayerName = playerName;
    currentRoomName = roomName;
    hasJoinedRoom = true;
    
    console.log(`Successfully joined room ${roomName} with ID ${data.playerId}`);
    onJoined(data);
  });
  
  socket.on('error', (error) => {
    clearTimeout(joinTimeout);
    socket.off('connect_error');
    console.error(`Error joining room ${roomName}:`, error.message);
    onError(error);
  });
}

// Create a new room
export function createRoom(
  playerName: string, 
  roomName: string, 
  playerCount: 6 | 8,
  onCreated: (data: { roomName: string, playerId: string }) => void,
  onError: (error: { message: string }) => void
): void {
  console.log(`Attempting to create room ${roomName} as ${playerName} with ${playerCount} players`);
  
  // Initialize socket if not already done
  if (!socket) {
    try {
      initSocket();
    } catch (error) {
      console.error('Error initializing socket:', error);
      onError({ message: 'Failed to initialize socket connection. Please refresh the page and try again.' });
      return;
    }
  }
  
  if (!socket) {
    console.error('Socket still not initialized after attempt');
    onError({ message: 'Socket connection not established. Please refresh the page and try again.' });
    return;
  }
  
  // Wait for connection before proceeding
  if (!socket.connected) {
    console.log('Socket not connected, waiting for connection...');
    
    // Set up a timeout for connection
    const connectionTimeout = setTimeout(() => {
      console.error('Connection timeout');
      socket?.off('connect');
      onError({ message: 'Connection timeout. Please check your internet connection and try again.' });
    }, 45000); // Match server timeout
    
    socket.once('connect', () => {
      clearTimeout(connectionTimeout);
      console.log('Connected, now creating room...');
      emitCreateRoom(socket!, playerName, roomName, playerCount, onCreated, onError);
    });
    
    // Try to connect
    try {
      socket.connect();
    } catch (error) {
      console.error('Error connecting socket:', error);
      clearTimeout(connectionTimeout);
      onError({ message: 'Failed to connect to server. Please try again.' });
    }
  } else {
    // Socket already connected, proceed with room creation
    emitCreateRoom(socket, playerName, roomName, playerCount, onCreated, onError);
  }
}

// Helper function to emit createRoom event
function emitCreateRoom(
  socket: Socket,
  playerName: string,
  roomName: string,
  playerCount: 6 | 8,
  onCreated: (data: { roomName: string, playerId: string }) => void,
  onError: (error: { message: string }) => void
) {
  // Clear any previous listeners to avoid duplicates
  socket.off('roomCreated');
  socket.off('error:createRoom');
  
  // Set up a timeout for room creation (20 seconds)
  const timeoutId = setTimeout(() => {
    console.error(`Timed out waiting to create room ${roomName}`);
    socket.off('roomCreated');
    socket.off('error:createRoom');
    onError({ message: 'Connection timed out while creating room. Please try again.' });
  }, 20000);

  // Listen for successful room creation
  socket.on('roomCreated', (data: { roomName: string, playerId: string }) => {
    clearTimeout(timeoutId);
    socket.off('error:createRoom');
    console.log(`Room ${data.roomName} created successfully, player ID: ${data.playerId}`);
    onCreated(data);
  });

  // Listen for errors
  socket.on('error:createRoom', (error: { message: string }) => {
    clearTimeout(timeoutId);
    socket.off('roomCreated');
    console.error(`Error creating room ${roomName}:`, error.message);
    onError(error);
  });

  // Emit the createRoom event
  try {
    console.log(`Emitting createRoom event for room ${roomName}`);
    socket.emit('createRoom', { playerName, roomName, playerCount });
  } catch (error) {
    console.error('Error emitting createRoom event:', error);
    clearTimeout(timeoutId);
    onError({ message: 'Failed to send room creation request. Please try again.' });
  }
}

// Join a team
export function joinTeam(
  roomName: string,
  team: Team,
  onError: (error: { message: string }) => void
): void {
  const socket = getSocket();
  if (!socket) return;
  
  // Remove any existing listeners to prevent duplicates
  socket.off('error');
  
  socket.emit('joinTeam', { roomName, team });
  socket.on('error', onError);
}

// Shuffle teams (admin only)
export function shuffleTeams(
  roomName: string,
  onError: (error: { message: string }) => void
): void {
  const socket = getSocket();
  if (!socket) return;
  
  // Remove any existing listeners to prevent duplicates
  socket.off('error');
  
  socket.emit('shuffleTeams', { roomName });
  socket.on('error', onError);
}

// Start game (admin only)
export function startGame(
  roomName: string,
  onError: (error: { message: string }) => void
): void {
  const socket = getSocket();
  if (!socket) return;
  
  // Remove any existing listeners to prevent duplicates
  socket.off('error');
  
  socket.emit('startGame', { roomName });
  socket.on('error', onError);
}

// Request a card from another player
export function requestCard(
  roomName: string,
  request: CardRequest,
  onError: (error: { message: string }) => void
): void {
  const socket = getSocket();
  if (!socket) return;
  
  // Remove any existing listeners to prevent duplicates
  socket.off('error');
  
  socket.emit('requestCard', { roomName, request });
  socket.on('error', onError);
}

// Declare a set
export function declareSet(
  roomName: string,
  declaration: SetDeclaration,
  onError: (error: { message: string }) => void
): void {
  const socket = getSocket();
  if (!socket) return;
  
  // Remove any existing listeners to prevent duplicates
  socket.off('error');
  
  socket.emit('declareSet', { roomName, declaration });
  socket.on('error', onError);
}

// Claim turn after set declaration
export function claimTurn(
  roomName: string,
  onError: (error: { message: string }) => void
): void {
  const socket = getSocket();
  if (!socket) return;
  
  // Remove any existing listeners to prevent duplicates
  socket.off('error');
  
  socket.emit('claimTurn', { roomName });
  socket.on('error', onError);
}

// Listen for room updates
export function onRoomUpdate(callback: (room: GameState) => void): () => void {
  const socket = getSocket();
  if (!socket) return () => {};
  
  // Remove any existing listeners to prevent duplicates
  socket.off('roomUpdate');
  
  socket.on('roomUpdate', callback);
  
  return () => {
    socket.off('roomUpdate', callback);
  };
}

// Listen for game started event
export function onGameStarted(callback: (room: GameState) => void): () => void {
  const socket = getSocket();
  if (!socket) return () => {};
  
  // Remove any existing listeners to prevent duplicates
  socket.off('gameStarted');
  
  socket.on('gameStarted', callback);
  
  return () => {
    socket.off('gameStarted', callback);
  };
}

// Listen for hand updates
export function onHandUpdate(callback: (data: { hand: Player['hand'] }) => void): () => void {
  const socket = getSocket();
  if (!socket) return () => {};
  
  // Remove any existing listeners to prevent duplicates
  socket.off('updateHand');
  
  socket.on('updateHand', callback);
  
  return () => {
    socket.off('updateHand', callback);
  };
}

// Listen for action updates
export function onActionUpdate(
  callback: (data: { lastAction: string | null, currentTurnPlayerId: string | null }) => void
): () => void {
  const socket = getSocket();
  if (!socket) return () => {};
  
  // Remove any existing listeners to prevent duplicates
  socket.off('actionUpdate');
  
  socket.on('actionUpdate', callback);
  
  return () => {
    socket.off('actionUpdate', callback);
  };
}

// Listen for game updates
export function onGameUpdate(callback: (room: GameState) => void): () => void {
  const socket = getSocket();
  if (!socket) return () => {};
  
  // Remove any existing listeners to prevent duplicates
  socket.off('gameUpdate');
  
  socket.on('gameUpdate', callback);
  
  return () => {
    socket.off('gameUpdate', callback);
  };
}

// Cleanup function to reset socket state
export function cleanup(): void {
  console.log('Cleaning up socket connection...');
  
  // Set flags first to prevent race conditions
  isCleaningUp = true;
  isConnecting = false; // Stop any in-progress connections
  
  // Add a more aggressive approach to handle race conditions
  // Clear connection attempt tracking
  connectionAttempts = 0;
  
  // Wait a bit before doing the actual cleanup to allow in-flight operations to settle
  setTimeout(() => {
    // Reset connection state variables
    currentPlayerId = null;
    currentPlayerName = null;
    currentRoomName = null;
    hasJoinedRoom = false;
    
    // Clear any connection timeout
    if (connectionTimeout) {
      console.log('Clearing connection timeout');
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
    
    // Clean up socket if it exists
    if (socket) {
      try {
        // Remove all listeners first
        console.log('Removing socket event listeners...');
        try {
          socket.removeAllListeners();
          socket.off();
        } catch (e) {
          console.error('Error removing socket listeners:', e);
        }
        
        // Only try to disconnect if we're connected
        if (socket.connected) {
          console.log('Disconnecting connected socket...');
          try {
            socket.disconnect();
          } catch (e) {
            console.error('Error disconnecting socket:', e);
          }
        } else {
          console.log('Socket already disconnected, closing...');
          try {
            socket.close();
          } catch (e) {
            console.error('Error closing socket:', e);
          }
        }
      } catch (error) {
        console.error('Error during socket cleanup:', error);
      }
      
      // Null out the socket reference
      socket = null;
    }
    
    console.log('Socket connection cleaned up');
    
    // Reset the cleanup flag after a longer delay
    setTimeout(() => {
      isCleaningUp = false;
      console.log('Socket cleanup complete, ready for new connections');
    }, 1500); // Longer delay to ensure full cleanup
  }, 100); // Short delay before starting cleanup
} 