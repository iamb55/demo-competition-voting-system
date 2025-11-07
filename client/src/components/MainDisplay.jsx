import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import socketManager from '../utils/socket';
import './MainDisplay.css';

const MainDisplay = () => {
  const [searchParams] = useSearchParams();
  const [competition, setCompetition] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eliminatedTeams, setEliminatedTeams] = useState(new Set());
  const [winner, setWinner] = useState(null);
  const [showVoteCounts, setShowVoteCounts] = useState(false);

  const competitionId = searchParams.get('competition') || 'demo-competition';

  useEffect(() => {
    fetchCompetition();
    setupSocketListeners();
    socketManager.connect();
    
    return () => {
      socketManager.off('voteUpdate', handleVoteUpdate);
      socketManager.off('teamEliminated', handleTeamEliminated);
      socketManager.off('roundReset', handleRoundReset);
      socketManager.off('competitionComplete', handleCompetitionComplete);
      socketManager.off('currentState', handleCurrentState);
    };
  }, [competitionId]);

  const fetchCompetition = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/competition/${competitionId}`);
      if (response.ok) {
        const data = await response.json();
        setCompetition(data);
        setTeams(data.teams || []);
        socketManager.joinCompetition(competitionId);
      } else {
        setError('Competition not found');
      }
    } catch (err) {
      setError('Failed to load competition');
    } finally {
      setLoading(false);
    }
  };

  const setupSocketListeners = () => {
    socketManager.on('voteUpdate', handleVoteUpdate);
    socketManager.on('teamEliminated', handleTeamEliminated);
    socketManager.on('roundReset', handleRoundReset);
    socketManager.on('competitionComplete', handleCompetitionComplete);
    socketManager.on('currentState', handleCurrentState);
  };

  const handleVoteUpdate = (data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams);
    }
  };

  const handleTeamEliminated = (data) => {
    if (data.competitionId === competitionId) {
      setEliminatedTeams(prev => new Set([...prev, data.eliminatedTeam.id]));
      
      // Animate elimination
      setTimeout(() => {
        setTeams(prevTeams => 
          prevTeams.map(team => 
            team.id === data.eliminatedTeam.id 
              ? { ...team, status: 'eliminated' }
              : team
          )
        );
      }, 2000);
    }
  };

  const handleRoundReset = (data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams);
      setEliminatedTeams(new Set());
    }
  };

  const handleCompetitionComplete = (data) => {
    if (data.competitionId === competitionId) {
      setWinner(data.winner);
      // Trigger confetti
      if (window.confetti) {
        window.confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    }
  };

  const handleCurrentState = (data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams);
    }
  };

  if (loading) {
    return (
      <div className="main-display loading">
        <div className="loading-spinner"></div>
        <p>Loading competition...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="main-display error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={fetchCompetition} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  const activeTeams = teams.filter(team => team.status === 'active');
  const totalVotes = teams.reduce((sum, team) => sum + (team.votes || 0), 0);

  return (
    <div className="main-display">
      <header className="display-header">
        <h1>{competition?.name || 'Demo Competition'}</h1>
        <div className="controls">
          <button 
            onClick={() => setShowVoteCounts(!showVoteCounts)}
            className="toggle-votes"
          >
            {showVoteCounts ? 'Hide Votes' : 'Show Votes'}
          </button>
          {totalVotes > 0 && (
            <div className="vote-counter">
              Total Votes: {totalVotes}
            </div>
          )}
        </div>
      </header>

      <div className="content-area">
        <div className="teams-section">
          {winner ? (
            <div className="winner-announcement">
              <h2 className="winner-title">🎉 WINNER! 🎉</h2>
              <div className="winner-team">
                {winner.name}
              </div>
              <p className="winner-subtitle">Congratulations!</p>
            </div>
          ) : (
            <div className={`teams-grid teams-count-${Math.min(activeTeams.length, 6)}`}>
              {teams.map(team => (
                <div
                  key={team.id}
                  className={`team-card ${team.status} ${
                    eliminatedTeams.has(team.id) ? 'eliminating' : ''
                  }`}
                >
                  <div className="team-name">{team.name}</div>
                  {showVoteCounts && team.status === 'active' && (
                    <div className="vote-count">{team.votes || 0} votes</div>
                  )}
                  {team.status === 'eliminated' && (
                    <div className="eliminated-badge">Eliminated</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="qr-section">
          <div className="qr-container">
            <h3>Vote Now!</h3>
            {competition?.qrCode && (
              <img 
                src={competition.qrCode} 
                alt="QR Code for voting" 
                className="qr-code"
              />
            )}
            <p className="voting-instruction">
              Scan to vote on your phone
            </p>
            <div className="voting-url">
              {competition?.votingUrl}
            </div>
          </div>
        </div>
      </div>

      {activeTeams.length <= 3 && activeTeams.length > 1 && (
        <div className="final-round-indicator">
          <p>🔥 FINAL ROUND! 🔥</p>
        </div>
      )}
    </div>
  );
};

export default MainDisplay;


