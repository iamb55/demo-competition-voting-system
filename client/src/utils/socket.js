import { io } from 'socket.io-client';

// Dynamically determine socket URL based on current hostname
function getSocketURL() {
  if (process.env.REACT_APP_SOCKET_URL) {
    return process.env.REACT_APP_SOCKET_URL;
  }
  
  // In production (Vercel), WebSocket is on same domain
  if (window.location.hostname !== 'localhost') {
    return window.location.origin;
  }
  
  // Use current hostname with port 3001 for local development
  const hostname = window.location.hostname;
  return `http://${hostname}:3001`;
}

const SOCKET_URL = getSocketURL();

class SocketManager {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (!this.socket) {
      this.socket = io(SOCKET_URL);
      
      this.socket.on('connect', () => {
        console.log('Connected to server');
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from server');
      });

      // Set up event listeners
      this.socket.on('voteUpdate', (data) => {
        this.emit('voteUpdate', data);
      });

      this.socket.on('teamEliminated', (data) => {
        this.emit('teamEliminated', data);
      });

      this.socket.on('roundReset', (data) => {
        this.emit('roundReset', data);
      });

      this.socket.on('competitionComplete', (data) => {
        this.emit('competitionComplete', data);
      });

      this.socket.on('competitionStarted', (data) => {
        this.emit('competitionStarted', data);
      });

      this.socket.on('competitionReset', (data) => {
        this.emit('competitionReset', data);
      });

      this.socket.on('currentState', (data) => {
        this.emit('currentState', data);
      });
    }
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinCompetition(competitionId) {
    if (this.socket) {
      this.socket.emit('joinCompetition', competitionId);
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }
}

const socketManager = new SocketManager();
export default socketManager;


