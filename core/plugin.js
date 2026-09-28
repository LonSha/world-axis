/**
 * WorldAxis core/plugin.js (v2.114.0) — 生命周期钩子（计划二 #56）
 *
 * ── 范围（明确不做）────────────────────────────────────────
 *   不做插件市场、不做远程安装、不做 REST。那些与「零依赖 / 砍公开 API」冲突。
 *   本模块只立**进程内**注册表：init / beforeSave / afterLoad / onRender。
 *
 * ── 病灶 ──────────────────────────────────────────────────
 *   store.save / store.init 是世界写/载的唯一入口，但外部脚本没有受控的挂钩点，
 *   只能直接改 WA.store —— 等于没有边界。
 *
 * ── 契约 ──────────────────────────────────────────────────
 *   register({name, version, hooks}) 同名覆盖并记 `replaced++`。
 *   beforeSave 钩子看到的是**冻结快照**，改它不影响即将落盘的对象。
 *   钩子返回 {ok:false, reason} ⇒ save 被拦（reason=plugin-blocked），世界写未发生。
 *   钩子抛错 ⇒ 记 faults.hookThrow，**不**拦保存（观测失败不得变成写失败）。
 *   钩子体默认走 sandbox.run，白名单只有 log / name / hook。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const HOOKS = ['init', 'beforeSave', 'afterLoad', 'onRender'];
  const NAME_CAP = 40;
  const plugins = Object.create(null);
  const _stat = {
    registers: 0, replaced: 0, unregisters: 0, fires: 0, blocked: 0,
    hookThrow: 0, lastReason: '', lastHook: '', lastPlugin: '', lastAt: 0
  };

  function cleanName(n) {
    if (typeof n !== 'string') return '';
    const s = n.replace(/[^\w.\-]/g, '').slice(0, NAME_CAP);
    return s;
  }

  function register(spec) {
    const name = cleanName(spec && spec.name);
    if (!name) {
      _stat.lastReason = 'bad-name';
      return { ok: false, reason: 'bad-name' };
    }
    if (plugins[name]) _stat.replaced++;
    const hooks = Object.create(null);
    const src = (spec && spec.hooks && typeof spec.hooks === 'object') ? spec.hooks : {};
    HOOKS.forEach(function (h) {
      if (typeof src[h] === 'function') hooks[h] = src[h];
    });
    plugins[name] = {
      name: name,
      version: (spec && typeof spec.version === 'string') ? spec.version.slice(0, 24) : '0',
      hooks: hooks,
      at: clockWall()
    };
    _stat.registers++;
    _stat.lastPlugin = name;
    _stat.lastReason = 'ok';
    // init 钩子在注册当下打一次（世界可能已经在跑）
    fireOne(name, 'init', { at: clockWall(), name: name });
    return { ok: true, name: name, hooks: Object.keys(hooks) };
  }

  // v2.114.0：`unregister(name)` **不是**零消费导出——tests/reject-v2780.js 的
  //   `plugin-blocked` 见证用它做收尾（注册一个拦写钩子 → 触发 → 卸掉），
  //   否则该钩子会留在注册表里影响后续用例。收口期我曾把它当「过度导出」删掉，
  //   现场立刻以「见证缺失：plugin-blocked」现形——**这就是见证面存在的意义**：
  //   「以为没人用」与「没人用」是两回事，删导出前必须核见证表。
  function unregister(name) {
    const n = cleanName(name);
    if (!n || !plugins[n]) return { ok: false, reason: 'not-found' };
    delete plugins[n];
    _stat.unregisters++;
    return { ok: true, name: n };
  }

  function fireOne(name, hook, ctx) {
    const p = plugins[name];
    if (!p || typeof p.hooks[hook] !== 'function') return { ok: true, skipped: true };
    _stat.fires++;
    _stat.lastHook = hook;
    _stat.lastPlugin = name;
    _stat.lastAt = clockWall();
    const api = {
      name: name,
      hook: hook,
      log: function (msg) {
        try { WA.log('info', 'Plugin ' + name + ': ' + String(msg).slice(0, 160)); } catch (e) {}
      }
    };
    const fn = p.hooks[hook];
    let ret;
    if (WA.sandbox && typeof WA.sandbox.run === 'function') {
      ret = WA.sandbox.run(fn, api, [ctx], { timeoutMs: 50 });
      if (!ret.ok) {
        if (ret.reason === 'Access denied') {
          _stat.hookThrow++;
          _stat.lastReason = 'Access denied';
          return { ok: true, denied: true };
        }
        _stat.hookThrow++;
        _stat.lastReason = ret.reason || 'hook-throw';
        return { ok: true, thrown: true, reason: ret.reason };
      }
      ret = ret.value;
    } else {
      try { ret = fn.call(api, ctx); }
      catch (e) {
        _stat.hookThrow++;
        _stat.lastReason = 'hook-throw';
        return { ok: true, thrown: true };
      }
    }
    if (ret && ret.ok === false) {
      _stat.blocked++;
      _stat.lastReason = 'plugin-blocked';
      return { ok: false, reason: 'plugin-blocked', plugin: name, hook: hook, detail: ret.reason || '' };
    }
    return { ok: true, value: ret };
  }

  function fire(hook, ctx) {
    if (HOOKS.indexOf(hook) < 0) return { ok: false, reason: 'unknown-hook' };
    const names = Object.keys(plugins);
    for (let i = 0; i < names.length; i++) {
      const r = fireOne(names[i], hook, ctx);
      if (r && r.ok === false) return r;
    }
    return { ok: true, n: names.length };
  }

  function list() {
    return Object.keys(plugins).sort().map(function (k) {
      const p = plugins[k];
      return { name: p.name, version: p.version, hooks: Object.keys(p.hooks) };
    });
  }

  WA.plugin = {
    HOOKS: HOOKS.slice(),
    register: register,
    unregister: unregister,
    fire: fire,
    list: list,
    stat: function () {
      return {
        plugins: Object.keys(plugins).length,
        registers: _stat.registers, replaced: _stat.replaced, unregisters: _stat.unregisters,
        fires: _stat.fires, blocked: _stat.blocked, hookThrow: _stat.hookThrow,
        lastReason: _stat.lastReason, lastHook: _stat.lastHook, lastPlugin: _stat.lastPlugin
      };
    }
  };
  // 注（v2.114.0 收口）：首版还有一个 reset() 出口（清注册表 + 归零计数）。它是**能力未接线**
  //   （产品与测试均零引用，测试夹具走的是每例重建 vm 宿主）——同上：能删的当场删。
  if (typeof WA.registerModule === 'function') WA.registerModule('core/plugin.js', { kind: 'core', ver: '2.114.0' });
})();
