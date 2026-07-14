import { collapseSpaces, fingerprintText } from '../utils/text.js';
export function normalizeAddress(v:string):string{return fingerprintText(v);}
export function displayAddress(v:string):string{return collapseSpaces(v).toUpperCase();}
export function extractPostalCode(v:string):string|null{return v.match(/\b\d{5}-?\d{3}\b/)?.[0].replace('-','')??null;}
