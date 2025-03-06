import { create } from 'zustand';
import { GameState, Player, Card, Team, CardRequest, SetDeclaration } from '@/types/game';
import * as socketClient from '@/utils/socketClient';

// Get player name from localStorage if available (with SSR safety check)
const getStoredPlayerName = (): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('playerName') || '';
  }
  return '';
};

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

interface GameStore {
  // Player data
  playerName: string;
  playerId: string | null;
  playerHand: Card[];
  
  // Room data
  roomName: string | null;
  gameState: GameState | null;
  
  // UI state
  errorMessage: string | null;
  isConnecting: boolean;
  
  // Actions
  setPlayerName: (name: string) => void;
  createRoom: (roomName: string, playerCount: 6 | 8) => void;
  joinRoom: (roomName: string) => void;
  joinTeam: (team: Team) => void;
  shuffleTeams: () => void;
  startGame: () => void;
  requestCard: (targetPlayerId: string, suit: Card['suit'], rank: Card['rank'], setType: Card['setType']) => void;
  declareSet: (suit: Card['suit'], setType: Card['setType']) => void;
  claimTurn: () => void;
  setErrorMessage: (message: string | null) => void;
  reset: () => void;
}

const initialState = {
  playerName: getStoredPlayerName(),
  playerId: null,
  playerHand: [],
  roomName: null,
  gameState: null,
  errorMessage: null,
  isConnecting: false,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,
  
  setPlayerName: (name: string) => {
    // Also store in localStorage for persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem('playerName', name);
    }
    set({ playerName: name });
  },
  
  createRoom: (roomName: string, playerCount: 6 | 8) => {
    set({ isConnecting: true, errorMessage: null });
    
    socketClient.createRoom(
      get().playerName,
      roomName,
      playerCount,
      (data) => {
        set({
          playerId: data.playerId,
          roomName: data.roomName,
          isConnecting: false,
        });
        
        // Set up room update listener
        socketClient.onRoomUpdate((gameState) => {
          set({ gameState });
        });
        
        // Set up hand update listener
        socketClient.onHandUpdate((data) => {
          set({ playerHand: data.hand });
        });
        
        // Set up game started listener
        socketClient.onGameStarted((gameState) => {
          set({ gameState });
        });
        
        // Set up action update listener
        socketClient.onActionUpdate((data) => {
          set((state: GameStore) => ({
            gameState: state.gameState
              ? {
                  ...state.gameState,
                  lastAction: data.lastAction,
                  currentTurnPlayerId: data.currentTurnPlayerId,
                }
              : null,
          }));
        });
        
        // Set up game update listener
        socketClient.onGameUpdate((gameState) => {
          set({ gameState });
        });
      },
      (error) => {
        set({ errorMessage: error.message, isConnecting: false });
      }
    );
  },
  
  joinRoom: (roomName: string) => {
    set({ isConnecting: true, errorMessage: null });
    
    socketClient.joinRoom(
      get().playerName,
      roomName,
      (data) => {
        set({
          playerId: data.playerId,
          roomName: data.roomName,
          isConnecting: false,
        });
        
        // Set up room update listener
        socketClient.onRoomUpdate((gameState) => {
          set({ gameState });
        });
        
        // Set up hand update listener
        socketClient.onHandUpdate((data) => {
          set({ playerHand: data.hand });
        });
        
        // Set up game started listener
        socketClient.onGameStarted((gameState) => {
          set({ gameState });
        });
        
        // Set up action update listener
        socketClient.onActionUpdate((data) => {
          set((state: GameStore) => ({
            gameState: state.gameState
              ? {
                  ...state.gameState,
                  lastAction: data.lastAction,
                  currentTurnPlayerId: data.currentTurnPlayerId,
                }
              : null,
          }));
        });
        
        // Set up game update listener
        socketClient.onGameUpdate((gameState) => {
          set({ gameState });
        });
      },
      (error) => {
        set({ errorMessage: error.message, isConnecting: false });
      }
    );
  },
  
  joinTeam: (team: Team) => {
    const { roomName } = get();
    if (!roomName) return;
    
    socketClient.joinTeam(
      roomName,
      team,
      (error) => {
        set({ errorMessage: error.message });
      }
    );
  },
  
  shuffleTeams: () => {
    const { roomName } = get();
    if (!roomName) return;
    
    socketClient.shuffleTeams(
      roomName,
      (error) => {
        set({ errorMessage: error.message });
      }
    );
  },
  
  startGame: () => {
    const { roomName } = get();
    if (!roomName) return;
    
    socketClient.startGame(
      roomName,
      (error) => {
        set({ errorMessage: error.message });
      }
    );
  },
  
  requestCard: (targetPlayerId: string, suit: Card['suit'], rank: Card['rank'], setType: Card['setType']) => {
    const { roomName, playerId } = get();
    if (!roomName || !playerId) {
      set({ errorMessage: "You must be in a room to request cards" });
      return;
    }
    
    const request: CardRequest = {
      requestingPlayerId: playerId,
      targetPlayerId,
      requestedCard: { suit, rank, setType },
    };
    
    console.log(`Requesting card: ${rank} of ${suit} (${setType}) from player ${targetPlayerId}`);
    
    set({ errorMessage: null }); // Clear any previous errors
    
    socketClient.requestCard(
      roomName,
      request,
      (error) => {
        if (error.message) {
          set({ errorMessage: error.message });
          
          // Add a timeout to clear the error after 5 seconds
          setTimeout(() => {
            set(state => {
              // Only clear if it's still the same error message
              if (state.errorMessage === error.message) {
                return { errorMessage: null };
              }
              return state;
            });
          }, 5000);
        }
      }
    );
  },
  
  declareSet: (suit: Card['suit'], setType: Card['setType']) => {
    const { roomName, playerId } = get();
    if (!roomName || !playerId) {
      set({ errorMessage: "You must be in a room to declare a set" });
      return;
    }
    
    const declaration: SetDeclaration = {
      declaringPlayerId: playerId,
      suit,
      setType,
    };
    
    set({ errorMessage: null }); // Clear any previous errors
    
    socketClient.declareSet(
      roomName,
      declaration,
      (error) => {
        if (error.message) {
          set({ errorMessage: error.message });
          
          // Add a timeout to clear the error after 5 seconds
          setTimeout(() => {
            set(state => {
              // Only clear if it's still the same error message
              if (state.errorMessage === error.message) {
                return { errorMessage: null };
              }
              return state;
            });
          }, 5000);
        }
      }
    );
  },
  
  claimTurn: () => {
    const { roomName } = get();
    if (!roomName) {
      set({ errorMessage: "You must be in a room to claim a turn" });
      return;
    }
    
    set({ errorMessage: null }); // Clear any previous errors
    
    socketClient.claimTurn(
      roomName,
      (error) => {
        if (error.message) {
          set({ errorMessage: error.message });
          
          // Add a timeout to clear the error after 5 seconds
          setTimeout(() => {
            set(state => {
              // Only clear if it's still the same error message
              if (state.errorMessage === error.message) {
                return { errorMessage: null };
              }
              return state;
            });
          }, 5000);
        }
      }
    );
  },
  
  setErrorMessage: (message: string | null) => {
    set({ errorMessage: message });
  },
  
  reset: () => {
    // Only clean up if we have something to clean up
    const state = get();
    if (state.playerId || state.roomName) {
      console.log('Cleaning up socket connection in gameStore.reset()');
      socketClient.cleanup();
      set(initialState);
    } else {
      console.log('No active connection to clean up in gameStore.reset()');
    }
  },
})); 