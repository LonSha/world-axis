/**
 * WorldAxis engines/slot-format.js (v2.529.0) — 存档位命名规则与解析（纯函数）
 *
 * 缝合来源：nekotools core/worldfmt.js（962 行纯函数里的命名与解析那一段）。
 *
 * 病（宿主侧的真实边界，两条）：
 *   ① 同一个角色所有档的「角色名部分」必须**完全一致**，否则按前缀找档会漏档；
 *   ② 酒馆后端按 **255 字节** 截世界书文件名，而 JS 的 length 是字符数：
 *      一个 30 字的中文角色名是 90 字节，长名会被磁盘截成**对不上的名字**，
 *      于是「档还在、但插件认不出它属于谁」。截断必须按 UTF-8 字节、按码点整字截。
 *      预算里还要先留出「后缀 + 最大四位数」的空间，这样第 1 档和第 99 档的角色名部分相同。
 *
 * 判据：
 *   - 名字形态：`【WA存档·<角色名>】`；第 N 档（N>=2）为 `【WA存档·<角色名>·N】`；
 *   - 解析只认**结尾**的 `·数字`：角色名中间带 `·` 不会误伤；
 *   - 非法字符（\ / : * ? " < > |）换成 `_`，连续空白归一，角色名本身限 120 字符；
 *   - 认不出（前缀/后缀不对、内层空）一律返回 null —— 不猜。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const SLOT_PREFIX = '【WA存档·';
  const SLOT_SUFFIX = '】';
  const SLOT_SEP = '·';
  const MAX_NAME_BYTES = 220; // 后端上限 255 字节，留余量
  const SLOT_ROOM = SLOT_SEP + '9999'; // 给档号预留的字节（四位数）
  const MAX_CHARS = 120;

  function byteLength(str) {
    let n = 0;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
      const code = s.codePointAt(i);
      if (code > 0xffff) i++; // 代理对算一个码点
      if (code <= 0x7f) n += 1;
      else if (code <= 0x7ff) n += 2;
      else if (code <= 0xffff) n += 3;
      else n += 4;
    }
    return n;
  }

  /** 按 UTF-8 字节截断，整字截（不切坏字符）。 */
  function truncateBytes(str, maxBytes) {
    const limit = isFinite(maxBytes) ? Math.floor(maxBytes) : MAX_NAME_BYTES;
    const s = String(str == null ? '' : str);
    let used = 0;
    let out = '';
    for (let i = 0; i < s.length; i++) {
      let ch = s[i];
      const code = s.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) { ch = s.substr(i, 2); i++; }
      const b = byteLength(ch);
      if (used + b > limit) break;
      used += b;
      out += ch;
    }
    return out;
  }

  function sanitizeName(name) {
    return String(name == null ? '' : name)
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_CHARS);
  }

  function compose(charName, suffix) {
    const safe = sanitizeName(charName);
    if (!safe) return '';
    const fixed = byteLength(SLOT_PREFIX) + byteLength(SLOT_ROOM + SLOT_SUFFIX);
    const room = MAX_NAME_BYTES - fixed;
    if (room <= 0) return '';
    const part = truncateBytes(safe, room); // 所有档共用同一预算 ⇒ 角色名部分一致
    if (!part) return '';
    return SLOT_PREFIX + part + (suffix || '') + SLOT_SUFFIX;
  }

  /** 第 1 档（基础名）。没有角色名 → ''。 */
  function slotBaseName(charName) {
    return compose(charName, '');
  }

  /** 第 n 档书名；n <= 1 就是基础名，不带后缀。 */
  function slotName(charName, n) {
    const base = slotBaseName(charName);
    if (!base) return '';
    const num = Math.floor(Number(n));
    if (!isFinite(num) || num <= 1) return base;
    return compose(charName, SLOT_SEP + num);
  }

  /** 书名 → {charName, slot}；不是我们的存档书 → null。 */
  function parseSlotName(name) {
    const s = String(name == null ? '' : name);
    if (s.indexOf(SLOT_PREFIX) !== 0) return null;
    if (s.slice(-SLOT_SUFFIX.length) !== SLOT_SUFFIX) return null;
    const inner = s.slice(SLOT_PREFIX.length, s.length - SLOT_SUFFIX.length);
    if (!inner) return null;
    let charName = inner;
    let slot = 1;
    const m = /^(.*)·(\d+)$/.exec(inner);
    if (m && m[1]) {
      const num = Number(m[2]);
      if (isFinite(num) && Math.floor(num) === num && num >= 1) {
        charName = m[1];
        slot = num;
      }
    }
    if (!charName) return null;
    return { charName: charName, slot: slot };
  }

  function slotNumber(name) {
    const p = parseSlotName(name);
    return p ? p.slot : 0;
  }

  /** 这本书是否属于某个角色：用基础名前缀比（长名被截断也能对上）。 */
  function isSlotOf(name, charName) {
    const base = slotBaseName(charName);
    if (!base || typeof name !== 'string') return false;
    const prefix = base.slice(0, base.length - SLOT_SUFFIX.length);
    return name === base || name.indexOf(prefix + SLOT_SEP) === 0;
  }

  /** 给界面看的档名（不含前缀，「第 N 档」）。 */
  function slotLabel(n) {
    const num = Math.floor(Number(n));
    if (!isFinite(num) || num < 1) return '存档';
    return '第 ' + num + ' 档';
  }

  /** 一组书名里属于这个角色的所有档号（升序）。 */
  function slotsOf(names, charName) {
    const out = [];
    const list = Array.isArray(names) ? names : [];
    for (let i = 0; i < list.length; i++) {
      if (!isSlotOf(list[i], charName)) continue;
      const n = slotNumber(list[i]);
      if (n > 0 && out.indexOf(n) < 0) out.push(n);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  WA.slotFormat = {
    SLOT_PREFIX: SLOT_PREFIX,
    SLOT_SUFFIX: SLOT_SUFFIX,
    SLOT_SEP: SLOT_SEP,
    MAX_NAME_BYTES: MAX_NAME_BYTES,
    byteLength: byteLength,
    truncateBytes: truncateBytes,
    sanitizeName: sanitizeName,
    slotBaseName: slotBaseName,
    slotName: slotName,
    parseSlotName: parseSlotName,
    slotNumber: slotNumber,
    isSlotOf: isSlotOf,
    slotLabel: slotLabel,
    slotsOf: slotsOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/slot-format.js', { kind: 'engine', ver: '2.529.0' });
})();