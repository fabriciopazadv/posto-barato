import fs from 'node:fs'; import path from 'node:path'; import { z } from 'zod';
export const collectionConfigSchema=z.object({municipalities:z.array(z.object({name:z.string(),state:z.string().length(2),active:z.boolean()})),products:z.array(z.string()).min(1),maximumResultsPerProduct:z.number().int().positive(),maximumLoadMoreClicks:z.number().int().nonnegative(),saveScreenshots:z.boolean(),saveHtmlSnapshots:z.boolean(),schedulerEnabled:z.boolean(),allowedCollectionHours:z.object({start:z.string(),end:z.string()})});
export type CollectionConfig=z.infer<typeof collectionConfigSchema>;
export function loadCollectionConfig(file='config/collection.json'):CollectionConfig{return collectionConfigSchema.parse(JSON.parse(fs.readFileSync(path.resolve(file),'utf8')));}
