/**
 * WorldAxis engines/green-keys.js (v2.529.0) — 世界书绿灯关键词（只生成短词）
 *
 * 缝合来源：nekotools core/worldkeys.js（137 行）。
 *
 * 病：本仓往世界书条目上写 key 的地方，都是把**标题整句**塞进去。
 *   酒馆是按 key 做子串命中扫描的：key 越长越具体，命中率越低，
 *   于是一条永远不被激活的条目看起来「写了但没生效」，而读数上完全看不出来
 *   （条目存在、内容正确、就是从不注入）。反过来，key 放太松（单个常用字）
 *   会让大量条目每轮都注入，把上下文预算吃光。
 *
 * 判据（刻意保守，宁可少一个 key，不许错一个）：
 *   ① 长度 2–6 字；分类名（主线/支线/地图/计划…）一律拒绝；
 *   ② 抽象名（疑云/暗流/序曲/真相…）拒绝 —— 这类词在任何一段正文里都可能出现；
 *   ③ 含两个及以上虚词/代词 ⇒ 判为句子碎片，拒绝（单个虚词可出现在「和平/要塞/议会」这类真专名里）；
 *   ④ 以虚词/介词/动词开头 ⇒ 拒绝；「被」出现在词中 ⇒ 拒绝（被动句碎片），开头放行（「被遗忘者」）；
 *   ⑤ 结尾是 家门/时候/之后 这类泛化后缀 ⇒ 拒绝；
 *   ⑥ 实体词按地名/机构后缀取（区城国山海盟会…），自由文本不做切词 —— 不切就不会切错。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const MIN_LEN = 2;
  const MAX_LEN = 6;

  const STOP_WORDS = [
    '国家', '势力', '新闻日报', '社会新闻', '新闻', '事件', '影响', '来源',
    '计划', '伏笔', '道具', '支线', '主线', '地图', '索引',
    '当前', '地点', '未知', '暂无', '以下', '内容', '描述',
    '进行中', '目标', '状态', '进度', '执行者', '持有者', '作用'
  ];
  const STOP_SET = {};
  for (let i = 0; i < STOP_WORDS.length; i++) STOP_SET[STOP_WORDS[i]] = 1;

  const ENTITY_SUFFIX = /([\u4e00-\u9fa5]{1,5}(?:区|城|镇|街|港|州|国|山|河|湖|海|盟|府|宫|门|塔|会|党|军|团|教|公司|商会|码头|监狱|车站|市场|广场|医院|学院|森林|荒原|冻土|王国|王都))/g;
  const BAD_PREFIX = /^(居民|市民|百姓|人们|众人|有人|洽谈|谈判|封锁|连夜|已经|正在|开始|继续|发生|出现|造成|导致|引发|抵达|抵京|使节|盟约|使团|商队)/;
  const ABSTRACT_NAME = /(疑云|寻踪|谜团|秘影|暗流|回响|序曲|终章|秘闻|传说|风云|往事|余波|征兆|真相|阴谋|计划|序章|终局)/;
  const KEY_STOP_RX = /(它们|什么|怎么|为什么|已经|正在|将要|可以|应该|可能|默认|觉得|认为|知道|看到|听到|因为|所以|如果|需要|开始|继续|然后|同时)/;
  const KEY_BAD_START_RX = /^(在|是|把|给|从|到|就|才|再|还|又|很|太|更|最|也|只|想|让|说|问|这|那|哪|谁|但|而|她|他|我|你|您|它|去|来|回|往|进|出)/;
  const KEY_STOP_CHARS_ALL = /[和与或能会要有了着过吗呢吧并及去来救谈说问想让被把给从到在是就才再还又很太更最也只这那哪谁]/g;
  const BAD_TAIL = /(家门|家人|时候|之后|之前|上面|下面|里面|外面|后面|前面)$/;

  function stopCharCount(key) {
    const m = String(key == null ? '' : key).match(KEY_STOP_CHARS_ALL);
    return m ? m.length : 0;
  }

  function isValidKey(value) {
    const key = String(value == null ? '' : value).trim();
    if (key.length < MIN_LEN || key.length > MAX_LEN) return false;
    if (STOP_SET[key]) return false;
    if (ABSTRACT_NAME.test(key)) return false;
    if (KEY_STOP_RX.test(key)) return false;
    if (KEY_BAD_START_RX.test(key)) return false;
    if (key.indexOf('被') > 0) return false;
    if (stopCharCount(key) >= 2) return false;
    if (BAD_TAIL.test(key)) return false;
    return true;
  }

  function isAbstractName(name) {
    return ABSTRACT_NAME.test(String(name == null ? '' : name));
  }

  function clean(text) {
    return String(text == null ? '' : text)
      .replace(/^[\s\-*•·]+/, '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/[「」『』【】\[\]《》<>]/g, '')
      .replace(/[\s"'“”‘’]+/g, '')
      .trim();
  }

  function addKey(out, value, max) {
    if (out.length >= max) return;
    const key = clean(value);
    if (!isValidKey(key)) return;
    if (out.indexOf(key) < 0) out.push(key);
  }

  function addEntities(out, text, max) {
    const s = String(text == null ? '' : text);
    const re = new RegExp(ENTITY_SUFFIX.source, 'g');
    let m;
    while ((m = re.exec(s)) !== null) {
      addKey(out, m[1], max);
      if (out.length >= max) return;
    }
  }

  /** 从结构化字段 `[执行者 | 目标]` 或引号里取关键词：不切自由文本，所以不会切错。 */
  function extractStructuredKeys(value, opts) {
    const max = opts && isFinite(opts.max) ? Math.floor(opts.max) : 10;
    const out = [];
    const text = String(value == null ? '' : value);
    const re = /\[([^\]]+)\]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const parts = m[1].split(/[｜|、,，/]/);
      for (let i = 0; i < parts.length; i++) {
        addKey(out, parts[i], max);
        if (out.length >= max) break;
      }
      if (out.length >= max) break;
    }
    const re2 = /[「“"]([^」”"]{2,12})[」”"]/g;
    while ((m = re2.exec(text)) !== null) {
      addKey(out, m[1], max);
      if (out.length >= max) break;
    }
    return out;
  }

  /** 条目里显式写的「关键词：A、B」。 */
  function parseKeywordSpec(value) {
    const m = /关键词[：:]\s*([^；;。\n]+)/.exec(String(value == null ? '' : value));
    if (!m) return [];
    const parts = m[1].split(/[、,，/]/);
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const k = clean(parts[i]);
      if (isValidKey(k) && k.length <= MAX_LEN && out.indexOf(k) < 0) out.push(k);
    }
    return out;
  }

  /** 通用绿灯：名字短就直接用；长名字取实体词、按分隔符拆段、首尾短词兜底。 */
  function deriveGreenKeys(names, opts) {
    const max = opts && isFinite(opts.max) ? Math.floor(opts.max) : 16;
    const maxLen = opts && isFinite(opts.maxLen) ? Math.floor(opts.maxLen) : MAX_LEN;
    const out = [];
    const list = Array.isArray(names) ? names : [];
    for (let i = 0; i < list.length; i++) {
      const name = clean(list[i]);
      if (!name) continue;
      if (isAbstractName(name)) continue;
      if (name.length <= maxLen) addKey(out, name, max);
      const parts = name.split(/[·｜|、，,。！？；;:：/\\\s]+/);
      for (let j = 0; j < parts.length; j++) addKey(out, parts[j], max);
      addEntities(out, name, max);
      if (name.length > maxLen) {
        addKey(out, name.slice(-2), max);
        addKey(out, name.slice(-3), max);
        if (name.indexOf('的') >= 0) addKey(out, name.split('的').pop(), max);
      }
      if (out.length >= max) break;
    }
    return out.slice(0, max);
  }

  /** 新闻标题：取地名/机构等实体词；没有实体词的短句取开头 3 字。 */
  function deriveNewsKeys(names, opts) {
    const max = opts && isFinite(opts.max) ? Math.floor(opts.max) : 12;
    const maxLen = opts && isFinite(opts.maxLen) ? Math.floor(opts.maxLen) : MAX_LEN;
    const out = [];
    const list = Array.isArray(names) ? names : [];
    for (let i = 0; i < list.length; i++) {
      const title = clean(list[i]);
      if (!title) continue;
      if (title.length <= maxLen) addKey(out, title, max);
      const clauses = title.split(/[，。！？；;、]/).map(clean).filter(Boolean);
      for (let j = 0; j < clauses.length; j++) {
        const before = out.length;
        addEntities(out, clauses[j], max);
        if (out.length === before && !BAD_PREFIX.test(clauses[j])) addKey(out, clauses[j].slice(0, 3), max);
        if (out.length >= max) break;
      }
      addKey(out, title.slice(-2), max);
      addKey(out, title.slice(-3), max);
      if (out.length >= max) break;
    }
    return out.slice(0, max);
  }

  WA.greenKeys = {
    MIN_LEN: MIN_LEN,
    MAX_LEN: MAX_LEN,
    STOP_WORDS: STOP_WORDS,
    isValidKey: isValidKey,
    isAbstractName: isAbstractName,
    clean: clean,
    extractStructuredKeys: extractStructuredKeys,
    parseKeywordSpec: parseKeywordSpec,
    deriveGreenKeys: deriveGreenKeys,
    deriveNewsKeys: deriveNewsKeys
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/green-keys.js', { kind: 'engine', ver: '2.529.0' });
})();