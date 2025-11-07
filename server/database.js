const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    const dbPath = path.join(__dirname, 'voting.db');
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  init() {
    this.db.serialize(() => {
      // Competitions table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS competitions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT DEFAULT 'setup',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          started_at DATETIME,
          completed_at DATETIME,
          winner_team_id TEXT,
          last_reset DATETIME,
          settings JSON DEFAULT '{}'
        )
      `);

      // Teams table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          name TEXT NOT NULL,
          position INTEGER,
          status TEXT DEFAULT 'active',
          votes INTEGER DEFAULT 0,
          eliminated_at DATETIME,
          FOREIGN KEY (competition_id) REFERENCES competitions (id)
        )
      `);

      // Votes table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS votes (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          team_id TEXT NOT NULL,
          voter_session TEXT NOT NULL,
          voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          ip_address TEXT,
          FOREIGN KEY (competition_id) REFERENCES competitions (id),
          FOREIGN KEY (team_id) REFERENCES teams (id),
          UNIQUE(competition_id, voter_session)
        )
      `);

      // Competition results table (for historical data)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS competition_results (
          id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          final_ranking JSON,
          total_votes INTEGER,
          total_participants INTEGER,
          duration_minutes INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (competition_id) REFERENCES competitions (id)
        )
      `);

      // Add last_reset column to existing competitions table (for backwards compatibility)
      this.db.run(`
        ALTER TABLE competitions ADD COLUMN last_reset DATETIME
      `, (err) => {
        // Ignore error if column already exists
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Error adding last_reset column:', err.message);
        }
      });
    });
  }

  // Competition methods
  async createCompetition(id, name, teamNames) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        // Create competition
        this.db.run(
          'INSERT INTO competitions (id, name) VALUES (?, ?)',
          [id, name],
          function(err) {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }
          }
        );

        // Create teams
        const stmt = this.db.prepare('INSERT INTO teams (id, competition_id, name, position) VALUES (?, ?, ?, ?)');
        teamNames.forEach((teamName, index) => {
          const teamId = `${id}_team_${index + 1}`;
          stmt.run(teamId, id, teamName, index + 1);
        });
        stmt.finalize();

        this.db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve(id);
        });
      });
    });
  }

  async getCompetition(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM competitions WHERE id = ?',
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async getCompetitionWithTeams(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM competitions WHERE id = ?',
        [id],
        (err, competition) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (!competition) {
            resolve(null);
            return;
          }

          this.db.all(
            'SELECT * FROM teams WHERE competition_id = ? ORDER BY position',
            [id],
            (err, teams) => {
              if (err) reject(err);
              else resolve({ ...competition, teams });
            }
          );
        }
      );
    });
  }

  async updateCompetitionStatus(id, status, additionalFields = {}) {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(additionalFields).map(key => `${key} = ?`).join(', ');
      const values = Object.values(additionalFields);
      
      let query = 'UPDATE competitions SET status = ?';
      let params = [status, id];
      
      if (fields) {
        query += `, ${fields}`;
        params = [status, ...values, id];
      }
      
      query += ' WHERE id = ?';

      this.db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // Team methods
  async getTeams(competitionId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM teams WHERE competition_id = ? ORDER BY position',
        [competitionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async updateTeamVotes(teamId, votes) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE teams SET votes = ? WHERE id = ?',
        [votes, teamId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async eliminateTeam(teamId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE teams SET status = ?, eliminated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['eliminated', teamId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async resetTeams(competitionId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE teams SET votes = 0, status = ?, eliminated_at = NULL WHERE competition_id = ?',
        ['active', competitionId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async clearVotes(competitionId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM votes WHERE competition_id = ?',
        [competitionId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Vote methods
  async addVote(voteId, competitionId, teamId, voterSession, ipAddress) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO votes (id, competition_id, team_id, voter_session, ip_address) VALUES (?, ?, ?, ?, ?)',
        [voteId, competitionId, teamId, voterSession, ipAddress],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async hasVoted(competitionId, voterSession) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id FROM votes WHERE competition_id = ? AND voter_session = ?',
        [competitionId, voterSession],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });
  }

  async getVoteCount(competitionId, teamId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(*) as count FROM votes WHERE competition_id = ? AND team_id = ?',
        [competitionId, teamId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
  }

  async getAllVoteCounts(competitionId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT t.id, t.name, t.status, COUNT(v.id) as votes 
         FROM teams t 
         LEFT JOIN votes v ON t.id = v.team_id 
         WHERE t.competition_id = ? 
         GROUP BY t.id, t.name, t.status 
         ORDER BY t.position`,
        [competitionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Result methods
  async saveCompetitionResult(competitionId, finalRanking, totalVotes, totalParticipants, durationMinutes) {
    return new Promise((resolve, reject) => {
      const resultId = `result_${Date.now()}`;
      this.db.run(
        'INSERT INTO competition_results (id, competition_id, final_ranking, total_votes, total_participants, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)',
        [resultId, competitionId, JSON.stringify(finalRanking), totalVotes, totalParticipants, durationMinutes],
        function(err) {
          if (err) reject(err);
          else resolve(resultId);
        }
      );
    });
  }

  async getCompetitionHistory() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT c.*, cr.final_ranking, cr.total_votes, cr.total_participants, cr.duration_minutes 
         FROM competitions c 
         LEFT JOIN competition_results cr ON c.id = cr.competition_id 
         ORDER BY c.created_at DESC`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => ({
            ...row,
            final_ranking: row.final_ranking ? JSON.parse(row.final_ranking) : null
          })));
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;


