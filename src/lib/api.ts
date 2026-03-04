import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'https://whatsappapi.nextmavens.cloud/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('accessToken');
  const resellerToken = localStorage.getItem('resellerJwtToken');

  // Extract pathname from full URL (or use url as-is if relative)
  let path = config.url || '';
  if (path.startsWith('http')) {
    try {
      path = new URL(path).pathname;
    } catch {
      // If URL parsing fails, use as-is
    }
  }

  // Determine which token to use
  const token = path.startsWith('/whatsapp/reseller/') && !path.includes('/token')
    ? resellerToken
    : accessToken;

  // Only set Authorization if token exists and is a non-empty string
  if (token && typeof token === 'string' && token.trim().length > 0) {
    config.headers.Authorization = `Bearer ${token.trim()}`;
  }

  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      // Extract pathname if full URL
      let path = url;
      if (url.startsWith('http')) {
        try {
          path = new URL(url).pathname;
        } catch {
          // Use as-is
        }
      }

      // For reseller API endpoints (except token endpoint), don't automatically logout
      // Let the component handle the error (e.g., prompt to generate token)
      if (path.startsWith('/whatsapp/reseller/') && !path.includes('/token')) {
        return Promise.reject(error);
      }

      // For all other endpoints (including token endpoint), treat as session expiry
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      localStorage.removeItem('resellerJwtToken');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
