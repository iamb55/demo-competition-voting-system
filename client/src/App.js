import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainDisplay from './components/MainDisplay';
import VotingInterface from './components/VotingInterface';
import AdminDashboard from './components/AdminDashboard';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<MainDisplay />} />
          <Route path="/vote" element={<VotingInterface />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;


