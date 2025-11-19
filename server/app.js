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
    // Try multiple Railway environment variables
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    }
    
    // Railway might also set these
    if (process.env.PUBLIC_DOMAIN) {
      return `https://${process.env.PUBLIC_DOMAIN}`;
    }
    
    // If we know it's Railway, construct the URL from known pattern
    // Railway URLs follow pattern: projectname-production.up.railway.app
    if (process.env.RAILWAY_ENVIRONMENT) {
      return `https://demo-competition-voting-system-production.up.railway.app`;
    }
    
    // Fallback to other hosting platforms
    return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
           process.env.RENDER_EXTERNAL_URL || 
           `http://localhost:${PORT}`;
  } else {
    // In development, use local IP for mobile access
    return `http://${LOCAL_IP}:3000`;
  }
}

const CLIENT_URL = getClientURL();

// Debug logging for URL detection
console.log('🌐 Environment Detection:');
console.log(`  NODE_ENV: ${NODE_ENV}`);
console.log(`  RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT || 'not set'}`);
console.log(`  RAILWAY_PUBLIC_DOMAIN: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'not set'}`);
console.log(`  PUBLIC_DOMAIN: ${process.env.PUBLIC_DOMAIN || 'not set'}`);
console.log(`  Detected CLIENT_URL: ${CLIENT_URL}`);

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
    // Railway domains
    'https://demo-competition-voting-system-production.up.railway.app',
    /\.up\.railway\.app$/,
    
    // Other platforms
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.RENDER_EXTERNAL_URL,
    
    // Pattern matchers for preview deployments
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

