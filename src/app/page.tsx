'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/stores/gameStore';

export default function Home() {
  const router = useRouter();
  const { setPlayerName, createRoom, joinRoom, errorMessage } = useGameStore();
  
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [playerCount, setPlayerCount] = useState<6 | 8>(6);
  const [mode, setMode] = useState<'join' | 'create' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    if (!name.trim()) {
      alert('Please enter your name');
      setIsSubmitting(false);
      return;
    }
    
    if (!roomName.trim()) {
      alert('Please enter a room name');
      setIsSubmitting(false);
      return;
    }
    
    try {
      // Save player name to localStorage for persistence
      localStorage.setItem('playerName', name);
      
      // Set player name in store
      setPlayerName(name);
      
      // Create or join room - make sure connection is established first
      if (mode === 'create') {
        // Create room first with a longer wait time
        await new Promise<void>((resolve) => {
          console.log(`Creating room ${roomName} with player ${name}`);
          createRoom(roomName, playerCount);
          // Wait longer to ensure socket connection is established
          setTimeout(resolve, 1000);
        });
        
        // Navigate with query params to indicate it's a new room
        router.push(`/room/${roomName}?new=true&playerCount=${playerCount}`);
      } else if (mode === 'join') {
        await new Promise<void>((resolve) => {
          console.log(`Joining room ${roomName} with player ${name}`);
          joinRoom(roomName);
          // Wait longer to ensure socket connection is established
          setTimeout(resolve, 1000);
        });
        
        // Navigate without query params for joining existing room
        router.push(`/room/${roomName}`);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      setIsSubmitting(false);
    }
  };
  
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gray-100">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-center mb-6 text-blue-800">LIT Card Game</h1>
        
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
            {errorMessage}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Your Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          
          <div>
            <label htmlFor="roomName" className="block text-sm font-medium text-gray-700">
              Room Name
            </label>
            <input
              type="text"
              id="roomName"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          
          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Number of Players
              </label>
              <div className="mt-1 flex space-x-4">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    name="playerCount"
                    checked={playerCount === 6}
                    onChange={() => setPlayerCount(6)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2">6 Players</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    name="playerCount"
                    checked={playerCount === 8}
                    onChange={() => setPlayerCount(8)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2">8 Players</span>
                </label>
              </div>
            </div>
          )}
          
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={() => setMode('join')}
              className={`flex-1 py-2 px-4 border rounded-md shadow-sm text-sm font-medium ${
                mode === 'join'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Join Room
            </button>
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 py-2 px-4 border rounded-md shadow-sm text-sm font-medium ${
                mode === 'create'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Create Room
            </button>
          </div>
          
          <button
            type="submit"
            disabled={!mode}
            className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
              mode
                ? 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {mode === 'create' ? 'Create & Join' : mode === 'join' ? 'Join Game' : 'Select an Option'}
          </button>
        </form>
        
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>A team-based card game for 6 or 8 players</p>
        </div>
      </div>
    </main>
  );
}
