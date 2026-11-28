/**
  * tests/persona-anchor-v2249.js — v2.249.0 人物性格绝对锚定与防漂移引擎专锁
  */
(function () {
  'use strict';
  const a = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); };
  let passed = 0;
  const ok = (msg) => { passed++; };

  // 模拟运行环境
  const window = global;
  window.window = window;
  const WA = window.WorldAxis = window.WorldAxis || {};

  // 基础依赖打桩
  WA.log = WA.log || function () {};
  WA.clock = WA.clock || { now: () => 1700000000000, wallNow: () => 1700000000000 };
  let _store = { personaAnchor: { anchors: {} } };
  WA.store = WA.store || {
    get: () => _store,
    transact: (fn) => { fn(_store); }
  };
  WA.settingsBus = WA.settingsBus || {
    read: (reg) => reg.def,
    normalize: (reg, val) => val,
    saveOrThrow: (reg, val) => val
  };
  WA.inputGuard = WA.inputGuard || {
    text: (v, max) => String(v || '').trim().slice(0, max)
  };

  // 加载模块
  require('../engines/persona-anchor.js');
  const PA = WA.personaAnchor;
  a(PA, 'personaAnchor must be exported');
  ok('personaAnchor engine loaded');

  function runPositive() {
    // 1. 注册核心性格锚点
    const regRes = PA.registerAnchor('冷面刺客', {
      coreTraits: ['寡言', '警惕', '利己理性'],
      toneStyle: '极简短句，不带感叹号，零语气词',
      forbiddenBehaviors: ['撒娇', '无脑倒贴', '长篇大论倾诉心声'],
      resistance: 0.95
    });
    a(regRes.ok === true, 'registerAnchor should succeed');
    const anchor = PA.getAnchor('冷面刺客');
    a(anchor && anchor.coreTraits.includes('寡言'), 'anchor should store core traits');
    ok('registerAnchor & getAnchor pass');

    // 2. 正常符合锚定特质的行为评估应通过
    const ev1 = PA.evaluateDrift('冷面刺客', {
      action: '冷淡地擦拭匕首，未发一言'
    }, {});
    a(ev1.ok && ev1.allowed === true, 'consistent behavior should be allowed');
    ok('evaluateDrift consistent behavior pass');

    // 3. 无重大事件驱动的禁忌行为应被坚决拦截（拦截弱模型OOC）
    const ev2 = PA.evaluateDrift('冷面刺客', {
      deltaTrait: '突然撒娇并向玩家长篇大论倾诉心声',
      action: '撒娇'
    }, {});
    a(ev2.ok && ev2.allowed === false, 'forbidden behavior without major event must be blocked');
    a(ev2.reason === 'forbidden-behavior-without-major-event', 'reason must match');
    ok('evaluateDrift forbidden behavior blocked pass');

    // 4. 无深层羁绊驱动的突变式谄媚讨好应被坚决拦截
    const ev3 = PA.evaluateDrift('冷面刺客', {
      isFlattery: true
    }, { sharedBonds: 10 });
    a(ev3.ok && ev3.allowed === false, 'unjustified flattery must be blocked');
    a(ev3.reason === 'unjustified-flattery-blocked', 'reason must match flattery block');
    ok('evaluateDrift flattery blocked pass');

    // 5. 在重大事件（生死转折、重大救赎等）驱动下，行为转变合法
    const ev4 = PA.evaluateDrift('冷面刺客', {
      deltaTrait: '长篇大论倾诉心声'
    }, {
      majorEvent: {
        title: '生死同盟血战',
        intensity: 95,
        evidence: '玩家为其挡下致命毒箭濒死'
      }
    });
    a(ev4.ok && ev4.allowed === true, 'major event should justify behavioral shift');
    a(ev4.reason === 'major-event-justified', 'reason must be major-event-justified');
    ok('evaluateDrift major event justified pass');

    // 6. 下游生成正文审查：抓取无重大事件驱动的禁忌行为
    const audit1 = PA.auditGeneratedContent('冷面刺客', '只见他突然撒娇道：求求你带我走吧！', {});
    a(audit1.ok && audit1.compliant === false, 'audit should detect forbidden behavior');
    a(audit1.flagged.includes('撒娇'), 'audit should flag specific forbidden behavior');
    ok('auditGeneratedContent violation detected pass');

    // 7. 下游生成正文审查：符合性格正文合规通过
    const audit2 = PA.auditGeneratedContent('冷面刺客', '他只是站在阴影里，微微点头。', {});
    a(audit2.ok && audit2.compliant === true, 'compliant text should pass audit');
    ok('auditGeneratedContent compliant pass');

    // 8. 构造注入提示词块
    const block = PA.buildBlock();
    a(typeof block === 'string' && block.includes('[人物性格绝对锚定律 (Anti-Persona-Drift)]'), 'buildBlock should produce prompt block');
    a(block.includes('核心特质=[寡言、警惕、利己理性]'), 'buildBlock should include registered traits');
    a(block.includes('绝对禁忌=[撒娇、无脑倒贴、长篇大论倾诉心声]'), 'buildBlock should include forbidden behaviors');
    ok('buildBlock pass');
  }

  function runNegative() {
    // N1: 空姓名或无核心特质应拒收
    const r1 = PA.registerAnchor('', { coreTraits: ['冷酷'] });
    a(r1.ok === false && r1.reason === 'missing-person', 'N1 missing person');

    const r2 = PA.registerAnchor('某角色', { coreTraits: [] });
    a(r2.ok === false && r2.reason === 'missing-core-traits', 'N1 missing traits');
    ok('N1 negative input validation pass');

    // N2: 未注册角色评估默认通过（不阻断普通NPC流程）
    const r3 = PA.evaluateDrift('未注册路人', { deltaTrait: '热情招待' }, {});
    a(r3.ok === true && r3.allowed === true && r3.reason === 'no-anchor-registered', 'N2 unanchored person fallback');
    ok('N2 unanchored fallback pass');
  }

  function runLayeredPrismV2616() {
    // v2.616.0：只经公开 API 验分层棱镜缝合（不新增导出面）。
    // 同人同种子重复建档 => 三层逐字同签（Skill 的主/副模型同签口径）。
    PA.registerAnchor('棱镜甲', { coreTraits: ['克制'], autoPrism: true, prismSeed: 'seed-42' });
    const a1 = PA.getAnchor('棱镜甲');
    a(a1.surface && a1.deep && a1.deep.coreConflict && a1.private && a1.private.history, 'three stages filled');
    PA.registerAnchor('棱镜甲', { coreTraits: ['克制'], autoPrism: true, prismSeed: 'seed-42' });
    const a2 = PA.getAnchor('棱镜甲');
    a(a1.surface === a2.surface && a1.deep.coreConflict === a2.deep.coreConflict && a1.private.history === a2.private.history, 'same person + same seed => identical prism');
    ok('v2.616.0 deterministic prism via public API pass');

    // 多种子必须出现差异（证明确定性随机真在抽，而非恒定值）。
    const surfaces = {};
    for (let i = 0; i < 12; i++) {
      const who = '棱镜种子' + i;
      PA.registerAnchor(who, { coreTraits: ['克制'], autoPrism: true, prismSeed: 'seed-' + i });
      surfaces[PA.getAnchor(who).surface] = 1;
    }
    a(Object.keys(surfaces).length >= 2, 'different seeds => prism variety');
    ok('v2.616.0 seeded variety pass');

    // 双轨归一化 + 开放 Schema（未知字段原样进 ext）。
    const regC = PA.registerAnchor('棱镜丙', { coreTraits: ['克制'], autoPrism: true, prismSeed: 'seed-43', bondTier: '过命交情', romanceTier: '暗恋', intimateMode: '冻结', customFutureField: { keep: '开放 Schema 原样保留' } });
    a(regC.ok, 'normalized-tier anchor registered');
    const c = PA.getAnchor('棱镜丙');
    a(c.bondTier === '生死莫逆' && c.romanceTier === '暗生情愫' && c.intimateMode === '普通', 'tiers normalized & stored');
    a(c.ext && c.ext.customFutureField && c.ext.customFutureField.keep === '开放 Schema 原样保留', 'open schema preserved in ext');
    ok('v2.616.0 tiers normalization + open schema pass');

    const block = PA.buildBlock();
    a(block.indexOf('表层身份（Stage 0）') >= 0, 'buildBlock exposes stage0');
    a(block.indexOf('深层人设（Stage 1）：内核矛盾=') >= 0, 'buildBlock exposes stage1');
    a(block.indexOf('关系双轨：情分=生死莫逆 × 情愫=暗生情愫') >= 0, 'buildBlock exposes dual-tier readpoint');
    ok('v2.616.0 injection readpoints pass');
  }

  runPositive();
  runNegative();
  runLayeredPrismV2616();
  console.log(`Summary: ${passed} passed, 0 failed`);
})();