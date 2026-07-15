import { z } from 'zod';

const clientType = z.enum(['web', 'mobile']).default('web');

export const registerBody = z.object({
  email: z.string().email('E-mail inválido').max(200),
  password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres').max(200),
  name: z.string().min(1).max(120).optional(),
  clientType,
});

export const loginBody = z.object({
  email: z.string().email('E-mail inválido').max(200),
  password: z.string().min(1, 'Informe a senha').max(200),
  clientType,
});

export const refreshBody = z.object({
  refreshToken: z.string().min(1).optional(),
  clientType,
});
