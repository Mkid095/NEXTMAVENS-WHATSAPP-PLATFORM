import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

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
  // If path contains '/whatsapp/reseller/' AND does NOT contain '/token', use reseller token
  // Otherwise, use user access token
  const isResellerEndpoint = path.includes('/whatsapp/reseller/') && !path.includes('/token');
  const token = isResellerEndpoint ? resellerToken : accessToken;

  // Only set Authorization if token exists and is a non-empty string
  if (token && typeof token === 'string' && token.trim().length > 0) {
    config.headers.Authorization = `Bearer ${token.trim()}`;
  }

  // DEBUG: log outgoing requests
  console.log('[API Request]', config.method?.toUpperCase(), config.url, 'hasAuth:', !!config.headers.Authorization);

  return config;
});

// Response interceptor for logging and error handling
api.interceptors.response.use(
  (response) => {
    // DEBUG: log response status
    console.log('[API Response]', response.config?.url, response.status);
    return response;
  },
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
      const isResellerEndpoint = path.includes('/whatsapp/reseller/') && !path.includes('/token');
      if (isResellerEndpoint) {
        return Promise.reject(error);
      }

      // DEBUG: Log the 401 error with details
      console.error('[API Interceptor] 401 error on:', {
        url: error.config?.url,
        method: error.config?.method,
        path,
        status: error.response?.status,
        data: error.response?.data
      });

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
