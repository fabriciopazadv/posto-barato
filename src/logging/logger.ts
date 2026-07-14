import pino from 'pino'; import { loadEnvironment } from '../config/environment.js';
export const redactPaths=['password','senha','token','cookie','cookies','authorization','headers.authorization','localStorage','sessionStorage','storageState'];
export function createLogger(){const env=loadEnvironment(); return pino({level:env.LOG_LEVEL,redact:{paths:redactPaths,censor:'[REDACTED]'}});}
export const logger=createLogger();
