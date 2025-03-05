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

// Initialize socket connection
export function initializeSocket(): Socket {
  // Return existing socket if it exists and is connected
  if (socket && socket.connected) {
    console.log('Reusing existing socket connection:', socket.id);
    return socket;
  }
  
  // Don't attempt to reconnect if we're in cleanup mode or already connecting
  if (isCleaningUp || isConnecting) {
    console.log('Not connecting - in cleanup or already connecting mode');
    // Return existing socket or a dummy one that won't do anything
    return socket || io('http://localhost:3002', { autoConnect: false });
  }

  console.log('Initializing new socket connection...');
  isConnecting = true;
  
  // Try to connect to each port in sequence
  const connectToNextPort = () => {
    if (connectionAttempts >= PORTS_TO_TRY.length || isCleaningUp) {
      console.error('Failed to connect to socket server after trying all ports');
      isConnecting = false;
      return socket || io('http://localhost:3002', { autoConnect: false });
    }
    
    const port = PORTS_TO_TRY[connectionAttempts];
    // Use window.location.origin when in browser environment
    const socketUrl = typeof window !== 'undefined' 
      ? `${window.location.protocol}//${window.location.hostname}:${port}`
      : `http://localhost:${port}`;
    
    console.log(`Attempting to connect to socket server at ${socketUrl} (Attempt ${connectionAttempts + 1} of ${PORTS_TO_TRY.length})`);
    
    if (socket) {
      // Try to clean up previous connection
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch (e) {
        console.error('Error cleaning up previous socket:', e);
      }
    }
    
    const newSocket = io(socketUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 3,
      timeout: CONNECTION_TIMEOUT_MS,
      transports: ['websocket', 'polling'],
    });
    
    // Clear any existing timeout
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    
    // Set connect timeout
    connectionTimeout = setTimeout(() => {
      console.log(`Connection to port ${port} timed out`);
      
      if (isCleaningUp) return;
      
      // Only close if connection is still pending
      if (newSocket && !newSocket.connected) {
        try {
          newSocket.close();
        } catch (e) {
          console.error('Error closing socket after timeout:', e);
        }
      }
      
      // Try next port
      connectionAttempts++;
      connectToNextPort();
    }, CONNECTION_TIMEOUT_MS);
    
    newSocket.on('connect', () => {
      console.log('Connected to server with ID:', newSocket.id);
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
      
      // Only update the global socket if we're not cleaning up
      if (!isCleaningUp) {
        socket = newSocket;
        isConnecting = false;
      }
    });
    
    newSocket.on('connect_error', (error) => {
      console.error(`Connection error to port ${port}:`, error.message);
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
      
      // Try next port if not in cleanup
      if (!isCleaningUp) {
        connectionAttempts++;
        try {
          newSocket.close();
        } catch (e) {
          console.error('Error closing socket after connect error:', e);
        }
        connectToNextPort();
      }
    });
    
    newSocket.on('disconnect', (reason) => {
      console.log(`Disconnected from server: ${reason}`);
      
      // Auto-reconnect if unexpected disconnect and not cleaning up
      if (reason === 'io server disconnect' && !isCleaningUp) {
        console.log('Server disconnected us, trying to reconnect...');
        newSocket.connect();
      }
    });
    
    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });
    
    return newSocket;
  };
  
  return connectToNextPort();
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
  
  const socket = initializeSocket();
  
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
  // Don't try to create if we're in cleanup mode
  if (isCleaningUp) {
    console.log('Not creating room - in cleanup mode');
    onError({ message: 'Connection is being cleaned up, please try again in a moment' });
    return;
  }
  
  // Don't create with empty name or room
  if (!playerName || !roomName) {
    console.error('Cannot create room with empty player name or room name');
    onError({ message: 'Player name and room name are required' });
    return;
  }
  
  console.log(`Attempting to create room ${roomName} as ${playerName} with ${playerCount} players`);
  
  const socket = initializeSocket();
  
  // Skip if already created/joined with the same parameters
  if (hasJoinedRoom && currentPlayerName === playerName && currentRoomName === roomName) {
    console.log(`Already created room ${roomName} as ${playerName}, skipping duplicate creation`);
    // If we have the playerId, we can simulate the onCreated callback
    if (currentPlayerId) {
      onCreated({ roomName, playerId: currentPlayerId });
    }
    return;
  }
  
  // Remove any existing listeners to prevent duplicates
  socket.off('roomCreated');
  socket.off('error');
  socket.off('connect_error');
  
  // Add a timeout to handle cases where the server never responds
  const createTimeout = setTimeout(() => {
    console.error(`Timed out waiting to create room ${roomName}`);
    socket.off('roomCreated');
    socket.off('error');
    socket.off('connect_error');
    onError({ message: 'Timed out waiting to create room. The server may be offline.' });
  }, 10000); // 10 second timeout
  
  // Handle connection errors
  socket.on('connect_error', (error) => {
    clearTimeout(createTimeout);
    console.error(`Connection error while creating room ${roomName}:`, error.message);
    socket.off('roomCreated');
    socket.off('error');
    socket.off('connect_error');
    onError({ message: `Connection error: ${error.message}` });
  });
  
  // Emit create event
  try {
    socket.emit('createRoom', { playerName, roomName, playerCount });
  } catch (e) {
    clearTimeout(createTimeout);
    console.error(`Error emitting createRoom event:`, e);
    onError({ message: 'Failed to send create request' });
    return;
  }
  
  socket.on('roomCreated', (data) => {
    clearTimeout(createTimeout);
    socket.off('connect_error');
    
    // Store the player information
    currentPlayerId = data.playerId;
    currentPlayerName = playerName;
    currentRoomName = roomName;
    hasJoinedRoom = true;
    
    console.log(`Successfully created room ${roomName} with ID ${data.playerId}`);
    onCreated(data);
  });
  
  socket.on('error', (error) => {
    clearTimeout(createTimeout);
    socket.off('connect_error');
    console.error(`Error creating room ${roomName}:`, error.message);
    onError(error);
  });
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