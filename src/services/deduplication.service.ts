import { stableHash } from './hashing.service.js';
export function collectionWindow(date:Date, hours=4):string{const ms=hours*60*60*1000; return String(Math.floor(date.getTime()/ms));}
export function stationFingerprint(args:{normalizedName:string;normalizedAddress:string;municipality:string;state:string}):string{return stableHash([args.normalizedName,args.normalizedAddress,args.municipality.toUpperCase(),args.state.toUpperCase()]);}
export function observationFingerprint(args:{stationFingerprint:string;productCode:string;price:number|string;relativeTimeText?:string;collectedAt:Date;windowHours?:number}):string{return stableHash([args.stationFingerprint,args.productCode,args.price,args.relativeTimeText??'',collectionWindow(args.collectedAt,args.windowHours??4)]);}
export function isDuplicateFingerprint(fingerprint:string, known:Set<string>):boolean{if(known.has(fingerprint)) return true; known.add(fingerprint); return false;}
