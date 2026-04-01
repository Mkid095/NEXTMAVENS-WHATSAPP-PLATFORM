/**
 * Auth Service
 *
 * Handles user authentication and profile operations
 */

import { getApiService } from '../api/ApiService';
import { UserProfile } from '../../types';

class AuthService {
  private api = getApiService().getAxios();

  /**
   * Fetch current user profile
   */
  async fetchCurrentUser(): Promise<UserProfile> {
    const response = await this.api.get<{ user: UserProfile }>('auth/me');
    return response.data.user;
  }

  /**
   * Update user profile
   */
  async updateProfile(data: { name?: string; email?: string }): Promise<UserProfile> {
    const response = await this.api.put<{ user: UserProfile }>('auth/profile', data);
    return response.data.user;
  }

  /**
   * Change password
   */
  async changePassword(credentials: { currentPassword: string; newPassword: string }): Promise<void> {
    await this.api.post<null>('auth/change-password', credentials);
  }

  /**
   * Login user
   */
  async login(credentials: { email: string; password: string }): Promise<{ token: string; user: UserProfile }> {
    const response = await this.api.post<{ token: string; user: UserProfile }>('auth/login', credentials);
    const result = response.data;
    // Store auth data
    localStorage.setItem('accessToken', result.token);
    localStorage.setItem('user', JSON.stringify(result.user));
    return result;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    localStorage.removeItem('resellerJwtToken');
  }

  /**
   * Register new user
   */
  async register(data: { email: string; password: string; name: string }): Promise<UserProfile> {
    const response = await this.api.post<{ user: UserProfile }>('auth/register', data);
    return response.data.user;
  }
}

// Export singleton
const authService = new AuthService();
export { authService };
