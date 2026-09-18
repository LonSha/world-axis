/** WorldAxis ui/settings.js (v0.2) — 推演设置页（尺度/时间/脉搏/预算/舆情） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '"' }[c])); }

  WA.uiSettings = {
    render() {
      const bs = WA.backstage.getSettings();
      const op = WA.opinion.getSettings();
      const modes = [['light', '轻量'], ['balanced', '均衡'], ['deep', '深度'], ['manual', '手动']];
      const times = [['explicit', '严格'], ['cautious', '谨慎'], ['open', '开放'], ['world', '世界钟']];
      const pulses = [['quiet', '安静'], ['normal', '正常'], ['turbulent', '激荡']];
      // v2.7.0（收口）: 控件区间一律取自登记表声明（`boundsOf`）——此前每个 `<input min max>`
      //   都是一份**独立**的字面量：它既是「界面能拖到的范围」，又事实上是「引擎接受的契约」，
      //   而引擎自己的夹取常量住在别处（memory-sampler.js 跨文件、evolution._num 干脆不夹）。
      //   三处只要有一处改动不一致，就会出现「滑块能拖到的值被引擎夹掉」或「引擎接受但界面拖不到」
      //   的静默不一致。现在声明只有一份，界面与写路径读取同一份。
      const bd = k => (WA.settingsBus && WA.settingsBus.boundsOf) ? WA.settingsBus.boundsOf(k) : {};
      const bB = bd('worldaxis_backstage_settings_v1');
      const bO = bd('worldaxis_opinion_settings_v1');
      const bE = bd('worldaxis_evolution_settings_v1');
      const rng = (arr, fb) => Array.isArray(arr) ? arr : fb;
      return `
        <div class="wa-sec">世界推演设置</div>
        <div class="wa-set-row"><span>推演尺度</span><select id="wa-set-mode" class="wa-input">${modes.map(m => `<option value="${m[0]}" ${bs.simulationMode === m[0] ? 'selected' : ''}>${m[1]}</option>`).join('')}</select></div>
        <div class="wa-set-row"><span>时间策略</span><select id="wa-set-time" class="wa-input">${times.map(t => `<option value="${t[0]}" ${bs.timePolicy === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select></div>
        <div class="wa-set-row"><span>世界脉搏活跃度</span><select id="wa-set-pulse" class="wa-input">${pulses.map(p => `<option value="${p[0]}" ${bs.pulseActivity === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></div>
        <div class="wa-set-row"><span>NPC预算 <b id="wa-set-npcv">${bs.npcBudget}</b></span><input type="range" min="${rng(bB.npcBudget, [1, 16])[0]}" max="${rng(bB.npcBudget, [1, 16])[1]}" value="${bs.npcBudget}" id="wa-set-npc" class="wa-range"/></div>
        <label class="wa-node"><input type="checkbox" id="wa-set-auto" ${bs.autoSimulate ? 'checked' : ''}/><span class="wa-node-label">每轮自动推演（关闭则仅手动）</span></label>
        <label class="wa-node"><input type="checkbox" id="wa-set-fullrules" ${bs.fullRules ? 'checked' : ''}/><span class="wa-node-label">注入世界规则全文（12模块铁律；关闭则仅精简守则，省token）</span></label>
        <div class="wa-set-row"><span>注入预算</span><select id="wa-set-budget-mode" class="wa-input">
          <option value="auto" ${bs.injectBudget == null || bs.injectBudget < 0 ? 'selected' : ''}>自动（按上下文窗口 6%）</option>
          <option value="unlimited" ${bs.injectBudget === 0 ? 'selected' : ''}>不限（全量注入）</option>
          <option value="manual" ${bs.injectBudget > 0 ? 'selected' : ''}>手动上限</option>
        </select></div>
        <div class="wa-set-row"><span>手动上限 <b id="wa-set-budgetv">${bs.injectBudget > 0 ? bs.injectBudget + 't' : '—'}</b></span><input type="range" min="200" max="6000" step="200" value="${bs.injectBudget > 0 ? bs.injectBudget : 2400}" id="wa-set-budget" class="wa-range"/></div>
        <div class="wa-dim">预算裁决：核心块（世界状态/近端事件）优先保底；记忆/摘要/账本/舆情超预算时先折叠后丢弃。自动档从宿主上下文窗口推导，夹在 800–4000t。</div>
        <div class="wa-sec">主观记忆采样（v0.9.9）</div>
        <div class="wa-set-row"><span>采样上限 <b id="wa-set-mslimitv">${bs.memSamplerLimit || 8}</b></span><input type="range" min="${rng(bB.memSamplerLimit, [1, 30])[0]}" max="${rng(bB.memSamplerLimit, [1, 30])[1]}" value="${bs.memSamplerLimit || 8}" id="wa-set-mslimit" class="wa-range"/></div>
        <div class="wa-set-row"><span>骰子面数 <b id="wa-set-msdicev">${bs.memSamplerDice || 10000}</b></span><input type="range" min="${rng(bB.memSamplerDice, [1000, 10000])[0]}" max="${rng(bB.memSamplerDice, [1000, 10000])[1]}" step="500" value="${bs.memSamplerDice || 10000}" id="wa-set-msdice" class="wa-range"/></div>
        <label class="wa-node"><input type="checkbox" id="wa-set-msrel" ${bs.memSamplerRelevance !== 'off' ? 'checked' : ''}/><span class="wa-node-label">上下文相关召回（只注入当前剧情相关的人物记忆，关闭则全量采样）</span></label>
        <div class="wa-sec">自定义推演指令（追加到系统提示）</div>
        <textarea id="wa-set-custom" class="wa-ta" placeholder="例如：本世界魔法衰退，推演时注意时代背景…">${esc(bs.customInstruction)}</textarea>
        <button class="wa-btn" id="wa-set-save">保存推演设置</button>
        <div class="wa-sec">输出净化规则（缝合 Veridis 规则引擎）</div>
        ${(() => {
          // v2.2.0: 规则治理口（此前 addRule/removeRule/setEnabled/loadPreset 全零调用，
          //   用户只能去 localStorage 手改 JSON —— 规则引擎有治理能力却无治理入口）
          if (!WA.purifier || typeof WA.purifier.stat !== 'function') return '<div class="wa-empty">净化模块未加载</div>';
          const ps = WA.purifier.stat();
          const rules = (WA.purifier.rules || []);
          const rows = rules.length ? rules.map((r, i) => `<div class="wa-item">
              <label class="wa-node"><input type="checkbox" data-prm-on="${esc(r.id)}" ${r.enabled !== false ? 'checked' : ''}/><span class="wa-node-label">${esc(r.name || r.id)}</span></label>
              <div class="wa-dim">find: ${esc(String(r.find || '').slice(0, 60))} → ${esc(String(r.replace || '（删）').slice(0, 24))}</div>
              <button class="wa-btn wa-mini" data-prm-del="${esc(r.id)}">删除</button></div>`).join('')
            : '<div class="wa-empty">无规则（净化不会做任何事）</div>';
          return rows + `<div class="wa-dim">共 ${rules.length} 条 · 已净化 ${ps.runs} 次（命中 ${ps.changed} · 省 ${ps.charsSaved} 字符 · 拦空 ${ps.blocked} · 规则错 ${ps.ruleErrors}）${ps.imported ? ' · 已导入 ' + ps.imported + ' 条' : ''}${ps.lastImport ? ' · 最近导入：' + esc(ps.lastImport) : ''}</div>`;
        })()}
        <div class="wa-row"><input id="wa-prm-find" class="wa-input" placeholder="正则 find（如 &lt;think&gt;[\\s\\S]*?&lt;/think&gt;）"/><input id="wa-prm-repl" class="wa-input wa-w60" placeholder="替换为（留空=删除）"/></div>
        <div class="wa-row"><button class="wa-btn wa-mini" id="wa-prm-add">新增规则</button><button class="wa-btn wa-mini" id="wa-prm-reset">恢复内置</button></div>
        <div class="wa-row"><button class="wa-btn wa-mini" id="wa-prm-import">导入预设 JSON</button></div>
        <textarea id="wa-prm-json" class="wa-ta" placeholder='粘贴 Veridis 预设或规则数组，如 [{"find":"…","replace":""}]'></textarea>
        <div id="wa-prm-out" class="wa-out"></div>
        <div class="wa-sec">区域突发事件</div>
        ${(() => {
          // v2.7.0: 生效视图接入界面——`WA.regional.effectiveSettings` 自 v2.3.0 起存在，
          //   实现注释写的是「面板/诊断据此显示真实生效值」，但**全库产品代码零消费**
          //   （只有测试调用）：区域配置此前没有界面入口，只能靠 localStorage 手改，
          //   而手改出的越界值又被引擎夹取——界面上没有任何地方能看到「真正生效的数」。
          if (!WA.regional || typeof WA.regional.effectiveSettings !== 'function') return '<div class="wa-dim">区域引擎未加载</div>';
          const rg = WA.regional.effectiveSettings();
          const bd = (typeof WA.regional.bounds === 'function') ? WA.regional.bounds() : { chancePercent: [1, 100], durationRounds: [1, 20] };
          return `<label class="wa-node"><input type="checkbox" id="wa-rg-enable" ${rg.enabled ? 'checked' : ''}/><span class="wa-node-label">启用区域突发事件（按轮掷骰）</span></label>
            <div class="wa-set-row"><span>触发概率 <b id="wa-rg-chancev">${rg.chancePercent}%</b></span><input type="range" min="${bd.chancePercent[0]}" max="${bd.chancePercent[1]}" value="${rg.chancePercent}" id="wa-rg-chance" class="wa-range"/></div>
            <div class="wa-set-row"><span>持续轮次 <b id="wa-rg-durv">${rg.durationRounds}</b></span><input type="range" min="${bd.durationRounds[0]}" max="${bd.durationRounds[1]}" value="${rg.durationRounds}" id="wa-rg-dur" class="wa-range"/></div>
            <button class="wa-btn" id="wa-rg-save">保存区域设置</button>
            <div id="wa-rg-out" class="wa-out"></div>
            <div class="wa-dim">此处显示的是<b>生效值</b>（越界存档已在保存时归一，落盘即引擎掷骰用的数）。</div>`;
        })()}
        <div class="wa-sec">舆情引擎</div>
        <label class="wa-node"><input type="checkbox" id="wa-op-enable" ${op.enabled ? 'checked' : ''}/><span class="wa-node-label">启用舆情观察（新闻/论坛）</span></label>
        <label class="wa-node"><input type="checkbox" id="wa-op-sandbox" ${op.sandboxEnabled ? 'checked' : ''}/><span class="wa-node-label">启用闲逛沙盒（NON-CANON氛围碎片）</span></label>
        <div class="wa-set-row"><span>每N轮生成</span><input type="number" min="${rng(bO.everyNRounds, [1, 10])[0]}" max="${rng(bO.everyNRounds, [1, 10])[1]}" value="${op.everyNRounds}" id="wa-op-n" class="wa-input wa-w60"/></div>
        <div class="wa-row">
          <button class="wa-btn" id="wa-op-now">立即生成舆情</button>
          <button class="wa-btn" id="wa-sim-now">立即推演世界</button>
        </div>
        <div class="wa-sec">事件演化（本地骰子）</div>
        <label class="wa-node"><input type="checkbox" id="wa-ev-dice" ${WA.evolution.getSettings().diceEnabled ? 'checked' : ''}/><span class="wa-node-label">启用事件链本地骰子推进</span></label>
        <div class="wa-set-row"><span>骰子修正 <b id="wa-ev-modv">${WA.evolution.getSettings().diceModifier}</b></span><input type="range" min="${rng(bE.diceModifier, [-30, 30])[0]}" max="${rng(bE.diceModifier, [-30, 30])[1]}" value="${WA.evolution.getSettings().diceModifier}" id="wa-ev-mod" class="wa-range"/></div>
        <div class="wa-row"><button class="wa-btn" id="wa-ev-roll">立即掷一轮演化骰</button></div>
        <div id="wa-ev-out" class="wa-out"></div>
        <div class="wa-sec">远方 / 近端随机事件（v2.3.0）</div>
        ${(() => {
          // v2.3.0 块3: 此前「开关/触发率/冷却/保底轮数」是 horizon 的模块常量 ——
          //   用户既不能关掉随机事件，也不能调触发率（一个会打断叙事的机制没有开关）。
          if (!WA.horizon || typeof WA.horizon.getSettings !== 'function') return '<div class="wa-empty">远方/近端引擎未加载</div>';
          const c = WA.horizon.getSettings();
          // v2.7.0: 区间边界取自引擎的单一真源（bounds）——此处此前硬编码 min/max，
          //   与 horizon 的 MIN_CHANCE_PCT/MAX_COOLDOWN/MIN_LEDGER 是同一组数的**第二份声明**：
          //   改一处忘一处就会出现「滑块能拖到的值被引擎夹掉」的静默不一致。
          const hb = (typeof WA.horizon.bounds === 'function') ? WA.horizon.bounds()
            : { chancePct: [1, 100], cooldown: [0, 20], ledger: [3, 30] };
          const st = WA.horizon.stat ? WA.horizon.stat() : null;
          const dis = v => (v === false ? 'disabled' : '');
          const dEn = c.distantEnabled !== false, nEn = c.nearEnabled !== false;
          const tail = st ? `<div class="wa-dim">本会话掷骰 ${st.rolls} 次 · 远方触发 ${st.distantFired} · 近端触发 ${st.nearFired} · 跳过（通道关） ${st.skipped}${st.lastReason ? ' · 最近：' + esc(st.lastReason) : ''}</div>` : '';
          // id 一律写成字面量（而非 `${k}-en` 式拼接）：守卫表靠源码字面量发现控件，
          //   拼接出的 id 运行时存在、静态守卫里隐形（会被报成僵尸或漏覆盖）。
          return `
            <label class="wa-node"><input type="checkbox" id="wa-hz-d-en" ${dEn ? 'checked' : ''}/><span class="wa-node-label">远方通道</span></label>
            <div class="wa-set-row"><span>触发率 <b id="wa-hz-d-chancev">${c.distantChance}</b>%</span><input type="range" min="${hb.chancePct[0]}" max="${hb.chancePct[1]}" value="${c.distantChance}" id="wa-hz-d-chance" class="wa-range" ${dis(c.distantEnabled)}/></div>
            <div class="wa-set-row"><span>冷却 <b id="wa-hz-d-cdv">${c.distantCooldown}</b>轮</span><input type="range" min="${hb.cooldown[0]}" max="${hb.cooldown[1]}" value="${c.distantCooldown}" id="wa-hz-d-cd" class="wa-range" ${dis(c.distantEnabled)}/></div>
            <div class="wa-set-row"><span>保底 <b id="wa-hz-d-ledgerv">${c.distantLedger}</b>轮</span><input type="range" min="${hb.ledger[0]}" max="${hb.ledger[1]}" value="${c.distantLedger}" id="wa-hz-d-ledger" class="wa-range" ${dis(c.distantEnabled)}/></div>
            <label class="wa-node"><input type="checkbox" id="wa-hz-n-en" ${nEn ? 'checked' : ''}/><span class="wa-node-label">近端通道</span></label>
            <div class="wa-set-row"><span>触发率 <b id="wa-hz-n-chancev">${c.nearChance}</b>%</span><input type="range" min="${hb.chancePct[0]}" max="${hb.chancePct[1]}" value="${c.nearChance}" id="wa-hz-n-chance" class="wa-range" ${dis(c.nearEnabled)}/></div>
            <div class="wa-set-row"><span>冷却 <b id="wa-hz-n-cdv">${c.nearCooldown}</b>轮</span><input type="range" min="${hb.cooldown[0]}" max="${hb.cooldown[1]}" value="${c.nearCooldown}" id="wa-hz-n-cd" class="wa-range" ${dis(c.nearEnabled)}/></div>
            <div class="wa-set-row"><span>保底 <b id="wa-hz-n-ledgerv">${c.nearLedger}</b>轮</span><input type="range" min="${hb.ledger[0]}" max="${hb.ledger[1]}" value="${c.nearLedger}" id="wa-hz-n-ledger" class="wa-range" ${dis(c.nearEnabled)}/></div>
            <div class="wa-dim">保底：连续未触发达该轮数即强制触发一次；关闭通道后连掷骰都不进行（不消耗冷却与保底计数）。</div>
            <div class="wa-row"><button class="wa-btn" id="wa-hz-save">保存随机事件设置</button></div><div id="wa-hz-out" class="wa-out"></div>`
            + tail;
        })()}
        <div id="wa-set-out" class="wa-out"></div>`;
    },
    bind(panelEl) {
      const $ = sel => panelEl.querySelector(sel);
      const out = () => $('#wa-set-out');
      // v2.2.0: 净化规则治理绑定（此前这些能力零调用 = 治理无入口）
      if (WA.purifier) {
        const pOut = () => { const o = $('#wa-prm-out'); return o; };
        panelEl.querySelectorAll('[data-prm-on]').forEach(cb => cb.onchange = () => {
          WA.purifier.setEnabled(cb.dataset.prmOn, cb.checked);
          if (WA.log) WA.log('info', '净化规则「' + cb.dataset.prmOn + '」已' + (cb.checked ? '启用' : '停用'));
        });
        panelEl.querySelectorAll('[data-prm-del]').forEach(btn => btn.onclick = () => {
          const r = WA.purifier.removeRuleSafe(btn.dataset.prmDel);
          const o = pOut(); if (o) o.textContent = r.ok ? '✓ 已删除，剩 ' + r.remaining + ' 条' : ('删除失败：' + r.reason);
          renderPruneRefresh();
        });
        const prmAdd = $('#wa-prm-add');
        if (prmAdd) prmAdd.onclick = () => {
          const r = WA.purifier.addRuleSafe({ find: $('#wa-prm-find').value, replace: $('#wa-prm-repl').value });
          const o = pOut(); if (o) o.textContent = r.ok ? '✓ 已新增规则（共 ' + r.total + ' 条）' : ('新增失败：' + r.reason);
          if (r.ok) renderPruneRefresh();
        };
        const prmReset = $('#wa-prm-reset');
        if (prmReset) prmReset.onclick = () => {
          const r = WA.purifier.resetToBuiltin();
          const o = pOut(); if (o) o.textContent = '✓ 已恢复内置规则（' + r.total + ' 条）';
          renderPruneRefresh();
        };
        const prmImp = $('#wa-prm-import');
        if (prmImp) prmImp.onclick = () => {
          const r = WA.purifier.importPresetSafe($('#wa-prm-json').value);
          const o = pOut(); if (o) o.textContent = r.ok ? ('✓ 导入 ' + r.added + ' 条' + (r.rejected ? '（拒收 ' + r.rejected + '：' + (r.reasons || []).join('、') + '）' : '')) : ('导入失败：' + r.reason);
          if (r.ok) renderPruneRefresh();
        };
      }
      function renderPruneRefresh() {
        try {
          if (typeof WA.uiSettings.render === 'function' && WA.ui && WA.ui.mounted) {
            const body = panelEl.querySelector('.wa-body');
            if (body && body.querySelector('#wa-prm-find')) { body.innerHTML = WA.uiSettings.render(); WA.uiSettings.bind(panelEl); }
          }
        } catch (e) {}
      }
      const npc = $('#wa-set-npc');
      if (npc) npc.oninput = () => { $('#wa-set-npcv').textContent = npc.value; };
      const bg = $('#wa-set-budget');
      const bgMode = $('#wa-set-budget-mode');
      const syncBudgetRow = () => {
        const mode = bgMode ? bgMode.value : 'auto';
        if (bg) bg.disabled = (mode !== 'manual');
        if ($('#wa-set-budgetv')) $('#wa-set-budgetv').textContent = mode === 'auto' ? '自动' : (mode === 'unlimited' ? '不限' : (bg ? bg.value + 't' : '—'));
      };
      if (bgMode) bgMode.onchange = syncBudgetRow;
      if (bg) bg.oninput = () => { if ($('#wa-set-budgetv') && (!$('#wa-set-budget-mode') || $('#wa-set-budget-mode').value === 'manual')) $('#wa-set-budgetv').textContent = bg.value + 't'; };
      syncBudgetRow();
      const msl = $('#wa-set-mslimit');
      if (msl) msl.oninput = () => { const v = $('#wa-set-mslimitv'); if (v) v.textContent = msl.value; };
      const msd = $('#wa-set-msdice');
      if (msd) msd.oninput = () => { const v = $('#wa-set-msdicev'); if (v) v.textContent = msd.value; };
      // v2.6.0（收口）: 写失败归因话术——**单一实现，提升到共同作用域**。
      //   为什么要提升（两处都踩过，留证防回退）：
      //     · 首版把 whyTxt 定义在 `saveBtn.onclick` 的**函数体内**，而 `#wa-hz-save`（远方/近端）
      //       在同一作用域的另一处引用它 ⇒ ReferenceError：主保存能用、另一个保存按钮一点就抛。
      //       能提前的作用域不要后置——定义在使用点之后、或在别的兄弟闭包里面，都是定时炸弹。
      //     · 反过来「在每个保存出口各写一份措辞」会立刻分叉成第二份真源（改一处忘一处）。
      //   本函数内共有三处用户可见的写入出口（主保存 / 远方近端 / 未来新增），故此处只留一份。
      const whyTxt = function (raw) {
        // 归因必须区分「环境问题」与「实现缺陷」：把 missing-key / stringify 这类编程错误显示成原始
        //   前缀，用户只会去清存储（或反复重试），永远修不好；反过来把配额问题说成「未知原因」也
        //   无从下手。两者给不同的下一步动作。
        const t = String(raw || '未知原因');
        if (/^missing-key/.test(t)) return '登记项未声明 key（实现缺陷，与存储空间无关）';
        if (/^stringify/.test(t)) return '设置值不可序列化（实现缺陷，与存储空间无关）';
        if (/^setItem/.test(t)) return t.replace(/^setItem:\s*/, '') + '（存储写入被拒：配额已满/隐私模式等）';
        return t;
      };
      const saveBtn = $('#wa-set-save');
      if (saveBtn) saveBtn.onclick = () => {
        const wMain = WA.backstage.setSettings({
          simulationMode: $('#wa-set-mode').value,
          timePolicy: $('#wa-set-time').value,
          pulseActivity: $('#wa-set-pulse').value,
          npcBudget: +npc.value,
          autoSimulate: $('#wa-set-auto').checked,
          fullRules: $('#wa-set-fullrules').checked,
          injectBudget: (() => { const m = $('#wa-set-budget-mode'); const v = m ? m.value : 'auto'; if (v === 'unlimited') return 0; if (v === 'manual') return Math.max(200, +($('#wa-set-budget') ? $('#wa-set-budget').value : 2400) || 2400); return -1; })(),
          memSamplerLimit: +($('#wa-set-mslimit') ? $('#wa-set-mslimit').value : 8) || 8,
          memSamplerDice: +($('#wa-set-msdice') ? $('#wa-set-msdice').value : 10000) || 10000,
          memSamplerRelevance: $('#wa-set-msrel') && $('#wa-set-msrel').checked ? 'on' : 'off',
          customInstruction: $('#wa-set-custom').value.trim()
        });
        const wOp = WA.opinion.setSettings({ enabled: $('#wa-op-enable').checked, sandboxEnabled: $('#wa-op-sandbox').checked, everyNRounds: +$('#wa-op-n').value || 3 });
        // v2.6.0: 保存结果必须回显——此前这里恒报「✓ 设置已保存」，而底层 save() 失败时
        //   用户看到的是成功提示、磁盘上却什么都没变（配额满/隐私模式），下次打开发现配置回退
        //   且完全无从判断是自己没保存还是被环境吞了。改为按 writeStat 的真实结果给话术。
        const ws2 = (WA.settingsBus && WA.settingsBus.writeStat) ? WA.settingsBus.writeStat() : null;
        //   两条判据都要看：① 本次调用的回传结果（最精确）；② 写入台账最近失败（兜住
        //   「回传被吞」的路径）。两者任一为失败即报失败，绝不无条件报成功。
        const badW = [wMain, wOp].filter(function (x) { return x && x.ok === false; })[0];
        if (badW) out().textContent = '✗ 保存失败：' + whyTxt(badW.reason) + '（改动未落盘）';
        else if (ws2 && ws2.lastError) out().textContent = '✗ 保存失败：' + whyTxt(ws2.lastError) + '（改动未落盘）';
        else out().textContent = '✓ 设置已保存';
      };
      const opNow = $('#wa-op-now');
      if (opNow) opNow.onclick = async () => { out().textContent = '舆情生成中…'; const r = await WA.opinion.generate(); out().textContent = r.ok ? `✓ 新闻${r.news}条 论坛${r.forums}主题` : ('失败：' + r.reason); };
      const simNow = $('#wa-sim-now');
      if (simNow) simNow.onclick = () => { WA.backstage.forceSimulate(); out().textContent = '已触发世界推演（见日志）'; };
      // 演化设置
      const evMod = $('#wa-ev-mod');
      if (evMod) evMod.oninput = () => { $('#wa-ev-modv').textContent = evMod.value; };
      // v2.3.0 块3: 远方/近端通道配置绑定（含「关闭 ⇒ 概率/冷却控件禁用」的可见降级）
      // ⚠ 选择器必须带 '#'：`$('wa-hz-d-en')` 是**标签名**选择器（找 <wa-hz-d-en> 元素），
      //   永远返回 null，绑定会静默失效（控件渲染正常、参数却不联动、滑块不回显）。
      const byId = id => $('#' + id);
      const hzIds = ['wa-hz-d', 'wa-hz-n'];
      hzIds.forEach(k => {
        const pair = { en: byId(k + '-en'), ch: byId(k + '-chance'), cd: byId(k + '-cd'), lg: byId(k + '-ledger') };
        const sync = () => {
          const on = (pair.en || {}).checked !== false;
          [pair.ch, pair.cd, pair.lg].forEach(el => { if (el) el.disabled = !on; });
        };
        if (pair.en) pair.en.onchange = sync;
        if (pair.ch) pair.ch.oninput = () => { const v = byId(k + '-chancev'); if (v) v.textContent = pair.ch.value; };
        if (pair.cd) pair.cd.oninput = () => { const v = byId(k + '-cdv'); if (v) v.textContent = pair.cd.value; };
        if (pair.lg) pair.lg.oninput = () => { const v = byId(k + '-ledgerv'); if (v) v.textContent = pair.lg.value; };
        sync();
      });
      const hzSave = $('#wa-hz-save');
      if (hzSave) hzSave.onclick = () => {
        const wHz = WA.horizon.setSettings({
          distantEnabled: $('#wa-hz-d-en').checked, distantChance: +$('#wa-hz-d-chance').value, distantCooldown: +$('#wa-hz-d-cd').value, distantLedger: +$('#wa-hz-d-ledger').value,
          nearEnabled: $('#wa-hz-n-en').checked, nearChance: +$('#wa-hz-n-chance').value, nearCooldown: +$('#wa-hz-n-cd').value, nearLedger: +$('#wa-hz-n-ledger').value
        });
        const o = $('#wa-hz-out');
        // v2.6.0: 与主保存同规格——写失败不得再报「✓ 已保存」；归因话术也复用同一处
        //   （whyTxt 与主保存定义在同一作用域内，避免「两条保存路径两套措辞」的第二份真源）。
        if (o) o.textContent = (wHz && wHz.ok === false)
          ? ('✗ 保存失败：' + whyTxt(wHz.reason) + '（改动未落盘）')
          : '✓ 已保存（写入即归一：概率 1-100%、冷却 0-20 轮、保底 3-30 轮——落盘的就是生效值）';
      };
      // v2.7.0: 区域突发事件配置绑定（与 horizon 的 hzSave 同规格——同一条写入出口、同一套话术）
      const rgIds = ['wa-rg-chance', 'wa-rg-dur'];
      rgIds.forEach(function (id) {
        const el = byId(id);
        const val = byId(id + 'v');
        if (el && val) el.oninput = function () { val.textContent = el.value + (id === 'wa-rg-chance' ? '%' : ''); };
      });
      const rgSave = byId('wa-rg-save');
      if (rgSave) rgSave.onclick = function () {
        const wRg = WA.regional.setSettings({
          enabled: byId('wa-rg-enable').checked,
          chancePercent: +byId('wa-rg-chance').value,
          durationRounds: +byId('wa-rg-dur').value
        });
        const o = byId('wa-rg-out');
        // 与主保存/远方近端同规格：写失败不得报成功；归因话术复用同一处 whyTxt（单一实现）
        if (o) o.textContent = (wRg && wRg.ok === false)
          ? ('✗ 保存失败：' + whyTxt(wRg.reason) + '（改动未落盘）')
          : '✓ 已保存（写入即归一：概率 1-100%、持续 1-20 轮，落盘的就是生效值）';
      };
      const evRoll = $('#wa-ev-roll');
      if (evRoll) evRoll.onclick = () => {
        WA.evolution.setSettings({ diceEnabled: $('#wa-ev-dice').checked, diceModifier: +evMod.value });
        const results = WA.evolution.tick();
        $('#wa-ev-out').innerHTML = results.length ? results.map(r => `<div class="wa-item">${esc(r.name)}：<b>${esc(r.result)}</b> ${r.stage ? '→ ' + esc(r.stage) : ''} ${r.dice ? '(骰' + r.dice + '/阈' + r.threshold + ')' : ''}</div>`).join('') : '<div class="wa-dim">（无活跃事件链，可在backstage推演中生成）</div>';
      };
    }
  };
})();