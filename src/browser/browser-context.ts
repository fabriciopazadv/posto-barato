import { chromium } from 'playwright'; import { loadEnvironment } from '../config/environment.js';
export async function launchCollectorContext(){const env=loadEnvironment(); return chromium.launchPersistentContext(env.BROWSER_PROFILE_DIR,{headless:env.HEADLESS,viewport:{width:1366,height:900},acceptDownloads:false});}
