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
  const petName = new Map(pets.map((pet) => [pet.id, pet.name]));
  const section = document.createElement('section');
  section.id = 'client-experience';
  section.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px';
  section.innerHTML = `
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
experienceStyle.textContent = '@media(max-width:700px){#client-experience{grid-template-columns:1fr!important}#client-experience .timeline{grid-column:auto!important}#client-experience .finance-vault>div:last-child{grid-template-columns:1fr!important}}';
document.head.append(experienceStyle);
setTimeout(() => renderClientExperience().catch(() => {}), 500);
