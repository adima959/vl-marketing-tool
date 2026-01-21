import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function debugHierarchy() {
  try {
    console.log('=== Checking Google Ads "Balansera_Dnk_IM_24_11" campaign ===\n');

    const result = await pool.query(`
      SELECT
        network,
        campaign_name,
        adset_name,
        ad_name,
        SUM(cost::numeric) as total_cost
      FROM merged_ads_spending
      WHERE network = 'Google Ads'
        AND campaign_name LIKE '%Balansera_Dnk_IM_24_11%'
        AND date BETWEEN '2026-01-18' AND '2026-01-18'
      GROUP BY network, campaign_name, adset_name, ad_name
      ORDER BY total_cost DESC
      LIMIT 10;
    `);

    console.log(`Found ${result.rows.length} rows:\n`);
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}.`);
      console.log(`   Network: ${row.network}`);
      console.log(`   Campaign: ${row.campaign_name}`);
      console.log(`   Adset: ${row.adset_name}`);
      console.log(`   Ad: ${row.ad_name}`);
      console.log(`   Cost: ${row.total_cost}`);
      console.log('');
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugHierarchy();
