import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import './WinnerCelebration.css';

const WinnerCelebration = ({ winner, finalRanking, onCelebrationEnd }) => {
  const [stage, setStage] = useState('buildup'); // buildup -> reveal -> celebration -> results
  const [showWinner, setShowWinner] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!winner) return;

    const sequence = async () => {
      // Stage 1: Buildup (3 seconds)
      setStage('buildup');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Stage 2: Winner Reveal
      setStage('reveal');
      setShowWinner(true);
      
      // Trigger confetti burst
      triggerConfettiBurst();
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Stage 3: Celebration with continuous confetti
      setStage('celebration');
      startContinuousConfetti();
      
      await new Promise(resolve => setTimeout(resolve, 4000));

      // Stage 4: Show final results
      setStage('results');
      setShowResults(true);
      stopContinuousConfetti();
      
      // One final confetti burst
      setTimeout(() => {
        triggerConfettiBurst();
      }, 500);
    };

    sequence();
  }, [winner]);

  const triggerConfettiBurst = () => {
    // Multiple confetti bursts from different angles
    const duration = 3000;
    const animationEnd = Date.now() + duration;

    const randomInRange = (min, max) => Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      // Left side burst
      confetti({
        particleCount: 50,
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        origin: {
          x: randomInRange(0.1, 0.3),
          y: Math.random() - 0.2
        },
        colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']
      });

      // Right side burst
      confetti({
        particleCount: 50,
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        origin: {
          x: randomInRange(0.7, 0.9),
          y: Math.random() - 0.2
        },
        colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']
      });
    }, 250);
  };

  const startContinuousConfetti = () => {
    const duration = 4000;
    const animationEnd = Date.now() + duration;

    const frame = () => {
      if (Date.now() > animationEnd) return;

      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.8 },
        colors: ['#ffd700', '#ffed4e', '#ff6b6b', '#4ecdc4', '#45b7d1']
      });
      
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.8 },
        colors: ['#ffd700', '#ffed4e', '#ff6b6b', '#4ecdc4', '#45b7d1']
      });

      requestAnimationFrame(frame);
    };
    
    frame();
  };

  const stopContinuousConfetti = () => {
    // Confetti will naturally stop as the animation frames end
  };

  const handleClose = () => {
    if (onCelebrationEnd) {
      onCelebrationEnd();
    }
  };

  if (!winner) return null;

  return (
    <div className="winner-celebration-overlay">
      <div className="winner-celebration-content">
        
        {/* Stage 1: Buildup */}
        {stage === 'buildup' && (
          <div className="buildup-stage">
            <div className="calculating-text">
              <h2>🏆 Calculating Results...</h2>
              <div className="loading-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
            <div className="drum-roll">
              <div className="pulse-ring"></div>
              <div className="pulse-ring pulse-ring-delay-1"></div>
              <div className="pulse-ring pulse-ring-delay-2"></div>
            </div>
          </div>
        )}

        {/* Stage 2 & 3: Winner Reveal & Celebration */}
        {(stage === 'reveal' || stage === 'celebration') && (
          <div className="winner-reveal-stage">
            <div className={`winner-announcement ${showWinner ? 'show' : ''}`}>
              <h1 className="celebration-title">🎉 WE HAVE A WINNER! 🎉</h1>
              <div className="winner-card">
                <div className="winner-crown">👑</div>
                <h2 className="winner-name">{winner.name}</h2>
                <div className="winner-votes">{winner.votes} votes</div>
                <div className="winner-sparkles">✨ ⭐ ✨</div>
              </div>
            </div>
          </div>
        )}

        {/* Stage 4: Final Results */}
        {stage === 'results' && showResults && (
          <div className="results-stage">
            <div className="final-results">
              <h2>🏆 Final Rankings</h2>
              <div className="rankings-list">
                {finalRanking && finalRanking.map((team, index) => (
                  <div key={team.teamId} className={`ranking-item ${index === 0 ? 'winner-item' : ''}`}>
                    <div className="rank-position">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </div>
                    <div className="team-info">
                      <span className="team-name">{team.teamName}</span>
                      <span className="team-votes">{team.finalVotes} votes</span>
                    </div>
                    {team.status === 'active' && <div className="winner-badge">WINNER!</div>}
                  </div>
                ))}
              </div>
              
              <button className="close-celebration" onClick={handleClose}>
                Continue to Next Competition 🚀
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WinnerCelebration;
