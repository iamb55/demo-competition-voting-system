const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const Database = require('./database');
const os = require('os');
const path = require('path');

// Function to get the local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return 'localhost'; // fallback to localhost if no IP found
}

// Environment configuration
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOCAL_IP = getLocalIP();

// Determine client URL based on environment
function getClientURL() {
  if (process.env.CLIENT_URL) {
    return process.env.CLIENT_URL;
  }
  
  if (NODE_ENV === 'production') {
    // In production on Vercel, use the deployment URL
    return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
           process.env.RAILWAY_STATIC_URL || 
           process.env.RENDER_EXTERNAL_URL || 
           `http://localhost:${PORT}`;
  } else {
    // In development, use local IP for mobile access
    return `http://${LOCAL_IP}:3000`;
  }
}

const CLIENT_URL = getClientURL();

const app = express();
const server = http.createServer(app);

// Configure CORS origins
const allowedOrigins = [
  'http://localhost:3000',
  `http://${LOCAL_IP}:3000`,
  CLIENT_URL
];

// Add additional origins for production
if (NODE_ENV === 'production') {
  allowedOrigins.push(
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.RAILWAY_STATIC_URL,
    process.env.RENDER_EXTERNAL_URL,
    `https://${process.env.RAILWAY_STATIC_URL}`,
    `https://${process.env.RENDER_EXTERNAL_URL}`,
    // Allow Vercel preview deployments
    /\.vercel\.app$/
  );
}

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins.filter(Boolean),
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Initialize database
const db = new Database();

// Middleware
app.use(cors({
  origin: allowedOrigins.filter(Boolean),
  credentials: true
}));
app.use(express.json());

// Serve static files in production
if (NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../client/build');
  app.use(express.static(buildPath));
}

// Store active competitions and their state
const activeCompetitions = new Map();

// Utility functions
function generateVotingUrl(competitionId) {
  return `${CLIENT_URL}/vote?competition=${competitionId}`;
}

