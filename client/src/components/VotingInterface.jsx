import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import socketManager from '../utils/socket';
import { API_BASE_URL } from '../utils/api';
import './VotingInterface.css';

const VotingInterface = () => {
  const [searchParams] = useSearchParams();
  const [competition, setCompetition] = useState(null);
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState(false);
  const [error, setError] = useState(null);
  const [voterSession, setVoterSession] = useState(null);

  const competitionId = searchParams.get('competition') || 'demo-competition';

  const fetchCompetition = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/competition/${competitionId}`);
      if (response.ok) {
        const data = await response.json();
        setCompetition(data);
        setTeams(data.teams?.filter(team => team.status === 'active') || []);
        socketManager.joinCompetition(competitionId);
      } else {
        setError('Competition not found');
      }
    } catch (err) {
      setError('Failed to load competition');
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  const handleVoteUpdate = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams.filter(team => team.status === 'active'));
    }
  }, [competitionId]);

  const handleTeamEliminated = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.remainingTeams);
      // Reset voting for next round
      setVoted(false);
      setSelectedTeam(null);
      localStorage.removeItem(`has-voted-${competitionId}`);
    }
  }, [competitionId]);

  const handleCompetitionComplete = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setError(`Competition complete! Winner: ${data.winner.name}`);
    }
  }, [competitionId]);

  const handleCurrentState = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams.filter(team => team.status === 'active'));
    }
  }, [competitionId]);

  const handleCompetitionReset = useCallback((data) => {
    if (data.competitionId === competitionId) {
      // Reset voting states for new competition
      setTeams(data.teams?.filter(team => team.status === 'active') || []);
      setVoted(false);
      setSelectedTeam(null);
      setError(null);
      // Clear local storage vote record
      localStorage.removeItem(`has-voted-${competitionId}`);
    }
  }, [competitionId]);

  const setupSocketListeners = useCallback(() => {
    socketManager.on('voteUpdate', handleVoteUpdate);
    socketManager.on('teamEliminated', handleTeamEliminated);
    socketManager.on('competitionComplete', handleCompetitionComplete);
    socketManager.on('competitionReset', handleCompetitionReset);
    socketManager.on('currentState', handleCurrentState);
  }, [handleVoteUpdate, handleTeamEliminated, handleCompetitionComplete, handleCompetitionReset, handleCurrentState]);

  const handleTeamSelect = (team) => {
    if (!voted && !voting) {
      setSelectedTeam(team);
    }
  };

  const handleVoteSubmit = async () => {
    if (!selectedTeam || voting || voted) return;

    setVoting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          competitionId,
          teamId: selectedTeam.id,
          voterSession,
        }),
      });

      if (response.ok) {
        setVoted(true);
        localStorage.setItem(`has-voted-${competitionId}`, 'true');
        // Keep selected team visible for feedback
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to submit vote');
      }
    } catch (err) {
      setError('Failed to submit vote');
    } finally {
      setVoting(false);
    }
  };

  const handleRetry = () => {
    setError(null);
    fetchCompetition();
  };

  useEffect(() => {
    // Generate or get voter session ID
    let sessionId = localStorage.getItem(`voter-session-${competitionId}`);
    if (!sessionId) {
      sessionId = `voter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(`voter-session-${competitionId}`, sessionId);
    }
    setVoterSession(sessionId);

    // Check if already voted
    const hasVoted = localStorage.getItem(`has-voted-${competitionId}`);
    if (hasVoted) {
      setVoted(true);
    }

    fetchCompetition();
    setupSocketListeners();
    socketManager.connect();

    return () => {
      socketManager.off('voteUpdate', handleVoteUpdate);
      socketManager.off('teamEliminated', handleTeamEliminated);
      socketManager.off('competitionComplete', handleCompetitionComplete);
      socketManager.off('competitionReset', handleCompetitionReset);
      socketManager.off('currentState', handleCurrentState);
    };
  }, [competitionId, fetchCompetition, setupSocketListeners, handleVoteUpdate, handleTeamEliminated, handleCompetitionComplete, handleCompetitionReset, handleCurrentState]);

  if (loading) {
    return (
      <div className="voting-interface loading">
        <div className="loading-spinner"></div>
        <p>Loading voting...</p>
      </div>
    );
  }

  if (error && !voted) {
    return (
      <div className="voting-interface error">
        <h2>Unable to Vote</h2>
        <p>{error}</p>
        <button onClick={handleRetry} className="retry-button">
          Try Again
        </button>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="voting-interface error">
        <h2>Voting Not Available</h2>
        <p>No active teams to vote for at the moment.</p>
        <button onClick={handleRetry} className="retry-button">
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="voting-interface">
      <header className="voting-header">
        <h1>🗳️ Cast Your Vote</h1>
        <p className="competition-name">{competition?.name}</p>
        {teams.length <= 3 && (
          <div className="final-round-badge">
            🔥 FINAL ROUND!
          </div>
        )}
      </header>

      {voted ? (
        <div className="vote-success">
          <div className="success-icon">✅</div>
          <h2>Vote Submitted!</h2>
          <p>Thank you for voting for:</p>
          <div className="selected-team-display">
            {selectedTeam?.name}
          </div>
          <p className="wait-message">
            Please wait for the next round or check the main display for results.
          </p>
        </div>
      ) : (
        <>
          <div className="voting-instructions">
            <p>Select your favorite team:</p>
            {selectedTeam && (
              <div className="selection-feedback">
                Selected: <strong>{selectedTeam.name}</strong>
              </div>
            )}
          </div>

          <div className="teams-voting-grid">
            {teams.map(team => (
              <button
                key={team.id}
                className={`team-voting-card ${
                  selectedTeam?.id === team.id ? 'selected' : ''
                } ${voting ? 'disabled' : ''}`}
                onClick={() => handleTeamSelect(team)}
                disabled={voting || voted}
              >
                <div className="team-voting-name">{team.name}</div>
                <div className="tap-indicator">
                  {selectedTeam?.id === team.id ? '✓ Selected' : 'Tap to select'}
                </div>
              </button>
            ))}
          </div>

          {selectedTeam && (
            <div className="vote-action">
              <button
                className="vote-button"
                onClick={handleVoteSubmit}
                disabled={voting || voted}
              >
                {voting ? (
                  <>
                    <span className="button-spinner"></span>
                    Submitting...
                  </>
                ) : (
                  `Vote for ${selectedTeam.name}`
                )}
              </button>
            </div>
          )}

          {error && (
            <div className="vote-error">
              <p>{error}</p>
            </div>
          )}
        </>
      )}

      <footer className="voting-footer">
        <p>One vote per device • Results shown on main display</p>
      </footer>
    </div>
  );
};

export default VotingInterface;


