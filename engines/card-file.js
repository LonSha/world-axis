/**
 * WorldAxis engines/card-file.js (v2.529.0) — 角色卡文件直读（PNG tEXt 块 / JSON 卡）
 *
 * 缝合来源：RedBird-Tools src/core/cardFile.ts（118 行，带 cardFile.test.ts）。
 *
 * 病：本仓要判断「这张卡里自带的世界书是不是就是这本」时，只能先让酒馆导入，
 *   再从上下文里反查 —— 导入本身就会写盘、改选中角色。而卡的数据**就在文件里**：
 *   PNG 卡把它 base64 编码在 tEXt 块里（v2 键名 `chara`，v3 键名 `ccv3`），JSON 卡是同一份数据。
 *   直接读字节就能在导入前认出来，且零副作用。
 *
 * 判据：
 *   ① 只认真 PNG 签名（8 字节）；不是 PNG 返回空表，**不抛错**（调用方按「读不出」处理）；
 *   ② 块长度必须落在文件内（end + 4 <= 长度），越界即停 —— 坏文件不许把循环拖成死循环；
 *   ③ v3(`ccv3`) 优先于 v2(`chara`)；解码失败试下一个，不认半个卡；
 *   ④ 世界书比对用「备注 + 关键词」指纹（卡里叫 keys，世界书文件里叫 key，两个字段都认），
 *      按**多重集**比 —— 顺序、缩进、设置项不同不算差异。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  const CARD_KEYS = ['ccv3', 'chara'];

  function isPng(bytes) {
    if (!bytes || bytes.length < 8) return false;
    for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIG[i]) return false;
    return true;
  }

  function readU32(bytes, p) {
    return ((bytes[p] << 24) >>> 0) + (bytes[p + 1] << 16) + (bytes[p + 2] << 8) + bytes[p + 3];
  }

  /** PNG 的 tEXt 块：keyword → text（Latin-1 直读，与卡文件一致）。 */
  function pngTextChunks(bytes) {
    const out = {};
    if (!isPng(bytes)) return out;
    let p = 8;
    while (p + 12 <= bytes.length) {
      const len = readU32(bytes, p);
      const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
      const start = p + 8;
      const end = start + len;
      if (end + 4 > bytes.length || len < 0) break; // 坏文件：停，不猜
      if (type === 'tEXt') {
        let z = start;
        while (z < end && bytes[z] !== 0) z++;
        let key = '';
        for (let i = start; i < z; i++) key += String.fromCharCode(bytes[i]);
        let text = '';
        for (let i = z + 1; i < end; i++) text += String.fromCharCode(bytes[i]);
        out[key] = text;
      }
      if (type === 'IEND') break;
      p = end + 4;
    }
    return out;
  }

  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  /** base64 → 字节。不用 atob：测试环境不一定有，且 atob 对空白/换行更挑。 */
  function base64Bytes(s) {
    const src = String(s == null ? '' : s).replace(/[^A-Za-z0-9+/=]/g, '');
    const out = [];
    let buf = 0;
    let bits = 0;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '=') break;
      const v = B64.indexOf(ch);
      if (v < 0) continue;
      buf = (buf << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((buf >> bits) & 255);
      }
    }
    return out;
  }

  /** UTF-8 解码（自己实现：不依赖 TextDecoder）。坏字节按 U+FFFD 记，不抛。 */
  function utf8Decode(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b < 0x80) { out += String.fromCharCode(b); continue; }
      let cp = -1;
      let need = 0;
      if ((b & 0xe0) === 0xc0) { cp = b & 0x1f; need = 1; }
      else if ((b & 0xf0) === 0xe0) { cp = b & 0x0f; need = 2; }
      else if ((b & 0xf8) === 0xf0) { cp = b & 0x07; need = 3; }
      if (cp < 0 || i + need >= bytes.length) { out += '\uFFFD'; continue; }
      let ok = true;
      for (let k = 1; k <= need; k++) {
        const nb = bytes[i + k];
        if ((nb & 0xc0) !== 0x80) { ok = false; break; }
        cp = (cp << 6) | (nb & 0x3f);
      }
      if (!ok) { out += '\uFFFD'; continue; }
      i += need;
      if (cp > 0xffff) {
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else out += String.fromCharCode(cp);
    }
    return out;
  }

  /** PNG 里的卡 JSON；读不出 / 不是 PNG → null。 */
  function cardFromPng(bytes) {
    const t = pngTextChunks(bytes);
    for (let i = 0; i < CARD_KEYS.length; i++) {
      const k = CARD_KEYS[i];
      if (!t[k]) continue;
      try {
        const bytes2 = base64Bytes(t[k]);
        const j = JSON.parse(utf8Decode(bytes2));
        if (j && typeof j === 'object') return j;
      } catch (e) { /* 试下一个键 */ }
    }
    return null;
  }

  function obj(v) {
    return v && typeof v === 'object' ? v : {};
  }
  function norm(s) {
    return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
  }

  /** 每条的指纹：备注（没有就用名字）+ 关键词。卡里和世界书文件字段名不同，两个都认。 */
  function entryPrints(entries) {
    const list = Array.isArray(entries) ? entries : (entries && typeof entries === 'object' ? Object.keys(entries).map(function (k) { return entries[k]; }) : []);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const e = obj(list[i]);
      const keys0 = e.keys !== undefined ? e.keys : e.key;
      const k = Array.isArray(keys0) ? keys0.map(String).join('|') : String(keys0 == null ? '' : keys0);
      const label = e.comment !== undefined && e.comment !== '' ? e.comment : (e.name !== undefined ? e.name : '');
      const f = norm(String(label) + '#' + k);
      if (f !== '#') out.push(f);
    }
    return out;
  }

  /** 卡的摘要；没有名字就不是卡 → null。 */
  function summarizeCard(j) {
    const o = obj(j);
    const d = obj(o.data);
    const name = String(d.name !== undefined ? d.name : (o.name !== undefined ? o.name : '')).trim();
    if (!name) return null;
    const book = obj(d.character_book !== undefined ? d.character_book : o.character_book);
    const entries = book.entries;
    let bookEntries = 0;
    if (Array.isArray(entries)) bookEntries = entries.length;
    else if (entries && typeof entries === 'object') bookEntries = Object.keys(entries).length;
    const rx = obj(d.extensions !== undefined ? d.extensions : o.extensions).regex_scripts;
    const prints = entryPrints(entries);
    return {
      name: name,
      bookName: String(book.name == null ? '' : book.name).trim(),
      bookEntries: bookEntries,
      bookPrints: prints,
      regexCount: Array.isArray(rx) ? rx.length : 0
    };
  }

  /** 从扩展字段反推卡的来源链接（与酒馆 getCharacterSource 同口径）。读不到返回 ''。 */
  function autoSourceUrl(ext) {
    const e = obj(ext);
    if (e.chub && e.chub.full_path) return 'https://chub.ai/characters/' + e.chub.full_path;
    if (e.pygmalion_id) return 'https://pygmalion.chat/' + e.pygmalion_id;
    if (e.github_repo) return 'https://github.com/' + e.github_repo;
    if (typeof e.source_url === 'string' && e.source_url) return e.source_url;
    const risu = e.risuai && e.risuai.source;
    if (Array.isArray(risu) && typeof risu[0] === 'string' && risu[0].indexOf('risurealm:') === 0) {
      return 'https://realm.risuai.net/character/' + risu[0].split(':')[1];
    }
    if (e.perchance_data && e.perchance_data.slug) return 'https://perchance.org/ai-character-chat?data=' + e.perchance_data.slug;
    return '';
  }

  /** 两组指纹按多重集比：返回 {same, onlyCard, onlyBook}（只报条数，不报内容 —— 内容可能是剧透）。 */
  function comparePrints(cardPrints, bookPrints) {
    const pool = {};
    const bp = Array.isArray(bookPrints) ? bookPrints : [];
    for (let i = 0; i < bp.length; i++) pool[bp[i]] = (pool[bp[i]] || 0) + 1;
    const cp = Array.isArray(cardPrints) ? cardPrints : [];
    let same = 0;
    let onlyCard = 0;
    for (let i = 0; i < cp.length; i++) {
      const n = pool[cp[i]] || 0;
      if (n > 0) { same++; pool[cp[i]] = n - 1; } else onlyCard++;
    }
    let onlyBook = 0;
    const keys = Object.keys(pool);
    for (let i = 0; i < keys.length; i++) onlyBook += pool[keys[i]];
    return { same: same, onlyCard: onlyCard, onlyBook: onlyBook, identical: onlyCard === 0 && onlyBook === 0 };
  }

  WA.cardFile = {
    PNG_SIG: PNG_SIG,
    CARD_KEYS: CARD_KEYS,
    isPng: isPng,
    pngTextChunks: pngTextChunks,
    base64Bytes: base64Bytes,
    utf8Decode: utf8Decode,
    cardFromPng: cardFromPng,
    entryPrints: entryPrints,
    summarizeCard: summarizeCard,
    autoSourceUrl: autoSourceUrl,
    comparePrints: comparePrints
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/card-file.js', { kind: 'engine', ver: '2.529.0' });
})();