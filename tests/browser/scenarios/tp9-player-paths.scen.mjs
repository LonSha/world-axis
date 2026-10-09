/* ============================================================
 * tests/browser/scenarios/tp9-player-paths.scen.mjs
 * TP9「玩家路径」栏 —— 真实宿主里的整条操作流 [L4]
 * ------------------------------------------------------------
 * 与 tp9-host-boot 的分工：
 *   · host-boot 判「扩展在真实宿主里起不起来」（装载链与真 DOM）；
 *   · 本场景判「起来之后，玩家的操作流在真宿主契约下走不走得通」。
 *   TP9 点名要在真实宿主验证的九条：导入 / 首次启用 / 旧局恢复 / 远方消息 /
 *   种子新局 / 切聊天 / 生成取消 / 存档重载 / 新增玩法。本场景覆盖其中**不需要
 *   AI 通道**的那几条（切聊天、楼层推进与重掷防双计、存档重载、输出净化、
 *   生成中断），这是「搭个桩就能真跑」的部分；需要真模型的（推演结果落地、
 *   远方消息生成）如实留给 TauriTavern 手动验收，**不在此假装通过**。
 *
 * 每条判据都读**真状态**（store 里的 worldFacts / evolution.round / localStorage
 * 的实际内容）或**真账本**（settleGuard 的判定理由、注入台账），不读「声明存在」。
 * ============================================================ */
import { installHostStub } from '/tests/browser/host-stub.mjs';

const EXT_MOUNT = '/scripts/extensions/third-party/WorldAxis';

function ok(name, cond, detail) {
  report({ name, ok: !!cond, detail: String(detail == null ? '' : detail) });
}

async function waitFor(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (_e) { /* 尚未就绪 */ }
    await window.__sleep(50);
  }
  return false;
}

/* ── 0. 宿主桩 + 装载（与真 ST 同序：先桩、再插 script、最后派发 APP_READY）── */
const host = installHostStub({ chatId: 'l4_tp9_player_001', userName: '玩家', charName: '测试角色' });
host.addUserFloor('我去镇上打听消息。');
host.addCharFloor('你走进酒馆，几个陌生人抬眼看了看你。');

const s = document.createElement('script');
s.src = EXT_MOUNT + '/index.js';
document.head.appendChild(s);

const booted = await waitFor(function () { return !!window.WorldAxis; }, 30000);
ok('P0 扩展已装载', booted, 'window.WorldAxis ' + (window.WorldAxis ? '在场' : '缺席'));
if (!booted) { ok('P0b 装载失败即止', false, '后续玩家路径判据不予执行（未执行不得计通过）'); done(); }

const WA = window.WorldAxis;
host.appReady();
const inited = await waitFor(function () { return WA.__loadFailed !== undefined; }, 120000);
ok('P1 init 完成（装载审计落位）', inited, 'loadFailed=' + JSON.stringify(WA.__loadFailed || 'n/a'));

/* 装好之后确认拦截器已挂上事件源（否则后面的事件驱动全是空转）── */
const interceptInstalled = await waitFor(function () {
  return host.ledger.listeners.app_ready >= 1
    && host.ledger.listeners.generation_ended >= 1
    && host.ledger.listeners.chat_id_changed >= 1;
}, 15000);
ok('P2 拦截器已按名订阅（app_ready / generation_ended / chat_id_changed）',
  interceptInstalled, JSON.stringify(host.ledger.listeners));

/* ══ 路径 1：首次启用 —— store 真初始化并落盘 ══ */
const st0 = WA.store.get();
const key0 = 'worldaxis_state_' + host.rawCtx.chatId;
let persisted0 = null;
try { persisted0 = window.localStorage.getItem(key0); } catch (_e) { persisted0 = null; }
ok('P3 首次启用：世界状态已建立且非空', !!st0 && typeof st0 === 'object' && Object.keys(st0).length > 0,
  'keys=' + (st0 ? Object.keys(st0).length : 'n/a'));
