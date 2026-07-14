import { prisma } from './prisma.js';
export async function findProduct(code:string){return prisma.product.findUnique({where:{canonicalCode:code}});}
