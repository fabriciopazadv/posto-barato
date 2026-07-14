import { prisma } from './prisma.js';
export async function createObservation(data:Record<string, unknown>){return prisma.priceObservation.create({data});}
