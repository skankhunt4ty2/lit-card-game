// Types for the LIT card game

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'ace' | '2' | '3' | '4' | '5' | '6' | '8' | '9' | '10' | 'jack' | 'queen' | 'king';
export type SetType = 'lower' | 'upper';

export interface Card {
  suit: Suit;
  rank: Rank;
  setType: SetType; // lower (A-6) or upper (8-K)
  id: string; // unique identifier
}

export type Team = 'red' | 'blue' | 'unassigned' | 'draw';

export interface Player {
  id: string;
  name: string;
  team: Team;
  hand: Card[];
  connected: boolean;
  canClaimTurn?: boolean;
}

export interface CapturedSet {
  suit: Suit;
  setType: SetType;
  team: Team;
}

export interface GameState {
  roomName: string;
  players: Player[];
  currentTurnPlayerId: string | null;
  capturedSets: CapturedSet[];
  gameStatus: 'waiting' | 'playing' | 'finished';
  winner: Team | null;
  adminId: string;
  lastAction: string | null;
  playerCount: 6 | 8; // The game can only have 6 or 8 players
}

export interface CardRequest {
  requestingPlayerId: string;
  targetPlayerId: string;
  requestedCard: {
    suit: Suit;
    rank: Rank;
    setType: SetType;
  };
}

export interface SetDeclaration {
  declaringPlayerId: string;
  suit: Suit;
  setType: SetType;
}

export interface RoomConfig {
  roomName: string;
  playerCount: 6 | 8;
} 