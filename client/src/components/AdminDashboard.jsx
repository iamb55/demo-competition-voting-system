import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import socketManager from '../utils/socket';
import { API_BASE_URL } from '../utils/api';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState([]);
  const [currentCompetition, setCurrentCompetition] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Create competition form state
  const [competitionName, setCompetitionName] = useState('');
  const [teamNames, setTeamNames] = useState(['', '', '', '', '', '', '', '', '', '']);
  const [expectedParticipants, setExpectedParticipants] = useState(50);
  
  // Bulk input state
  const [inputMode, setInputMode] = useState('individual'); // 'individual' or 'bulk'
  const [bulkTeamNames, setBulkTeamNames] = useState('');

  useEffect(() => {
    fetchHistory();
    setupSocketListeners();
    socketManager.connect();

    return () => {
      socketManager.off('voteUpdate', handleVoteUpdate);
      socketManager.off('competitionComplete', handleCompetitionComplete);
    };
  }, []);

  const setupSocketListeners = () => {
    socketManager.on('voteUpdate', handleVoteUpdate);
    socketManager.on('competitionComplete', handleCompetitionComplete);
  };

  const handleVoteUpdate = (data) => {
    console.log('Admin received vote update:', data);
    if (currentCompetition && data.competitionId === currentCompetition.id) {
      setTeams(data.teams);
    }
  };

  const handleCompetitionComplete = (data) => {
    if (currentCompetition && data.competitionId === currentCompetition.id) {
      setSuccess(`Competition completed! Winner: ${data.winner.name}`);
      setTimeout(() => {
        fetchHistory();
        setCurrentCompetition(null);
        setTeams([]);
      }, 3000);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/history`);
      if (response.ok) {
        const data = await response.json();
        setCompetitions(data);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  const createCompetition = async (e) => {
    e.preventDefault();
    
    // Get team names based on input mode
    let finalTeamNames = [];
    if (inputMode === 'bulk') {
      finalTeamNames = bulkTeamNames
        .split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);
    } else {
      finalTeamNames = teamNames.filter(name => name.trim());
    }
    
    if (finalTeamNames.length < 2) {
      setError('Please enter at least 2 team names');
      return;
    }

    if (!competitionName.trim()) {
      setError('Please enter a competition name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/competition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: competitionName.trim(),
          teamNames: finalTeamNames
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Competition created:', data);
        setSuccess('Competition created successfully!');
        
        // Load the created competition
        await loadCompetition(data.competitionId);
        
        // Reset form
        setCompetitionName('');
        setTeamNames(['', '', '', '', '', '', '', '', '', '']);
        setBulkTeamNames('');
        setInputMode('individual');
        setShowCreateForm(false);
        
        fetchHistory();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create competition');
      }
    } catch (err) {
      setError('Failed to create competition');
    } finally {
      setLoading(false);
    }
  };

  const loadCompetition = async (competitionId) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/competition/${competitionId}`);
      if (response.ok) {
        const data = await response.json();
        setCurrentCompetition(data);
        setTeams(data.teams || []);
        // Join the competition room for real-time updates
        console.log('Admin joining competition:', competitionId);
        socketManager.joinCompetition(competitionId);
      } else {
        setError('Failed to load competition');
      }
    } catch (err) {
      setError('Failed to load competition');
    } finally {
      setLoading(false);
    }
  };

  const startCompetition = async () => {
    if (!currentCompetition) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/competition/${currentCompetition.id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expectedParticipants
        }),
      });

      if (response.ok) {
        setSuccess('Competition started! Voting is now live.');
        setCurrentCompetition(prev => ({ ...prev, status: 'voting' }));
      } else {
        setError('Failed to start competition');
      }
    } catch (err) {
      setError('Failed to start competition');
    } finally {
      setLoading(false);
    }
  };

  const resetCompetition = async () => {
    if (!currentCompetition) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/competition/${currentCompetition.id}/reset`, {
        method: 'POST',
      });

      if (response.ok) {
        setSuccess('Competition reset! Ready for a new round.');
        await loadCompetition(currentCompetition.id);
        fetchHistory();
      } else {
        setError('Failed to reset competition');
      }
    } catch (err) {
      setError('Failed to reset competition');
    } finally {
      setLoading(false);
    }
  };

  const openMainDisplay = () => {
    if (currentCompetition) {
      const url = `/?competition=${currentCompetition.id}`;
      window.open(url, '_blank');
    }
  };

  const handleTeamNameChange = (index, value) => {
    const newTeamNames = [...teamNames];
    newTeamNames[index] = value;
    setTeamNames(newTeamNames);
  };

  const handleBulkTeamNamesChange = (value) => {
    setBulkTeamNames(value);
  };

  const switchToIndividual = () => {
    // If there's bulk input, try to populate individual inputs
    if (bulkTeamNames.trim()) {
      const parsedTeams = bulkTeamNames
        .split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);
      
      const newTeamNames = ['', '', '', '', '', '', '', '', '', ''];
      parsedTeams.slice(0, 10).forEach((name, index) => {
        newTeamNames[index] = name;
      });
      setTeamNames(newTeamNames);
    }
    setInputMode('individual');
  };

  const switchToBulk = () => {
    // If there are individual inputs, convert them to bulk
    const nonEmptyTeams = teamNames.filter(name => name.trim());
    if (nonEmptyTeams.length > 0) {
      setBulkTeamNames(nonEmptyTeams.join('\n'));
    }
    setInputMode('bulk');
  };

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <h1>🎯 Competition Admin</h1>
        <div className="header-actions">
          <button onClick={() => setShowCreateForm(!showCreateForm)} className="create-button">
            {showCreateForm ? 'Cancel' : 'New Competition'}
          </button>
          {currentCompetition && (
            <button onClick={openMainDisplay} className="display-button">
              Open Main Display
            </button>
          )}
        </div>
      </header>

      {(error || success) && (
        <div className={`message ${error ? 'error' : 'success'}`}>
          <span>{error || success}</span>
          <button onClick={clearMessages} className="close-message">×</button>
        </div>
      )}

      <div className="admin-content">
        {showCreateForm && (
          <div className="create-competition-form">
            <h2>Create New Competition</h2>
            <form onSubmit={createCompetition}>
              <div className="form-group">
                <label htmlFor="competitionName">Competition Name:</label>
                <input
                  id="competitionName"
                  type="text"
                  value={competitionName}
                  onChange={(e) => setCompetitionName(e.target.value)}
                  placeholder="Demo Day 2025"
                  required
                />
              </div>
              
              <div className="form-group">
                <div className="team-input-header">
                  <label>Team Names (enter at least 2):</label>
                  <div className="input-mode-toggle">
                    <button
                      type="button"
                      className={`toggle-button ${inputMode === 'individual' ? 'active' : ''}`}
                      onClick={switchToIndividual}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      className={`toggle-button ${inputMode === 'bulk' ? 'active' : ''}`}
                      onClick={switchToBulk}
                    >
                      Paste List
                    </button>
                  </div>
                </div>
                
                {inputMode === 'individual' ? (
                  <div className="team-names-grid">
                    {teamNames.map((name, index) => (
                      <input
                        key={index}
                        type="text"
                        value={name}
                        onChange={(e) => handleTeamNameChange(index, e.target.value)}
                        placeholder={`Team ${index + 1}`}
                        className="team-input"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bulk-input-container">
                    <textarea
                      value={bulkTeamNames}
                      onChange={(e) => handleBulkTeamNamesChange(e.target.value)}
                      placeholder="Paste team names here, one per line:&#10;&#10;Global Search MVP&#10;Consumer Settings&#10;feed right rail + homepage&#10;Employer Discovery Glow Up & FDS Prompt&#10;Starting liquid glass on iOS&#10;..."
                      className="bulk-team-input"
                      rows={10}
                    />
                    <div className="bulk-input-help">
                      💡 Tip: Copy team names from your spreadsheet and paste them here. Each team should be on a separate line.
                    </div>
                    {bulkTeamNames && (
                      <div className="team-count">
                        {bulkTeamNames.split('\n').filter(name => name.trim()).length} teams detected
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="expectedParticipants">Expected Participants:</label>
                <input
                  id="expectedParticipants"
                  type="number"
                  value={expectedParticipants}
                  onChange={(e) => setExpectedParticipants(Number(e.target.value))}
                  min="10"
                  max="1000"
                />
              </div>

              <button type="submit" disabled={loading} className="submit-button">
                {loading ? 'Creating...' : 'Create Competition'}
              </button>
            </form>
          </div>
        )}

        {currentCompetition && (
          <div className="current-competition">
            <h2>Current Competition: {currentCompetition.name}</h2>
            
            <div className="competition-info">
              <div className="info-card">
                <h3>Status</h3>
                <span className={`status ${currentCompetition.status}`}>
                  {currentCompetition.status.toUpperCase()}
                </span>
              </div>
              
              <div className="info-card">
                <h3>QR Code for Voting</h3>
                {currentCompetition.qrCode && (
                  <img 
                    src={currentCompetition.qrCode} 
                    alt="QR Code" 
                    className="qr-preview"
                  />
                )}
              </div>
            </div>

            <div className="competition-controls">
              {currentCompetition.status === 'setup' && (
                <button 
                  onClick={startCompetition} 
                  disabled={loading}
                  className="start-button"
                >
                  Start Voting
                </button>
              )}
              
              <button 
                onClick={resetCompetition} 
                disabled={loading}
                className="reset-button"
              >
                Reset Competition
              </button>
            </div>

            {teams.length > 0 && (
              <div className="teams-status">
                <h3>Teams Status</h3>
                <div className="teams-list">
                  {teams.map(team => (
                    <div key={team.id} className={`team-status ${team.status}`}>
                      <span className="team-name">{team.name}</span>
                      <span className="team-votes">{team.votes || 0} votes</span>
                      <span className={`team-badge ${team.status}`}>
                        {team.status === 'active' ? '🟢' : '❌'} {team.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!currentCompetition && !showCreateForm && (
          <div className="competition-selection">
            <h2>Select Competition</h2>
            
            <div className="quick-start">
              <h3>Quick Start</h3>
              <button 
                onClick={() => setShowCreateForm(true)}
                className="quick-create-button"
              >
                Create New Competition
              </button>
            </div>

            {competitions.length > 0 && (
              <div className="competition-history">
                <h3>Recent Competitions</h3>
                <div className="competitions-grid">
                  {competitions.map(competition => (
                    <div key={competition.id} className="competition-card">
                      <div className="competition-header">
                        <h4>{competition.name}</h4>
                        <span className={`status ${competition.status}`}>
                          {competition.status}
                        </span>
                      </div>
                      
                      {competition.winner_team_id && competition.final_ranking && (
                        <div className="competition-result">
                          <p><strong>Winner:</strong> {
                            competition.final_ranking[0]?.teamName || 'Unknown'
                          }</p>
                          <p><strong>Total Votes:</strong> {competition.total_votes}</p>
                        </div>
                      )}
                      
                      <div className="competition-actions">
                        <button 
                          onClick={() => loadCompetition(competition.id)}
                          className="load-button"
                        >
                          Load
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;


