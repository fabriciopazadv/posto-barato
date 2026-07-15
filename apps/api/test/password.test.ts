import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/domain/password.js';

describe('hashPassword/verifyPassword', () => {
  it('gera hash diferente do texto original e verifica corretamente', async () => {
    const hash = await hashPassword('minhaSenhaForte123');
    expect(hash).not.toBe('minhaSenhaForte123');
    expect(await verifyPassword(hash, 'minhaSenhaForte123')).toBe(true);
    expect(await verifyPassword(hash, 'senhaErrada')).toBe(false);
  });

  it('hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const [a, b] = await Promise.all([hashPassword('mesmaSenha'), hashPassword('mesmaSenha')]);
    expect(a).not.toBe(b);
  });

  it('verifyPassword não lança para hash inválido', async () => {
    await expect(verifyPassword('não-é-um-hash-argon2', 'qualquer')).resolves.toBe(false);
  });
});
