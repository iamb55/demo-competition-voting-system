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
  const [showCelebration, setShowCelebration] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);

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

  const handleCurrentState = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams);
    }
  }, [competitionId]);

  const handleCompetitionReset = useCallback((data) => {
    if (data.competitionId === competitionId) {
      setTeams(data.teams || []);
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
      setShowCelebration(true);
    }
  }, [competitionId]);

  const handleCelebrationEnd = useCallback(() => {
    setShowCelebration(false);
  }, []);

  const markCurrentTeamDone = useCallback(async (teamId) => {
    if (!competition || markingDone) return;

    setMarkingDone(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/competition/${competitionId}/team/${teamId}/done`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isDone: true
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTeams(data.teams || []);
      } else {
        console.error('Failed to mark team as done');
      }
    } catch (err) {
      console.error('Error marking team as done:', err);
    } finally {
      setMarkingDone(false);
    }
  }, [competition, competitionId, markingDone]);

  const setupSocketListeners = useCallback(() => {
    socketManager.on('competitionReset', handleCompetitionReset);
    socketManager.on('currentState', handleCurrentState);
    socketManager.on('queueUpdate', handleQueueUpdate);
    socketManager.on('competitionStarted', handleCompetitionStarted);
    socketManager.on('allTeamsDone', handleAllTeamsDone);
  }, [handleCompetitionReset, handleCurrentState, handleQueueUpdate, handleCompetitionStarted, handleAllTeamsDone]);

  useEffect(() => {
    fetchCompetition();
    setupSocketListeners();
    socketManager.connect();

    return () => {
      socketManager.off('competitionReset', handleCompetitionReset);
      socketManager.off('currentState', handleCurrentState);
      socketManager.off('queueUpdate', handleQueueUpdate);
      socketManager.off('competitionStarted', handleCompetitionStarted);
      socketManager.off('allTeamsDone', handleAllTeamsDone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId, fetchCompetition, setupSocketListeners]);

  // Check if all teams are done and show celebration
  const doneTeams = teams.filter(t => t.is_done === 1);
  const allTeamsDone = doneTeams.length === teams.length && teams.length > 0;

  useEffect(() => {
    if (allTeamsDone && !showCelebration) {
      setShowCelebration(true);
    }
  }, [allTeamsDone, showCelebration]);

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

  const notDoneTeams = teams.filter(t => t.is_done === 0);
  const remainingCount = notDoneTeams.length;

  return (
    <div className="main-display">
      <header className="display-header">
        <h1>{competition?.name || 'Demo Competition'}</h1>
      </header>

      <div className="content-area">
        <div className="teams-section">
          <div className={`teams-grid teams-count-${Math.min(teams.length, 6)}`}>
            {teams.map(team => {
              const isDone = team.is_done === 1;
              const queuePos = team.queue_position;
              const isLastRemaining = remainingCount === 1 && queuePos === 'current';
              const isCurrent = queuePos === 'current';
              const presenterNames = Array.isArray(team.presenter_names) ? team.presenter_names : null;
              
              return (
                <div
                  key={team.id}
                  className={`team-card ${team.status} ${queuePos || ''} ${isDone ? 'done' : ''}`}
                >
                  <div className="team-name">{team.name}</div>
                  {isCurrent && presenterNames && presenterNames.length > 0 && (
                    <div className="presenter-names">
                      {presenterNames.join(', ')}
                    </div>
                  )}
                  {queuePos === 'current' && !isLastRemaining && (
                    <button
                      onClick={() => markCurrentTeamDone(team.id)}
                      disabled={markingDone || competition?.status !== 'voting'}
                      className="queue-badge current clickable"
                      title="Click to mark as done"
                    >
                      🎤 CURRENT
                    </button>
                  )}
                  {isLastRemaining && (
                    <button
                      onClick={() => markCurrentTeamDone(team.id)}
                      disabled={markingDone || competition?.status !== 'voting'}
                      className="last-badge clickable"
                      title="Click to mark as done"
                    >
                      🌟 Last but not least!
                    </button>
                  )}
                  {queuePos === 'next' && <div className="queue-badge next">⏭️ NEXT</div>}
                  {queuePos === 'after_next' && <div className="queue-badge after-next">⏭️⏭️ AFTER NEXT</div>}
                  {isDone && <div className="done-badge">✅ DONE</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confetti celebration when all teams are done */}
      {showCelebration && allTeamsDone && (
        <WinnerCelebration 
          winner={{ name: 'All Presentations Complete!' }}
          finalRanking={null}
          onCelebrationEnd={handleCelebrationEnd}
        />
      )}
    </div>
  );
};

export default MainDisplay;