async function generateQRCode(competitionId) {
  try {
    const votingUrl = generateVotingUrl(competitionId);
    const qrCodeDataUrl = await QRCode.toDataURL(votingUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrCodeDataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
}

async function updateVoteCounts(competitionId) {
  try {
    const voteCounts = await db.getAllVoteCounts(competitionId);
    
    // Update team vote counts in database
    for (const team of voteCounts) {
      await db.updateTeamVotes(team.id, team.votes);
    }

    // Emit updated vote counts to all clients
    console.log('Emitting vote update for competition:', competitionId, 'to', voteCounts.length, 'teams');
    io.emit('voteUpdate', {
      competitionId,
      teams: voteCounts
    });

    return voteCounts;
  } catch (error) {
    console.error('Error updating vote counts:', error);
    return [];
  }
}

async function checkForElimination(competitionId) {
  try {
    const competition = activeCompetitions.get(competitionId);
    if (!competition || competition.status !== 'voting') return;

    const teams = await db.getTeams(competitionId);
    const activeTeams = teams.filter(team => team.status === 'active');
    
    if (activeTeams.length <= 1) {
      // We have a winner!
      await endCompetition(competitionId);
      return;
    }

    // Check if we should eliminate the team with the least votes
    const totalVotes = activeTeams.reduce((sum, team) => sum + team.votes, 0);
    
    // Eliminate if we have enough votes (at least 10% of expected participants)
    const expectedParticipants = competition.expectedParticipants || 50;
    const minVotesForElimination = Math.max(10, expectedParticipants * 0.1);

    if (totalVotes >= minVotesForElimination && activeTeams.length > 2) {
      // Sort by votes (ascending) to find team with least votes
      activeTeams.sort((a, b) => a.votes - b.votes);
      
      const teamToEliminate = activeTeams[0];
      const secondLowest = activeTeams[1];
      
      // Only eliminate if there's a clear difference (not a tie)
      if (teamToEliminate.votes < secondLowest.votes) {
        await db.eliminateTeam(teamToEliminate.id);
        
        // Emit elimination event
        io.emit('teamEliminated', {
          competitionId,
          eliminatedTeam: teamToEliminate,
          remainingTeams: activeTeams.filter(t => t.id !== teamToEliminate.id)
        });

        // Reset votes for next round
        setTimeout(async () => {
          await db.resetTeams(competitionId);
          const updatedTeams = await updateVoteCounts(competitionId);
          
          io.emit('roundReset', {
            competitionId,
            teams: updatedTeams.filter(t => t.status === 'active')
          });
        }, 3000); // 3 second delay for animation
      }
    }
  } catch (error) {
    console.error('Error checking for elimination:', error);
  }
}

async function endCompetition(competitionId) {
  try {
    const teams = await db.getTeams(competitionId);
    const winner = teams.find(team => team.status === 'active');
    
    if (winner) {
      // Update competition status
      await db.updateCompetitionStatus(competitionId, 'completed', {
        completed_at: new Date().toISOString(),
        winner_team_id: winner.id
      });

      // Save competition results
      const finalRanking = teams
        .sort((a, b) => {
          if (a.status === 'active') return -1;
          if (b.status === 'active') return 1;
          return (b.eliminated_at || 0) - (a.eliminated_at || 0);
        })
        .map(team => ({
          teamId: team.id,
          teamName: team.name,
          finalVotes: team.votes,
          status: team.status
        }));

      const totalVotes = teams.reduce((sum, team) => sum + team.votes, 0);
      const competition = activeCompetitions.get(competitionId);
      const duration = Date.now() - competition.startTime;
      
      await db.saveCompetitionResult(
        competitionId, 
        finalRanking, 
        totalVotes, 
        competition.totalParticipants || 0,
        Math.round(duration / 60000) // Convert to minutes
      );

      // Emit winner announcement
      io.emit('competitionComplete', {
        competitionId,
        winner,
        finalRanking
      });

      // Remove from active competitions
      activeCompetitions.delete(competitionId);
    }
  } catch (error) {
    console.error('Error ending competition:', error);
  }
}

// API Routes

// Get competition info
app.get('/api/competition/:id', async (req, res) => {
  try {
    const competition = await db.getCompetitionWithTeams(req.params.id);
    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    const qrCode = await generateQRCode(competition.id);
    
    res.json({
      ...competition,
      votingUrl: generateVotingUrl(competition.id),
      qrCode
    });
  } catch (error) {
    console.error('Error getting competition:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new competition
app.post('/api/competition', async (req, res) => {
  try {
    const { name, teamNames } = req.body;
    
    if (!name || !teamNames || !Array.isArray(teamNames) || teamNames.length < 2) {
      return res.status(400).json({ error: 'Invalid competition data' });
    }

    const competitionId = uuidv4();
    await db.createCompetition(competitionId, name, teamNames);

    const qrCode = await generateQRCode(competitionId);
    
    res.json({
      competitionId,
      name,
      votingUrl: generateVotingUrl(competitionId),
      qrCode
    });
  } catch (error) {
    console.error('Error creating competition:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start competition voting
app.post('/api/competition/:id/start', async (req, res) => {
  try {
    const competitionId = req.params.id;
    
    await db.updateCompetitionStatus(competitionId, 'voting', {
      started_at: new Date().toISOString()
    });

    // Add to active competitions
    activeCompetitions.set(competitionId, {
      status: 'voting',
      startTime: Date.now(),
      totalParticipants: 0,
      expectedParticipants: req.body.expectedParticipants || 50
    });

    // Reset all team votes
    await db.resetTeams(competitionId);
    
    const teams = await updateVoteCounts(competitionId);
    
    io.emit('competitionStarted', {
      competitionId,
      teams: teams.filter(t => t.status === 'active')
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error starting competition:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit vote
app.post('/api/vote', async (req, res) => {
  try {
    const { competitionId, teamId, voterSession } = req.body;
    const ipAddress = req.ip;

    if (!competitionId || !teamId || !voterSession) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if competition exists and is active
    const competition = await db.getCompetition(competitionId);
    if (!competition || competition.status !== 'voting') {
      return res.status(400).json({ error: 'Competition not available for voting' });
    }

    // Check if user has already voted
    const hasVoted = await db.hasVoted(competitionId, voterSession);
    if (hasVoted) {
      return res.status(400).json({ error: 'You have already voted' });
    }

    // Add vote
    const voteId = uuidv4();
    await db.addVote(voteId, competitionId, teamId, voterSession, ipAddress);

    // Update participant count
    const activeComp = activeCompetitions.get(competitionId);
    if (activeComp) {
      activeComp.totalParticipants = (activeComp.totalParticipants || 0) + 1;
    }

    // Update vote counts and check for elimination
    await updateVoteCounts(competitionId);
    setTimeout(() => checkForElimination(competitionId), 1000);

    res.json({ success: true });
  } catch (error) {
    console.error('Error submitting vote:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get competition history (including active competitions)
app.get('/api/history', async (req, res) => {
  try {
    const history = await db.getCompetitionHistory();
    
    // Also get current active competitions
    const activeCompetitionsArray = Array.from(activeCompetitions.entries()).map(([id, data]) => ({
      id,
      name: `Active Competition ${id.substring(0, 8)}...`,
      status: data.status,
      created_at: new Date(data.startTime).toISOString()
    }));
    
    // Combine active and completed competitions
    const allCompetitions = [...activeCompetitionsArray, ...history];
    
    res.json(allCompetitions);
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset competition (for new rounds)
app.post('/api/competition/:id/reset', async (req, res) => {
  try {
    const competitionId = req.params.id;
    
    // Update competition status back to setup
    await db.updateCompetitionStatus(competitionId, 'setup', {
      started_at: null,
      completed_at: null,
      winner_team_id: null
    });

    // Reset all teams
    await db.resetTeams(competitionId);
    
    // Clear votes (optional - keep for history)
    // We'll keep votes for historical purposes but they won't affect new rounds
    
    activeCompetitions.delete(competitionId);
    
    io.emit('competitionReset', { competitionId });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error resetting competition:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('joinCompetition', async (competitionId) => {
    socket.join(competitionId);
    console.log(`Client ${socket.id} joined competition ${competitionId}`);
    
    // Send current state
    try {
      const teams = await updateVoteCounts(competitionId);
      socket.emit('currentState', {
        competitionId,
        teams
      });
    } catch (error) {
      console.error('Error sending current state:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Catch-all handler: send back React's index.html file in production
if (NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    const buildPath = path.join(__dirname, '../client/build', 'index.html');
    res.sendFile(buildPath);
  });
}

// Start server
server.listen(PORT, () => {
  console.log('🎯 Competition Voting System Server Started!');
  console.log('='.repeat(50));
  console.log(`📍 Server running on port ${PORT}`);
  console.log('🌐 WebSocket server ready for connections');
  console.log();
  console.log('📱 MOBILE ACCESS ENABLED:');
  console.log(`   • Local access: http://localhost:3000`);
  console.log(`   • Mobile access: ${CLIENT_URL}`);
  console.log();
  console.log('📋 Instructions:');
  console.log('   1. Open admin dashboard: http://localhost:3000/admin');
  console.log(`   2. For mobile voting, devices must connect to: ${CLIENT_URL}`);
  console.log('   3. QR codes will automatically use the mobile-accessible URL');
  console.log();
  console.log('💡 Tip: Make sure mobile devices are on the same WiFi network!');
  console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  db.close();
  server.close(() => {
    console.log('Server closed.');
  });
});

// Export for Vercel serverless functions
module.exports = app;


