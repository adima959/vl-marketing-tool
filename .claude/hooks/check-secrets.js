#!/usr/bin/env node

// PostToolUse hook: Blocks hardcoded secrets in code files
// Detects API keys, passwords, tokens written directly in source

let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(data);
  const filePath = input.tool_input?.file_path || '';

  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) process.exit(0);

  const content = input.tool_input?.new_string || input.tool_input?.content || '';
  if (!content) process.exit(0);

  const patterns = [
    { pattern: /sk-[a-zA-Z0-9]{20,}/, msg: 'API key (sk-...)' },
    { pattern: /(?:api_key|apikey|api_secret)\s*[:=]\s*['"][^'"]+['"]/i, msg: 'API key assignment' },
    { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/i, msg: 'Hardcoded password' },
    { pattern: /(?:secret|token)\s*[:=]\s*['"][^'"]{8,}['"]/i, msg: 'Hardcoded secret/token' },
  ];

  for (const { pattern, msg } of patterns) {
    if (pattern.test(content)) {
      console.error(`[Hook] Potential hardcoded secret: ${msg}`);
      console.error('[Hook] Use environment variables: process.env.YOUR_SECRET');
      process.exit(2);
    }
  }
});