ok('P4 当前聊天键已可用', host.rawCtx.chatId === 'l4_tp9_player_001', String(host.rawCtx.chatId));

/* 写一条可辨识的世界事实（后面对「存档重载」与「切聊天隔离」用它做真值）── */
WA.store.transact(function (d) {
  d.worldFacts = d.worldFacts || [];
  d.worldFacts.push({ key: 'l4标记', value: '玩家路径场景' });
});
const marked = WA.store.get().worldFacts.some(function (f) { return f.key === 'l4标记'; });
ok('P5 世界事实真写入 store', marked,
  JSON.stringify((WA.store.get().worldFacts || []).slice(-2)));

/* ══ 路径 2：一次生成结束 —— after 链（世界推进）真跑一轮 ══ */
const roundBefore = (WA.store.get().evolution || {}).round || 0;
host.addCharFloor('酒馆里的人开始交头接耳。');
host.emit('generation_ended', { chatId: host.rawCtx.chatId });
const advanced = await waitFor(function () {
  const r = (WA.store.get().evolution || {}).round || 0;
  return r > roundBefore;
}, 20000);
const roundAfter = (WA.store.get().evolution || {}).round || 0;
ok('P6 生成结束驱动世界推进（round 真增长）', advanced,
  'round ' + roundBefore + ' → ' + roundAfter + ' / settleGuard=' + JSON.stringify(WA.settleGuard && WA.settleGuard.stat().lastReason));

/* ══ 路径 3：同一楼层重复通知 / 重掷 —— 不得双计（settleGuard 真拦） ══ */
const roundBeforeDup = (WA.store.get().evolution || {}).round || 0;
host.emit('generation_ended', { chatId: host.rawCtx.chatId });   // 同一楼层再派发一次
await window.__sleep(1200);
const roundAfterDup = (WA.store.get().evolution || {}).round || 0;
const sg = WA.settleGuard ? WA.settleGuard.stat() : {};
ok('P7 同楼层重复通知不双计（round 不变）', roundAfterDup === roundBeforeDup,
  'round ' + roundBeforeDup + ' → ' + roundAfterDup + ' / 判定=' + JSON.stringify(sg.lastReason)
  + ' / skips=' + JSON.stringify(sg.skips));

/* 手动旁路一次：确认 escape hatch 真的通（用户删改楼层后强制重结算）── */
WA.settleGuard.forceNext();
const roundBeforeForce = (WA.store.get().evolution || {}).round || 0;
host.emit('generation_ended', { chatId: host.rawCtx.chatId });
const forcedAdvanced = await waitFor(function () {
  return ((WA.store.get().evolution || {}).round || 0) > roundBeforeForce;
}, 20000);
ok('P8 forceNext 旁路生效（删改后可强制重结算）', forcedAdvanced,
  'round ' + roundBeforeForce + ' → ' + (((WA.store.get().evolution || {}).round) || 0)
  + ' / 判定=' + JSON.stringify(WA.settleGuard.stat().lastReason));

/* ══ 路径 4：输出净化 —— 只改用户所见，不改世界结算口径 ══ */
let purgeRan = null;
try {
  const before = '正文前段。<think>这是模型的思考块</think>正文后段。';
  const after = WA.purifier.applySafe(before);
  purgeRan = { before: before, after: String(after) };
  ok('P9 输出净化真生效（思考块被摘除、正文保留）',
    purgeRan.after.indexOf('思考块') < 0 && purgeRan.after.indexOf('正文前段') >= 0,
    JSON.stringify({ len: [before.length, purgeRan.after.length] }));
} catch (e) {
  ok('P9 输出净化真生效', false, '抛错：' + String(e && e.message));
}

/* ══ 路径 5：生成中断（用户点了停止）—— 不得把半份结果当已确认世界 ══ */
let stopErr = '';
try { host.emit('generation_stopped', { chatId: host.rawCtx.chatId }); }
catch (e) { stopErr = String(e && e.message); }
await window.__sleep(600);
ok('P10 生成中断不抛错、页面仍存活', stopErr === '' && !!window.WorldAxis,
  stopErr || 'WorldAxis 在场，after 链未因中断崩坏');

