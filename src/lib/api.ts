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

  // Use reseller token for reseller API endpoints (except token management itself)
  if (config.url?.startsWith('/whatsapp/reseller/') && !config.url.includes('/token')) {
    if (resellerToken) {
      config.headers.Authorization = `Bearer ${resellerToken}`;
    }
  } else if (accessToken) {
    // Use user access token for all other endpoints
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url;
      // For reseller API endpoints, don't automatically logout the user
      // Let the component handle the error (e.g., prompt to generate token)
      if (url?.startsWith('/whatsapp/reseller/')) {
        return Promise.reject(error);
      }
      // For other endpoints, treat as session expiry and logout
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
