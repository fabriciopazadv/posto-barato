export function collapseSpaces(v:string):string{return v.replace(/\s+/g,' ').trim();}
export function stripDiacritics(v:string):string{return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
export function fingerprintText(v:string):string{return stripDiacritics(collapseSpaces(v).toUpperCase());}
