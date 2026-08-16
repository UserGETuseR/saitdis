// ===== Смены персонала «Чайной истории» =====
// Управляющий назначает смены сотрудникам; мастер видит свои смены и
// отмечает открытие/закрытие (чек-ин). Простая операционка расписания.
//
// Запись: { id, date:'YYYY-MM-DD', slot:'morning'|'evening', userId, userName,
//           status:'planned'|'open'|'closed' }

window.Shifts = (function () {
  const col = DB.collection("shifts");

  const SLOTS = {
    morning: { label: "Утро", time: "09:00–15:00", icon: "bi-sunrise" },
    evening: { label: "Вечер", time: "15:00–22:00", icon: "bi-sunset" },
  };

  function todayKey(d) {
    const x = d || new Date();
    return x.toISOString().slice(0, 10);
  }

  return {
    SLOTS,
    todayKey,
    all: () => col.all(),

    plan({ date, slot, userId, userName }) {
      // одна смена на сотрудника в слот/дату
      const dup = col.find((s) => s.date === date && s.slot === slot && s.userId === userId);
      if (dup) return dup;
      return col.insert({ date, slot, userId, userName, status: "planned" });
    },
    remove(id) { col.remove(id); },
    setStatus(id, status) { return col.update(id, { status }); },

    forUser(userId) {
      return col.query((s) => s.userId === userId).sort((a, b) => a.date.localeCompare(b.date));
    },
    forDate(date) { return col.query((s) => s.date === date); },

    // ближайшие N дней, сгруппировано
    upcoming(days) {
      const out = [];
      for (let i = 0; i < (days || 7); i++) {
        const d = new Date(); d.setDate(d.getDate() + i);
        const key = todayKey(d);
        out.push({ date: key, dateObj: new Date(d), items: this.forDate(key) });
      }
      return out;
    },

    subscribe(fn) { DB.subscribe("shifts", fn); },
  };
})();
