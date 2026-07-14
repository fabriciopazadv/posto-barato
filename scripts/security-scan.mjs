import { execFileSync } from 'node:child_process';
const files = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const forbidden = [/^storage\//, /^\.env$/, /(^|\/)(cookies?|sessions?|auth|profile)(\.|\/|$)/i, /screenshot/i, /\.(png|jpg|jpeg)$/i];
const allowed = [/^tests\/fixtures\//, /^src\/browser\/session-validator\.ts$/, /^src\/cli\/auth\.ts$/];
const bad = files.filter((file) => forbidden.some((rule) => rule.test(file)) && !allowed.some((rule) => rule.test(file)));
if (bad.length) {
  console.error(`Arquivos sensíveis bloqueados para commit:\n${bad.join('\n')}`);
  process.exit(1);
}
console.log('Security scan OK');
