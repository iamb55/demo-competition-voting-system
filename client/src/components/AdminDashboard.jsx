import React, { useState, useEffect, useCallback } from 'react';
import socketManager from '../utils/socket';
import { API_BASE_URL } from '../utils/api';
import './AdminDashboard.css';

const AdminDashboard = () => {
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
  const [inputMode, setInputMode] = useState('individual'); // 'individual', 'bulk', or 'csv'
  const [bulkTeamNames, setBulkTeamNames] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState(null); // { teamNames: [], teamPresenters: [] }

  const handleVoteUpdate = useCallback((data) => {
    console.log('Admin received vote update:', data);
    if (currentCompetition && data.competitionId === currentCompetition.id) {
      setTeams(data.teams);
    }
  }, [currentCompetition]);

  const handleCompetitionComplete = useCallback((data) => {
    if (currentCompetition && data.competitionId === currentCompetition.id) {
      setSuccess(`Competition completed! Winner: ${data.winner.name}`);
      setTimeout(() => {
        fetchHistory();
        setCurrentCompetition(null);
        setTeams([]);
      }, 3000);
    }
  }, [currentCompetition]);

  const handleQueueUpdate = useCallback((data) => {
    if (currentCompetition && data.competitionId === currentCompetition.id) {
      setTeams(data.teams);
    }
  }, [currentCompetition]);

  const handleCompetitionStarted = useCallback((data) => {
    if (currentCompetition && data.competitionId === currentCompetition.id) {
      setTeams(data.teams);
      setCurrentCompetition(prev => ({ ...prev, status: 'voting' }));
    }
  }, [currentCompetition]);

  const handleAllTeamsDone = useCallback((data) => {
    if (currentCompetition && data.competitionId === currentCompetition.id) {
      setTeams(data.teams);
      setSuccess('All teams have completed their presentations! 🎉');
    }
  }, [currentCompetition]);

  const setupSocketListeners = useCallback(() => {
    socketManager.on('voteUpdate', handleVoteUpdate);
    socketManager.on('competitionComplete', handleCompetitionComplete);
    socketManager.on('queueUpdate', handleQueueUpdate);
    socketManager.on('competitionStarted', handleCompetitionStarted);
    socketManager.on('allTeamsDone', handleAllTeamsDone);
  }, [handleVoteUpdate, handleCompetitionComplete, handleQueueUpdate, handleCompetitionStarted, handleAllTeamsDone]);

  useEffect(() => {
    fetchHistory();
    setupSocketListeners();
    socketManager.connect();

    return () => {
      socketManager.off('voteUpdate', handleVoteUpdate);
      socketManager.off('competitionComplete', handleCompetitionComplete);
      socketManager.off('queueUpdate', handleQueueUpdate);
      socketManager.off('competitionStarted', handleCompetitionStarted);
      socketManager.off('allTeamsDone', handleAllTeamsDone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupSocketListeners, handleVoteUpdate, handleCompetitionComplete]);

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

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }

    // Simple CSV parser that handles quoted fields
    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    // Parse header row
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/"/g, ''));
    
    // Find column indices - be flexible with column names
    // Date column: "Demo day", "date", or anything containing "date"
    const dateColIndex = headers.findIndex(h => 
      h.includes('demo day') || h === 'demo day' || h.includes('date')
    );
    const demoTitleColIndex = headers.findIndex(h => 
      (h.includes('demo') && h.includes('title')) || h === 'demo title' || h === 'title'
    );
    const presenterColIndex = headers.findIndex(h => 
      h.includes('presenter') && (h.includes('name') || h.includes('names'))
    );

    if (dateColIndex === -1) {
      throw new Error('CSV must contain a date column (e.g., "Demo day" or "Date")');
    }
    if (demoTitleColIndex === -1) {
      throw new Error('CSV must contain a "Demo Title" column');
    }
    if (presenterColIndex === -1) {
      throw new Error('CSV must contain a "Presenter Name(s)" column');
    }

    // Parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, ''));
      if (values.length <= Math.max(dateColIndex, demoTitleColIndex, presenterColIndex)) {
        continue; // Skip incomplete rows
      }
      
      const dateStr = values[dateColIndex];
      const demoTitle = values[demoTitleColIndex];
      const presenterNames = values[presenterColIndex];

      if (!dateStr || !demoTitle) {
        continue; // Skip rows without required data
      }

      // Parse date - try multiple formats
      let date = null;
      try {
        date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          // Try other formats (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD)
          const parts = dateStr.split(/[-\/]/);
          if (parts.length === 3) {
            // Try YYYY-MM-DD first
            if (parts[0].length === 4) {
              date = new Date(parts[0], parts[1] - 1, parts[2]);
            } else {
              // Try MM/DD/YYYY or DD/MM/YYYY
              date = new Date(parts[2] || parts[0], parts[0] - 1, parts[1] || parts[2]);
            }
          }
        }
      } catch (e) {
        console.warn('Could not parse date:', dateStr);
        continue;
      }

      if (isNaN(date.getTime())) {
        continue; // Skip rows with invalid dates
      }

      rows.push({
        date,
        demoTitle: demoTitle.trim(),
        presenterNames: presenterNames ? presenterNames.trim() : null
      });
    }

    if (rows.length === 0) {
      throw new Error('No valid rows found in CSV');
    }

    // Find most recent date
    const mostRecentDate = new Date(Math.max(...rows.map(r => r.date.getTime())));
    
    // Filter rows with most recent date
    const recentRows = rows.filter(r => {
      const rDate = new Date(r.date);
      return rDate.getTime() === mostRecentDate.getTime();
    });

    // Extract team names and presenter names
    const teamNames = [];
    const teamPresenters = [];
    
    recentRows.forEach(row => {
      teamNames.push(row.demoTitle);
      
      // Parse presenter names - could be comma-separated, semicolon-separated, or "and" separated
      let presenters = [];
      if (row.presenterNames) {
        presenters = row.presenterNames
          .split(/[,;]| and /i)
          .map(p => p.trim())
          .filter(p => p.length > 0);
      }
      teamPresenters.push(presenters.length > 0 ? presenters : null);
    });

    return { teamNames, teamPresenters };
  };

  const handleCSVFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      setCsvFile(null);
      setCsvData(null);
      return;
    }

    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    setCsvFile(file);
    setError(null);

    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      setCsvData(parsed);
      setSuccess(`Successfully parsed ${parsed.teamNames.length} teams from CSV`);
    } catch (err) {
      setError(err.message || 'Failed to parse CSV file');
      setCsvData(null);
    }
  };

  const createCompetition = async (e) => {
    e.preventDefault();
    
    // Get team names and presenters based on input mode
    let finalTeamNames = [];
    let finalTeamPresenters = null;
    
    if (inputMode === 'csv') {
      if (!csvData || csvData.teamNames.length < 2) {
        setError('Please upload a CSV file with at least 2 teams');
        return;
      }
      finalTeamNames = csvData.teamNames;
      finalTeamPresenters = csvData.teamPresenters;
    } else if (inputMode === 'bulk') {
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
          teamNames: finalTeamNames,
          teamPresenters: finalTeamPresenters
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
        setCsvFile(null);
        setCsvData(null);
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
        const data = await response.json();
        setSuccess('Competition started! Presentation queue initialized.');
        setCurrentCompetition(prev => ({ ...prev, status: 'voting' }));
        setTeams(data.teams || []);
      } else {
        setError('Failed to start competition');
      }
    } catch (err) {
      setError('Failed to start competition');
    } finally {
      setLoading(false);
    }
  };

  const markTeamDone = async (teamId, isDone) => {
    if (!currentCompetition) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/competition/${currentCompetition.id}/team/${teamId}/done`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isDone
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTeams(data.teams || []);
        setSuccess(isDone ? 'Team marked as done. Queue updated.' : 'Team marked as undone.');
      } else {
        setError('Failed to update team status');
      }
    } catch (err) {
      setError('Failed to update team status');
    } finally {
      setLoading(false);
    }
  };

  const deleteCompetition = async (competitionId) => {
    if (!window.confirm('Are you sure you want to delete this competition? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/competition/${competitionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSuccess('Competition deleted successfully.');
        // If we deleted the current competition, clear it
        if (currentCompetition && currentCompetition.id === competitionId) {
          setCurrentCompetition(null);
          setTeams([]);
        }
        // Refresh the history
        await fetchHistory();
      } else {
        setError('Failed to delete competition');
      }
    } catch (err) {
      setError('Failed to delete competition');
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

  const endCompetition = async () => {
    if (!currentCompetition) return;

    // Confirm before ending
    if (!window.confirm('Are you sure you want to end this competition? The team with the most votes will be declared the winner.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/competition/${currentCompetition.id}/end`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccess(`Competition ended! Winner: ${data.winner?.name || 'Unknown'}`);
        await loadCompetition(currentCompetition.id);
        fetchHistory();
      } else {
        setError(data.error || 'Failed to end competition');
      }
    } catch (err) {
      setError('Failed to end competition');
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

  const switchToCSV = () => {
    setInputMode('csv');
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
                    <button
                      type="button"
                      className={`toggle-button ${inputMode === 'csv' ? 'active' : ''}`}
                      onClick={switchToCSV}
                    >
                      CSV Import
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
                ) : inputMode === 'bulk' ? (
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
                ) : (
                  <div className="csv-input-container">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCSVFileChange}
                      className="csv-file-input"
                      id="csv-file-input"
                    />
                    <label htmlFor="csv-file-input" className="csv-file-label">
                      {csvFile ? csvFile.name : 'Choose CSV File'}
                    </label>
                    <div className="csv-input-help">
                      💡 CSV Requirements:
                      <ul>
                        <li>Must contain columns: Demo day (or Date), Demo Title, Presenter Name(s)</li>
                        <li>Only rows with the most recent date will be imported</li>
                        <li>Presenter names can be comma, semicolon, or "and" separated</li>
                      </ul>
                    </div>
                    {csvData && (
                      <div className="csv-preview">
                        <div className="team-count">
                          {csvData.teamNames.length} teams detected from most recent date
                        </div>
                        <div className="csv-preview-list">
                          {csvData.teamNames.map((name, index) => (
                            <div key={index} className="csv-preview-item">
                              <strong>{name}</strong>
                              {Array.isArray(csvData.teamPresenters[index]) && csvData.teamPresenters[index].length > 0 && (
                                <span className="presenter-names">
                                  {' - '}
                                  {csvData.teamPresenters[index].join(', ')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
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
                  🚀 Start Competition
                </button>
              )}
              
              {currentCompetition.status === 'voting' && (
                <button 
                  onClick={resetCompetition} 
                  disabled={loading}
                  className="reset-button"
                >
                  🔄 Reset Competition
                </button>
              )}
              
              {currentCompetition.status === 'voting' && teams.filter(team => team.status === 'active').length > 1 && (
                <button 
                  onClick={endCompetition} 
                  disabled={loading}
                  className="end-button"
                >
                  🏆 End Competition
                </button>
              )}
            </div>

            {teams.length > 0 && (
              <div className="teams-status">
                <h3>Teams Status</h3>
                <div className="teams-list">
                  {teams.map((team, index) => {
                    const queueLabel = team.queue_position === 'current' ? '🎤 CURRENT' :
                                      team.queue_position === 'next' ? '⏭️ NEXT' :
                                      team.queue_position === 'after_next' ? '⏭️⏭️ AFTER NEXT' : '';
                    const isDone = team.is_done === 1;
                    
                    return (
                      <div key={`${team.id}-${index}`} className={`team-status ${team.status} ${isDone ? 'done' : ''} ${team.queue_position || ''}`}>
                        <div className="team-info">
                          <span className="team-name">{team.name}</span>
                          {Array.isArray(team.presenter_names) && team.presenter_names.length > 0 && (
                            <span className="presenter-names-admin">
                              ({team.presenter_names.join(', ')})
                            </span>
                          )}
                          {queueLabel && <span className="queue-label">{queueLabel}</span>}
                          {isDone && <span className="done-badge">✅ DONE</span>}
                        </div>
                        <div className="team-actions">
                          {currentCompetition.status === 'voting' && (
                            <button
                              onClick={() => markTeamDone(team.id, !isDone)}
                              className={`done-button ${isDone ? 'undone' : 'done'}`}
                              disabled={loading}
                            >
                              {isDone ? '↩️ Undone' : '✅ Done'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
                        <button 
                          onClick={() => deleteCompetition(competition.id)}
                          className="delete-button"
                        >
                          🗑️ Delete
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


