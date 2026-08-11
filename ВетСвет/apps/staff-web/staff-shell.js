(() => {
  const ALL = ['ADMIN', 'MANAGER', 'VETERINARIAN', 'GROOMER', 'ASSISTANT', 'RECEPTIONIST'];
  const routes = [
    { id: 'today', group: 'Смена', icon: '◉', title: 'Сегодня — всё важное рядом.', kicker: 'ЖИВОЙ ПУЛЬС СМЕНЫ', description: 'Записи, очередь и решения, которые требуют внимания прямо сейчас.', roles: ALL, tabs: [['overview', 'Обзор'], ['queue', 'Очередь'], ['calendar', 'Расписание']] },
    { id: 'schedule', group: 'Смена', icon: '▦', title: 'Запись без хаоса.', kicker: 'РАСПИСАНИЕ И ПОТОК', description: 'День, очередь и свободные окна в одном рабочем контексте.', roles: ALL, tabs: [['overview', 'Все записи'], ['calendar', 'Календарь'], ['queue', 'Запросы']] },
    { id: 'patients', group: 'Забота', icon: '◇', title: 'Пациент — это история, не строка.', kicker: 'ВЛАДЕЛЬЦЫ И ПИТОМЦЫ', description: 'Поиск, отношения, задачи, история контактов и следующий лучший шаг.', roles: ALL, tabs: [['owners', 'Владельцы'], ['patients', 'Пациенты'], ['timeline', 'История']] },
    { id: 'clinical', group: 'Забота', icon: '✚', title: 'Клиническая ясность.', kicker: 'МЕДИЦИНСКИЙ КОНТУР', description: 'Осмотр, SOAP, назначения и завершённый медицинский цикл без повторного ввода.', roles: ['ADMIN', 'VETERINARIAN', 'ASSISTANT'], tabs: [['workspace', 'Рабочая область'], ['encounter', 'Приёмы'], ['plan', 'Планы']] },
    { id: 'grooming', group: 'Забота', icon: '✦', title: 'Уход, который помнит детали.', kicker: 'GROOMING WORKSPACE', description: 'Предпочтения, recipe, отчёт владельцу и следующий уход связаны в один визит.', roles: ['ADMIN', 'MANAGER', 'GROOMER', 'ASSISTANT'], tabs: [['workspace', 'В работе'], ['today', 'Сегодня'], ['reports', 'Отчёты']] },
    { id: 'consultations', group: 'Забота', icon: '◎', title: 'Консультации без тишины.', kicker: 'ПРОФЕССИОНАЛЬНЫЙ ОТВЕТ', description: 'Оплата, вопрос, назначение специалиста и понятный статус для владельца.', roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'VETERINARIAN'], tabs: [['queue', 'Очередь'], ['active', 'В работе'], ['completed', 'Завершённые']] },
    { id: 'hospital', group: 'Операции', icon: '▤', title: 'Стационар живёт по ритму.', kicker: 'TREATMENT BOARD', description: 'Пациенты, места, процедуры, наблюдения и передача смены без потерь.', roles: ['ADMIN', 'VETERINARIAN', 'ASSISTANT'], tabs: [['board', 'Пациенты'], ['treatment', 'Процедуры'], ['beds', 'Места'], ['handoff', 'Передача смены']] },
    { id: 'inbox', group: 'Операции', icon: '◌', title: 'Все разговоры — в контексте.', kicker: 'ЕДИНЫЙ INBOX', description: 'Обращения, консультации и история контактов рядом с карточкой пациента.', roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'GROOMER'], tabs: [['messages', 'Сообщения'], ['queue', 'Консультации'], ['owners', 'Контакты']] },
    { id: 'tasks', group: 'Операции', icon: '✓', title: 'Задачи, которые доходят до результата.', kicker: 'КОМАНДНЫЙ ФОКУС', description: 'Личные, клиентские и клинические действия с понятным владельцем и сроком.', roles: ALL, tabs: [['tasks', 'Все задачи'], ['overdue', 'Просрочено'], ['team', 'Команда']] },
    { id: 'inventory', group: 'Бизнес', icon: '□', title: 'Склад знает, что будет дальше.', kicker: 'ЗАПАСЫ И FEFO', description: 'Остатки, партии, сроки и движения — раньше, чем что-то закончится.', roles: ['ADMIN', 'MANAGER', 'VETERINARIAN', 'ASSISTANT'], tabs: [['stock', 'Остатки'], ['lots', 'Партии'], ['movement', 'Движения']] },
    { id: 'finance', group: 'Бизнес', icon: '₽', title: 'Финансы без серых зон.', kicker: 'СЧЕТА И ПЛАТЕЖИ', description: 'Услуги, оплаты, чеки и документы связаны с конкретным визитом.', roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'], tabs: [['invoices', 'Счета'], ['payments', 'Оплаты'], ['documents', 'Документы']] },
    { id: 'crm', group: 'Бизнес', icon: '↗', title: 'Отношения сильнее разовых визитов.', kicker: 'CRM И УДЕРЖАНИЕ', description: 'Сегменты, контакты и заботливые follow-up действия без давления.', roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'], tabs: [['owners', 'Клиенты'], ['tasks', 'Follow-up'], ['messages', 'Контакты']] },
    { id: 'growth', group: 'Бизнес', icon: '∞', title: 'Рост через ценность.', kicker: 'ПАКЕТЫ И ЛОЯЛЬНОСТЬ', description: 'Абонементы, баллы и возвращаемость опираются только на подтверждённые действия.', roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'], tabs: [['packages', 'Пакеты'], ['memberships', 'Абонементы'], ['loyalty', 'Лояльность'], ['retention', 'Возврат']] },
    { id: 'analytics', group: 'Бизнес', icon: '⌁', title: 'Цифры объясняют движение.', kicker: 'АНАЛИТИКА VETSVET', description: 'Выручка, загрузка, клиенты, стационар и склад в единой версии правды.', roles: ['ADMIN', 'MANAGER'], tabs: [['business', 'Бизнес'], ['clients', 'Клиенты'], ['staff', 'Команда'], ['inventory', 'Склад']] },
    { id: 'settings', group: 'Система', icon: '⚙', title: 'Ваше рабочее пространство.', kicker: 'АККАУНТ И ИНТЕГРАЦИИ', description: 'Telegram, безопасность входа и персональные настройки рабочего места.', roles: ALL, tabs: [['account', 'Аккаунт'], ['telegram', 'Telegram'], ['security', 'Безопасность']] }
  ];
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const moduleMap = [
    [/^расписание/i, 'today schedule', 'overview calendar'],
    [/^очередь записи/i, 'today schedule', 'overview queue'],
    [/^клинический/i, 'clinical', 'workspace encounter plan'],
    [/^размещение/i, 'hospital', 'board admissions'],
    [/^груминг/i, 'grooming', 'workspace today reports'],
    [/^консультации/i, 'consultations inbox', 'queue active completed'],
    [/^стационар/i, 'hospital tasks', 'board treatment beds handoff tasks'],
    [/^склад/i, 'inventory', 'stock lots movement'],
    [/^финансы/i, 'finance', 'invoices payments documents'],
    [/^crm/i, 'patients inbox tasks crm', 'owners patients timeline messages tasks'],
    [/^пульс бизнеса/i, 'analytics', 'business clients staff inventory'],
    [/^рост без давления/i, 'growth crm', 'packages memberships loyalty retention']
  ];
  const nav = document.querySelector('#module-nav');
  const dock = document.querySelector('#mobile-dock');
  const intro = document.querySelector('#route-intro');
  const tabs = document.querySelector('#route-tabs');
  const workspace = document.querySelector('.workspace');
  const rail = document.querySelector('#app-rail');
  const palette = document.querySelector('#command-palette');
  const commandInput = document.querySelector('#command-input');
  const commandResults = document.querySelector('#command-results');
  let currentRole = document.documentElement.dataset.staffRole || 'ADMIN';
  let searchTimer;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const allowedRoutes = () => routes.filter((route) => route.roles.includes(currentRole));
  const routeState = () => {
    const [routeId = 'today', view] = location.hash.replace(/^#\/?/, '').split('/');
    const route = routeById.get(routeId) && routeById.get(routeId).roles.includes(currentRole) ? routeById.get(routeId) : routeById.get('today');
    return { route, view: view || route.tabs[0]?.[0] || 'overview' };
  };

  function renderNav() {
    const labels = { today: 'Сегодня', schedule: 'Запись', patients: 'Пациенты', clinical: 'Медицина', grooming: 'Груминг', consultations: 'Консультации', hospital: 'Стационар', inbox: 'Сообщения', tasks: 'Задачи', inventory: 'Склад', finance: 'Финансы', crm: 'CRM', growth: 'Лояльность', analytics: 'Отчёты', settings: 'Настройки' };
    const list = allowedRoutes(); let group = '';
    nav.innerHTML = list.map((route) => { const heading = group === route.group ? '' : `<div class="nav-group">${escapeHtml(route.group)}</div>`; group = route.group; return `${heading}<a class="module-link" data-route="${route.id}" href="#/${route.id}"><i>${route.icon}</i><span>${escapeHtml(labels[route.id])}</span>${route.id === 'inbox' ? '<em>live</em>' : ''}</a>`; }).join('');
    const dockIds = ['today', 'schedule', 'patients', 'tasks'];
    dock.innerHTML = dockIds.map((id) => { const route = routeById.get(id); return `<a class="dock-link" data-route="${id}" href="#/${id}"><i>${route.icon}</i><span>${id === 'today' ? 'Сегодня' : id === 'schedule' ? 'Запись' : id === 'patients' ? 'Пациенты' : 'Задачи'}</span></a>`; }).join('') + '<button class="dock-link" id="dock-more" type="button"><i>•••</i><span>Ещё</span></button>';
    document.querySelector('#dock-more')?.addEventListener('click', openRail);
  }

  function renderIntro(state) {
    intro.innerHTML = `<span class="intro-orbit"></span><div class="intro-copy"><p class="intro-kicker">${escapeHtml(state.route.kicker)}</p><h1>${escapeHtml(state.route.title)}</h1><p>${escapeHtml(state.route.description)}</p></div><div class="intro-meta"><span>Данные обновлены сейчас</span><span>${escapeHtml(currentRole)}</span></div>`;
    tabs.innerHTML = state.route.tabs.map(([id, label]) => `<a class="${state.view === id ? 'active' : ''}" href="#/${state.route.id}/${id}">${escapeHtml(label)}</a>`).join('');
  }

  function classifyCards() {
    workspace.querySelectorAll('.board>.card').forEach((card) => {
      const title = card.querySelector('h2')?.textContent.trim() || '';
      const match = moduleMap.find(([pattern]) => pattern.test(title));
      if (match) { card.dataset.modules = match[1]; card.dataset.views = match[2]; }
    });
  }

  function applyRoute() {
    currentRole = document.documentElement.dataset.staffRole || currentRole;
    renderNav(); const state = routeState(); renderIntro(state);
    document.title = `${state.route.title.replace(/[.—]$/g, '')} · VetSvet Space`;
    document.querySelector('#rail-role').textContent = ({ ADMIN: 'Администратор', MANAGER: 'Управляющий', VETERINARIAN: 'Ветеринар', GROOMER: 'Грумер', ASSISTANT: 'Ассистент', RECEPTIONIST: 'Регистратор' })[currentRole] || 'Команда VetSvet';
    document.querySelectorAll('[data-route]').forEach((link) => link.classList.toggle('active', link.dataset.route === state.route.id));
    classifyCards();
    const board = workspace.querySelector('.board'); if (!board) return;
    let visible = 0;
    board.querySelectorAll(':scope>.card').forEach((card, index) => {
      const modules = (card.dataset.modules || 'today').split(' '); const views = (card.dataset.views || '').split(' ');
      const routeMatches = modules.includes(state.route.id);
      const hasSpecificView = state.route.tabs.some(([id]) => id === state.view) && state.view !== state.route.tabs[0]?.[0];
      const viewMatches = !hasSpecificView || views.includes(state.view);
      const show = routeMatches && viewMatches; card.toggleAttribute('data-module-hidden', !show); card.style.setProperty('--card-index', String(index)); if (show) visible += 1;
    });
    const telegram = workspace.querySelector('.telegram-connect'); if (telegram) telegram.hidden = !['today', 'settings'].includes(state.route.id);
    const empty = board.querySelector('.module-empty');
    if (!visible && !empty) board.insertAdjacentHTML('beforeend', `<section class="module-empty"><i>${state.route.icon}</i><h2>${state.route.id === 'settings' ? 'Аккаунт защищён' : 'Здесь спокойно'}</h2><p>${state.route.id === 'settings' ? 'Telegram подключается отдельной кнопкой выше. Пароль можно изменить в разделе безопасности аккаунта.' : 'Для этого представления пока нет активных записей. Как только появится рабочее событие, оно окажется здесь автоматически.'}</p></section>`);
    if (visible && empty) empty.remove();
    board.classList.remove('route-transition'); void board.offsetWidth; board.classList.add('route-transition'); workspace.setAttribute('aria-busy', 'false');
    document.body.classList.remove('rail-open'); window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function openRail() { document.body.classList.add('rail-open'); }
  function closeRail() { document.body.classList.remove('rail-open'); }
  document.querySelector('#mobile-menu').addEventListener('click', openRail);
  document.querySelector('#rail-scrim').addEventListener('click', closeRail);
  rail.addEventListener('click', (event) => { if (event.target.closest('.module-link')) closeRail(); });

  function paletteMarkup(results = []) {
    const routeItems = allowedRoutes().map((route) => `<button class="palette-item" type="button" data-palette-route="${route.id}"><i>${route.icon}</i><span><b>${escapeHtml(route.title)}</b><small>${escapeHtml(route.description)}</small></span><em>Открыть</em></button>`).join('');
    const found = results.length ? `<div class="palette-group">Найдено в VetSvet</div>${results.map((item) => `<button class="palette-item" type="button" data-search-result><i>◇</i><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.subtitle)}</small></span><em>${escapeHtml(item.type)}</em></button>`).join('')}` : '';
    commandResults.innerHTML = `${found}<div class="palette-group">Разделы приложения</div>${routeItems}`;
    commandResults.querySelectorAll('[data-palette-route]').forEach((button) => button.addEventListener('click', () => { location.hash = `#/${button.dataset.paletteRoute}`; palette.close(); }));
  }
  function openPalette() { paletteMarkup(); palette.showModal(); requestAnimationFrame(() => commandInput.focus()); }
  document.querySelector('#command-open').addEventListener('click', openPalette);
  document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); } });
  commandInput.addEventListener('input', () => { clearTimeout(searchTimer); const query = commandInput.value.trim(); if (query.length < 2) { paletteMarkup(); return; } searchTimer = setTimeout(async () => { try { const response = await fetch(`/api/v1/staff/search?q=${encodeURIComponent(query)}`); const data = await response.json(); paletteMarkup(response.ok ? data.results || [] : []); } catch { paletteMarkup(); } }, 240); });
  palette.addEventListener('close', () => { commandInput.value = ''; paletteMarkup(); });

  document.querySelector('#sign-out').addEventListener('click', async (event) => { event.preventDefault(); try { await fetch('/api/v1/auth/sign-out', { method: 'POST' }); } finally { location.assign('/auth/?mode=staff'); } });
  window.vetsvetToast = (message) => { const node = document.createElement('div'); node.className = 'app-toast'; node.textContent = String(message); document.querySelector('#toast-stack').append(node); setTimeout(() => node.remove(), 4600); };
  window.alert = window.vetsvetToast;

  const observer = new MutationObserver(() => { clearTimeout(observer.timer); observer.timer = setTimeout(applyRoute, 20); });
  observer.observe(workspace, { childList: true, subtree: true });
  window.addEventListener('hashchange', applyRoute);
  window.addEventListener('vetsvet:data-ready', applyRoute);
  if (!location.hash) history.replaceState(null, '', '#/today');
  renderNav(); applyRoute();
})();
