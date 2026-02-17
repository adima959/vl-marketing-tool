import { executeQuery } from '@/lib/server/db';

async function main() {
  console.log('=== Finding tables with "campaign" in the name ===\n');

  const tables = await executeQuery<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (
        table_name LIKE '%campaign%'
        OR table_name LIKE '%fb_ads%'
        OR table_name LIKE '%google_ads%'
      )
    ORDER BY table_name
  `);

  console.log(`Found ${tables.length} relevant tables:\n`);

  for (const { table_name } of tables) {
    console.log(`\n📊 Table: ${table_name}`);

    // Get columns for this table
    const columns = await executeQuery<{ column_name: string; data_type: string }>(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [table_name]);

    // Check if it has campaign_id and status
    const hasCampaignId = columns.some(c => c.column_name.includes('campaign_id'));
    const hasStatus = columns.some(c => c.column_name.includes('status'));

    if (hasCampaignId || hasStatus) {
      console.log(`   ✓ Has campaign_id: ${hasCampaignId}`);
      console.log(`   ✓ Has status: ${hasStatus}`);

      if (hasStatus) {
        const statusCols = columns.filter(c => c.column_name.includes('status'));
        console.log(`   Status columns: ${statusCols.map(c => c.column_name).join(', ')}`);
      }

      // Show all columns
      console.log(`   Columns (${columns.length}):`);
      columns.forEach(c => {
        const marker = c.column_name.includes('status') ? '⭐' :
                       c.column_name.includes('campaign') ? '🎯' : '  ';
        console.log(`     ${marker} ${c.column_name} (${c.data_type})`);
      });
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
