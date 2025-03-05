'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGameStore } from '@/stores/gameStore';
import { Card, Player, Team, SetType, CardRequest, SetDeclaration } from '@/types/game';
import React from 'react';
import { initializeSocket, cleanup, joinRoom, createRoom, onRoomUpdate, onGameStarted, onHandUpdate, onActionUpdate, onGameUpdate, joinTeam, shuffleTeams, startGame, requestCard, declareSet, claimTurn } from '@/utils/socketClient';

// Track socket initialization at module level to prevent multiple initializations
let socketInitialized = false;

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const roomName = params.roomName as string;
  const { 
    playerName, 
    gameState, 
    errorMessage,
    joinRoom,
    createRoom,
    joinTeam,
    shuffleTeams,
    startGame,
    requestCard,
    declareSet,
    claimTurn,
    reset,
    setErrorMessage
  } = useGameStore();
  
  const [requestCardPlayer, setRequestCardPlayer] = useState<string | null>(null);
  const [requestCardSuit, setRequestCardSuit] = useState<Card['suit'] | null>(null);
  const [requestCardRank, setRequestCardRank] = useState<Card['rank'] | null>(null);
  const [requestCardSetType, setRequestCardSetType] = useState<Card['setType'] | null>(null);
  const [declareSuit, setDeclareSuit] = useState<Card['suit'] | null>(null);
  const [declareSetType, setDeclareSetType] = useState<SetType | null>(null);
  
  // Add a ref to track component mount state to prevent race conditions
  const isMounted = React.useRef(false);
  // Track if cleanup has been called
  const cleanupCalled = React.useRef(false);
  // Track elapsed time since mounting to avoid premature cleanup
  const mountTime = React.useRef(Date.now());
  // Track if socket has been initialized
  const socketInitializedRef = React.useRef(false);
  // Track joining status to prevent duplicate joins
  const isJoiningRoom = React.useRef(false);
  // Track if reset has been called to prevent infinite loops
  const resetCalled = React.useRef(false);
  
  // Add loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  
  // Get player name from localStorage
  const getPlayerNameFromLocalStorage = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('playerName') || '';
    }
    return '';
  };
  
  // Redirect to home if no player name
  useEffect(() => {
    // Make sure isMounted is set first thing
    isMounted.current = true;
    mountTime.current = Date.now();
    
    // Reset cleanup flag on mount
    cleanupCalled.current = false;
    
    // First check if there's a player name in the store
    if (!playerName) {
      // Try to get from localStorage
      const storedName = getPlayerNameFromLocalStorage();
      
      if (storedName) {
        console.log(`No player name in store, but found stored player name: ${storedName}`);
        // Update the store with the name from localStorage
        useGameStore.getState().setPlayerName(storedName);
        // Let the next useEffect handle the socket initialization
        return;
      } else {
        // No player name at all, redirect to home after a short delay
        console.log('No player name found, redirecting to home');
        const redirectTimer = setTimeout(() => {
          if (isMounted.current) {
            router.push('/');
          }
        }, 500);
        
        return () => {
          clearTimeout(redirectTimer);
        };
      }
    }
    
    // If we have a player name, show loading state briefly to avoid flashing UI
    // Reset loading state after a short delay
    const loadingTimer = setTimeout(() => {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }, 1500);
    
    return () => {
      clearTimeout(loadingTimer);
    };
  }, [playerName, router]);
  
  // Initialize socket connection and join/create room
  useEffect(() => {
    // Skip initialization if no player name or already initialized
    if (!playerName || socketInitializedRef.current || isJoiningRoom.current) {
      return;
    }
    
    if (!isMounted.current) {
      return;
    }
    
    console.log(`Room page mounting, initializing socket for room ${roomName} with player ${playerName}...`);
    
    // Mark that we're starting the socket initialization
    socketInitializedRef.current = true;
    isJoiningRoom.current = true;
    
    // Make sure component cleans up if unmounted during this async operation
    if (!isMounted.current) {
      socketInitializedRef.current = false;
      isJoiningRoom.current = false;
      return;
    }
    
    // Initialize socket connection
    console.log('Initializing socket connection...');
    initializeSocket();
    
    // Parse URL parameters
    const searchParams = typeof window !== 'undefined' 
      ? new URLSearchParams(window.location.search) 
      : new URLSearchParams('');
    const isNewRoom = searchParams.get('new') === 'true';
    const playerCount = Number(searchParams.get('playerCount')) as 6 | 8 || 6;
    
    // Give socket time to connect before joining/creating room
    const roomTimer = setTimeout(() => {
      if (!isMounted.current) {
        console.log('Component unmounted before room join/create, aborting');
        isJoiningRoom.current = false;
        return;
      }
      
      console.log(`Attempting to ${isNewRoom ? 'create' : 'join'} room ${roomName} with player ${playerName}`);
      
      try {
        if (isNewRoom) {
          console.log(`Creating new room ${roomName} with ${playerCount} players...`);
          createRoom(roomName, playerCount);
        } else {
          console.log(`Joining existing room ${roomName}...`);
          joinRoom(roomName);
        }
      } catch (error) {
        console.error('Error joining/creating room:', error);
        setLocalError('Failed to join room. Please try again.');
      } finally {
        isJoiningRoom.current = false;
      }
    }, 1000);
    
    return () => {
      clearTimeout(roomTimer);
      console.log('Socket initialization effect unmounting');
    };
  }, [playerName, roomName, createRoom, joinRoom]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Only run cleanup if component was mounted for at least 2 seconds
      // This helps avoid cleanup during quick navigations or remounts
      const mountDuration = Date.now() - mountTime.current;
      const shouldCleanup = mountDuration > 2000;
      
      console.log(`Room page unmounting after ${mountDuration}ms, will cleanup: ${shouldCleanup}`);
      isMounted.current = false;
      
      // Only run cleanup once and if component was mounted long enough
      if (!cleanupCalled.current && !resetCalled.current && shouldCleanup) {
        cleanupCalled.current = true;
        resetCalled.current = true;
        socketInitializedRef.current = false;
        
        // Add a small delay before cleanup to ensure we're really unmounting
        setTimeout(() => {
          if (!isMounted.current) {
            console.log('Performing delayed cleanup of socket connection');
            reset();
          }
        }, 300);
      }
    };
  }, []);
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-8 max-w-md w-full bg-white rounded-lg shadow-md">
          <h2 className="text-2xl font-bold mb-4">Loading Game...</h2>
          <div className="w-full max-w-md mx-auto">
            <div className="animate-pulse h-2 bg-blue-500 rounded"></div>
          </div>
        </div>
      </div>
    );
  }
  
  // Show error state
  if (localError || errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-8 max-w-md w-full bg-white rounded-lg shadow-md">
          <h2 className="text-2xl font-bold mb-4 text-red-600">Error</h2>
          <p className="mb-6 text-gray-700">{localError || errorMessage}</p>
          <button 
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }
  
  // Check if current player is admin
  const isAdmin = gameState?.adminId === gameState?.players.find(p => p.name === playerName)?.id;
  
  // Find current player
  const currentPlayer = gameState?.players.find(p => p.name === playerName);
  
  // Handle join team
  const handleJoinTeam = (team: Team) => {
    joinTeam(team);
  };
  
  // Handle request card
  const handleRequestCard = () => {
    if (requestCardPlayer && requestCardSuit && requestCardRank && requestCardSetType) {
      // Call the requestCard function from gameStore with the proper parameters
      requestCard(
        requestCardPlayer,
        requestCardSuit, 
        requestCardRank, 
        requestCardSetType
      );
      
      // Reset selection
      setRequestCardPlayer(null);
      setRequestCardSuit(null);
      setRequestCardRank(null);
      setRequestCardSetType(null);
    } else {
      // Show an error or alert the user that all fields must be selected
      console.error('All fields must be selected to request a card');
    }
  };
  
  // Handle declare set
  const handleDeclareSet = () => {
    if (declareSuit && declareSetType) {
      // Call the declareSet function from gameStore with proper parameters
      declareSet(declareSuit, declareSetType);
      
      // Reset selection
      setDeclareSuit(null);
      setDeclareSetType(null);
    } else {
      // Show an error message
      setErrorMessage('Both suit and set type must be selected to declare a set');
      
      // Clear error after 5 seconds
      setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
    }
  };
  
  // Handle claim turn
  const handleClaimTurn = () => {
    if (!gameState || !currentPlayer?.id) {
      setErrorMessage("You must be in a room to claim your turn");
      return;
    }

    claimTurn();
  };
  
  // Check if it's current player's turn
  const isPlayerTurn = gameState?.currentTurnPlayerId === currentPlayer?.id;
  
  // Get current player's team
  const currentTeam = currentPlayer?.team;
  
  // Group players by team
  const unassignedPlayers = gameState?.players.filter(p => p.team === 'unassigned') || [];
  const redTeamPlayers = gameState?.players.filter(p => p.team === 'red') || [];
  const blueTeamPlayers = gameState?.players.filter(p => p.team === 'blue') || [];
  
  // Get opponents (players from the other team)
  const opponents = gameState?.players.filter(p => p.team !== currentTeam && p.team !== 'unassigned') || [];
  
  // Render player list by team
  const renderPlayerList = (players: Player[], teamName: string) => (
    <div className={`mb-4 p-3 rounded-md ${teamName === 'red' ? 'bg-red-100' : teamName === 'blue' ? 'bg-blue-100' : 'bg-gray-100'}`}>
      <h3 className="font-bold mb-2">{teamName.charAt(0).toUpperCase() + teamName.slice(1)} Team</h3>
      <ul className="space-y-1">
        {players.map((player, index) => (
          <li key={`${teamName}-${player.name}-${index}`} className="flex items-center justify-between">
            <div className="flex items-center">
              <span className={`${player.name === playerName ? 'font-bold' : ''} ${!player.connected ? 'text-gray-400' : ''}`}>
                {player.name} {player.name === playerName && '(You)'} {!player.connected && '(Disconnected)'}
              </span>
              {gameState?.currentTurnPlayerId === player.id && (
                <span className="ml-2 px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
                  Current Turn
                </span>
              )}
            </div>
            {player.canClaimTurn && player.name === playerName && (
              <button
                onClick={handleClaimTurn}
                disabled={!gameState || gameState.currentTurnPlayerId === player.id}
                className="ml-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                Claim Turn
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
  
  // Render captured sets
  const renderCapturedSets = () => {
    if (!gameState?.capturedSets.length) return null;
    
    const redSets = gameState.capturedSets.filter(set => set.team === 'red');
    const blueSets = gameState.capturedSets.filter(set => set.team === 'blue');
    
    return (
      <div className="mb-6">
        <h3 className="font-bold mb-2">Captured Sets</h3>
        <div className="flex space-x-4">
          <div className="flex-1 p-3 bg-red-100 rounded-md">
            <h4 className="font-semibold">Red Team: {redSets.length}</h4>
            <ul className="text-sm">
              {redSets.map((set, index) => (
                <li key={`red-set-${set.suit}-${set.setType}-${index}`}>
                  {set.setType} {set.suit}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 p-3 bg-blue-100 rounded-md">
            <h4 className="font-semibold">Blue Team: {blueSets.length}</h4>
            <ul className="text-sm">
              {blueSets.map((set, index) => (
                <li key={`blue-set-${set.suit}-${set.setType}-${index}`}>
                  {set.setType} {set.suit}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  };
  
  // Render player's hand
  const renderPlayerHand = () => {
    if (!gameState?.players.find(p => p.name === playerName)?.hand.length) return null;
    
    // Group cards by suit and set type
    const groupedCards: Record<string, Card[]> = {};
    
    gameState.players.find(p => p.name === playerName)?.hand.forEach(card => {
      const key = `${card.suit}-${card.setType}`;
      if (!groupedCards[key]) {
        groupedCards[key] = [];
      }
      groupedCards[key].push(card);
    });
    
    // Get suit emoji
    const getSuitEmoji = (suit: Card['suit']) => {
      switch (suit) {
        case 'hearts': return '♥️';
        case 'diamonds': return '♦️';
        case 'clubs': return '♣️';
        case 'spades': return '♠️';
        default: return '';
      }
    };
    
    return (
      <div className="mb-6">
        <h3 className="font-bold mb-2">Your Hand</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Object.entries(groupedCards).map(([key, cards], groupIndex) => {
            const [suit, setType] = key.split('-');
            const suitColor = suit === 'hearts' || suit === 'diamonds' ? 'text-red-600' : 'text-black';
            
            return (
              <div 
                key={`card-group-${key}-${groupIndex}`} 
                className="p-3 bg-white border rounded-md shadow-sm hover:shadow-md transition-shadow"
              >
                <h4 className={`font-semibold mb-2 flex items-center ${suitColor}`}>
                  <span className="mr-1">{getSuitEmoji(suit as Card['suit'])}</span>
                  <span>{setType} {suit}</span>
                </h4>
                <ul className="space-y-1">
                  {cards.map((card, cardIndex) => (
                    <li
                      key={`card-${card.suit}-${card.rank}-${cardIndex}`}
                      className="p-2 rounded flex justify-between items-center hover:bg-gray-50"
                    >
                      <span className={suitColor}>{card.rank}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  
  // Render game actions
  const renderGameActions = () => {
    if (gameState?.gameStatus !== 'playing') return null;
    
    // Get all suits and ranks in the game for reference
    const allSuits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const allLowerRanks: Card['rank'][] = ['ace', '2', '3', '4', '5', '6'];
    const allUpperRanks: Card['rank'][] = ['8', '9', '10', 'jack', 'queen', 'king'];
    
    // Get cards player has, organized by suit/set
    const playerCards = currentPlayer?.hand || [];
    
    // Group player's cards by suit and set type for easier checking
    const playerCardSets: Record<string, Card[]> = {};
    
    playerCards.forEach(card => {
      const key = `${card.suit}-${card.setType}`;
      if (!playerCardSets[key]) {
        playerCardSets[key] = [];
      }
      playerCardSets[key].push(card);
    });
    
    // Find all sets the player has at least one card from
    const playerSetsWithCards = Object.keys(playerCardSets).map(key => {
      const [suit, setType] = key.split('-');
      return { suit: suit as Card['suit'], setType: setType as SetType };
    });
    
    // Find card ranks the player doesn't have within sets they do have
    const getAvailableRanks = (suit: Card['suit'], setType: SetType): Card['rank'][] => {
      const playerCardsInSet = playerCardSets[`${suit}-${setType}`] || [];
      const playerRanksInSet = playerCardsInSet.map(card => card.rank);
      const baseRanks = setType === 'lower' ? allLowerRanks : allUpperRanks;
      
      // Filter out ranks the player already has in their hand
      return baseRanks.filter(rank => !playerRanksInSet.includes(rank));
    };
    
    return (
      <div className="mb-6">
        <h3 className="font-bold mb-2">Game Actions</h3>
        
        {isPlayerTurn ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-100 rounded-md">
              <p className="font-semibold mb-2">It's your turn!</p>
              
              <div className="mb-4">
                <h4 className="font-medium mb-1">Request a Card</h4>
                
                {playerSetsWithCards.length === 0 ? (
                  <p className="text-red-600">You don't have any cards to request with.</p>
                ) : (
                  <div className="flex flex-col space-y-4">
                    <div className="p-3 border rounded bg-blue-50">
                      <h5 className="font-medium mb-2">Request Rules:</h5>
                      <ul className="list-disc pl-5 text-sm">
                        <li>You can only request cards you <strong>don't</strong> already have</li>
                        <li>You can only request from sets where you already have at least one card</li>
                        <li>You can only request from opponents (not teammates)</li>
                      </ul>
                    </div>
                    
                    {/* Step 1: Select a set */}
                    <div className="p-3 border rounded">
                      <h5 className="font-medium mb-2">Step 1: Select a set to request from</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                        {playerSetsWithCards.map(({ suit, setType }) => {
                          const availableRanks = getAvailableRanks(suit, setType);
                          const hasAvailableCards = availableRanks.length > 0;
                          const isSelected = requestCardSuit === suit && requestCardSetType === setType;
                          
                          return (
                            <button
                              key={`${suit}-${setType}`}
                              onClick={() => {
                                if (hasAvailableCards) {
                                  setRequestCardSuit(suit);
                                  setRequestCardSetType(setType);
                                  setRequestCardRank(null);
                                  setRequestCardPlayer(null);
                                }
                              }}
                              disabled={!hasAvailableCards}
                              className={`p-2 border rounded flex items-center justify-center ${
                                isSelected
                                  ? 'bg-blue-100 border-blue-500'
                                  : hasAvailableCards
                                  ? 'hover:bg-gray-100'
                                  : 'bg-gray-100 opacity-60 cursor-not-allowed'
                              }`}
                            >
                              <span className={suit === 'hearts' || suit === 'diamonds' ? 'text-red-600' : ''}>
                                {setType} {suit} ({availableRanks.length} available)
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Step 2: Select a rank */}
                    {requestCardSuit && requestCardSetType && (
                      <div className="p-3 border rounded">
                        <h5 className="font-medium mb-2">Step 2: Select a card rank to request</h5>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                          {getAvailableRanks(requestCardSuit, requestCardSetType).map(rank => (
                            <button
                              key={rank}
                              onClick={() => {
                                setRequestCardRank(rank);
                                setRequestCardPlayer(null);
                              }}
                              className={`p-2 border rounded ${
                                requestCardRank === rank
                                  ? 'bg-yellow-100 border-yellow-500'
                                  : 'hover:bg-gray-100'
                              }`}
                            >
                              {rank}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Step 3: Select an opponent */}
                    {requestCardSuit && requestCardSetType && requestCardRank && (
                      <div>
                        <h5 className="font-medium mb-2">Step 3: Select an opponent to request from</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                          {opponents
                            .filter(opponent => opponent.hand.length > 0) // Only show opponents who have cards
                            .map(opponent => (
                              <button
                                key={opponent.id}
                                onClick={() => setRequestCardPlayer(opponent.id)}
                                className={`p-2 border rounded flex items-center justify-center ${
                                  requestCardPlayer === opponent.id
                                    ? 'bg-blue-100 border-blue-500'
                                    : 'hover:bg-gray-100'
                                }`}
                              >
                                {opponent.name} {opponent.hand.length === 0 ? '(No cards)' : '(Has cards)'}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Summary and submit button */}
                    {requestCardSuit && requestCardRank && requestCardSetType && requestCardPlayer && (
                      <div className="p-3 border rounded bg-green-50">
                        <h5 className="font-medium mb-2">Request Summary:</h5>
                        <p>You will ask for the <strong>{requestCardRank}</strong> of <strong>{requestCardSuit}</strong> ({requestCardSetType}) from opponent {opponents.find(p => p.id === requestCardPlayer)?.name}</p>
                        
                        <button
                          onClick={handleRequestCard}
                          className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Request Card
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div>
                <h4 className="font-medium mb-1">Declare a Set</h4>
                <p className="text-sm text-gray-600 mb-2">
                  Declare when your team has all cards of a specific suit and type.
                </p>
                <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                  <select
                    value={declareSuit || ''}
                    onChange={(e) => setDeclareSuit(e.target.value as Card['suit'] || null)}
                    className="p-2 border rounded"
                  >
                    <option value="">Select suit</option>
                    {[...new Set(playerSetsWithCards.map(({ suit }) => suit))].map(suit => (
                      <option key={suit} value={suit}>
                        {suit.charAt(0).toUpperCase() + suit.slice(1)}
                      </option>
                    ))}
                  </select>
                  
                  <select
                    value={declareSetType || ''}
                    onChange={(e) => setDeclareSetType(e.target.value as SetType || null)}
                    className="p-2 border rounded"
                    disabled={!declareSuit}
                  >
                    <option value="">Select set type</option>
                    {[...new Set(
                      playerSetsWithCards
                        .filter(({ suit }) => suit === declareSuit)
                        .map(({ setType }) => setType)
                    )].map(setType => (
                      <option key={setType} value={setType}>
                        {setType === 'lower' ? 'Lower (A-6)' : 'Upper (8-K)'}
                      </option>
                    ))}
                  </select>
                  
                  <button
                    onClick={handleDeclareSet}
                    disabled={!declareSuit || !declareSetType}
                    className={`px-4 py-2 rounded-md ${
                      declareSuit && declareSetType
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    Declare Set
                  </button>
                </div>
                
                {(declareSuit || declareSetType) && !(declareSuit && declareSetType) && (
                  <p className="text-sm mt-1 text-orange-600">
                    Please select both a suit and set type to declare
                  </p>
                )}
                
                {declareSuit && declareSetType && (
                  <div className="mt-2 p-2 bg-yellow-100 rounded border border-yellow-300">
                    <p className="text-sm font-medium">
                      You are about to declare that your team has all cards in the {declareSetType} {declareSuit} set!
                    </p>
                    <p className="text-xs text-gray-700 mt-1">
                      If correct, your team gets the set. If wrong, the opposing team gets it.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gray-100 rounded-md">
            <p>Waiting for {gameState?.players.find(p => p.id === gameState.currentTurnPlayerId)?.name}'s turn...</p>
          </div>
        )}
      </div>
    );
  };
  
  // Render game status
  const renderGameStatus = () => {
    if (!gameState) return null;
    
    return (
      <div className="mb-6">
        <h3 className="font-bold mb-2">Game Status</h3>
        <div className="p-4 bg-white border rounded-md shadow-sm">
          <p className="mb-2">
            <span className="font-medium">Status:</span>{' '}
            <span className={`${
              gameState.gameStatus === 'waiting' ? 'text-yellow-600' :
              gameState.gameStatus === 'playing' ? 'text-green-600' :
              gameState.gameStatus === 'finished' ? 'text-blue-600' : ''
            } font-semibold`}>
              {gameState.gameStatus.charAt(0).toUpperCase() + gameState.gameStatus.slice(1)}
            </span>
          </p>
          
          {gameState.gameStatus === 'playing' && (
            <>
              <p className="mb-2">
                <span className="font-medium">Current Turn:</span>{' '}
                <span className="font-semibold">
                  {gameState.players.find(p => p.id === gameState.currentTurnPlayerId)?.name || 'Unknown'}
                  {gameState.currentTurnPlayerId === 
                    gameState.players.find(p => p.name === playerName)?.id && ' (Your Turn)'}
                </span>
              </p>
              
              <div className="mb-2">
                <span className="font-medium">Score:</span>{' '}
                <span className="font-semibold text-red-600 mr-2">
                  Red: {gameState.capturedSets.filter(set => set.team === 'red').length}
                </span>
                <span className="font-semibold text-blue-600">
                  Blue: {gameState.capturedSets.filter(set => set.team === 'blue').length}
                </span>
              </div>
              
              {gameState.lastAction && (
                <div className="mt-3 p-2 bg-gray-100 rounded text-sm">
                  <span className="font-medium">Last Action:</span> {gameState.lastAction}
                </div>
              )}
            </>
          )}
          
          {gameState.gameStatus === 'finished' && gameState.winner && (
            <div className={`mt-3 p-3 rounded font-bold text-center ${
              gameState.winner === 'red' ? 'bg-red-100 text-red-800' : 
              gameState.winner === 'blue' ? 'bg-blue-100 text-blue-800' : 
              'bg-gray-100'
            }`}>
              {gameState.winner === 'draw' 
                ? 'Game ended in a draw!' 
                : `${gameState.winner.toUpperCase()} TEAM WINS!`}
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // Render content based on game state
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="w-16 h-16 border-t-4 border-blue-500 border-solid rounded-full animate-spin mb-4"></div>
          <p className="text-lg font-medium">Connecting to room...</p>
          <p className="text-sm text-gray-500 mt-2">Please wait while we establish the connection</p>
        </div>
      );
    }
    
    if (errorMessage) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="max-w-md w-full bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <h2 className="text-xl font-bold text-red-700 mb-4">Connection Error</h2>
            <p className="text-red-600 mb-6">{errorMessage}</p>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Return to Home
            </button>
          </div>
        </div>
      );
    }
    
    if (!gameState) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="max-w-md w-full bg-white border rounded-lg p-6 text-center">
            <h2 className="text-xl font-bold mb-4">Waiting for Game State</h2>
            <p className="text-gray-600 mb-4">
              The connection has been established, but we're still waiting for the game state.
            </p>
            <div className="w-12 h-12 border-t-4 border-blue-500 border-solid rounded-full animate-spin mx-auto"></div>
          </div>
        </div>
      );
    }
    
    if (gameState.gameStatus === 'waiting') {
      return (
        <div>
          <h2 className="text-xl font-bold mb-4">Game Lobby</h2>
          
          {/* Team selection for unassigned players */}
          {currentPlayer?.team === 'unassigned' && (
            <div className="mb-6 p-4 bg-yellow-100 rounded-md">
              <h3 className="font-bold mb-2">Choose Your Team</h3>
              <div className="flex space-x-4">
                <button
                  onClick={() => handleJoinTeam('red')}
                  disabled={redTeamPlayers.length >= (gameState.playerCount / 2)}
                  className={`px-4 py-2 rounded-md ${
                    redTeamPlayers.length >= (gameState.playerCount / 2)
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  Join Red Team
                </button>
                <button
                  onClick={() => handleJoinTeam('blue')}
                  disabled={blueTeamPlayers.length >= (gameState.playerCount / 2)}
                  className={`px-4 py-2 rounded-md ${
                    blueTeamPlayers.length >= (gameState.playerCount / 2)
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Join Blue Team
                </button>
              </div>
            </div>
          )}
          
          {/* Admin controls */}
          {isAdmin && (
            <div className="mb-6 p-4 bg-purple-100 rounded-md">
              <h3 className="font-bold mb-2">Admin Controls</h3>
              <div className="flex space-x-4">
                <button
                  onClick={() => shuffleTeams()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Shuffle Teams
                </button>
                <button
                  onClick={() => startGame()}
                  disabled={
                    redTeamPlayers.length !== blueTeamPlayers.length ||
                    redTeamPlayers.length !== gameState.playerCount / 2
                  }
                  className={`px-4 py-2 rounded-md ${
                    redTeamPlayers.length === blueTeamPlayers.length &&
                    redTeamPlayers.length === gameState.playerCount / 2
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Start Game
                </button>
              </div>
              {redTeamPlayers.length !== blueTeamPlayers.length && (
                <p className="text-sm mt-2 text-red-600">Teams must be balanced to start the game.</p>
              )}
              {gameState.players.length < gameState.playerCount && (
                <p className="text-sm mt-2 text-red-600">
                  Waiting for more players. ({gameState.players.length}/{gameState.playerCount})
                </p>
              )}
            </div>
          )}
          
          {/* Player lists */}
          <div className="mb-6">
            <h3 className="font-bold mb-2">Players</h3>
            {renderPlayerList(unassignedPlayers, 'unassigned')}
            {renderPlayerList(redTeamPlayers, 'red')}
            {renderPlayerList(blueTeamPlayers, 'blue')}
          </div>
          
          <div className="text-sm text-gray-500">
            <p>Room: {roomName}</p>
            <p>Player Count: {gameState.playerCount}</p>
          </div>
        </div>
      );
    }
    
    // Game is in progress or finished
    return (
      <div>
        <h2 className="text-xl font-bold mb-4">
          {gameState.gameStatus === 'playing' ? 'Game in Progress' : 'Game Over'}
        </h2>
        
        {renderGameStatus()}
        {renderCapturedSets()}
        {renderPlayerHand()}
        {renderGameActions()}
        
        {/* Player lists */}
        <div className="mb-6">
          <h3 className="font-bold mb-2">Players</h3>
          {renderPlayerList(redTeamPlayers, 'red')}
          {renderPlayerList(blueTeamPlayers, 'blue')}
        </div>
      </div>
    );
  };
  
  return (
    <main className="min-h-screen p-4 bg-gray-100">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-blue-800">LIT Card Game</h1>
          <button
            onClick={() => {
              reset();
              router.push('/');
            }}
            className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Leave Game
          </button>
        </div>
        
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
            {errorMessage}
          </div>
        )}
        
        {renderContent()}
      </div>
    </main>
  );
} 