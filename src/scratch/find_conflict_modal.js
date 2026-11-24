const fs = require('fs');
const content = fs.readFileSync('src/components/SettingsModal.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('importConflictData') || l.includes('Project Already Exists') || l.includes('Merge Data')) {
    console.log((i + 1) + ': ' + l.trim());
  }
});
