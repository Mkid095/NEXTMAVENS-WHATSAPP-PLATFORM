/**
 * API Service
 *
 * Core HTTP client with interceptors for authentication and error handling.
 * All API requests go through this singleton instance.
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

export class ApiService {
  private instance: AxiosInstance;
  private static readonly API_BASE = '/api/v1';

  constructor() {
    this.instance = axios.create({
      baseURL: ApiService.API_BASE,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor - add auth tokens
    this.instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const accessToken = localStorage.getItem('accessToken');
      const resellerToken = localStorage.getItem('resellerJwtToken');

      let path = config.url || '';
      if (typeof path === 'string' && path.startsWith('http')) {
        try {
          path = new URL(path).pathname;
        } catch {
          // Use as-is
        }
      }

      const isResellerEndpoint = path.includes('/whatsapp/reseller/') && !path.includes('/token');
      const token = isResellerEndpoint ? resellerToken : accessToken;

      if (token && typeof token === 'string' && token.trim().length > 0) {
        if (!config.headers) {
          config.headers = {} as any;
        }
        config.headers.Authorization = `Bearer ${token.trim()}`;
      }

      console.log('[API Request]', config.method?.toUpperCase(), config.url, 'hasAuth:', !!config.headers?.Authorization);

      return config;
    });

    // Response interceptor - unwrap envelope and handle errors
    this.instance.interceptors.response.use(
      (response) => {
        if (response.data && response.data.success && response.data.data !== undefined) {
          response.data = response.data.data;
        }
        return response;
      },
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          const url = error.config?.url || '';
          let path = url;
          if (typeof url === 'string' && url.startsWith('http')) {
            try {
              path = new URL(url).pathname;
            } catch {
              // Use as-is
            }
          }

          const isResellerEndpoint = path.includes('/whatsapp/reseller/') && !path.includes('/token');
          if (!isResellerEndpoint) {
            console.error('[API Interceptor] 401 error, clearing auth and redirecting to login');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('user');
            localStorage.removeItem('resellerJwtToken');
            if (window.location.pathname !== '/login') {
              window.location.href = '/login';
            }
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get the underlying axios instance
   */
  getAxios(): AxiosInstance {
    return this.instance;
  }

  /**
   * Create a public API client for instance-specific authentication
   */
  createPublicClient(instanceId: string, apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: import.meta.env.VITE_API_URL || '/api/v1',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
    });
  }
}

// Singleton instance
let apiServiceInstance: ApiService | null = null;

export function getApiService(): ApiService {
  if (!apiServiceInstance) {
    apiServiceInstance = new ApiService();
  }
  return apiServiceInstance;
}
