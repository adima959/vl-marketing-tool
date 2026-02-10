#!/usr/bin/env node
/**
 * Check what source values CRM subscriptions have for Feb 10
 */

import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

function createMariaPool(): mysql.Pool {
  return mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 15000,
  });
}

async function checkSources() {
  const pool = createMariaPool();

  try {
    const date = '2026-02-10';

    console.log('🔍 Checking CRM subscription sources for Feb 10...\n');

    // Check subscription sources - joining with invoice to get source
    const query = `
      SELECT
        s.id AS subscription_id,
        s.tracking_id_4 AS campaign_id,
        sr.source,
        sr.id AS source_id,
        COUNT(*) AS count
      FROM subscription s
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE DATE(s.date_create) = ?
        AND s.tracking_id_4 IS NOT NULL
        AND s.tracking_id_4 != ''
      GROUP BY s.id, s.tracking_id_4, sr.source, sr.id
      ORDER BY sr.source, s.id
      LIMIT 20
    `;

    const [rows] = await pool.execute(query, [date]);
    const results = rows as any[];

    console.log(`Sample of subscriptions with their sources:\n`);

    const sourceGroups = new Map<string, number>();

    results.forEach((row, index) => {
      if (index < 10) {
        console.log(`Subscription #${row.subscription_id}:`);
        console.log(`  Campaign ID: ${row.campaign_id}`);
        console.log(`  Source: ${row.source || '(NULL)'}`);
        console.log(`  Source ID: ${row.source_id || '(NULL)'}`);
        console.log('');
      }

      const sourceKey = row.source || '(NULL)';
      sourceGroups.set(sourceKey, (sourceGroups.get(sourceKey) || 0) + 1);
    });

    console.log('\n📊 Source distribution:\n');
    for (const [source, count] of Array.from(sourceGroups.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${source}: ${count} subscriptions`);
    }

    // Check all subscriptions regardless of source
    const allQuery = `
      SELECT
        COUNT(DISTINCT s.id) AS total_with_tracking,
        COUNT(DISTINCT CASE WHEN sr.source IS NOT NULL THEN s.id END) AS with_source,
        COUNT(DISTINCT CASE WHEN sr.source IS NULL THEN s.id END) AS without_source
      FROM subscription s
      LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      LEFT JOIN source sr ON sr.id = i.source_id
      WHERE DATE(s.date_create) = ?
        AND s.tracking_id_4 IS NOT NULL
        AND s.tracking_id_4 != ''
    `;

    const [allRows] = await pool.execute(allQuery, [date]);
    const allResult = (allRows as any[])[0];

    console.log('\n📊 Overall stats:');
    console.log(`  Subscriptions with tracking IDs: ${allResult.total_with_tracking}`);
    console.log(`  With source (from invoice): ${allResult.with_source}`);
    console.log(`  Without source (NULL): ${allResult.without_source}`);
    console.log('');

    if (allResult.without_source > 0) {
      console.log('⚠️  Some subscriptions have tracking IDs but NO source!');
      console.log('   This could explain missing CRM data if source matching is required.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkSources()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });
