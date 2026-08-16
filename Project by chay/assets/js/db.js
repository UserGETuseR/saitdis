// ===== Единый слой данных «Чайной истории» =====
// Лёгкий локальный «движок БД» поверх localStorage с коллекциями, запросами и
// реактивными подписками. Цель — спрятать хранилище за единым интерфейсом,
// чтобы в будущем заменить localStorage на реальный бэкенд (Supabase/Firebase)
// без переписывания экранов. Все домены (заказы, склад, смены) работают через DB.
//
// Замена в будущем: достаточно переписать read()/write() на сетевые вызовы,
// сохранив сигнатуры collection().*

window.DB = (function () {
  const NS = "cha_db_v1_";
  const listeners = {}; // { collection: [fn, ...] }

  function key(coll) { return NS + coll; }

  function read(coll) {
    try {
      const raw = localStorage.getItem(key(coll));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function write(coll, arr) {
    try { localStorage.setItem(key(coll), JSON.stringify(arr)); } catch (e) {}
    emit(coll, arr);
  }

  function emit(coll, arr) {
    (listeners[coll] || []).forEach((fn) => { try { fn(arr); } catch (e) {} });
    (listeners["*"] || []).forEach((fn) => { try { fn(coll, arr); } catch (e) {} });
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function collection(name) {
    return {
      all: () => read(name),
      count: () => read(name).length,

      byId(id) { return read(name).find((x) => x.id === id) || null; },

      find(pred) { return read(name).find(pred) || null; },

      query(pred) { return pred ? read(name).filter(pred) : read(name); },

      insert(doc) {
        const arr = read(name);
        const rec = Object.assign({ id: doc.id || uid(name.slice(0, 3)), createdAt: Date.now() }, doc);
        arr.push(rec);
        write(name, arr);
        return rec;
      },

      // вставка с заданным id, либо обновление существующего
      upsert(doc) {
        const arr = read(name);
        const i = arr.findIndex((x) => x.id === doc.id);
        if (i >= 0) { arr[i] = Object.assign({}, arr[i], doc); write(name, arr); return arr[i]; }
        return this.insert(doc);
      },

      update(id, patch) {
        const arr = read(name);
        const i = arr.findIndex((x) => x.id === id);
        if (i < 0) return null;
        arr[i] = Object.assign({}, arr[i], typeof patch === "function" ? patch(arr[i]) : patch);
        write(name, arr);
        return arr[i];
      },

      remove(id) {
        const arr = read(name).filter((x) => x.id !== id);
        write(name, arr);
      },

      replaceAll(arr) { write(name, arr); },

      clear() { write(name, []); },
    };
  }

  return {
    collection,
    uid,
    subscribe(coll, fn) { (listeners[coll] = listeners[coll] || []).push(fn); },
    // полный сброс всех коллекций приложения (для демо/отладки)
    nuke(collections) {
      (collections || []).forEach((c) => { try { localStorage.removeItem(key(c)); } catch (e) {} });
    },
  };
})();
