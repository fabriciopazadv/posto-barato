export type SessionStatus='VALID'|'AUTH_REQUIRED'|'CAPTCHA_DETECTED'|'BLOCKED'|'SECURITY_CHALLENGE'|'PAGE_UNAVAILABLE';
export type CanonicalFuel='ETANOL'|'ETANOL_ADITIVADO'|'GASOLINA_COMUM'|'GASOLINA_ADITIVADA'|'DIESEL_COMUM'|'DIESEL_S10'|'GNV';
export interface VisibleResultCard{ originalProductName:string; originalPriceText:string; relativeTimeText?:string; originalStationName:string; originalAddress:string; sourcePosition:number; municipality:string; state:string; latitude?:number|null; longitude?:number|null; publicStationCode?:string|null; collectedAt:Date; }
