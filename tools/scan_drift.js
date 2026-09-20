// WorldAxis tools/scan_drift.js — 「引擎桶/枚举 ↔ UI 展示映射」漂移扫描（一次性取证脚本）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const rd = p => fs.readFileSync(path.join(BASE, p), 'utf8');

// 从映射内部某键值对向前找最近的 `{` 并配平（对象字面量提取）
function objAt(src, anchor) {
  const t0 = src.indexOf(anchor);
  if (t0 < 0) throw new Error('anchor not found: ' + anchor);
  const s = anchor.indexOf('{') >= 0 ? src.indexOf('{', t0) : src.lastIndexOf('{', t0);
  if (s < 0 || s < t0 - anchor.length) throw new Error('no brace for: ' + anchor);
  let d = 0;
  for (let i = s; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(s, i + 1); }
  }
  throw new Error('unbalanced: ' + anchor);
}
// 文本解析键集（避免 eval：值里可能有模板串/变量引用）
function keysOf(lit) {
  const body = lit.slice(1, -1);
  const keys = [];
  const RE = /(?:^|[,{])\s*(?:'([^']*)'|"([^"]*)"|([A-Za-z_$][\w$]*))\s*:/g;
  let m;
  while ((m = RE.exec(body))) keys.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  return keys;
}

const report = [];
function check(name, uiKeys, engineKeys) {
  const missing = engineKeys.filter(k => uiKeys.indexOf(k) < 0);
  const ghost = uiKeys.filter(k => engineKeys.indexOf(k) < 0);
  report.push({ name, missing, ghost, ui: uiKeys.length, eng: engineKeys.length });
}

const panel = rd('ui/panel.js');

const evoTxt = rd('engines/evolution.js');
const FACTION_STATUS = (new Function('return (' + evoTxt.match(/FACTION_STATUS = (\[[^\]]*\])/)[1] + ')'))();
const FACTION_RELATION = (new Function('return (' + evoTxt.match(/FACTION_RELATION = (\[[^\]]*\])/)[1] + ')'))();
const REPUTATION_LEVELS = (new Function('return (' + evoTxt.match(/REPUTATION_LEVELS = (\[[^\]]*\])/)[1] + ')'))();
const ECONOMY_CLIMATE = (new Function('return (' + evoTxt.match(/ECONOMY_CLIMATE = (\[[^\]]*\])/)[1] + ')'))();

check('panel:factionBadge', keysOf(objAt(panel, "'鼎盛':'")), FACTION_STATUS);
check('panel:relBadge', keysOf(objAt(panel, "'血盟':'")), FACTION_RELATION);
check('panel:repColor', keysOf(objAt(panel, "'万众敬仰':'")), REPUTATION_LEVELS);
check('panel:ecoColor', keysOf(objAt(panel, "'繁荣':'")), ECONOMY_CLIMATE);

const injTxt = rd('render/inject.js');
const SOURCES = (new Function('return (' + injTxt.match(/SOURCES = (\[[^\]]*\])/)[1] + ')'))();
check('panel:renderDirector(可见性标签)', keysOf(objAt(panel, "clock:'世界时间'")), SOURCES);

const sbTxt = rd('core/settings-bus.js');
// 真源口径：声明桶 ∪ 该记账函数调用点的字面量标签（noteFail/noteRemoveFail/noteReadFail 均动态建桶）
function declKeys(anchor) { return keysOf(objAt(sbTxt, anchor)); }
function callTags(fn) { const s = new Set(); const RX = new RegExp(fn + "\\(\\s*'([^']+)'", 'g'); let mm; while ((mm = RX.exec(sbTxt))) s.add(mm[1]); return Array.from(s); }
function union(a, b) { return Array.from(new Set(a.concat(b))).sort(); }
const WB = union(declKeys('missingKey: 0, stringify: 0'), callTags('noteFail'));
const RB = union(declKeys('guarded: 0, missing: 0'), callTags('noteRemoveFail'));
const sbTags = union(declKeys('read: 0, parse: 0, migrate: 0, copy: 0'), callTags('noteReadFail'));
check('panel:WS_LABEL(写入侧)', keysOf(objAt(panel, 'missingKey: ')), WB);
check('panel:rSrcTxt(删除侧)', keysOf(objAt(panel, "guarded: '删完仍在'")), RB);
// settings-bus 读标签为 noteReadFail 动态建桶 ⇒ 真源是声明 ∪ 全部调用点
check('panel:rdSrcTxt(settings读侧)', keysOf(objAt(panel, "read: '存储层读取'")), sbTags);

const stTxt = rd('core/store.js');
const stTags = new Set();
const RE = /noteStoreReadFail\(\s*'([^']+)'/g;
let m; while ((m = RE.exec(stTxt))) stTags.add(m[1]);
['index.js', 'core/workflow.js', 'engines/worldbook.js', 'engines/chatcache.js', 'engines/tool-diag.js', 'render/inject.js'].forEach(f => {
  const t = rd(f);
  const RE2 = /report(?:Host)?ReadFail\(\s*'([^']+)'/g;
  let m2; while ((m2 = RE2.exec(t))) stTags.add(m2[1]);
  const RE3 = /noteRead\(\s*'([^']+)'/g;
  let m3; while ((m3 = RE3.exec(t))) stTags.add(m3[1]);
});
check('panel:LAB_P(store读侧)', keysOf(objAt(panel, "bytes: '按字节'")), Array.from(stTags).sort());

// 引擎↔引擎重复真源：editor-faction 的 STATUSES/RELATIONS 必须等于 evolution 的 FACTION_STATUS/FACTION_RELATION
const efTxt = rd('engines/editor-faction.js');
const arrOf = (txt, name) => (new Function('return (' + txt.match(new RegExp(name + ' = (\\[[^\\]]*\\])'))[1] + ')'))();
check('editorFaction.STATUSES↔FACTION_STATUS', arrOf(efTxt, 'STATUSES'), FACTION_STATUS);
check('editorFaction.RELATIONS↔FACTION_RELATION', arrOf(efTxt, 'RELATIONS'), FACTION_RELATION);

console.log('\n== 漂移扫描 ==');
let bad = 0;
report.forEach(r => {
  const ok = r.missing.length === 0 && r.ghost.length === 0;
  if (!ok) bad++;
  console.log((ok ? '  OK   ' : '  DRIFT') + '  ' + r.name + '  (ui ' + r.ui + ' / eng ' + r.eng + ')');
  if (r.missing.length) console.log('         缺键: ' + r.missing.join('、'));
  if (r.ghost.length) console.log('         幽灵键: ' + r.ghost.join('、'));
});
console.log('\n漂移组数: ' + bad + ' / ' + report.length);