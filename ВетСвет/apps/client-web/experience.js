const experienceEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

async function showGroomingReports() {
  const meResponse = await fetch('/api/v1/auth/me');
  if (!meResponse.ok) return;
  const account = (await meResponse.json()).account;
  if (account.mode !== 'CLIENT' || !account.owner) return;
  const dashboardResponse = await fetch(`/api/v1/client/owners/${encodeURIComponent(account.owner.id)}/dashboard`);
  if (!dashboardResponse.ok) return;
  const dashboard = await dashboardResponse.json();
  const reports = (dashboard.pets ?? []).flatMap((pet) => (pet.appointments ?? [])
    .filter((appointment) => appointment.grooming?.state === 'COMPLETE' && appointment.grooming.report)
    .map((appointment) => ({ pet, appointment })));
  if (!reports.length || document.querySelector('#grooming-reports')) return;
  const section = document.createElement('section');
  section.id = 'grooming-reports';
  section.className = 'timeline';
  section.style.marginTop = '14px';
  section.innerHTML = `<div class="timeline-head"><h2>Отчёты об уходе</h2><span style="font-size:12px;color:var(--muted)">важное остаётся с вами</span></div><div style="display:grid;gap:10px;padding:16px 0">${reports.map(({ pet, appointment }) => `<article style="padding:14px;border:1px solid var(--line);border-radius:14px;background:#fff"><p class="eyebrow" style="margin-bottom:8px">${experienceEscape(pet.name)} · ${experienceEscape(appointment.service)}</p><p style="margin:0;line-height:1.5">${experienceEscape(appointment.grooming.report)}</p><small style="display:block;margin-top:10px;color:var(--muted)">${appointment.grooming.completedAt ? new Date(appointment.grooming.completedAt).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}) : 'Отчёт готов'}</small></article>`).join('')}</div>`;
  document.querySelector('.urgent')?.before(section);
}

setTimeout(() => showGroomingReports().catch(() => {}), 450);
