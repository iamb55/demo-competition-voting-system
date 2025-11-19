import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import socketManager from '../utils/socket';
import { API_BASE_URL } from '../utils/api';
import WinnerCelebration from './WinnerCelebration';
import './MainDisplay.css';

const MainDisplay = () => {
  const [searchParams] = useSearchParams();
  const [competition, setCompetition] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eliminatedTeams, setEliminatedTeams] = useState(new Set());
  const [winner, setWinner] = useState(null);
  const [finalRanking, setFinalRanking] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showVoteCounts, setShowVoteCounts] = useState(false);

  const competitionId = searchParams.get('competition') || 'demo-competition';

  const fetchCompetition = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/competition/${competitionId}`);
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
  }, [competitionId]);

  const handleVoteUpdate = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams);
    }
  }, [competitionId]);

  const handleTeamEliminated = useCallback((data) => {
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
  }, [competitionId]);

  const handleRoundReset = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams);
      setEliminatedTeams(new Set());
    }
  }, [competitionId]);

  const handleCompetitionComplete = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setWinner(data.winner);
      setFinalRanking(data.finalRanking);
      setShowCelebration(true);
    }
  }, [competitionId]);

  const handleCurrentState = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams);
    }
  }, [competitionId]);

  const handleCompetitionReset = useCallback((data) => {
    if (data.competitionId === competitionId) {
      // Reset all states to initial values
      setTeams(data.teams || []);
      setEliminatedTeams(new Set());
      setWinner(null);
      setFinalRanking(null);
      setShowCelebration(false);
    }
  }, [competitionId]);

  const handleQueueUpdate = useCallback((data) => {
    console.log('MainDisplay received queueUpdate:', data);
    if (data.competitionId === competitionId) {
      console.log('Updating teams with queue positions:', data.teams);
      setTeams(data.teams);
    }
  }, [competitionId]);

  const handleCompetitionStarted = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams);
    }
  }, [competitionId]);

  const handleAllTeamsDone = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams);
      // Just show confetti, don't set winner or complete competition
      setShowCelebration(true);
    }
  }, [competitionId]);

  const handleCelebrationEnd = useCallback(() => {
    setShowCelebration(false);
    // Keep winner and ranking data for display
  }, []);

  const setupSocketListeners = useCallback(() => {
    socketManager.on('voteUpdate', handleVoteUpdate);
    socketManager.on('teamEliminated', handleTeamEliminated);
    socketManager.on('roundReset', handleRoundReset);
    socketManager.on('competitionComplete', handleCompetitionComplete);
    socketManager.on('competitionReset', handleCompetitionReset);
    socketManager.on('currentState', handleCurrentState);
    socketManager.on('queueUpdate', handleQueueUpdate);
    socketManager.on('competitionStarted', handleCompetitionStarted);
    socketManager.on('allTeamsDone', handleAllTeamsDone);
  }, [handleVoteUpdate, handleTeamEliminated, handleRoundReset, handleCompetitionComplete, handleCompetitionReset, handleCurrentState, handleQueueUpdate, handleCompetitionStarted, handleAllTeamsDone]);

  useEffect(() => {
    fetchCompetition();
    setupSocketListeners();
    socketManager.connect();

    return () => {
      socketManager.off('voteUpdate', handleVoteUpdate);
      socketManager.off('teamEliminated', handleTeamEliminated);
      socketManager.off('roundReset', handleRoundReset);
      socketManager.off('competitionComplete', handleCompetitionComplete);
      socketManager.off('competitionReset', handleCompetitionReset);
      socketManager.off('currentState', handleCurrentState);
      socketManager.off('queueUpdate', handleQueueUpdate);
      socketManager.off('competitionStarted', handleCompetitionStarted);
      socketManager.off('allTeamsDone', handleAllTeamsDone);
    };
  }, [competitionId, fetchCompetition, setupSocketListeners, handleVoteUpdate, handleTeamEliminated, handleRoundReset, handleCompetitionComplete, handleCompetitionReset, handleCurrentState]);

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
  
  // Get queue positions
  const currentTeam = teams.find(t => t.queue_position === 'current');
  const nextTeam = teams.find(t => t.queue_position === 'next');
  const afterNextTeam = teams.find(t => t.queue_position === 'after_next');
  const doneTeams = teams.filter(t => t.is_done === 1);
  const notDoneTeams = teams.filter(t => t.is_done === 0);
  const remainingCount = notDoneTeams.length;
  const isLastTeam = remainingCount === 1 && currentTeam;

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
            <div className={`teams-grid teams-count-${Math.min(teams.length, 6)}`}>
              {teams.map(team => {
                const isDone = team.is_done === 1;
                const queuePos = team.queue_position;
                const isLastRemaining = remainingCount === 1 && queuePos === 'current';
                
                return (
                  <div
                    key={team.id}
                    className={`team-card ${team.status} ${
                      eliminatedTeams.has(team.id) ? 'eliminating' : ''
                    } ${queuePos || ''} ${isDone ? 'done' : ''}`}
                  >
                    <div className="team-name">{team.name}</div>
                    {queuePos === 'current' && !isLastRemaining && <div className="queue-badge current">🎤 CURRENT</div>}
                    {isLastRemaining && <div className="last-badge">🌟 Last but not least!</div>}
                    {queuePos === 'next' && <div className="queue-badge next">⏭️ NEXT</div>}
                    {queuePos === 'after_next' && <div className="queue-badge after-next">⏭️⏭️ AFTER NEXT</div>}
                    {isDone && <div className="done-badge">✅ DONE</div>}
                    {showVoteCounts && team.status === 'active' && (
                      <div className="vote-count">{team.votes || 0} votes</div>
                    )}
                    {team.status === 'eliminated' && (
                      <div className="eliminated-badge">Eliminated</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="qr-section">
          <div className="qr-container">
            {doneTeams.length === teams.length && teams.length > 0 && !winner ? (
              <>
                <h3>Vote Now!</h3>
                {competition?.qrCode && (
                  <img 
                    src={competition.qrCode} 
                    alt="QR Code for voting" 
                    className="qr-code"
                  />
                )}
                <p className="voting-instruction">
                  All presentations complete! Scan to vote on your phone
                </p>
                <div className="voting-url">
                  {competition?.votingUrl}
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confetti when all teams done (but not winner celebration) */}
      {showCelebration && doneTeams.length === teams.length && teams.length > 0 && !winner && (
        <WinnerCelebration 
          winner={{ name: 'All Presentations Complete!' }}
          finalRanking={null}
          onCelebrationEnd={handleCelebrationEnd}
        />
      )}
      
      {/* Winner Celebration Overlay (only when competition is ended) */}
      {showCelebration && winner && (
        <WinnerCelebration 
          winner={winner}
          finalRanking={finalRanking}
          onCelebrationEnd={handleCelebrationEnd}
        />
      )}
    </div>
  );
};

export default MainDisplay;


