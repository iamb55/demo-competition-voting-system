// Utility function to get the correct API base URL
export function getApiBaseUrl() {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // In production (Vercel), API is on same domain
  if (window.location.hostname !== 'localhost') {
    return window.location.origin;
  }
  
  // Use current hostname with port 3001 for local development
  const hostname = window.location.hostname;
  return `http://${hostname}:3001`;
}

export const API_BASE_URL = getApiBaseUrl();
