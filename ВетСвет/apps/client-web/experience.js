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
  const consultations = dashboard.consultations ?? [];
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
}

const experienceStyle = document.createElement('style');
experienceStyle.textContent = '@media(max-width:700px){#client-experience{grid-template-columns:1fr!important}#client-experience .timeline{grid-column:auto!important}}';
document.head.append(experienceStyle);
setTimeout(() => renderClientExperience().catch(() => {}), 500);
