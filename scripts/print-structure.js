const fs = require('fs');
const path = require('path');

function walk(dir, prefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    console.log(prefix + (entry.isDirectory() ? '📁 ' : '📄 ') + entry.name);
    if (entry.isDirectory() && !['node_modules'].includes(entry.name)) {
      walk(full, prefix + '  ');
    }
  }
}
walk(process.cwd());
