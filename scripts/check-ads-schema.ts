import { executeQuery } from '@/lib/server/db';

async function main() {
  const result = await executeQuery(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'marketing_merged_ads_spending'
    ORDER BY ordinal_position
    LIMIT 50
  `);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