/* ══ 路径 6：存档重载 —— 真写 localStorage，重载后读回同一份 ══ */
let savedRaw = null;
let reloadOk = false;
let reloadDetail = '';
try {
  WA.store.save();
  savedRaw = window.localStorage.getItem(key0);
  const factInRaw = savedRaw ? savedRaw.indexOf('l4标记') >= 0 : false;
  /* 真重载：清掉内存态，再从 localStorage 读回（走 init，不是只看内存） */
  WA.store.init();
  const back = WA.store.get();
  reloadOk = !!(back && (back.worldFacts || []).some(function (f) { return f.key === 'l4标记'; }));
  reloadDetail = JSON.stringify({ key: key0, rawLen: savedRaw ? savedRaw.length : 0, factInRaw: factInRaw });
} catch (e) { reloadDetail = '抛错：' + String(e && e.message); }
ok('P11 存档落盘（本聊天键里含刚写的事实）',
  !!savedRaw && savedRaw.indexOf('l4标记') >= 0, reloadDetail);
ok('P12 存档重载后世界可读回（同一份事实仍在）', reloadOk, reloadDetail);

/* ══ 路径 7：切聊天 —— store 重载 + 旧异步失效 + 旧聊天不被污染 ══ */
const oldChatId = host.rawCtx.chatId;
const newChatId = host.switchChat();
const switched = await waitFor(function () {
  return WA.store.chatId && WA.store.chatId() === newChatId;
}, 15000);
ok('P13 切聊天后 store 归属切到新聊天', switched,
  'store.chatId()=' + (WA.store.chatId ? WA.store.chatId() : 'n/a') + ' / 期望 ' + newChatId);
const newState = WA.store.get();
ok('P14 新聊天是干净局（不继承上一聊天的标记事实）',
  !(newState.worldFacts || []).some(function (f) { return f.key === 'l4标记'; }),
  'facts=' + JSON.stringify((newState.worldFacts || []).slice(-2)));
/* 旧聊天的那份存档必须仍在（切走不删档）── */
let oldStillThere = null;
try { oldStillThere = window.localStorage.getItem('worldaxis_state_' + oldChatId); } catch (_e) {}
ok('P15 切走后旧聊天存档未被删除', !!oldStillThere && oldStillThere.indexOf('l4标记') >= 0,
  '旧键 ' + ('worldaxis_state_' + oldChatId) + ' 长度 ' + (oldStillThere ? oldStillThere.length : 0));

/* ══ 路径 8：切回旧聊天 —— 旧局恢复（TP3「旧局恢复」的桩面）══ */
host.switchChat(oldChatId);
const backToOld = await waitFor(function () {
  return (WA.store.get().worldFacts || []).some(function (f) { return f.key === 'l4标记'; });
}, 15000);
ok('P16 切回旧聊天后旧局面恢复（标记事实回来）', backToOld,
  'chatId=' + (WA.store.chatId ? WA.store.chatId() : 'n/a'));

/* ══ 路径 9：页面恢复入口在位（TP3 的 visibilitychange / pageshow）── */
ok('P17 页面恢复入口已挂（TP3 交付面在真实 DOM 上可见）',
  (typeof WA.offlineReturn === 'object' && WA.offlineReturn !== null) || !!WA.playtime,
  'offlineReturn=' + typeof WA.offlineReturn + ' / playtime=' + typeof WA.playtime);

/* ══ 10. 全程零越权宿主访问 —— 上面这些路径没读过宿主上不存在的键 ══ */
ok('P18 全路径无越权宿主访问', host.ledger.unknown.length === 0,
  host.ledger.unknown.length
    ? JSON.stringify(host.ledger.unknown.slice(0, 6).map(function (u) { return u.at; }))
    : '零命中（' + host.ledger.extensionPrompt.length + ' 次注入 / ' + host.ledger.saves.length + ' 次存档调用）');

done();