// Queue management functions
function getRandomTeam(teams, excludeIds = []) {
  const available = teams.filter(team => !excludeIds.includes(team.id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

async function initializeQueue(competitionId) {
  try {
    // Clear existing queue positions
    await db.clearQueuePositions(competitionId);
    
    // Get all teams that are not done
    const availableTeams = await db.getTeamsNotDone(competitionId);
    
    if (availableTeams.length === 0) {
      return { current: null, next: null, afterNext: null };
    }

    // Randomly select first team
    const current = getRandomTeam(availableTeams);
    if (!current) {
      return { current: null, next: null, afterNext: null };
    }

    // Randomly select second team (excluding current)
    const next = getRandomTeam(availableTeams, [current.id]);
    
    // Randomly select third team (excluding current and next)
    const afterNext = next ? getRandomTeam(availableTeams, [current.id, next.id]) : null;

    // Set queue positions in database
    if (current) await db.setTeamQueuePosition(current.id, 'current');
    if (next) await db.setTeamQueuePosition(next.id, 'next');
    if (afterNext) await db.setTeamQueuePosition(afterNext.id, 'after_next');

    return { current, next, afterNext };
  } catch (error) {
    console.error('Error initializing queue:', error);
    return { current: null, next: null, afterNext: null };
  }
}

async function shiftQueue(competitionId) {
  try {
    console.log(`Shifting queue for competition ${competitionId} (current team done)`);
    
    // Get fresh team data
    const teams = await db.getTeams(competitionId);
    console.log(`Found ${teams.length} teams total`);
    
    // Find teams in queue that are NOT done (save their IDs and info before clearing positions)
    const nextTeam = teams.find(t => t.queue_position === 'next' && t.is_done === 0);
    const afterNextTeam = teams.find(t => t.queue_position === 'after_next' && t.is_done === 0);
    
    console.log(`Next team: ${nextTeam?.name || 'none'}, After next: ${afterNextTeam?.name || 'none'}`);
    
    const nextTeamId = nextTeam?.id || null;
    const afterNextTeamId = afterNextTeam?.id || null;

    // Clear ALL queue positions first (including the done team's position)
    for (const team of teams) {
      if (team.queue_position === 'current' || team.queue_position === 'next' || team.queue_position === 'after_next') {
        await db.setTeamQueuePosition(team.id, null);
      }
    }

    // Now reassign positions: next -> current, after_next -> next
    if (nextTeamId) {
      console.log(`Setting ${nextTeam?.name} as current`);
      await db.setTeamQueuePosition(nextTeamId, 'current');
    }

    if (afterNextTeamId) {
      console.log(`Setting ${afterNextTeam?.name} as next`);
      await db.setTeamQueuePosition(afterNextTeamId, 'next');
    }

    // Find new after_next from available teams (excluding new current and next)
    const availableTeams = await db.getTeamsNotDone(competitionId);
    console.log(`Available teams for after_next: ${availableTeams.length}`);
    const excludeIds = [nextTeamId, afterNextTeamId].filter(Boolean);
    const newAfterNext = getRandomTeam(availableTeams, excludeIds);

    if (newAfterNext) {
      console.log(`Setting ${newAfterNext.name} as after_next`);
      await db.setTeamQueuePosition(newAfterNext.id, 'after_next');
    } else {
      console.log('No available team for after_next');
    }

    // Emit queue update to competition room
    const updatedTeams = await db.getTeams(competitionId);
    console.log(`Emitting queueUpdate to room ${competitionId} with ${updatedTeams.length} teams`);
    
    // Log queue positions for debugging
    const current = updatedTeams.find(t => t.queue_position === 'current');
    const next = updatedTeams.find(t => t.queue_position === 'next');
    const afterNext = updatedTeams.find(t => t.queue_position === 'after_next');
    console.log(`Queue after shift - Current: ${current?.name || 'none'}, Next: ${next?.name || 'none'}, After Next: ${afterNext?.name || 'none'}`);
    
    io.to(competitionId).emit('queueUpdate', {
      competitionId,
      teams: updatedTeams
    });

    return updatedTeams;
  } catch (error) {
    console.error('Error shifting queue:', error);
    return [];
  }
}

async function handleNextTeamDone(competitionId) {
  try {
    console.log(`Handling next team done for competition ${competitionId}`);
    
    const teams = await db.getTeams(competitionId);
    const currentTeam = teams.find(t => t.queue_position === 'current' && t.is_done === 0);
    const afterNextTeam = teams.find(t => t.queue_position === 'after_next' && t.is_done === 0);
    
    // Clear next and after_next positions
    for (const team of teams) {
      if (team.queue_position === 'next' || team.queue_position === 'after_next') {
        await db.setTeamQueuePosition(team.id, null);
      }
    }
    
    // Move after_next to next
    if (afterNextTeam) {
      console.log(`Moving ${afterNextTeam.name} from after_next to next`);
      await db.setTeamQueuePosition(afterNextTeam.id, 'next');
    }
    
    // Find new after_next
    const availableTeams = await db.getTeamsNotDone(competitionId);
    const excludeIds = [currentTeam?.id, afterNextTeam?.id].filter(Boolean);
    const newAfterNext = getRandomTeam(availableTeams, excludeIds);
    
    if (newAfterNext) {
      console.log(`Setting ${newAfterNext.name} as after_next`);
      await db.setTeamQueuePosition(newAfterNext.id, 'after_next');
    }
    
    const updatedTeams = await db.getTeams(competitionId);
    io.to(competitionId).emit('queueUpdate', {
      competitionId,
      teams: updatedTeams
    });
    
    return updatedTeams;
  } catch (error) {
    console.error('Error handling next team done:', error);
    return [];
  }
}

async function handleAfterNextTeamDone(competitionId) {
  try {
    console.log(`Handling after_next team done for competition ${competitionId}`);
    
    const teams = await db.getTeams(competitionId);
    const currentTeam = teams.find(t => t.queue_position === 'current' && t.is_done === 0);
    const nextTeam = teams.find(t => t.queue_position === 'next' && t.is_done === 0);
    
    // Clear after_next position
    for (const team of teams) {
      if (team.queue_position === 'after_next') {
        await db.setTeamQueuePosition(team.id, null);
      }
    }
    
    // Find new after_next
    const availableTeams = await db.getTeamsNotDone(competitionId);
    const excludeIds = [currentTeam?.id, nextTeam?.id].filter(Boolean);
    const newAfterNext = getRandomTeam(availableTeams, excludeIds);
    
    if (newAfterNext) {
      console.log(`Setting ${newAfterNext.name} as after_next`);
      await db.setTeamQueuePosition(newAfterNext.id, 'after_next');
    }
    
    const updatedTeams = await db.getTeams(competitionId);
    io.to(competitionId).emit('queueUpdate', {
      competitionId,
      teams: updatedTeams
    });
    
    return updatedTeams;
  } catch (error) {
    console.error('Error handling after_next team done:', error);
    return [];
  }
}

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
    // First ensure vote counts are up to date
    await updateVoteCounts(competitionId);
    
    // Get teams with updated vote counts
    const teams = await db.getTeams(competitionId);
    const activeTeams = teams.filter(team => team.status === 'active');
    
    // Determine winner by vote count (highest votes wins)
    activeTeams.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    const winner = activeTeams[0];
    
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

// Start competition (initialize presentation queue)
app.post('/api/competition/:id/start', async (req, res) => {
  try {
    const competitionId = req.params.id;
    
    await db.updateCompetitionStatus(competitionId, 'voting', {
      started_at: new Date().toISOString()
    });

    // Reset all teams (clear done status and queue positions)
    await db.resetTeams(competitionId);

    // Initialize the presentation queue
    const queue = await initializeQueue(competitionId);

    // Add to active competitions
    activeCompetitions.set(competitionId, {
      status: 'voting',
      startTime: Date.now(),
      totalParticipants: 0,
      expectedParticipants: req.body.expectedParticipants || 50
    });

    // Get updated teams with queue positions
    const teams = await db.getTeams(competitionId);
    
    io.to(competitionId).emit('competitionStarted', {
      competitionId,
      teams,
      queue
    });

    res.json({ success: true, queue, teams });
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
    
    // Get active competition IDs to filter out duplicates
    const activeCompetitionIds = new Set(activeCompetitions.keys());
    
    // Filter out competitions that are already in activeCompetitions Map
    // (they're already in the database with status 'voting')
    const filteredHistory = history.filter(comp => !activeCompetitionIds.has(comp.id));
    
    res.json(filteredHistory);
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete competition
app.delete('/api/competition/:id', async (req, res) => {
  try {
    const competitionId = req.params.id;
    
    // Remove from active competitions if present
    activeCompetitions.delete(competitionId);
    
    // Delete from database
    await db.deleteCompetition(competitionId);
    
    // Emit deletion event
    io.to(competitionId).emit('competitionDeleted', {
      competitionId
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting competition:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset competition (for new rounds)
app.post('/api/competition/:id/reset', async (req, res) => {
  try {
    const competitionId = req.params.id;
    
    // Update competition status back to setup with reset timestamp
    await db.updateCompetitionStatus(competitionId, 'setup', {
      started_at: null,
      completed_at: null,
      winner_team_id: null,
      last_reset: new Date().toISOString()
    });

    // Reset all teams (status, vote counts, queue positions, and done status)
    await db.resetTeams(competitionId);
    
    // Clear all votes - this is essential for proper reset!
    await db.clearVotes(competitionId);
    
    // Remove from active competitions
    activeCompetitions.delete(competitionId);
    
    // Get updated teams with 0 votes
    const updatedTeams = await db.getTeams(competitionId);
    
    io.emit('competitionReset', { 
      competitionId,
      teams: updatedTeams 
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error resetting competition:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark team as done/undone
app.post('/api/competition/:id/team/:teamId/done', async (req, res) => {
  try {
    const competitionId = req.params.id;
    const teamId = req.params.teamId;
    const { isDone } = req.body;

    // Get team info BEFORE marking as done to check queue position
    const teams = await db.getTeams(competitionId);
    const team = teams.find(t => t.id === teamId);
    
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const wasInQueue = team && team.queue_position;
    console.log(`Marking team ${team.name} (${teamId}) as ${isDone ? 'done' : 'undone'}. Was in queue: ${wasInQueue}, Position: ${team.queue_position}`);

    // Mark team as done or undone
    await db.markTeamDone(teamId, isDone);

    let updatedTeams;
    
    if (isDone) {
      // If marking as done and team was in queue, handle queue update based on position
      if (wasInQueue) {
        const queuePosition = team.queue_position;
        console.log(`Team ${team.name} was in queue (${queuePosition}), updating queue...`);
        
        if (queuePosition === 'current') {
          // Current team done - shift entire queue
          updatedTeams = await shiftQueue(competitionId);
        } else if (queuePosition === 'next') {
          // Next team done - move after_next to next, find new after_next
          updatedTeams = await handleNextTeamDone(competitionId);
        } else if (queuePosition === 'after_next') {
          // After next team done - just find new after_next
          updatedTeams = await handleAfterNextTeamDone(competitionId);
        } else {
          // Unknown position, just emit update
          updatedTeams = await db.getTeams(competitionId);
          io.to(competitionId).emit('queueUpdate', {
            competitionId,
            teams: updatedTeams
          });
        }
      } else {
        // Just emit update to competition room
        updatedTeams = await db.getTeams(competitionId);
        console.log(`Team ${team.name} not in queue, emitting update to room ${competitionId}`);
        io.to(competitionId).emit('queueUpdate', {
          competitionId,
          teams: updatedTeams
        });
      }
      
      // Check if all teams are done (just show confetti, don't complete competition)
      const allDone = updatedTeams.every(t => t.is_done === 1);
      if (allDone && updatedTeams.length > 0) {
        // All teams are done, emit event for confetti (but don't complete competition)
        io.to(competitionId).emit('allTeamsDone', {
          competitionId,
          teams: updatedTeams
        });
      }
    } else {
      // Marking as undone - add team back to queue, filling empty positions
      updatedTeams = await db.getTeams(competitionId);
      const undoneTeam = updatedTeams.find(t => t.id === teamId);
      
      if (!undoneTeam || undoneTeam.is_done !== 0) {
        // Team wasn't properly marked as undone, just emit update
        updatedTeams = await db.getTeams(competitionId);
        io.to(competitionId).emit('queueUpdate', {
          competitionId,
          teams: updatedTeams
        });
        return res.json({ success: true, teams: updatedTeams });
      }
      
      const currentTeam = updatedTeams.find(t => t.queue_position === 'current' && t.is_done === 0);
      const nextTeam = updatedTeams.find(t => t.queue_position === 'next' && t.is_done === 0);
      const afterNextTeam = updatedTeams.find(t => t.queue_position === 'after_next' && t.is_done === 0);
      
      const hasQueue = currentTeam || nextTeam || afterNextTeam;
      
      if (!hasQueue) {
        // No queue exists, reinitialize it (this will include the undone team)
        console.log(`No queue exists, reinitializing for competition ${competitionId}`);
        await initializeQueue(competitionId);
        updatedTeams = await db.getTeams(competitionId);
      } else {
        // Queue exists, fill any empty positions, prioritizing the undone team
        const availableTeams = await db.getTeamsNotDone(competitionId);
        
        if (!currentTeam) {
          // No current - prefer the undone team, otherwise random
          if (availableTeams.some(t => t.id === undoneTeam.id)) {
            console.log(`Setting ${undoneTeam.name} as current (was undone)`);
            await db.setTeamQueuePosition(undoneTeam.id, 'current');
          } else {
            const excludeIds = [nextTeam?.id, afterNextTeam?.id].filter(Boolean);
            const newCurrent = getRandomTeam(availableTeams, excludeIds);
            if (newCurrent) {
              console.log(`Setting ${newCurrent.name} as current`);
              await db.setTeamQueuePosition(newCurrent.id, 'current');
            }
          }
        }
        
        // Refresh to get updated current
        updatedTeams = await db.getTeams(competitionId);
        const updatedCurrent = updatedTeams.find(t => t.queue_position === 'current' && t.is_done === 0);
        
        if (!nextTeam) {
          // No next - prefer the undone team if not already in queue
          const inQueue = updatedCurrent?.id === undoneTeam.id || afterNextTeam?.id === undoneTeam.id;
          if (!inQueue && availableTeams.some(t => t.id === undoneTeam.id)) {
            console.log(`Setting ${undoneTeam.name} as next (was undone)`);
            await db.setTeamQueuePosition(undoneTeam.id, 'next');
          } else {
            const excludeIds = [updatedCurrent?.id, afterNextTeam?.id].filter(Boolean);
            const newNext = getRandomTeam(availableTeams, excludeIds);
            if (newNext) {
              console.log(`Setting ${newNext.name} as next`);
              await db.setTeamQueuePosition(newNext.id, 'next');
            }
          }
        }
        
        // Refresh to get updated next
        updatedTeams = await db.getTeams(competitionId);
        const updatedNext = updatedTeams.find(t => t.queue_position === 'next' && t.is_done === 0);
        
        if (!afterNextTeam) {
          // No after_next - prefer the undone team if not already in queue
          const inQueue = updatedCurrent?.id === undoneTeam.id || updatedNext?.id === undoneTeam.id;
          if (!inQueue && availableTeams.some(t => t.id === undoneTeam.id)) {
            console.log(`Setting ${undoneTeam.name} as after_next (was undone)`);
            await db.setTeamQueuePosition(undoneTeam.id, 'after_next');
          } else {
            const excludeIds = [updatedCurrent?.id, updatedNext?.id].filter(Boolean);
            const newAfterNext = getRandomTeam(availableTeams, excludeIds);
            if (newAfterNext) {
              console.log(`Setting ${newAfterNext.name} as after_next`);
              await db.setTeamQueuePosition(newAfterNext.id, 'after_next');
            }
          }
        }
        
        // Get fresh teams after all updates
        updatedTeams = await db.getTeams(competitionId);
      }
      
      // Emit update to competition room
      io.to(competitionId).emit('queueUpdate', {
        competitionId,
        teams: updatedTeams
      });
    }

    res.json({ success: true, teams: updatedTeams });
  } catch (error) {
    console.error('Error marking team done:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manually end competition (declare winner)
app.post('/api/competition/:id/end', async (req, res) => {
  try {
    const competitionId = req.params.id;
    
    // Check if competition exists and is active
    const competition = await db.getCompetition(competitionId);
    if (!competition) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    if (competition.status !== 'voting') {
      return res.status(400).json({ error: 'Competition is not currently active' });
    }

    // Get current teams and determine winner (team with most votes)
    const teams = await db.getTeams(competitionId);
    const activeTeams = teams.filter(team => team.status === 'active');
    
    if (activeTeams.length === 0) {
      return res.status(400).json({ error: 'No active teams found' });
    }

    // Sort teams by votes (descending) to find winner
    activeTeams.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    const winner = activeTeams[0];

    // Manually trigger the end competition process
    await endCompetition(competitionId);
    
    res.json({ 
      success: true,
      winner: winner,
      message: `Competition ended! Winner: ${winner.name} with ${winner.votes || 0} votes`
    });
  } catch (error) {
    console.error('Error ending competition:', error);
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


