/**
 * WorldAxis ui/pages/people-page.js — 玩家面「人物」（v2.518.0 · UI-P1）
 *
 * 玩家先看到「这个人是谁、你们现在是什么感觉」，而不是 affinity/trust/bond
 * 三个内部数值。数值仍由旧人物页保留，开发者模式继续走 panel.js 的完整工作台。
 * 本模块只读 store 与既有语义出口，不写世界、不落盘、不新增导航页。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function esc(s) {
    if (WA && WA.sanitize && typeof WA.sanitize.html === 'function') return WA.sanitize.html(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '"', "'": '&#39;' }[c];
    });
  }
  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }
  function store() { return safe(function () { return WA.store.get(); }, null); }
  function bandOf(value) {
    const n = Number(value);
    if (!isFinite(n)) return '';
    const bands = safe(function () {
      return WA.registry && typeof WA.registry.relationBands === 'function'
        ? WA.registry.relationBands() : [];
    }, []);
    for (let i = 0; i < bands.length; i++) {
      if (n >= Number(bands[i].min) && n <= Number(bands[i].max)) return bands[i].band || '';
    }
    return '';
  }
  function affinityText(value) {
    const band = bandOf(value);
    if (!band) return '';
    return ({
      '陌生人': '你们还在互相打量',
      '相识': '你们已经认得彼此',
      '普通朋友': '相处起来已经自然',
      '信任者': '他愿意把一部分真心交给你',
      '好友': '你们之间有了稳定的默契',
      '至交': '你们站在彼此这一边',
      '挚爱': '你们之间的牵挂很深',
      '灵魂羁绊': '你们的命运已经紧紧相连'
    })[band] || band;
  }
  function trustText(value) {
    const n = Number(value);
    if (!isFinite(n)) return '';
    if (n <= 20) return '仍在观察你';
    if (n <= 40) return '对你有所保留';
    if (n <= 60) return '愿意听你说完';
    if (n <= 80) return '大多时候相信你';
    return '把你当作可以托付的人';
  }
  function bondText(value) {
    const n = Number(value);
    if (!isFinite(n)) return '';
    if (n <= 20) return '你们的联系还很浅';
    if (n <= 45) return '你们之间已有一些牵连';
    if (n <= 70) return '你们的故事正在交织';
    return '你们很难再把彼此当作无关的人';
  }
  function relationLine(person) {
    const lines = [];
    const affinity = affinityText(person.affinity);
    const trust = trustText(person.trust);
    const bond = bondText(person.bond);
    if (affinity) lines.push(affinity);
    if (trust) lines.push(trust);
    if (bond) lines.push(bond);
    return lines.join('。') + (lines.length ? '。' : '');
  }
  function personCard(person, key, index, recKey) {
    const p = person || {};
    const name = p.name || key || ('人物 ' + (index + 1));
    const rec = recKey || '';
    const recAttr = rec ? ' data-rec="' + esc(rec) + '"' : '';
    const tags = Array.isArray(p.tags) ? p.tags.filter(Boolean).slice(0, 5) : [];
    const tagHtml = tags.length
      ? '<div class="wa-people-tags">' + tags.map(function (tag) {
        return '<span class="wa-people-tag">' + esc(tag) + '</span>';
      }).join('') + '</div>' : '';
    const line = relationLine(p);
    return '<article class="wa-people-card"' + recAttr + '>'
      + '<div class="wa-people-card-head"><h3>' + esc(name) + '</h3>'
      + (tags.length ? '<span class="wa-people-tag-count">' + tags.length + ' 个印象</span>' : '') + '</div>'
      + (line ? '<p class="wa-people-relation">' + esc(line) + '</p>' : '<p class="wa-people-relation is-quiet">还没有足够的相处记录。</p>')
      + tagHtml
      + '</article>';
  }
  function empty() {
    return '<section class="wa-people-empty">'
      + '<div class="wa-people-empty-mark" aria-hidden="true">○</div>'
      + '<h3>还没有遇见谁</h3>'
      + '<p>人物会在故事推进后出现在这里。</p>'
      + '</section>';
  }
  function render() {
    const s = store();
    const people = s && s.people && typeof s.people === 'object' ? s.people : {};
    const keys = Object.keys(people);
    const peopleIds = keys;
    const recKeyOf = function (name) {
      const n = String(name == null ? '' : name);
      for (let i = 0; i < peopleIds.length; i++) {
        const value = people[peopleIds[i]];
        if (value && String(value.name == null ? '' : value.name) === n) return 'people:' + peopleIds[i];
      }
      return '';
    };
    const cards = keys.map(function (key, index) {
      const person = people[key] || {};
      return personCard(person, key, index, recKeyOf(person.name));
    }).join('');
    const relation = safe(function () {
      return WA.relationTemp && typeof WA.relationTemp.network === 'function'
        ? WA.relationTemp.network() : null;
    }, null);
    const hasNetwork = relation && relation.ok === true && relation.quiet !== true && Array.isArray(relation.rows) && relation.rows.length;
    return '<div class="wa-people-player">'
      + '<header class="wa-people-hero"><div class="wa-people-kicker">人物</div>'
      + '<h2>故事里的人</h2><p>他们如何靠近你，取决于你们一起经历过什么。</p></header>'
      + (cards || empty())
      + (hasNetwork ? '<details class="wa-details wa-people-network"><summary>关系正在发生变化</summary><div class="wa-people-network-body">'
        + relation.rows.slice(0, 4).map(function (row) {
          return '<p><b>' + esc(row.a) + ' ↔ ' + esc(row.b) + '</b>'
            + (row.recent && row.recent.reason ? ' · ' + esc(row.recent.reason) : '') + '</p>';
        }).join('') + '</div></details>' : '')
      + '</div>';
  }
  function bind() {}
  WA.panelPeoplePage = { render: render, bind: bind, ver: '2.518.0' };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('ui/pages/people-page.js', { kind: 'ui', ver: '2.518.0' });
  }
})();
