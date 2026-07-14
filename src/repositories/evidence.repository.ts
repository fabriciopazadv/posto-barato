import { prisma } from './prisma.js';
export async function createEvidence(data:Record<string, unknown>){return prisma.collectionEvidence.create({data});}
