# LIT Card Game

A multiplayer card game where teams compete to collect sets of cards.

## Game Rules

- The game is played with 6 or 8 players, divided into two teams (Red and Blue).
- Each player is dealt cards from a 48-card deck (no 7s).
- Players take turns asking opponents for specific cards to complete sets.
- A set consists of either all the lower cards (A-6) or all the upper cards (8-K) of a suit.
- When a team collects a complete set, they declare it and score a point.
- The first team to score 5 points wins the game.

## Running the Game

### Option 1: Standalone Server (Recommended)

1. Install dependencies:
   ```
   npm install
   ```

2. Start the standalone server:
   ```
   npm run server
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3002
   ```

### Option 2: Next.js Development Server

1. Install dependencies:
   ```
   npm install
   ```

2. Start the Next.js development server:
   ```
   npm run dev
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

### Testing with the Test Client

For quick testing without the full UI, you can use the included test client:

1. Start the standalone server:
   ```
   npm run server
   ```

2. Open the test client in your browser:
   ```
   file:///path/to/your/project/test-client.html
   ```

3. Use the test client to:
   - Create or join rooms
   - Join teams
   - Start games
   - View game state updates in real-time

## How to Play

1. Create a room by entering your name, a room name, and selecting the number of players (6 or 8).
2. Share the room name with other players so they can join.
3. Assign players to teams (Red or Blue).
4. Once teams are balanced and all players have joined, the admin can start the game.
5. On your turn:
   - Request a specific card from an opponent on the other team.
   - If they have the card, you get it and can make another request.
   - If they don't have the card, your turn ends.
6. When your team has collected all cards in a set, declare it to score a point.
7. The first team to score 5 points wins the game.

## Technologies Used

- Next.js
- React
- Socket.IO
- TypeScript
- Tailwind CSS

## Technical Implementation

This project is built with:
- Next.js (React framework)
- TypeScript
- Socket.io for real-time communication
- Tailwind CSS for styling
- Zustand for state management

## Getting Started

### Prerequisites
- Node.js 18.0 or higher
- npm or yarn

### Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/lit-game.git
cd lit-game
```

2. Install dependencies:
```
npm install
```

3. Run the development server:
```
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Deployment

The game can be deployed to platforms like Vercel or Netlify:

```
npm run build
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspired by traditional card games like Literature and Fish
- Built as a learning project for real-time multiplayer game development

## Development Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file:
```bash
NEXT_PUBLIC_SOCKET_SERVER_URL=http://localhost:3002
```

3. Start the development server:
```bash
npm run dev
```

## Production Deployment

### Socket.IO Server (Railway)
1. The server will automatically use the `PORT` environment variable provided by Railway
2. Set the following environment variables in Railway:
   - `NODE_ENV=production`
   - `CORS_ORIGIN=https://your-vercel-app-url.vercel.app`

### Next.js Client (Vercel)
1. Set the following environment variables in Vercel:
   - `NEXT_PUBLIC_SOCKET_SERVER_URL=https://your-railway-app-url.railway.app`

## Environment Variables

- `NEXT_PUBLIC_SOCKET_SERVER_URL`: URL of the Socket.IO server
- `CORS_ORIGIN`: Allowed origin for CORS (in production)
- `PORT`: Port for the Socket.IO server (provided by Railway in production)
- `NODE_ENV`: Environment mode ('development' or 'production')

# LIT Card Game Socket Server

This is the Socket.IO server for the LIT Card Game, handling real-time communication between players.

## Environment Variables

Required environment variables:
- `PORT`: Server port (default: 10000)
- `NODE_ENV`: Environment (development/production)
- `CORS_ORIGIN`: Allowed origin for CORS (e.g., https://lit-card-game.vercel.app)

## Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

## Production

The server is configured to run on Render with the following settings:
- Node.js version: 18.x
- Build command: `npm install`
- Start command: `node socket-server.js`
- Health check path: `/health`

## API Endpoints

- `GET /`: Server status
- `GET /health`: Health check endpoint
- WebSocket: `/socket.io`

## Socket Events

### Client to Server
- `createRoom`: Create a new game room
- `joinRoom`: Join an existing room
- `joinTeam`: Join a team
- `startGame`: Start the game
- `requestCard`: Request a card from another player
- `declareSet`: Declare a complete set
- `claimTurn`: Claim the current turn

### Server to Client
- `roomCreated`: Room creation confirmation
- `joinedRoom`: Room join confirmation
- `roomUpdate`: Room state update
- `gameStarted`: Game start confirmation
- `updateHand`: Player's hand update
- `gameUpdate`: Game state update
- `error`: Error messages
