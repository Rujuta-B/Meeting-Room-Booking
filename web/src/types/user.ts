// src/types/user.ts
export type Role = 'USER' | 'ADMIN'; // mirrors Prisma's Role enum

export interface User {
  id: string;
  email: string;
  role: Role;
}
