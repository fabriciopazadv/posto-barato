import { prisma } from './prisma.js';
export async function upsertStation(data:Record<string, unknown>){const now=new Date(); return prisma.station.upsert({where:{fingerprint:data.fingerprint},create:{...data,firstSeenAt:now,lastSeenAt:now},update:{displayName:data.displayName,displayAddress:data.displayAddress,lastSeenAt:now}});}
