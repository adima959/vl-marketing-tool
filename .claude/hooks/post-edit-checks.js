#!/usr/bin/env node

// Combined PostToolUse hook: imports + SQL injection + secrets
// Runs as a single process instead of 3 separate ones

let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(data);
  const filePath = input.tool_input?.file_path || '';
  const content = input.tool_input?.new_string || input.tool_input?.content || '';

  if (!content) process.exit(0);

  const isTS = /\.(ts|tsx)$/.test(filePath);
  const isJS = /\.(ts|tsx|js|jsx)$/.test(filePath);

  if (!isJS) process.exit(0);

  const errors = [];

  // 1. Relative parent imports (TS/TSX only)
  if (isTS) {
    content.split('\n').forEach(line => {
      if (/from\s+['"]\.\.\//.test(line)) {
        errors.push('[Imports] Use @/ absolute imports: ' + line.trim());
      }
    });
  }

  // 2. SQL injection: template literals in query/execute (TS/TSX only)
  if (isTS && /(?:query|execute)\s*\(\s*`[^`]*\$\{/.test(content)) {
    errors.push('[SQL] Template literal ${} in query. Use parameterized: PostgreSQL=$1,$2 | MariaDB=?,?');
  }

  // 3. Hardcoded secrets
  const secretPatterns = [
    { pattern: /sk-[a-zA-Z0-9]{20,}/, msg: 'API key (sk-...)' },
    { pattern: /(?:api_key|apikey|api_secret)\s*[:=]\s*['"][^'"]+['"]/i, msg: 'API key assignment' },
    { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/i, msg: 'Hardcoded password' },
    { pattern: /(?:secret|token)\s*[:=]\s*['"][^'"]{8,}['"]/i, msg: 'Hardcoded secret/token' },
  ];
  for (const { pattern, msg } of secretPatterns) {
    if (pattern.test(content)) {
      errors.push('[Secrets] ' + msg + ' — use process.env.YOUR_SECRET');
      break;
    }
  }

  if (errors.length) {
    errors.forEach(e => console.error('[Hook] ' + e));
    process.exit(2);
  }
});
