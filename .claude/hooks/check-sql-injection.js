#!/usr/bin/env node

// PostToolUse hook: Detects template literal interpolation in SQL queries
// Catches: query(`SELECT ... ${var} ...`) — use $1/? placeholders instead

let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(data);
  const filePath = input.tool_input?.file_path || '';

  if (!/\.(ts|tsx)$/.test(filePath)) process.exit(0);

  const content = input.tool_input?.new_string || input.tool_input?.content || '';
  if (!content) process.exit(0);

  // Detect ${} inside template literals near query/execute calls
  const sqlPattern = /(?:query|execute)\s*\(\s*`[^`]*\$\{/;

  if (sqlPattern.test(content)) {
    console.error('[Hook] Potential SQL injection: template literal with ${} in query.');
    console.error('[Hook] Use parameterized queries: PostgreSQL=$1,$2 | MariaDB=?,?');
    process.exit(2);
  }
});
