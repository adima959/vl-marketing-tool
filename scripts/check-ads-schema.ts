import { executeQuery } from '../lib/server/db';

async function checkAdsSchema() {
  try {
    console.log('Querying merged_ads_spending schema...\n');

    // Get one sample row to see all columns
    const sample = await executeQuery<Record<string, unknown>>(`
      SELECT * FROM merged_ads_spending
      WHERE date >= '2026-02-01'::date
      LIMIT 1
    `);

    if (sample.length === 0) {
      console.log('No data found');
      process.exit(1);
    }

    const columns = Object.keys(sample[0]);
    console.log(`Total columns: ${columns.length}\n`);
    console.log('Available columns:');
    console.log('==================\n');

    columns.forEach((col, idx) => {
      const value = sample[0][col];
      const type = typeof value;
      const displayValue = value === null ? 'NULL' :
                          type === 'string' && typeof value === 'string' && value.length > 50 ? value.substring(0, 47) + '...' :
                          value;
      console.log(`${(idx + 1).toString().padStart(3, ' ')}. ${col.padEnd(30, ' ')} (${type.padEnd(7, ' ')}) = ${displayValue}`);
    });

    console.log('\n==================');
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAdsSchema();
