export interface User {
  id: string;
  username: string;
  uuid: string;
  accessToken: string;
  avatar?: string;
}

export interface Credentials {
  username: string;
  password?: string;
  type: 'offline' | 'microsoft';
}

export class AuthService {
  private currentUser: User | null = null;

  async login(credentials: Credentials): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      username: credentials.username,
      uuid: crypto.randomUUID(),
      accessToken: 'offline-token',
    };
    this.currentUser = user;
    return user;
  }

  async logout(): Promise<void> {
    this.currentUser = null;
  }

  getUser(): User | null {
    return this.currentUser;
  }
}
