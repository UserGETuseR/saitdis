const experienceEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const experienceKey = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function experienceApi(path, method = 'GET', payload) {
  const response = await fetch(path, {
    method,
    headers: payload ? { 'content-type': 'application/json', 'idempotency-key': experienceKey() } : undefined,
    body: payload ? JSON.stringify(payload) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || 'Не удалось выполнить действие.');
  return data;
}

function paymentLabel(state) {
  return ({ AWAITING_PROOF: 'ждём чек', PENDING_REVIEW: 'чек проверяется', CONFIRMED: 'оплата подтверждена' })[state] || state;
}

async function renderClientExperience() {
  const me = await experienceApi('/api/v1/auth/me');
  const account = me.account;
  if (account.mode !== 'CLIENT' || !account.owner) return;
  const [dashboard, catalog] = await Promise.all([
    experienceApi(`/api/v1/client/owners/${encodeURIComponent(account.owner.id)}/dashboard`),
    experienceApi('/api/v1/client/booking/catalog')
  ]);
  document.querySelector('#client-experience')?.remove();
  const pets = dashboard.pets ?? [];
  const reports = pets.flatMap((pet) => (pet.appointments ?? [])
    .filter((appointment) => appointment.grooming?.state === 'COMPLETE' && appointment.grooming.report)
    .map((appointment) => ({ pet, appointment })));
  const clinicalRecords = pets.flatMap((pet) => (pet.clinicalHistory ?? []).map((record) => ({ pet, record })));
  const timelineEvents = pets.flatMap((pet) => (pet.timeline ?? []).map((event) => ({ pet, event }))).sort((left, right) => new Date(right.event.occurredAt) - new Date(left.event.occurredAt)).slice(0, 24);
  const consultations = dashboard.consultations ?? [];
  const hospitalizations = dashboard.hospitalizations ?? [];
  const invoices = dashboard.invoices ?? [];
  const documents = dashboard.documents ?? [];
  const growth = dashboard.growth ?? { loyaltyPoints: 0, loyaltyHistory: [], packages: [], memberships: [] };
  const activePackages = (growth.packages ?? []).filter((item) => item.state === 'ACTIVE' && item.remainingCredits > 0 && (!item.expiresAt || new Date(item.expiresAt) > new Date()));
  const rebookable = pets.flatMap((pet) => (pet.appointments ?? []).filter((appointment) => ['COMPLETED', 'READY'].includes(appointment.state) && appointment.variantId && appointment.locationId).map((appointment) => ({ pet, appointment }))).slice(-8).reverse();
  const petName = new Map(pets.map((pet) => [pet.id, pet.name]));
  const section = document.createElement('section');
  section.id = 'client-experience';
  section.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px';
  section.innerHTML = `
    ${account.telegramLinked ? '' : `<article class="timeline telegram-connect" style="grid-column:1/-1;padding:18px 22px;background:#e8f6fb;border-color:#b8dce8"><div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap"><div><p class="eyebrow" style="margin:0 0 6px;color:#17637b">Дополнительный канал</p><b style="font-size:18px">Подключите Telegram к этому аккаунту</b><p style="margin:6px 0 0;color:var(--muted);font-size:12px;line-height:1.5">После привязки бот увидит питомцев и поможет выбрать услугу, свободное окно, консультацию и оплату.</p></div><button class="button" type="button" data-link-telegram>Подключить Telegram ↗</button></div><p data-link-status style="margin:10px 0 0;color:#17637b;font-size:12px;font-weight:750"></p></article>`}
    <article class="timeline care-program" style="grid-column:1/-1;padding:5px 22px 18px;background:linear-gradient(135deg,#102f2d 0%,#07555a 58%,#123a36 100%);color:#fff;overflow:hidden;position:relative">
      <div aria-hidden="true" style="position:absolute;width:240px;height:240px;border:1px solid #c6f8d755;border-radius:50%;right:-55px;top:-105px"></div>
      <div class="timeline-head" style="border-color:#ffffff22;position:relative"><h2 style="color:#fff">Программа заботы</h2><span style="font-size:12px;color:#c6f8d7">${Number(growth.loyaltyPoints ?? 0).toLocaleString('ru-RU')} баллов</span></div>
      <div class="care-program-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;padding-top:16px;position:relative">
        <article style="padding:15px;border:1px solid #ffffff24;border-radius:16px;background:#ffffff0d"><small style="color:#c6f8d7">Баланс добрых визитов</small><strong style="display:block;font-size:34px;margin:7px 0">${Number(growth.loyaltyPoints ?? 0).toLocaleString('ru-RU')}</strong><span style="font-size:12px;color:#ffffffaa">Баллы начисляются после подтверждённой оплаты. Любая ручная корректировка остаётся в истории.</span></article>
        <article style="padding:15px;border:1px solid #ffffff24;border-radius:16px;background:#ffffff0d"><small style="color:#c6f8d7">Пакеты</small>${activePackages.length ? activePackages.map((item) => `<div style="margin-top:9px"><b>${experienceEscape(item.name)}</b><div style="display:flex;justify-content:space-between;font-size:12px;color:#ffffffb5;margin-top:4px"><span>${item.remainingCredits} из ${item.initialCredits} визитов</span><span>${item.expiresAt ? `до ${new Date(item.expiresAt).toLocaleDateString('ru-RU')}` : 'без срока'}</span></div><div style="height:6px;margin-top:7px;border-radius:99px;background:#ffffff20;overflow:hidden"><i style="display:block;height:100%;width:${Math.max(0, Math.min(100, item.initialCredits ? item.remainingCredits / item.initialCredits * 100 : 0))}%;background:#c6f8d7"></i></div></div>`).join('') : '<p style="font-size:12px;color:#ffffffaa;line-height:1.5">Активный пакет появится здесь сразу после подтверждения оплаты.</p>'}</article>
        <article style="padding:15px;border:1px solid #ffffff24;border-radius:16px;background:#ffffff0d"><small style="color:#c6f8d7">Membership</small>${(growth.memberships ?? []).length ? growth.memberships.map((item) => `<div style="margin-top:9px"><b>${experienceEscape(item.name)}</b><p style="margin:5px 0;color:#ffffffb5;font-size:12px">${experienceEscape(item.state)}${item.currentPeriodEnd ? ` · до ${new Date(item.currentPeriodEnd).toLocaleDateString('ru-RU')}` : ''}</p></div>`).join('') : '<p style="font-size:12px;color:#ffffffaa;line-height:1.5">Персональный план заботы объединит регулярные услуги и преимущества в одном месте.</p>'}</article>
      </div>
      ${rebookable.length ? `<div style="margin-top:14px;padding-top:13px;border-top:1px solid #ffffff22;position:relative"><small style="display:block;color:#c6f8d7;margin-bottom:8px">Повторить удачный визит</small><div style="display:flex;gap:8px;flex-wrap:wrap">${rebookable.map(({ pet, appointment }) => `<button type="button" class="button" data-rebook="${experienceEscape(appointment.id)}" style="min-height:38px;font-size:12px;background:#c6f8d7;color:#10211f">${experienceEscape(pet.name)} · ${experienceEscape(appointment.service)}</button>`).join('')}</div></div>` : ''}
    </article>
    <article class="timeline" style="grid-column:auto;padding:5px 22px 18px">
      <div class="timeline-head"><h2>Консультация рядом</h2><span style="font-size:12px;color:var(--muted)">кабинет + Telegram</span></div>
      <p style="margin:14px 0;color:var(--muted);font-size:13px;line-height:1.5">Опишите вопрос спокойно и своими словами. После заявки VetSvet откроет личный маршрут оплаты, а подтверждённый ответ останется в кабинете.</p>
      <form id="consultation-form" style="display:grid;gap:9px">
        <select name="petId" required ${pets.length ? '' : 'disabled'} style="width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;background:#fff"><option value="">О ком позаботимся?</option>${pets.map((pet) => `<option value="${experienceEscape(pet.id)}">${experienceEscape(pet.name)}</option>`).join('')}</select>
        <input name="startsAt" required type="datetime-local" ${pets.length ? '' : 'disabled'} style="width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;background:#fff">
        <textarea name="question" required minlength="10" maxlength="3000" placeholder="Что беспокоит, когда началось, что уже пробовали" ${pets.length ? '' : 'disabled'} style="width:100%;min-height:105px;padding:11px;border:1px solid var(--line);border-radius:10px;resize:vertical;background:#fff"></textarea>
        <input name="locationId" type="hidden" value="${experienceEscape(catalog.locations?.[0]?.id || '')}">
        <button class="button" type="submit" ${pets.length ? '' : 'disabled'}>Создать консультацию →</button>
      </form>
      <p id="consultation-status" style="margin:12px 0 0;color:var(--teal);font-size:13px;font-weight:750"></p>
    </article>
    <article class="timeline" style="grid-column:auto;padding:5px 22px 18px">
      <div class="timeline-head"><h2>Статус консультаций</h2><span style="font-size:12px;color:var(--muted)">${consultations.length}</span></div>
      <div style="display:grid;gap:9px;padding-top:14px">${consultations.length ? consultations.map((item) => `<article style="padding:13px;border:1px solid var(--line);border-radius:14px;background:#fff"><b>${experienceEscape(petName.get(item.petId) || 'Питомец')} · ${experienceEscape(paymentLabel(item.paymentState))}</b><p style="margin:6px 0;color:var(--muted);font-size:12px;line-height:1.45">${experienceEscape(item.response || item.question)}</p>${item.paymentState === 'AWAITING_PROOF' ? `<button class="button" type="button" data-payment-link="${experienceEscape(item.id)}" style="min-height:36px;font-size:12px">Открыть оплату в Telegram</button>` : ''}</article>`).join('') : '<p style="margin:0;color:var(--muted);font-size:13px">Здесь появится путь от вопроса до ответа специалиста.</p>'}</div>
    </article>
    <article class="timeline finance-vault" style="grid-column:1/-1;padding:5px 22px 18px">
      <div class="timeline-head"><h2>Счета и документы</h2><span style="font-size:12px;color:var(--muted)">всё связано с визитом</span></div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding-top:16px">
        <div style="display:grid;gap:9px;align-content:start">${invoices.length ? invoices.map((invoice) => `<article style="padding:14px;border:1px solid var(--line);border-radius:14px;background:#fff"><div style="display:flex;justify-content:space-between;gap:12px"><b>Счёт · ${(invoice.totalMinor / 100).toLocaleString('ru-RU')} ₽</b><span class="eyebrow">${experienceEscape(invoice.state)}</span></div><div style="margin:9px 0;display:grid;gap:5px">${(invoice.lines ?? []).map((line) => `<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted)"><span>${experienceEscape(line.description)}</span><b style="color:var(--ink)">${(line.totalMinor / 100).toLocaleString('ru-RU')} ₽</b></div>`).join('') || '<small style="color:var(--muted)">Команда уточняет состав расчёта.</small>'}</div><div style="height:7px;border-radius:99px;background:#e7ebe7;overflow:hidden"><i style="display:block;width:${invoice.totalMinor > 0 ? Math.min(100, invoice.paidMinor / invoice.totalMinor * 100) : 0}%;height:100%;background:var(--teal)"></i></div><small style="display:block;margin-top:7px;color:var(--muted)">Оплачено ${(invoice.paidMinor / 100).toLocaleString('ru-RU')} ₽${invoice.receiptState ? ` · чек: ${experienceEscape(invoice.receiptState === 'PENDING_PROVIDER' ? 'ожидает кассу' : invoice.receiptState)}` : ''}</small></article>`).join('') : '<p style="margin:0;color:var(--muted);font-size:13px">Счета появятся после выбора помощи.</p>'}</div>
        <div style="display:grid;gap:9px;align-content:start">${documents.length ? documents.map((document) => `<article style="padding:14px;border:1px solid var(--line);border-radius:14px;background:${document.state === 'SIGNED' ? 'var(--mint)' : '#fff'}"><p class="eyebrow" style="margin-bottom:7px">${experienceEscape(document.documentVersion)}</p><b>${experienceEscape(document.title)}</b><p style="margin:7px 0;color:var(--muted);font-size:12px">${document.state === 'SIGNED' ? `Подписано ${new Date(document.signedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}` : 'Откройте точный текст и подтвердите его своим именем.'}</p><div style="display:flex;gap:7px;flex-wrap:wrap"><a class="button" href="/api/v1/client/documents/${encodeURIComponent(document.id)}/print" target="_blank" rel="noopener" style="min-height:36px;font-size:12px;text-decoration:none">Открыть документ</a>${document.state === 'AWAITING_SIGNATURE' ? `<button class="button secondary" type="button" data-sign-document="${experienceEscape(document.id)}" style="min-height:36px;font-size:12px">Подписать</button>` : ''}</div></article>`).join('') : '<p style="margin:0;color:var(--muted);font-size:13px">Здесь сохранятся согласия и подтверждённые версии документов.</p>'}</div>
      </div>
    </article>
    ${hospitalizations.length ? `<article class="timeline" style="grid-column:1/-1;padding:5px 22px 18px"><div class="timeline-head"><h2>Стационар без неизвестности</h2><span style="font-size:12px;color:var(--muted)">${hospitalizations.filter((item) => item.state !== 'DISCHARGED').length} сейчас</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;padding:16px 0 0">${hospitalizations.map((item) => `<article style="padding:14px;border:1px solid var(--line);border-radius:14px;background:${item.state === 'DISCHARGED' ? '#fff' : 'var(--mint)'}"><p class="eyebrow" style="margin-bottom:8px">${experienceEscape(petName.get(item.petId) || 'Питомец')} · ${experienceEscape(item.state)}</p><b>${item.bed ? `${experienceEscape(item.bed.zone)} · ${experienceEscape(item.bed.label)}` : 'Размещение завершено'}</b><p style="margin:7px 0;color:var(--muted);font-size:12px;line-height:1.5">${experienceEscape(item.dischargeSummary || item.currentPlan || 'Команда ведёт наблюдение по клиническому плану.')}</p>${item.lastObservation ? `<small style="display:block;margin-top:8px">Последнее наблюдение: ${experienceEscape(item.lastObservation.acuity)} · ${new Date(item.lastObservation.recordedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</small>` : ''}${(item.nextTasks ?? []).length ? `<div style="margin-top:9px;padding-top:9px;border-top:1px solid #10211f22;font-size:12px"><b>Дальше:</b> ${item.nextTasks.map((task) => `${experienceEscape(task.title)} · ${new Date(task.scheduledAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`).join('<br>')}</div>` : ''}</article>`).join('')}</div></article>` : ''}
    ${clinicalRecords.length ? `<article class="timeline" style="grid-column:1/-1;padding:5px 22px 18px"><div class="timeline-head"><h2>Клиническая история</h2><span style="font-size:12px;color:var(--muted)">финализировано врачом</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;padding:16px 0 0">${clinicalRecords.map(({ pet, record }) => `<article style="padding:14px;border:1px solid var(--line);border-radius:14px;background:#fff"><p class="eyebrow" style="margin-bottom:8px">${experienceEscape(pet.name)} · ${record.finalizedAt ? new Date(record.finalizedAt).toLocaleDateString('ru-RU') : 'приём'}</p><b>${experienceEscape(record.reason)}</b><p style="margin:7px 0;color:var(--muted);font-size:12px;line-height:1.5"><strong style="color:var(--ink)">Оценка:</strong> ${experienceEscape(record.assessment || '—')}<br><strong style="color:var(--ink)">План:</strong> ${experienceEscape(record.plan || '—')}</p>${(record.prescriptions ?? []).length ? `<div style="padding:9px;border-radius:10px;background:var(--mint);font-size:12px">${record.prescriptions.map((prescription) => `<b>${experienceEscape(prescription.medicationName)}</b><br>${experienceEscape(prescription.instructions)}`).join('<br>')}</div>` : ''}</article>`).join('')}</div></article>` : ''}
    ${timelineEvents.length ? `<article class="timeline memory-stream" style="grid-column:1/-1;padding:5px 22px 18px"><div class="timeline-head"><h2>Память заботы</h2><span style="font-size:12px;color:var(--muted)">единая история питомцев</span></div><div style="display:grid;gap:0;padding-top:12px">${timelineEvents.map(({ pet, event }) => `<article style="display:grid;grid-template-columns:96px 12px 1fr;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)"><time style="font-size:11px;color:var(--muted)">${new Date(event.occurredAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' })}</time><i style="width:9px;height:9px;margin-top:4px;border-radius:99px;background:${event.type === 'HEALTH' || event.type === 'HOSPITAL' ? '#07555a' : event.type === 'FINANCE' ? '#d6a955' : 'var(--mint)'};box-shadow:0 0 0 4px #e9efea"></i><div><b>${experienceEscape(pet.name)} · ${experienceEscape(event.title)}</b><p style="margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.45">${experienceEscape(event.detail)}</p></div></article>`).join('')}</div></article>` : ''}
    ${reports.length ? `<article class="timeline" style="grid-column:1/-1;padding:5px 22px 18px"><div class="timeline-head"><h2>Отчёты об уходе</h2><span style="font-size:12px;color:var(--muted)">важное остаётся с вами</span></div><div style="display:grid;gap:10px;padding:16px 0 0">${reports.map(({ pet, appointment }) => `<article style="padding:14px;border:1px solid var(--line);border-radius:14px;background:#fff"><p class="eyebrow" style="margin-bottom:8px">${experienceEscape(pet.name)} · ${experienceEscape(appointment.service)}</p><p style="margin:0;line-height:1.5">${experienceEscape(appointment.grooming.report)}</p><small style="display:block;margin-top:10px;color:var(--muted)">${appointment.grooming.completedAt ? new Date(appointment.grooming.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Отчёт готов'}</small></article>`).join('')}</div></article>` : ''}`;
  document.querySelector('.urgent')?.before(section);
  section.querySelector('[data-link-telegram]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget; const status = section.querySelector('[data-link-status]'); button.disabled = true;
    try {
      const link = await experienceApi('/api/v1/auth/telegram/link/start', 'POST', {}); window.open(link.telegramUrl, '_blank', 'noopener'); status.textContent = 'Нажмите Start в боте — кабинет обновится автоматически.';
      const timer = setInterval(async () => { try { const response = await fetch(`/api/auth/telegram/status?requestId=${encodeURIComponent(link.requestId)}`); const result = await response.json(); if (result.state === 'AUTHENTICATED') { clearInterval(timer); await renderClientExperience(); } else if (['EXPIRED', 'REJECTED'].includes(result.state)) { clearInterval(timer); status.textContent = result.state === 'EXPIRED' ? 'Ссылка истекла. Попробуйте ещё раз.' : 'Этот Telegram уже связан с другим аккаунтом.'; button.disabled = false; } } catch {} }, 1600);
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
  const bookingForm = document.querySelector('#booking-form');
  bookingForm?.querySelector('[data-package-picker]')?.remove();
  if (bookingForm && activePackages.length) {
    const picker = document.createElement('select');
    picker.name = 'packageBalanceId';
    picker.dataset.packagePicker = 'true';
    picker.style.cssText = 'width:100%;margin:0 0 8px;padding:11px;border:1px solid var(--line);border-radius:8px;background:#fff';
    picker.innerHTML = `<option value="">Оплата отдельно — без пакета</option>${activePackages.map((item) => `<option value="${experienceEscape(item.id)}" data-services="${experienceEscape((item.serviceIds ?? []).join(','))}" data-pet="${experienceEscape(item.petId ?? '')}" data-family="${item.familyShared ? 'true' : 'false'}">Пакет «${experienceEscape(item.name)}» · осталось ${item.remainingCredits}</option>`).join('')}`;
    bookingForm.querySelector('[name="startsAt"]')?.before(picker);
    const syncPackageChoices = () => { const petId = bookingForm.querySelector('[name="petId"]')?.value; const variantId = bookingForm.querySelector('[name="variantId"]')?.value; [...picker.options].slice(1).forEach((option) => { const services = String(option.dataset.services ?? '').split(','); option.disabled = Boolean((variantId && !services.includes(variantId)) || (petId && option.dataset.family !== 'true' && option.dataset.pet !== petId)); }); if (picker.selectedOptions[0]?.disabled) picker.value = ''; };
    bookingForm.querySelector('[name="petId"]')?.addEventListener('change', syncPackageChoices);
    bookingForm.querySelector('[name="variantId"]')?.addEventListener('change', syncPackageChoices);
  }
  section.querySelectorAll('[data-rebook]').forEach((button) => button.addEventListener('click', async () => {
    const startsAt = window.prompt('На какое время повторить визит? Например: 2026-08-20 14:30');
    if (!startsAt) return;
    const parsed = new Date(startsAt);
    if (Number.isNaN(parsed.valueOf()) || parsed <= new Date()) { window.alert('Укажите будущую дату и время.'); return; }
    button.disabled = true;
    try { await experienceApi(`/api/v1/client/appointments/${encodeURIComponent(button.dataset.rebook)}/rebook`, 'POST', { startsAt: parsed.toISOString() }); await renderClientExperience(); }
    catch (error) { window.alert(error.message); button.disabled = false; }
  }));
  section.querySelector('#consultation-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = section.querySelector('#consultation-status');
    try {
      status.textContent = 'Создаём безопасный маршрут…';
      const result = await experienceApi('/api/v1/client/consultations', 'POST', Object.fromEntries(form));
      status.innerHTML = `Готово. <a href="${experienceEscape(result.telegramUrl)}" target="_blank" rel="noopener" style="color:inherit">Продолжить в Telegram →</a>`;
    } catch (error) { status.textContent = error.message; }
  });
  section.querySelectorAll('[data-payment-link]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const result = await experienceApi(`/api/v1/client/consultations/${encodeURIComponent(button.dataset.paymentLink)}/payment-link`, 'POST', {});
      window.open(result.telegramUrl, '_blank', 'noopener');
    } catch (error) { window.alert(error.message); button.disabled = false; }
  }));
  section.querySelectorAll('[data-sign-document]').forEach((button) => button.addEventListener('click', async () => {
    const signerName = window.prompt(`Введите имя точно как в профиле: ${dashboard.owner.fullName}`);
    if (!signerName) return;
    const accepted = window.confirm('Подтверждаете, что прочитали документ и согласны с его условиями?');
    if (!accepted) return;
    button.disabled = true;
    try { await experienceApi(`/api/v1/client/documents/${encodeURIComponent(button.dataset.signDocument)}/sign`, 'POST', { signerName, accepted: true }); await renderClientExperience(); }
    catch (error) { window.alert(error.message); button.disabled = false; }
  }));
}

const experienceStyle = document.createElement('style');
experienceStyle.textContent = '@media(max-width:700px){#client-experience{grid-template-columns:1fr!important}#client-experience .timeline{grid-column:auto!important}#client-experience .finance-vault>div:last-child,#client-experience .care-program-grid{grid-template-columns:1fr!important}.care-program{padding-left:16px!important;padding-right:16px!important}}';
document.head.append(experienceStyle);
setTimeout(() => renderClientExperience().catch(() => {}), 500);
