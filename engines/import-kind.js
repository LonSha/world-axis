/**
 * WorldAxis engines/import-kind.js (v2.529.0) — 从 JSON 形状认出它是哪种酒馆文件
 *
 * 缝合来源：RedBird-Tools src/core/importKind.ts（41 行，带 importKind.test.ts）。
 *
 * 病：本仓所有「导入」入口都靠**文件后缀**和**用户点哪个按钮**判断文件类型。
 *   酒馆的导出文件大量是 `.json`（预设、世界书、正则、角色卡、美化、酒馆助手脚本全是 json），
 *   后缀一点信息量都没有：把美化当预设导入不会报错，只会静默写进一个错的槽位。
 *
 * 判据（按「越不容易被别的类型冒充」的顺序判，顺序本身就是判据）：
 *   ① 正则：有 findRegex（数组或对象都算）；
 *   ② 脚本：酒馆助手脚本/脚本文件夹（新格式 type:script|folder，旧格式 name+content+buttons）；
 *   ③ 角色卡：spec 以 chara_card 开头，或顶层/ data 里有 first_mes；
 *   ④ 世界书：有 entries 对象；
 *   ⑤ 美化：有名字 **且** 有主题色或 custom_css —— 只有名字不够（预设也有名字）；
 *   ⑥ 预设：有 prompts / prompt_order / chat_completion_source / openai_max_tokens；
 *   ⑦ 都不是 → unknown（**不许猜**：unknown 必须一路传到界面，让用户自己选）。
 *   另：给「脚本一直开着、只在某个 CSS 变量存在时才生效」的配对识别（scriptWaitsForTheme），
 *   酒馆自己的 --SmartTheme* 变量所有美化都有，不算配对信号。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const KINDS = ['preset', 'world', 'regex', 'character', 'theme', 'script', 'unknown'];

  function isObj(x) {
    return !!x && typeof x === 'object';
  }

  /** 酒馆助手的一个脚本或一个脚本文件夹。 */
  function isThScript(x) {
    if (!isObj(x)) return false;
    if (x.type === 'script' && typeof x.content === 'string') return true;
    if (x.type === 'folder' && Array.isArray(x.scripts)) return true;
    return typeof x.name === 'string' && typeof x.content === 'string' && Array.isArray(x.buttons);
  }

  function detectJson(j) {
    if (!isObj(j)) return 'unknown';
    const first = Array.isArray(j) ? j[0] : undefined;
    if (isObj(first) && 'findRegex' in first) return 'regex';
    if ('findRegex' in j) return 'regex';
    if (isThScript(j) || (isObj(first) && isThScript(first))) return 'script';
    const data = j.data;
    if (String(j.spec == null ? '' : j.spec).indexOf('chara_card') === 0) return 'character';
    if ('first_mes' in j) return 'character';
    if (isObj(data) && 'first_mes' in data) return 'character';
    if ('entries' in j && isObj(j.entries)) return 'world';
    if (typeof j.name === 'string' && ('main_text_color' in j || 'blur_tint_color' in j || 'custom_css' in j)) return 'theme';
    if ('prompts' in j || 'prompt_order' in j || 'chat_completion_source' in j || 'openai_max_tokens' in j) return 'preset';
    return 'unknown';
  }

  /** 从一段文本里认（界面上贴进来的 json）。解析失败一律 unknown，不抛。 */
  function detectText(text) {
    const s = String(text == null ? '' : text).trim();
    if (!s) return 'unknown';
    try {
      return detectJson(JSON.parse(s));
    } catch (e) {
      return 'unknown';
    }
  }

  /** 脚本读的 CSS 变量里，有没有美化真的定义了的（--SmartTheme* 是酒馆自带，不算）。 */
  function scriptWaitsForTheme(scriptCode, themeCss) {
    const code = String(scriptCode == null ? '' : scriptCode);
    const css = String(themeCss == null ? '' : themeCss);
    const reads = {};
    const reRead = /getPropertyValue\(\s*['"`](--[\w-]+)['"`]\s*\)/g;
    let m;
    while ((m = reRead.exec(code)) !== null) {
      if (m[1].indexOf('--SmartTheme') !== 0) reads[m[1]] = 1;
    }
    const names = Object.keys(reads);
    if (!names.length) return false;
    const reDef = /(--[\w-]+)\s*:/g;
    while ((m = reDef.exec(css)) !== null) if (reads[m[1]]) return true;
    return false;
  }

  /** 给界面的一句话说明（unknown 也要说清楚，别让用户以为认出来了）。 */
  function describe(kind) {
    const table = {
      preset: '预设（提示词/生成参数）',
      world: '世界书（entries）',
      regex: '正则脚本（findRegex）',
      character: '角色卡（chara_card_v* / first_mes）',
      theme: '美化（主题色 / custom_css）',
      script: '酒馆助手脚本',
      unknown: '认不出（需要你手动选类型）'
    };
    return table[kind] || table.unknown;
  }

  WA.importKind = {
    KINDS: KINDS,
    isThScript: isThScript,
    detectJson: detectJson,
    detectText: detectText,
    scriptWaitsForTheme: scriptWaitsForTheme,
    describe: describe
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/import-kind.js', { kind: 'engine', ver: '2.529.0' });
})();