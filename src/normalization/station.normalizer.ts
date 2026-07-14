import { collapseSpaces, fingerprintText } from '../utils/text.js';
export function normalizeStationName(v:string):string{return fingerprintText(v);}
export function displayStationName(v:string):string{return collapseSpaces(v).toUpperCase();}
