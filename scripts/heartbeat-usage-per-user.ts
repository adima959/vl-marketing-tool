import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function main() {
  // 1. Per-user total usage (last 30 days)
  // Each heartbeat ≈ 30s of active time
  const perUser = (await pool.query(`
    SELECT
      u.name,
      u.email,
      u.role,
      COUNT(h.*)::int AS heartbeats,
      COUNT(DISTINCT h.heartbeat_at::date)::int AS active_days,
      ROUND(COUNT(h.*) * 30.0 / 60, 1) AS total_minutes,
      ROUND(COUNT(h.*) * 30.0 / 3600, 2) AS total_hours,
      MIN(h.heartbeat_at) AS first_heartbeat,
      MAX(h.heartbeat_at) AS last_heartbeat
    FROM app_users u
    LEFT JOIN app_usage_heartbeats h ON h.user_id = u.id
      AND h.heartbeat_at >= NOW() - INTERVAL '30 days'
    WHERE u.deleted_at IS NULL
    GROUP BY u.id, u.name, u.email, u.role
    ORDER BY heartbeats DESC
  `)).rows;

  console.log('\n=== Per-User Usage (Last 30 Days) ===');
  console.log('Each heartbeat = ~30s of active usage (sent only when user is active + tab visible)\n');
  console.log(
    'Name'.padEnd(25) + ' | ' +
    'Email'.padEnd(35) + ' | ' +
    'Role'.padEnd(6) + ' | ' +
    'Heartbeats'.padStart(10) + ' | ' +
    'Active Days'.padStart(11) + ' | ' +
    'Total Time'.padStart(10) + ' | ' +
    'Avg/Day'.padStart(10) + ' | ' +
    'Last Active'.padEnd(20)
  );
  console.log('-'.repeat(165));

  for (const r of perUser) {
    const totalSec = r.heartbeats * 30;
    const avgPerDay = r.active_days > 0 ? totalSec / r.active_days : 0;
    const lastActive = r.last_heartbeat
      ? new Date(r.last_heartbeat).toISOString().slice(0, 16).replace('T', ' ')
      : 'Never';

    console.log(
      (r.name || '(no name)').slice(0, 25).padEnd(25) + ' | ' +
      (r.email || '').slice(0, 35).padEnd(35) + ' | ' +
      (r.role || '').padEnd(6) + ' | ' +
      String(r.heartbeats).padStart(10) + ' | ' +
      String(r.active_days).padStart(11) + ' | ' +
      formatDuration(totalSec).padStart(10) + ' | ' +
      formatDuration(avgPerDay).padStart(10) + ' | ' +
      lastActive.padEnd(20)
    );
  }

  // 2. Per-user per-page breakdown (top users only)
  const topUserIds = perUser.filter((r) => r.heartbeats > 0).slice(0, 10);

  if (topUserIds.length > 0) {
    console.log('\n\n=== Page Breakdown (Top Users, Last 30 Days) ===\n');

    const perUserPage = (await pool.query(`
      SELECT
        u.name,
        h.page,
        COUNT(*)::int AS heartbeats,
        ROUND(COUNT(*) * 30.0 / 60, 1) AS minutes
      FROM app_usage_heartbeats h
      JOIN app_users u ON u.id = h.user_id
      WHERE h.heartbeat_at >= NOW() - INTERVAL '30 days'
      GROUP BY u.name, h.page
      ORDER BY u.name, heartbeats DESC
    `)).rows;

    let currentUser = '';
    for (const r of perUserPage) {
      if (r.name !== currentUser) {
        currentUser = r.name;
        console.log(`\n  ${currentUser}:`);
      }
      const totalSec = r.heartbeats * 30;
      console.log(`    ${r.page.padEnd(40)} ${formatDuration(totalSec).padStart(8)}  (${r.heartbeats} heartbeats)`);
    }
  }

  // 3. Daily usage trend (all users combined, last 30 days)
  const daily = (await pool.query(`
    SELECT
      h.heartbeat_at::date AS day,
      COUNT(DISTINCT h.user_id)::int AS unique_users,
      COUNT(*)::int AS heartbeats,
      ROUND(COUNT(*) * 30.0 / 3600, 2) AS total_hours
    FROM app_usage_heartbeats h
    WHERE h.heartbeat_at >= NOW() - INTERVAL '30 days'
    GROUP BY h.heartbeat_at::date
    ORDER BY day
  `)).rows;

  console.log('\n\n=== Daily Usage Trend (Last 30 Days) ===\n');
  console.log(
    'Date'.padEnd(12) + ' | ' +
    'Users'.padStart(5) + ' | ' +
    'Total Time'.padStart(10) + ' | ' +
    'Bar'
  );
  console.log('-'.repeat(70));

  const maxHb = Math.max(...daily.map((r) => r.heartbeats), 1);
  for (const r of daily) {
    const totalSec = r.heartbeats * 30;
    const barLen = Math.round((r.heartbeats / maxHb) * 30);
    const day = new Date(r.day).toISOString().slice(0, 10);
    console.log(
      day.padEnd(12) + ' | ' +
      String(r.unique_users).padStart(5) + ' | ' +
      formatDuration(totalSec).padStart(10) + ' | ' +
      '█'.repeat(barLen)
    );
  }

  // 4. Summary
  const totalHeartbeats = perUser.reduce((sum, r) => sum + r.heartbeats, 0);
  const activeUsers = perUser.filter((r) => r.heartbeats > 0).length;
  const totalUsers = perUser.length;

  console.log('\n\n=== Summary ===');
  console.log(`Total users: ${totalUsers} (${activeUsers} active in last 30 days)`);
  console.log(`Total heartbeats: ${totalHeartbeats}`);
  console.log(`Total active time: ${formatDuration(totalHeartbeats * 30)}`);
  console.log(`Avg per active user: ${formatDuration(Math.round((totalHeartbeats * 30) / (activeUsers || 1)))}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
