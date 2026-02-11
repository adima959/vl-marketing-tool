/**
 * Fix broken imports from add-unstable-rethrow script
 */

import fs from 'fs';
import path from 'path';

const APP_DIR = path.join(process.cwd(), 'app', 'api');

function findRouteFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath));
    } else if (entry.name === 'route.ts') {
      files.push(fullPath);
    }
  }

  return files;
}

function fixFile(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check if file has the broken pattern
  if (!content.includes("import { unstable_rethrow } from 'next/navigation'")) {
    return false;
  }

  // Remove all instances of the unstable_rethrow import (both correct and incorrect)
  let fixed = content.replace(/import\s+\{\s*unstable_rethrow\s*\}\s+from\s+['"]next\/navigation['"];?\s*/g, '');

  // Find where all the imports end
  const lines = fixed.split('\n');
  let lastImportIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('import ') && !line.includes('unstable_rethrow')) {
      lastImportIndex = i;
    } else if (lastImportIndex > -1 && line && !line.startsWith('import') && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
      // Found first non-import, non-comment line after imports
      break;
    }
  }

  if (lastImportIndex > -1) {
    // Insert the import after the last import
    lines.splice(lastImportIndex + 1, 0, "import { unstable_rethrow } from 'next/navigation';");
    fixed = lines.join('\n');

    fs.writeFileSync(filePath, fixed, 'utf-8');
    return true;
  }

  return false;
}

async function main() {
  console.log('🔧 Fixing broken imports...\n');

  const files = findRouteFiles(APP_DIR);
  let fixedCount = 0;

  for (const file of files) {
    const wasFixed = fixFile(file);
    if (wasFixed) {
      const relPath = path.relative(process.cwd(), file);
      console.log(`✅ ${relPath}`);
      fixedCount++;
    }
  }

  console.log(`\n📊 Fixed ${fixedCount} files`);
}

main().catch(console.error);
