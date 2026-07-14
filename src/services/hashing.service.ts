import { createHash } from 'node:crypto';
export function sha256(value:string|Buffer):string{return createHash('sha256').update(value).digest('hex');}
export function stableHash(parts:unknown[]):string{return sha256(parts.map(p=>String(p??'')).join('|'));}
