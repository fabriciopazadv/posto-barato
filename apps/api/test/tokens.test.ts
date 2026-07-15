import { describe, expect, it } from 'vitest';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from '../src/domain/tokens.js';

const SECRET = 'a'.repeat(32);

describe('access token (JWT)', () => {
  it('assina e verifica corretamente', async () => {
    const token = await signAccessToken({ userId: 'user-1' }, SECRET, 900);
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload).toEqual({ userId: 'user-1' });
  });

  it('rejeita assinatura com segredo errado', async () => {
    const token = await signAccessToken({ userId: 'user-1' }, SECRET, 900);
    const payload = await verifyAccessToken(token, 'b'.repeat(32));
    expect(payload).toBeNull();
  });

  it('rejeita token expirado', async () => {
    const token = await signAccessToken({ userId: 'user-1' }, SECRET, -1);
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload).toBeNull();
  });

  it('rejeita lixo não-JWT', async () => {
    expect(await verifyAccessToken('não-e-um-jwt', SECRET)).toBeNull();
  });
});

describe('refresh token', () => {
  it('gera tokens de alta entropia e únicos', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it('hash é determinístico (necessário para lookup por igualdade)', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });

  it('hashes diferentes para tokens diferentes', () => {
    expect(hashRefreshToken('a')).not.toBe(hashRefreshToken('b'));
  });
});
