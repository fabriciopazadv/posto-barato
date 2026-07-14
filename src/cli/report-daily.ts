import { prisma } from '../repositories/prisma.js';
const since=new Date(); since.setHours(0,0,0,0); const runs=await prisma.collectionRun.findMany({where:{startedAt:{gte:since}},orderBy:{startedAt:'asc'}}); console.log(JSON.stringify({date:since.toISOString().slice(0,10),executions:runs.length,runs},null,2));
