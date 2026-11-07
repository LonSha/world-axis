/**
 * WorldAxis engines/personal-inventory.js (v2.329.0)
 * 随身行囊、隐蔽口袋与物理约束引擎 (Personal Inventory & Concealment Pockets)
 *
 * ── 定位与边界（精准避让生态位重叠）─────────────────────────────────────
 *   1. 避让 LonSha 记忆插件：不管理记忆切片、语义事实，仅管理有重量、体积和物理位置的随身道具；
 *   2. 避让 RubyPhone 手机插件：不管理手机操作系统与消息历史，仅将“智能手机”作为一件占口袋格位的随身实体；
 *   3. 专注空间与世界物理闭环：
 *      - 口袋、皮包与夹层容积限制（无法无限制携带重物或长柄武器）；
 *      - 现金与钱包管理（为 transit-scheduler 的通勤、夜间打车与滞留避难提供支付能力）；
 *      - 实体钥匙与凭证管理（为 spatial-topology 的 VIP 门禁、锁止通道提供解构依据）；
 *      - 随身生活防具（雨伞抵御暴雨失温、打火机/烟盒、违禁品夹层隐蔽与搜身检定）。
 */
(function () {
  'use strict';
  const WA = (typeof window !== 'undefined' ? window.WorldAxis : (global.WorldAxis = global.WorldAxis || {}));
  const LS_KEY = 'worldaxis_personal_inventory_settings_v1';
  const DEF = {
    enabled: true,
    defaultPocketCapacity: 6,     // 默认口袋槽位上限
    defaultBagCapacity: 16        // 随身包槽位上限
  };

  const __REG = { key: LS_KEY, def: DEF, module: 'personalInventory' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
  }

  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 内部行囊台账 (按角色聚合)
  // characterId -> { cash: number, pockets: [], bag: [], equipped: {} }
  const inventories = {};

  const personalInventory = {
    version: '2.329.0',
    settings: settings,

    /**
     * 获取或初始化角色的行囊
     */
    getInventory: function (characterId) {
      if (!characterId) return null;
      if (!inventories[characterId]) {
        inventories[characterId] = {
          characterId: characterId,
          cash: 3500, // 初始现钞 (日元/铜钱/筹码)
          pockets: [
            { id: 'phone_01', name: '智能手机', size: 1, concealed: false },
            { id: 'wallet_01', name: '真皮钱夹', size: 1, concealed: false },
            { id: 'keys_01', name: '金属钥匙串', size: 1, concealed: false, keyIds: ['vip_key_01', 'home_key'] }
          ],
          bag: [
            { id: 'umbrella_01', name: '折叠雨伞', size: 2, concealed: false, protective: 'rain' }
          ]
        };
      }
      return inventories[characterId];
    },

    /**
     * 添加随身物品
     */
    addItem: function (characterId, item, targetContainer) {
      const inv = this.getInventory(characterId);
      if (!inv || !item) return { ok: false, reason: 'invalid_target' };
      const container = targetContainer === 'bag' ? inv.bag : inv.pockets;
      const cap = targetContainer === 'bag' ? DEF.defaultBagCapacity : DEF.defaultPocketCapacity;

      const currentSize = container.reduce((sum, it) => sum + (it.size || 1), 0);
      const itemSize = item.size || 1;
      if (currentSize + itemSize > cap) {
        return { ok: false, reason: 'container_full', currentSize: currentSize, capacity: cap };
      }

      container.push(Object.assign({
        id: item.id || ('item_' + Math.random().toString(36).slice(2, 7)),
        name: item.name || '未知物件',
        size: itemSize,
        concealed: !!item.concealed, // 是否处于暗格夹层
        concealTier: item.concealTier || (item.concealed ? 'deep' : 'exposed') // exposed | shallow | deep
      }, item));

      return { ok: true, currentSize: currentSize + itemSize };
    },

    /**
     * 检查是否持有特定钥匙
     */
    hasKey: function (characterId, keyId) {
      const inv = this.getInventory(characterId);
      if (!inv) return false;
      const allItems = [].concat(inv.pockets, inv.bag);
      for (let i = 0; i < allItems.length; i++) {
        const it = allItems[i];
        if (it.keyIds && it.keyIds.indexOf(keyId) >= 0) return true;
        if (it.id === keyId) return true;
      }
      return false;
    },

    /**
     * 现金扣除（用于通勤、消费、滞留避难）
     */
    deductCash: function (characterId, amount) {
      const inv = this.getInventory(characterId);
      if (!inv) return { ok: false, reason: 'no_inventory' };
      const num = Number(amount);
      if (!Number.isFinite(num) || num < 0) {
        return { ok: false, reason: 'invalid-amount', expected: '>= 0' };
      }
      const cost = num;
      if (inv.cash < cost) {
        return { ok: false, reason: 'insufficient_funds', balance: inv.cash, required: cost };
      }
      inv.cash -= cost;
      return { ok: true, balance: inv.cash, deducted: cost };
    },

    /**
     * 现金增加
     */
    addCash: function (characterId, amount) {
      const inv = this.getInventory(characterId);
      if (!inv) return { ok: false };
      inv.cash += Math.max(0, Number(amount) || 0);
      return { ok: true, balance: inv.cash };
    },

    /**
     * 搜查与发现检定（Concealment Check）
     * 搜查人员遭遇检定：exposed(100%发现), shallow(常规30%/深度70%发现), deep(常规0%/深度30%发现)
     * 支持传入 perceptionRoll (0~100) 确定性掷骰
     */
    conductSearch: function (characterId, searchThoroughness, perceptionRoll) {
      const inv = this.getInventory(characterId);
      if (!inv) return { ok: false, reason: 'character-not-found', foundItems: [] };
      const thorough = searchThoroughness || 'routine'; // routine (常规盘查) | thorough (深度搜身)
      const allItems = [].concat(inv.pockets, inv.bag);
      const found = [];
      const hasRoll = Number.isFinite(Number(perceptionRoll));
      const roll = hasRoll ? Number(perceptionRoll) : 50;

      allItems.forEach(it => {
        const tier = it.concealTier || 'exposed';
        if (tier === 'exposed') {
          found.push(it);
        } else if (tier === 'shallow') {
          if (hasRoll) {
            if (roll >= (thorough === 'thorough' ? 40 : 65)) found.push(it);
          } else {
            if (thorough === 'thorough' || Math.random() < 0.6) found.push(it);
          }
        } else if (tier === 'deep') {
          if (hasRoll) {
            // 深层暗格常规搜查绝对查不到；深度搜身需 roll >= 80 才能识破
            if (thorough === 'thorough' && roll >= 80) found.push(it);
          } else {
            if (thorough === 'thorough' && Math.random() < 0.3) found.push(it);
          }
        }
      });

      return {
        ok: true,
        characterId: characterId,
        thoroughness: thorough,
        totalItems: allItems.length,
        foundCount: found.length,
        foundItems: found
      };
    },

    /**
     * 生成反哺正文的随身物品透镜描述
     */
    buildInventoryFeed: function (characterId) {
      const inv = this.getInventory(characterId);
      if (!inv) return '';
      const pocketNames = inv.pockets.filter(it => !it.concealed).map(it => it.name);
      const bagNames = inv.bag.filter(it => !it.concealed).map(it => it.name);

      const parts = [`【${inv.characterId} · 随身行囊与财物】`];
      parts.push(`· 随身现金: ${inv.cash}円/币`);
      if (pocketNames.length) parts.push(`· 口袋物件: ${pocketNames.join('、')}`);
      if (bagNames.length) parts.push(`· 包内备品: ${bagNames.join('、')}`);
      return parts.join('\n');
    },

    diagnose: function () {
      return {
        version: this.version,
        trackedInventories: Object.keys(inventories).length
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = personalInventory;
  }
  WA.personalInventory = personalInventory;
})();