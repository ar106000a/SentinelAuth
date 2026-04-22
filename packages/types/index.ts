export interface Tenant {
  id: string;
  name: string;
  createdAt: Date;
}

export interface AuthResponse {
  accessToken: string;
  mfaRequired: boolean;
  riskScore: number;
}
