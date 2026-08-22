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
    all: () => {const branchId=window.Branches?.current?.().id||"sochi";return col.all().filter((shift)=>(shift.branchId||"sochi")===branchId);},

    plan({ date, slot, userId, userName }) {
      // одна смена на сотрудника в слот/дату
      const branchId=window.Branches?.current?.().id||"sochi";
      const dup = col.find((s) => (s.branchId||"sochi")===branchId&&s.date === date && s.slot === slot && s.userId === userId);
      if (dup) return dup;
      return col.insert({ branchId,date, slot, userId, userName, status: "planned" });
    },
    remove(id) { col.remove(id); },
    setStatus(id, status) { return col.update(id, { status }); },

    forUser(userId) {
      return this.all().filter((s) => s.userId === userId).sort((a, b) => a.date.localeCompare(b.date));
    },
    forDate(date) { return this.all().filter((s) => s.date === date); },

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
