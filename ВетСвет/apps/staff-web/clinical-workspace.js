(() => {
  let clinical;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const api = async (path, method = 'GET', payload) => { const response = await fetch(path, { method, headers: payload === undefined ? {} : { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: payload === undefined ? undefined : JSON.stringify(payload) }); const result = await response.json().catch(() => ({})); if (!response.ok) { const error = new Error(result.message || result.error || 'Не удалось выполнить действие'); error.code = result.error; error.details = result; throw error; } return result; };
  const when = (value) => value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  const money = (minor) => `${((minor ?? 0) / 100).toLocaleString('ru-RU')} ₽`;
  const panel = (view, className, content) => `<section class="card core-workspace clinical-command ${className}" data-modules="clinical" data-views="${view}">${content}</section>`;
  const diagnosis = (encounter) => encounter?.diagnoses?.[0] ?? {};
  const prescription = (encounter) => encounter?.prescriptions?.[0] ?? {};
  const procedure = (encounter) => encounter?.procedures?.[0] ?? {};
  const vitals = (encounter) => encounter?.vitals ?? {};

  function editor(visit) {
    const item = visit.encounter; const d = diagnosis(item); const rx = prescription(item); const proc = procedure(item); const v = vitals(item);
    return `<form class="clinical-editor" data-encounter="${esc(item.id)}" data-version="${esc(item.recordVersion)}">
      <header><div><p class="core-kicker">ЧЕРНОВИК · ВЕРСИЯ ${esc(item.version)}</p><h3>${esc(visit.pet?.name)} · ${esc(visit.owner?.fullName)}</h3><span>${esc(visit.service)} · начато ${when(item.updatedAt)}</span></div><b>SOAP</b></header>
      ${item.revisionReason ? `<div class="clinical-revision"><b>Причина поправки</b><span>${esc(item.revisionReason)}</span></div>` : ''}
      <div class="clinical-form-grid">
        <label class="wide">Жалоба<input name="complaint" required minlength="3" value="${esc(item.complaint)}"></label>
        <label>Температура, °C<input name="temperature" inputmode="decimal" value="${esc(v.temperature)}"></label><label>Вес, кг<input name="weightKg" inputmode="decimal" value="${esc(v.weightKg)}"></label><label>Пульс<input name="pulse" inputmode="numeric" value="${esc(v.pulse)}"></label><label>Дыхание<input name="respiration" inputmode="numeric" value="${esc(v.respiration)}"></label>
        <label class="wide">S · жалобы и анамнез<textarea name="subjective" required minlength="3">${esc(item.subjective)}</textarea></label>
        <label class="wide">O · объективный осмотр<textarea name="objective" required minlength="3">${esc(item.objective)}</textarea></label>
        <label>Диагноз / проблема<input name="diagnosis" required minlength="3" value="${esc(d.display)}"></label><label>Уверенность<select name="certainty"><option value="SUSPECTED" ${d.certainty === 'SUSPECTED' ? 'selected' : ''}>Предполагается</option><option value="CONFIRMED" ${d.certainty === 'CONFIRMED' ? 'selected' : ''}>Подтверждён</option><option value="RULED_OUT" ${d.certainty === 'RULED_OUT' ? 'selected' : ''}>Исключён</option></select></label>
        <label class="wide">A · клиническая оценка<textarea name="assessment" required minlength="10">${esc(item.assessment)}</textarea></label>
        <label class="wide">P · план лечения и наблюдения<textarea name="plan" required minlength="10">${esc(item.plan)}</textarea></label>
        <fieldset class="wide"><legend>Процедура и charge capture</legend><label>Что выполнено<input name="procedure" value="${esc(proc.display)}" placeholder="Например: терапевтическая манипуляция"></label><label>Стоимость, ₽<input name="procedurePrice" type="number" min="0" step="1" value="${proc.unitPriceMinor ? proc.unitPriceMinor / 100 : ''}"></label></fieldset>
        <fieldset class="wide"><legend>Назначение</legend><label>Препарат<input name="medicationName" value="${esc(rx.medicationName)}"></label><label>Схема<input name="instructions" value="${esc(rx.instructions)}"></label><label>Дней<input name="durationDays" type="number" min="0" max="365" value=""></label></fieldset>
        <label class="wide">Выписка владельцу<textarea name="dischargeSummary" required minlength="20" placeholder="Что делать дома, что считать ухудшением и когда связаться с клиникой">${esc(item.dischargeSummary)}</textarea></label>
        <label>Контрольный визит<input name="followUpAt" type="datetime-local"></label>
      </div>
      <footer><span data-save-state>Изменения ещё не сохранены</span><button type="button" class="quiet" data-clinical-save>Сохранить черновик</button><button type="submit">Подписать и завершить →</button></footer>
    </form>`;
  }

  function visitCard(visit) {
    if (visit.encounter?.state === 'DRAFT') return editor(visit);
    if (!visit.encounter && ['CHECKED_IN', 'IN_SERVICE'].includes(visit.state)) return `<article class="clinical-intake"><div><p class="core-kicker">ГОТОВ К ОСМОТРУ</p><h3>${esc(visit.pet?.name)}</h3><p>${esc(visit.owner?.fullName)} · ${esc(visit.service)}</p><span>${when(visit.startsAt)}</span></div><form data-clinical-start="${esc(visit.id)}"><input name="complaint" minlength="3" required placeholder="С какой жалобой пришли?"><button>Открыть приём →</button></form></article>`;
    const item = visit.encounter; if (!item) return '';
    return `<article class="clinical-locked"><div class="clinical-seal">✓</div><div><p class="core-kicker">ПОДПИСАНО · v${esc(item.version)}</p><h3>${esc(visit.pet?.name)} · ${esc(diagnosis(item).display || item.complaint)}</h3><p>${esc(item.assessment)}</p><span>${when(item.finalizedAt)} · подпись ${esc(String(item.signatureHash || '').slice(0, 12))}</span></div><aside><b>${money(visit.invoice?.totalMinor)}</b><small>${esc(visit.invoice?.state || 'Счёт формируется')}</small>${visit.dischargeDocument ? '<em>Выписка доставлена</em>' : ''}<button data-clinical-amend="${esc(item.id)}">Создать поправку</button></aside></article>`;
  }

  function render() {
    const board = document.querySelector('.workspace .board'); if (!board || !clinical) return;
    board.querySelectorAll('.core-workspace[data-modules~="clinical"]').forEach((item) => item.remove());
    board.querySelectorAll(':scope>.card:not(.core-workspace)').forEach((item) => { if (/^клинический контур/i.test(item.querySelector('h2')?.textContent || '')) item.setAttribute('data-core-replaced', ''); });
    const active = clinical.visits.filter((item) => ['CHECKED_IN', 'IN_SERVICE', 'READY'].includes(item.state)); const signed = clinical.visits.filter((item) => item.encounter?.state === 'FINALIZED'); const openDrafts = active.filter((item) => item.encounter?.state === 'DRAFT');
    const hero = panel('workspace', 'clinical-hero', `<div><p class="core-kicker">VETSVET CLINICAL FLOW</p><h2>От жалобы<br>до понятного <span>следующего шага.</span></h2><p>Черновик переживает перезапуск. Подписанная запись неизменяема. Поправка создаёт новую версию, а счёт и выписка появляются из того же клинического события.</p><div class="clinical-pulse"><span><b>${active.length}</b> в потоке</span><span><b>${openDrafts.length}</b> черновика</span><span><b>${signed.length}</b> подписано</span></div></div><div class="clinical-orbit"><i></i><i></i><b>✚</b><span>COMPLAINT</span><span>SOAP</span><span>SIGN</span><span>FOLLOW-UP</span></div>`);
    const work = panel('workspace', 'clinical-workbench', `<div class="core-head"><div><p class="core-kicker">РАБОЧАЯ ОБЛАСТЬ</p><h2>Сначала факт. Потом решение.</h2></div><span class="live-chip">● autosafe</span></div><div class="clinical-work-list">${active.map(visitCard).join('') || '<div class="core-empty">Нет активных ветеринарных приёмов.</div>'}</div>`);
    const history = panel('encounter', 'clinical-history', `<div class="core-head"><div><p class="core-kicker">НЕИЗМЕНЯЕМАЯ ИСТОРИЯ</p><h2>Каждое решение можно объяснить.</h2></div><span class="queue-number">${signed.length}</span></div><div class="clinical-history-list">${signed.map(visitCard).join('') || '<div class="core-empty">Подписанных приёмов пока нет.</div>'}</div>`);
    const planItems = clinical.visits.flatMap((visit) => (visit.followUps || []).map((task) => ({ ...task, pet: visit.pet?.name, owner: visit.owner?.fullName })));
    const plans = panel('plan', 'clinical-plan', `<div class="core-head"><div><p class="core-kicker">КОНТРОЛЬ ПОСЛЕ ВИЗИТА</p><h2>Никто не остаётся один на один с рекомендациями.</h2></div><span class="queue-number">${planItems.length}</span></div><div class="clinical-plan-grid">${planItems.map((item) => `<article><span>${esc(item.state)}</span><h3>${esc(item.pet)}</h3><p>${esc(item.title)} · ${esc(item.owner)}</p><time>${when(item.dueAt)}</time></article>`).join('') || '<div class="core-empty">Контрольные действия появятся из подписанного плана.</div>'}</div>`);
    board.insertAdjacentHTML('beforeend', hero + work + history + plans); bind(board); window.dispatchEvent(new CustomEvent('vetsvet:data-ready', { detail: { role: clinical.role } }));
  }

  const payload = (form) => { const values = new FormData(form); const medicationName = String(values.get('medicationName') || '').trim(); const procedureName = String(values.get('procedure') || '').trim(); return { expectedVersion: Number(form.dataset.version), complaint: values.get('complaint'), vitals: { temperature: values.get('temperature'), weightKg: values.get('weightKg'), pulse: values.get('pulse'), respiration: values.get('respiration') }, subjective: values.get('subjective'), objective: values.get('objective'), diagnoses: [{ display: values.get('diagnosis'), diagnosisType: 'WORKING', certainty: values.get('certainty') }], assessment: values.get('assessment'), plan: values.get('plan'), procedures: procedureName ? [{ display: procedureName, quantityMilli: 1000, unitPriceMinor: Math.round(Number(values.get('procedurePrice') || 0) * 100) }] : [], prescriptions: medicationName ? [{ medicationName, instructions: values.get('instructions'), durationDays: Number(values.get('durationDays') || 0) }] : [], dischargeSummary: values.get('dischargeSummary'), followUpAt: values.get('followUpAt') || undefined }; };
  async function reload() { clinical = await api('/api/v1/staff/clinical/workspace'); render(); }
  function bind(root) {
    root.querySelectorAll('[data-clinical-start]').forEach((form) => form.onsubmit = async (event) => { event.preventDefault(); const button = form.querySelector('button'); button.disabled = true; try { await api('/api/v1/staff/clinical/drafts', 'POST', { appointmentId: form.dataset.clinicalStart, complaint: new FormData(form).get('complaint') }); await reload(); } catch (error) { alert(error.message); button.disabled = false; } });
    root.querySelectorAll('.clinical-editor').forEach((form) => {
      const save = async (finalize) => { const status = form.querySelector('[data-save-state]'); status.textContent = finalize ? 'Проверяем полноту и подписываем…' : 'Сохраняем в PostgreSQL…'; form.querySelectorAll('button').forEach((button) => button.disabled = true); try { await api(`/api/v1/staff/clinical/encounters/${encodeURIComponent(form.dataset.encounter)}`, 'PATCH', { action: finalize ? 'FINALIZE' : 'SAVE', ...payload(form) }); await reload(); } catch (error) { if (error.code === 'CLINICAL_RECORD_INCOMPLETE') alert(`Заполните: ${(error.details.missing || []).join(', ')}`); else if (error.code === 'CLINICAL_RECORD_CONFLICT') { alert('Запись уже изменилась в другой вкладке. Загружаю актуальную версию.'); await reload(); } else alert(error.message); status.textContent = 'Не сохранено'; form.querySelectorAll('button').forEach((button) => button.disabled = false); } };
      form.querySelector('[data-clinical-save]').onclick = () => save(false); form.onsubmit = (event) => { event.preventDefault(); if (confirm('Подписать запись? После этого изменить её можно только новой поправкой с причиной.')) save(true); };
    });
    root.querySelectorAll('[data-clinical-amend]').forEach((button) => button.onclick = async () => { const reason = prompt('Почему требуется поправка? Причина сохранится в аудите.'); if (!reason || reason.trim().length < 10) return; button.disabled = true; try { await api(`/api/v1/staff/clinical/encounters/${encodeURIComponent(button.dataset.clinicalAmend)}`, 'PATCH', { action: 'AMEND', reason }); await reload(); location.hash = '#/clinical/workspace'; } catch (error) { alert(error.message); button.disabled = false; } });
  }
  window.addEventListener('vetsvet:workspace-data', () => reload().catch((error) => console.error('clinical workspace', error)));
  window.addEventListener('hashchange', () => requestAnimationFrame(render));
  if (window.vetsvetWorkspaceData) reload().catch((error) => console.error('clinical workspace', error));
})();
