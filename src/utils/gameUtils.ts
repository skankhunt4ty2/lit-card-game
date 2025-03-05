import { v4 as uuidv4 } from 'uuid';
import { 
  Card, 
  Suit, 
  Rank, 
  SetType, 
  Player,
  Team,
  GameState
} from '../types/game';

// Create a standard deck of cards (excluding 7s)
export function createDeck(): Card[] {
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const lowerRanks: Rank[] = ['ace', '2', '3', '4', '5', '6'];
  const upperRanks: Rank[] = ['8', '9', '10', 'jack', 'queen', 'king'];
  
  const deck: Card[] = [];
  
  for (const suit of suits) {
    for (const rank of lowerRanks) {
      deck.push({
        suit,
        rank,
        setType: 'lower',
        id: uuidv4()
      });
    }
    
    for (const rank of upperRanks) {
      deck.push({
        suit,
        rank,
        setType: 'upper',
        id: uuidv4()
      });
    }
  }
  
  return deck;
}

// Fisher-Yates shuffle algorithm
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffledDeck = [...deck];
  for (let i = shuffledDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]];
  }
  return shuffledDeck;
}

// Deal cards to players
export function dealCards(players: Player[], playerCount: 6 | 8): Player[] {
  const deck = shuffleDeck(createDeck());
  const cardsPerPlayer = playerCount === 6 ? 8 : 6;
  
  const updatedPlayers = [...players];
  
  for (let i = 0; i < updatedPlayers.length; i++) {
    updatedPlayers[i].hand = deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer);
  }
  
  return updatedPlayers;
}

// Check if a player has at least one card from a specific set
export function hasCardFromSet(player: Player, suit: Suit, setType: SetType): boolean {
  return player.hand.some(card => card.suit === suit && card.setType === setType);
}

// Check if a request is valid (player must have at least one card from that set)
export function isValidRequest(
  requestingPlayer: Player,
  targetPlayer: Player,
  suit: Suit,
  setType: SetType
): boolean {
  // Player can only request from opposing team
  if (requestingPlayer.team === targetPlayer.team || targetPlayer.team === 'unassigned') {
    return false;
  }
  
  // Player must have at least one card from the set they're requesting
  return hasCardFromSet(requestingPlayer, suit, setType);
}

// Transfer a card from one player to another
export function transferCard(
  fromPlayer: Player,
  toPlayer: Player,
  suit: Suit,
  rank: Rank,
  setType: SetType
): { fromPlayer: Player; toPlayer: Player; success: boolean } {
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

// Check if a team has a complete set
export function teamHasCompleteSet(players: Player[], team: Team, suit: Suit, setType: SetType): boolean {
  const teamPlayers = players.filter(player => player.team === team);
  const teamCards = teamPlayers.flatMap(player => player.hand);
  
  const requiredRanks = setType === 'lower' 
    ? ['ace', '2', '3', '4', '5', '6'] 
    : ['8', '9', '10', 'jack', 'queen', 'king'];
  
  return requiredRanks.every(rank => 
    teamCards.some(card => card.suit === suit && card.rank === rank as Rank)
  );
}

// Determine winner if game is over
export function checkWinCondition(capturedSets: GameState['capturedSets']): Team | null {
  const redSets = capturedSets.filter(set => set.team === 'red').length;
  const blueSets = capturedSets.filter(set => set.team === 'blue').length;
  
  if (redSets > 4) return 'red';
  if (blueSets > 4) return 'blue';
  if (redSets === 4 && blueSets === 4) return 'draw' as Team;
  
  return null;
}

// Shuffle teams
export function shuffleTeams(players: Player[], playerCount: 6 | 8): Player[] {
  const playersCount = players.length;
  const teamsSize = playerCount === 6 ? 3 : 4;
  
  const shuffledPlayers = [...players];
  // Fisher-Yates shuffle
  for (let i = shuffledPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
  }
  
  // Assign teams
  for (let i = 0; i < playersCount; i++) {
    shuffledPlayers[i].team = i < teamsSize ? 'red' : 'blue';
  }
  
  return shuffledPlayers;
}

// Find the next player in turn order
export function getNextPlayer(currentPlayerId: string, players: Player[]): string {
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