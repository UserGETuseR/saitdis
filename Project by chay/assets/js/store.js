// ===== Хранилище состояния (localStorage) =====
// «Чайный паспорт» гостя: избранное, история подборов, открытия, штампы, корзина.

window.Store = (function () {
  const PREFIX = "tea_stories_v1_";
  let KEY = PREFIX + "guest";

  const DEFAULT = {
    favorites: [],          // id чаёв
    history: [],            // { tea, mushroom, ts }
    discoveredTeas: [],     // id
    discoveredMushrooms: [],// id
    stamps: 0,              // штампы лояльности (за «чашки»)
    cart: [],               // { teaId, mushroomId|null, price }
    journal: [],            // { mood, note, teaId|null, ts }
  };

  let state = load();
  const listeners = [];

  function keyFor(uid) { return PREFIX + (uid || "guest"); }

  function loadFor(uid) {
    try {
      const raw = localStorage.getItem(keyFor(uid));
      if (!raw) return structuredClone(DEFAULT);
      return Object.assign(structuredClone(DEFAULT), JSON.parse(raw));
    } catch (e) { return structuredClone(DEFAULT); }
  }
  function saveFor(uid, st) {
    try { localStorage.setItem(keyFor(uid), JSON.stringify(st)); } catch (e) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT);
      return Object.assign(structuredClone(DEFAULT), JSON.parse(raw));
    } catch (e) {
      return structuredClone(DEFAULT);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
    listeners.forEach((fn) => fn(state));
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  return {
    get: () => state,
    subscribe,

    // переключение «паспорта» на конкретного пользователя (или гостя)
    useUser(uid) {
      KEY = PREFIX + (uid || "guest");
      state = load();
      listeners.forEach((fn) => fn(state));
    },

    toggleFavorite(teaId) {
      const i = state.favorites.indexOf(teaId);
      if (i >= 0) state.favorites.splice(i, 1);
      else state.favorites.push(teaId);
      save();
    },
    isFavorite: (teaId) => state.favorites.includes(teaId),

    discoverTea(teaId) {
      if (!state.discoveredTeas.includes(teaId)) {
        state.discoveredTeas.push(teaId);
        save();
      }
    },
    discoverMushroom(mId) {
      if (mId && !state.discoveredMushrooms.includes(mId)) {
        state.discoveredMushrooms.push(mId);
        save();
      }
    },

    logPick(teaId, mushroomId) {
      state.history.unshift({ tea: teaId, mushroom: mushroomId || null, ts: Date.now() });
      state.history = state.history.slice(0, 30);
      this.discoverTea(teaId);
      this.discoverMushroom(mushroomId);
      save();
    },

    addToCart(teaId, mushroomId, price) {
      state.cart.push({ teaId, mushroomId: mushroomId || null, price });
      this.discoverTea(teaId);
      this.discoverMushroom(mushroomId);
      save();
    },
    addCustomToCart(name, price, sub) {
      state.cart.push({ teaId: null, mushroomId: null, price, name, sub: sub || null });
      save();
    },
    removeFromCart(index) {
      state.cart.splice(index, 1);
      save();
    },
    clearCart() {
      state.cart = [];
      save();
    },
    cartTotal: () => state.cart.reduce((s, x) => s + x.price, 0),

    // ——— Лояльность по реальному заказу ———
    // Начисляет штампы и открытия конкретному пользователю (uid), даже если он
    // не активен (заказ за гостя на кассе мастера). Гостям без аккаунта — пропуск.
    creditOrder(userId, items) {
      if (!userId || !items || !items.length) return;
      const isCurrent = keyFor(userId) === KEY;
      const st = isCurrent ? state : loadFor(userId);
      items.forEach((it) => {
        st.stamps += 1;
        if (it.teaId && !st.discoveredTeas.includes(it.teaId)) st.discoveredTeas.push(it.teaId);
        if (it.mushroomId && !st.discoveredMushrooms.includes(it.mushroomId)) st.discoveredMushrooms.push(it.mushroomId);
      });
      // история подборов из заказа (для паспорта)
      items.forEach((it) => {
        if (it.teaId) {
          st.history.unshift({ tea: it.teaId, mushroom: it.mushroomId || null, ts: Date.now() });
        }
      });
      st.history = st.history.slice(0, 30);
      if (isCurrent) { state = st; save(); } else { saveFor(userId, st); }
    },
    setLoyalty(payload) {
      if (!payload) return;
      state.stamps = Number(payload.stamps) || 0;
      state.loyaltyRewards = Number(payload.rewards) || 0;
      state.loyaltyEvents = Array.isArray(payload.events) ? payload.events : [];
      save();
    },

    addJournal(entry) {
      state.journal.unshift(Object.assign({ ts: Date.now() }, entry));
      state.journal = state.journal.slice(0, 50);
      save();
    },
    removeJournal(index) {
      state.journal.splice(index, 1);
      save();
    },

    reset() {
      state = structuredClone(DEFAULT);
      save();
    },
  };
})();
