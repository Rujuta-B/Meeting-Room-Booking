// src/modules/auth/auth.schemas.ts
import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email('Must be a valid email address.'),
  // A real minimum, not "at least 1 character" - this is a POC, not a
  // security audit, but a token minimum communicates intent without
  // needing a full password-strength library.
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Must be a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});
export type LoginInput = z.infer<typeof LoginSchema>;
