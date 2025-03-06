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

# LIT Game Socket Server

This is the Socket.IO server for the LIT Card Game, handling real-time game state management and player interactions.

## Environment Variables

- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 10000)
- `CORS_ORIGIN`: Allowed origin for CORS (default: https://lit-card-game.vercel.app)

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Production

```bash
# Install dependencies
npm install

# Start production server
npm start
```

## API Endpoints

- `GET /health`: Health check endpoint
- `GET /socket.io`: Socket.IO endpoint

## Socket Events

### Client to Server
- `joinRoom`: Join a game room
- `leaveRoom`: Leave a game room
- `startGame`: Start a game
- `playCard`: Play a card
- `endTurn`: End player's turn

### Server to Client
- `roomJoined`: Confirmation of room join
- `roomLeft`: Confirmation of room leave
- `gameStarted`: Game start notification
- `gameState`: Updated game state
- `playerTurn`: Current player's turn notification
- `gameEnded`: Game end notification
