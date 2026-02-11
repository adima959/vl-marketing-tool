/**
 * Fix multi-line imports that have unstable_rethrow inserted in the wrong place
 */

import fs from 'fs';
import path from 'path';

const brokenFiles = [
  'app/api/marketing-pipeline/campaigns/[campaignId]/route.ts',
  'app/api/marketing-pipeline/messages/[messageId]/route.ts',
  'app/api/marketing-tracker/angles/[angleId]/route.ts',
  'app/api/marketing-tracker/angles/route.ts',
  'app/api/marketing-tracker/assets/[assetId]/route.ts',
  'app/api/marketing-tracker/assets/route.ts',
  'app/api/marketing-tracker/creatives/[creativeId]/route.ts',
  'app/api/marketing-tracker/creatives/route.ts',
  'app/api/marketing-tracker/messages/[messageId]/route.ts',
  'app/api/marketing-tracker/messages/route.ts',
  'app/api/marketing-tracker/products/[productId]/route.ts',
];

function fixFile(filePath: string): void {
  const fullPath = path.join(process.cwd(), filePath);
  let content = fs.readFileSync(fullPath, 'utf-8');

  // Pattern: "import {\nimport { unstable_rethrow }" - need to move it before
  const pattern = /import\s*\{\s*import\s*\{\s*unstable_rethrow\s*\}\s*from\s*['"]next\/navigation['"];?\s*/g;

  if (content.match(pattern)) {
    // Remove the incorrectly placed import
    content = content.replace(pattern, 'import {\n');

    // Add it at the top (after first import line)
    const lines = content.split('\n');
    let firstImportIndex = lines.findIndex(line => line.trim().startsWith('import '));

    if (firstImportIndex >= 0) {
      // Insert after the first import
      lines.splice(firstImportIndex + 1, 0, "import { unstable_rethrow } from 'next/navigation';");
      content = lines.join('\n');
    }

    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
  } else {
    console.log(`⏭️  Skipped: ${filePath} (no pattern match)`);
  }
}

console.log('🔧 Fixing multi-line import issues...\n');

for (const file of brokenFiles) {
  try {
    fixFile(file);
  } catch (error) {
    console.error(`❌ Error fixing ${file}:`, error);
  }
}

console.log('\n✨ Done!');
