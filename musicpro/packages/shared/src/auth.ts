import type { MemberRoleValue } from "./types";

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  user: AuthUser;
}

export interface Member {
  id: string;
  userId: string | null;
  memberNumber: number | null;
  firstName: string;
  lastName: string;
  email: string | null;
  isActive: boolean;
}

export interface MemberWithRoles extends Member {
  roles: MemberRoleValue[];
}

export interface AuthState {
  session: AuthSession | null;
  member: Member | null;
  roles: MemberRoleValue[];
  isLoading: boolean;
  isBiometricUnlockRequired: boolean;
}

export type SignInCredentials = {
  email: string;
  password: string;
};

export type SignUpCredentials = SignInCredentials & {
  firstName?: string;
  lastName?: string;
};
