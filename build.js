/**
 * build.js – Copies web assets to www/ directory for Capacitor
 * Run: node build.js
 */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const DEST = path.join(__dirname, 'www');

// Files to copy into www/
const FILES = [
  'index.html',
  'style.css',
  'app.js',
  'platform.js',
  'manifest.json',
];

// Ensure www/ exists
if (!fs.existsSync(DEST)) {
  fs.mkdirSync(DEST, { recursive: true });
  console.log('Created www/ directory');
}

// Copy each file
FILES.forEach(file => {
  const src = path.join(SRC, file);
  const dest = path.join(DEST, file);
  if (!fs.existsSync(src)) {
    console.warn(`  SKIP: ${file} (not found)`);
    return;
  }
  fs.copyFileSync(src, dest);
  console.log(`  OK: ${file}`);
});

console.log(`\nBuild complete. ${FILES.length} files copied to www/`);
