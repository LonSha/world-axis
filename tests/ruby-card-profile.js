'use strict';
/**
 * Ruby 宇宙专用卡画像器。只读外部卡，不修改卡、不把卡复制进仓库。
 * 用法：RUBY_CARD=/path/ruby_universe.json node tests/ruby-card-profile.js
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const cardPath = process.env.RUBY_CARD || process.argv[2];
if (!cardPath) { console.error('RUBY_CARD path is required'); process.exitCode = 2; return; }
const abs = path.resolve(cardPath);
const raw = fs.readFileSync(abs);
const card = JSON.parse(raw.toString('utf8'));
const data = card.data || card;
const book = data.character_book || {};
const entries = Array.isArray(book.entries) ? book.entries : [];
const extensions = data.extensions || card.extensions || {};
const tavern = extensions.tavern_helper || {};
const regex = Array.isArray(extensions.regex_scripts) ? extensions.regex_scripts : [];
const enabled = entries.filter(e => e && e.enabled === true).length;
const profile = {
  source: abs,
  sha256: crypto.createHash('sha256').update(raw).digest('hex'),
  bytes: raw.length,
  name: card.name || data.name || '',
  characterVersion: card.character_version || data.character_version || '',
  spec: card.spec || data.spec || '',
  entries: entries.length,
  enabledEntries: enabled,
  regexScripts: regex.length,
  tavernHelperScripts: Array.isArray(tavern.scripts) ? tavern.scripts.length : 0,
  hasMvuVariables: !!(tavern.variables && typeof tavern.variables === 'object'),
  extensions: Object.keys(extensions).sort(),
  generatedAt: new Date().toISOString()
};
process.stdout.write(JSON.stringify(profile, null, 2) + '\n');
