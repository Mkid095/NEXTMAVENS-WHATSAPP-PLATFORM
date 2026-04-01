/**
 * Auth API - Pure HTTP calls
 */

import { getApiService } from '../api/ApiService';
import { UserProfile } from '../../types';

export class AuthApi {
  private api = getApiService().getAxios();

  async login(credentials: { email: string; password: string }): Promise<{ token: string; user: UserProfile }> {
    const res = await this.api.post<{ token: string; user: UserProfile }>('auth/login', credentials);
    return res.data;
  }

  async fetchCurrentUser(): Promise<UserProfile> {
    const res = await this.api.get<{ user: UserProfile }>('auth/me');
    return res.data.user;
  }

  async updateProfile(data: { name?: string; email?: string }): Promise<UserProfile> {
    const res = await this.api.put<{ user: UserProfile }>('auth/profile', data);
    return res.data.user;
  }

  async changePassword(credentials: { currentPassword: string; newPassword: string }): Promise<void> {
    await this.api.post<null>('auth/change-password', credentials);
  }

  logout(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    localStorage.removeItem('resellerJwtToken');
  }
}
