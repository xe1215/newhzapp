export interface User {
  _id: string;
  openid: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface AuthResult {
  openid: string;
  user: User;
}
