#!/usr/bin/env node

// PostToolUse hook: Blocks relative parent imports (../) in TypeScript files
// Same-directory imports (./) are allowed per project rules

let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(data);
  const filePath = input.tool_input?.file_path || '';

  if (!/\.(ts|tsx)$/.test(filePath)) process.exit(0);

  // Check new content (Edit = new_string, Write = content)
  const content = input.tool_input?.new_string || input.tool_input?.content || '';
  if (!content) process.exit(0);

  const violations = [];
  content.split('\n').forEach(line => {
    if (/from\s+['"]\.\.\//.test(line)) {
      violations.push(line.trim());
    }
  });

  if (violations.length) {
    console.error('[Hook] Relative parent imports detected. Use @/ absolute imports:');
    violations.slice(0, 5).forEach(v => console.error('  ' + v));
    process.exit(2);
  }
});
