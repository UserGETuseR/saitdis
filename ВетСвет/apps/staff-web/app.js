const staffEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const staffKey = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function staffApi(path, method = 'GET', payload) {
  const response = await fetch(path, {
    method,
    headers: payload ? { 'content-type': 'application/json', 'idempotency-key': staffKey() } : undefined,
    body: payload ? JSON.stringify(payload) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие.');
  return data;
}

function stateLabel(state) {
  return ({ REQUESTED: 'ожидает решения', CONFIRMED: 'подтверждено', CHECKED_IN: 'в клинике', IN_SERVICE: 'в работе', READY: 'готово', ISSUED: 'счёт выставлен', PENDING_QUOTE: 'стоимость уточняется' })[state] || state;
}

function formatWhen(value) {
  return new Date(value).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderStaff(data) {
  const workspace = document.querySelector('.workspace');
  const requested = data.appointments.filter((item) => item.state === 'REQUESTED');
  const active = data.appointments.filter((item) => item.state !== 'REQUESTED');
  const rows = (active.length ? active : data.appointments).map((item) => `
    <article class="row"><span class="time">${staffEscape(formatWhen(item.startsAt))}</span><div class="who"><h3>${staffEscape(item.pet)} · ${staffEscape(item.species)}</h3><p>${staffEscape(item.owner)} · ${staffEscape(item.service)}</p></div><span class="chip ${item.state === 'CONFIRMED' ? 'vet' : 'wait'}">${staffEscape(stateLabel(item.state))}</span></article>`).join('') || '<p style="padding:18px;color:var(--muted)">На ближайшее время нет подтверждённых записей.</p>';
  const queue = requested.map((item) => `
    <article class="task" data-request="${staffEscape(item.id)}"><i class="check"></i><div><b>${staffEscape(item.pet)} · ${staffEscape(item.service)}</b><span>${staffEscape(item.owner)} · ${staffEscape(formatWhen(item.startsAt))}<br>Финансы: ${staffEscape(stateLabel(item.invoiceState))}</span><p style="margin:9px 0 0;display:flex;gap:7px"><button class="button" data-action="confirm" data-id="${staffEscape(item.id)}">Подтвердить</button><button class="button secondary" data-action="cancel" data-id="${staffEscape(item.id)}">Отклонить</button></p></div></article>`).join('') || '<p style="padding:14px 0;color:var(--muted);font-size:12px">Новых запросов нет. Всё спокойно.</p>';
  workspace.innerHTML = `<header class="top"><div><h1>Рабочее место VetSvet</h1><p>Живая очередь, расписание и решения команды · роль: ${staffEscape(data.account.role)}</p></div><div class="command">Сначала статус, потом действие <kbd>⌘</kbd></div></header><div class="board"><section class="card schedule"><div class="card-head"><h2>Расписание</h2><span class="count">${active.length}</span></div>${rows}</section><section class="card"><div class="card-head"><h2>Очередь записи</h2><span class="count">${requested.length}</span></div><div class="tasks">${queue}</div></section><section class="card"><div class="card-head"><h2>Операционный контур</h2><span class="count">live</span></div><div class="patient"><div class="patient-top"><div class="avatar" style="display:grid;place-items:center;background:#e2f2e8;color:#07555a;font-weight:900">✦</div><div><h2>Следующий шаг виден</h2><p>Запрос остаётся REQUESTED, пока сотрудник не примет решение.</p></div></div><div class="alerts"><span class="alert neutral">доступ по роли</span><span class="alert neutral">журнал действий</span></div><div class="detail"><b>Что уже связано</b>Владелец → питомец → услуга → заявка → счёт → решение сотрудника. Груминг, консультации и клинический приём будут продолжать ту же цепочку.</div></div></section></div>`;
  workspace.querySelectorAll('button[data-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.action === 'confirm' ? 'CONFIRM' : 'CANCEL';
    button.disabled = true;
    try { await staffApi(`/api/v1/staff/appointments/${encodeURIComponent(button.dataset.id)}`, 'PATCH', { action }); await loadStaff(); }
    catch (error) { window.alert(error.message); button.disabled = false; }
  }));
}

async function loadStaff() {
  const me = await staffApi('/api/v1/auth/me');
  if (me.account.mode !== 'STAFF') { location.assign('/client/'); return; }
  renderStaff(await staffApi('/api/v1/staff/dashboard'));
}

loadStaff().catch(() => location.assign('/auth/?mode=staff'));
