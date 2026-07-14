import type { Page } from 'playwright'; import { loadEnvironment } from '../config/environment.js'; import { detectPageStatus } from './page-guards.js';
export async function validateSession(page:Page){const env=loadEnvironment(); await page.goto(env.NOTA_MT_MENOR_PRECO_URL,{waitUntil:'domcontentloaded',timeout:env.COLLECTION_TIMEOUT_MS}); return detectPageStatus(page);}
