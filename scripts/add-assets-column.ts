import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { executeQuery } from '@/lib/server/db';

async function main(): Promise<void> {
  await executeQuery('ALTER TABLE app_products ADD COLUMN IF NOT EXISTS assets_folder_id VARCHAR(255);');
  console.log('assets_folder_id column added successfully');
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
