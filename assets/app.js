/* 사용자 동작 연결 */
function open(type, extra = {}) { UI.modal = { type, ...extra }; render(); document.querySelector('.sheet input, .sheet select, .sheet textarea, .sheet button')?.focus(); }
const close = () => { UI.modal = null; render(); };
const formData = name => Object.fromEntries(new FormData(document.querySelector(`[data-form="${name}"]`)).entries());

const ACT = {
  home() { UI.view = 'home'; render(); },
  open(d) { S.curId = d.id; UI.view = 'trip'; UI.tab = 'overview'; UI.undo = []; save(); render(); },
  delTrip(d) { const t = S.trips.find(x => x.id === d.id); if (t) open('confirm', { id: t.id, name: t.name }); },
  confirmDel(d) { UI.modal = null; S.trips = S.trips.filter(x => x.id !== d.id); if (S.curId === d.id) S.curId = null; save(); render(); toast('여행을 삭제했습니다'); },
  newBlank() { addTrip(makeTrip('새 여행', [])); },
  useTpl(d) { const tp = TEMPLATES.find(x => x.id === d.id); addTrip(makeTrip(tp.name, tp.stops, { type: tp.types[0], startDate: nextMonthDate(tp.months) })); },
  useProposal(d) { const p = UI.modal.results[+d.id], f = UI.modal.form || {}; UI.modal = null; addTrip(makeTrip(p.name, p.stops, { startDate: f.date, adults: +f.adults || 2, type: f.type })); },
  openSurvey() { open('survey'); },
  surveyRule() { const f = readSurvey(); UI.modal = { ...UI.modal, form: f, results: ruleProposals(f), error: '' }; render(); },
  async surveyAi() { const f = readSurvey(); UI.busy = true; UI.modal = { ...UI.modal, form: f, error: '' }; render(); try { UI.modal.results = await aiProposals(f); } catch (e) { UI.modal.error = e.message; } UI.busy = false; render(); },
  settings() { open('settings'); },
  closeModal: close,
  closeModalBg(d, el, ev) { if (ev.target === el) close(); },
  tab(d) { UI.tab = d.id; UI.modal = null; document.querySelector('.work')?.scrollTo(0, 0); render(); document.querySelector('.work')?.scrollTo(0, 0); },
  jump(d) { if (d.tab === 'guide') { ACT.guide({ id: d.day }); return; } if (d.day !== '') UI.day = +d.day; UI.tab = d.tab; render(); },
  day(d) { UI.day = +d.id; render(); },
  undo,
  adults(d) { commit(t => { t.adults = clamp(t.adults + +d.d, 1, 12); }); },
  addCity(d) { open('city', { at: +d.at, q: '' }); },
  pickCity(d) { const at = UI.modal.at; UI.modal = null; commit(t => { t.stops.splice(at, 0, newStop(d.id)); refreshLegs(t); }, '도시 추가'); },
  nights(d) { commit(t => { const s = t.stops.find(x => x.id === d.id); s.nights = clamp(s.nights + +d.d, 0, 30); }, '체류 변경'); },
  moveStop(d) { commit(t => { const i = t.stops.findIndex(x => x.id === d.id), j = i + +d.d; if (j < 0 || j >= t.stops.length) return; [t.stops[i], t.stops[j]] = [t.stops[j], t.stops[i]]; refreshLegs(t); }, '순서 변경'); },
  delStop(d) { commit(t => { t.items = t.items.filter(i => i.stopId !== d.id); t.stops = t.stops.filter(x => x.id !== d.id); refreshLegs(t); }, '도시 삭제'); toast('도시를 삭제했습니다. 되돌리기로 복구할 수 있습니다'); },
  delStopModal(d) { UI.modal = null; ACT.delStop(d); },
  moveStopModal(d) { ACT.moveStop(d); },
  guide(d) { open('guide', { id: d.id, wide: true }); },
  editLeg(d) { open('leg', { id: d.id }); },
  editFlight() { open('flight'); },
  saveLeg(d) { const f = formData('leg'); UI.modal = null; commit(t => { const l = t.stops.find(x => x.id === d.id).leg; l.mode = f.mode; l.dep = toMin(f.dep); l.mins = +f.mins || l.mins; l.fare = +f.fare || 0; l.price = +f.price || 0; l.booked = f.booked === 'on'; l.known = true; }, '이동 수정'); },
  saveFlight() { const f = formData('flight'); UI.modal = null; commit(t => { const o = t.flights.out, b = t.flights.back; o.arr = toMin(f.arr); o.price = +f.outPrice || 0; o.note = f.outNote; o.booked = f.outBooked === 'on'; b.dep = toMin(f.dep); b.price = +f.backPrice || 0; b.note = f.backNote; b.booked = f.backBooked === 'on'; }, '항공 수정'); },
  autofill() { let n = 0; commit(t => { n = autofill(t); }, '일정 채우기'); UI.tab = 'schedule'; render(); toast(n ? `일정 ${n}개를 채웠습니다` : '채울 빈 날이 없습니다'); },
  addItem(d) { open('item', { isNew: true, day: +d.day, draft: { title: '', start: +(d.start || 600), dur: 60, type: 'sight', cost: 0, note: '' } }); },
  addPlace(d) { const p = findPlace(d.id); commit(t => { const stop = t.stops.find(x => x.id === d.stop), st = stopStarts(t)[t.stops.indexOf(stop)]; let off = stop.nights && stop !== t.stops[0] ? 1 : 0, start = 600; for (let o = 0; o <= stop.nights; o++) { const load = blocksOf(t, st + o).reduce((a, b) => a + b.dur, 0); if (load < 420) { off = o; const b = blocksOf(t, st + o).at(-1); start = b ? b.start + b.dur + 30 : 570; break; } } t.items.push({ id: uid('i'), stopId: stop.id, off, start: Math.min(Math.round(start / 15) * 15, 1320), dur: p.mins, title: p.name, type: p.type, placeId: p.id, lat: p.lat, lon: p.lon, cost: 0, note: '', booked: false }); }, '장소 추가'); toast(`${p.name}을 일정에 넣었습니다`); },
  saveItem() {
    const f = formData('item'), m = UI.modal, picked = f.place ? findPlace(f.place) : null;
    const title = (f.title || '').trim() || picked?.name; if (!title) { toast('제목을 입력하세요'); return; }
    UI.modal = null;
    commit(t => {
      let it = m.isNew ? { id: uid('i') } : t.items.find(i => i.id === m.id);
      Object.assign(it, { title, type: picked?.type || f.type, dur: +f.dur || picked?.mins || 60, cost: +f.cost || 0, note: f.note });
      if (picked) Object.assign(it, { placeId: picked.id, lat: picked.lat, lon: picked.lon, dur: m.isNew && +f.dur === 60 ? picked.mins : it.dur });
      placeItem(t, it, +f.day, toMin(f.start)); if (m.isNew) t.items.push(it);
    }, '일정 저장');
  },
  delItem(d) { UI.modal = null; commit(t => { t.items = t.items.filter(i => i.id !== d.id); }, '일정 삭제'); },
  mapDay(d) { UI.mapDay += +d.d; UI.replay = null; render(); },
  replayStep(d) { UI.replay = +d.id; render(); },
  playTrip() { const t = trip(), n = dayCount(t); clearInterval(UI.timer); UI.playing = true; UI.mapDay = 0; const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; UI.timer = setInterval(() => { UI.mapDay++; if (UI.mapDay >= n) { UI.mapDay = n - 1; UI.playing = false; clearInterval(UI.timer); } render(); }, reduce ? 2000 : 900); render(); },
  pickHood(d) { commit(t => { const s = t.stops.find(x => x.id === d.id); s.hotel.area = s.hotel.area === d.v ? '' : d.v; }); },
  addTask() { open('task'); },
  saveTask() { const f = formData('task'); if (!f.title.trim()) { toast('할 일을 입력하세요'); return; } UI.modal = null; commit(t => { t.custom = t.custom || []; t.custom.push({ id: uid('c'), title: f.title.trim(), due: f.due || addDays(today(), 7) }); }, '할 일 추가'); },
  ics() { const t = trip(); download(`${t.name}.ics`, icsOf(t), 'text/calendar'); toast('캘린더 파일을 내려받았습니다'); },
  print() { window.print(); },
  async share() { open('share'); const url = location.href.split('#')[0] + '#t=' + await packTrip(trip()); UI.modal.url = url; render(); },
  async copyShare() { try { await navigator.clipboard.writeText(UI.modal.url); toast('링크를 복사했습니다'); } catch (e) { document.getElementById('shareUrl')?.select(); toast('링크를 선택했습니다. 직접 복사하세요'); } },
  exportJson() { const t = trip(); download(`${t.name}.json`, JSON.stringify(t, null, 1), 'application/json'); },
  acceptImport() { const t = UI.modal.trip; UI.modal = null; history.replaceState(null, '', location.pathname + location.search); addTrip(t); },
  toggleChat() { UI.chatOpen = !UI.chatOpen; render(); document.querySelector('.composer textarea')?.focus(); },
  hint(d) { sendChat(d.v); },
  async openFile(d) { const f = (await allFiles()).find(x => x.id === d.id); if (f) window.open(URL.createObjectURL(f.blob), '_blank', 'noopener'); },
  async delFile(d) { await delFile(d.id); await refreshFiles(); toast('파일을 삭제했습니다'); },
  async readFile(d) { const f = (await allFiles()).find(x => x.id === d.id); if (!f) return; toast('파일을 읽는 중입니다'); try { const file = new File([f.blob], f.name, { type: f.type }); const t = trip(), before = JSON.stringify(t); const r = await readBookings([file], t); UI.undo.push({ id: t.id, snap: before, label: '파일 반영' }); save(); render(); toast(`${r.count}건을 반영했습니다`); } catch (e) { toast(e.message); } }
};
function readSurvey() { const f = formData('survey'); return { date: f.date, nights: clamp(+f.nights || 10, 3, 40), adults: clamp(+f.adults || 2, 1, 12), type: f.type, wish: (f.wish || '').slice(0, 300) }; }
async function refreshFiles() { try { UI.files = await allFiles(); } catch (e) { UI.files = []; toast('이 브라우저에서는 파일 저장을 쓸 수 없습니다'); } render(); }

const CHG = {
  tripName(v) { commit(t => { t.name = v.trim().slice(0, 60) || '새 여행'; }); },
  startDate(v) { if (v) commit(t => { t.startDate = v; }, '출발일 변경'); },
  taskDone(v, d, el) {
    const on = el.checked;
    commit(t => {
      t.done[d.key] = on;
      if (d.key === 'flight') { t.flights.out.booked = on; t.flights.back.booked = on; }
      if (d.edit === 'hotel') t.stops.find(s => 'hotel-' + s.id === d.key).hotel.booked = on;
      if (d.edit === 'leg') t.stops.find(s => s.id === d.leg).leg.booked = on;
      if (d.edit === 'item') { const i = t.items.find(x => x.id === d.item); if (i) i.booked = on; }
    });
  },
  hotel(v, d) { commit(t => { const s = t.stops.find(x => x.id === d.id); s.hotel[d.f] = d.f === 'perNight' ? (+v || 0) : v.slice(0, 80); }); },
  hotelBooked(v, d, el) { commit(t => { t.stops.find(x => x.id === d.id).hotel.booked = el.checked; }); },
  legInPass(v, d, el) { commit(t => { t.stops.find(x => x.id === d.id).leg.inPass = el.checked; }); },
  legFare(v, d) { commit(t => { t.stops.find(x => x.id === d.id).leg.farePass = +v || 0; }); },
  passPrice(v, d) { S.settings.passes[d.id] = +v || 0; save(); render(); },
  cityFare(v, d) { S.settings.cityPasses[d.id] = { ...(S.settings.cityPasses[d.id] || {}), [d.f]: +v || 0 }; save(); render(); },
  extra(v, d) { commit(t => { t.extras[d.f] = +v || 0; }); },
  flightDefault(v) { S.settings.flightDefault = +v || 0; save(); render(); },
  rate(v, d) { S.settings.rates[d.id] = +v || 1; save(); render(); },
  apiKey(v) { S.settings.key = v.trim(); save(); toast(v ? 'API 키를 저장했습니다' : 'API 키를 지웠습니다'); },
  model(v) { S.settings.model = v; save(); },
  tokenCap(v) { S.settings.tokenCap = +v || 0; save(); },
  async addFiles(v, d, el) { const t = trip(); for (const f of el.files) { if (f.size > 30 * 1024 * 1024) { toast(`${f.name}은 30MB를 넘어 저장하지 않았습니다`); continue; } await putFile({ id: uid('f'), tripId: t.id, name: f.name, type: f.type, size: f.size, blob: f, added: Date.now() }); } await refreshFiles(); toast('파일을 저장했습니다'); },
  async importJson(v, d, el) { try { const t = sanitizeTrip(JSON.parse(await el.files[0].text())); open('import', { trip: t }); } catch (e) { toast('여행 파일을 읽지 못했습니다'); } },
  async aiFiles(v, d, el) { try { toast('예약 파일을 읽는 중입니다'); const r = await readBookings([...el.files]); if (!r.trip.stops.length) { toast('숙소 정보에서 도시를 찾지 못했습니다'); return; } addTrip(r.trip); toast(`${r.count}건을 반영했습니다`); } catch (e) { toast(e.message); } }
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (el && ACT[el.dataset.act]) { if (el.tagName === 'BUTTON' && el.closest('form')) ev.preventDefault(); ACT[el.dataset.act](el.dataset, el, ev); return; }
  const body = ev.target.closest('.day-body');
  if (body && !ev.target.closest('.blk') && !dragMoved) { const r = body.getBoundingClientRect(), m = Math.round((ev.clientY - r.top) / 15) * 15 + HOUR_FROM * 60; ACT.addItem({ day: body.dataset.slot, start: clamp(m, 360, 1380) }); }
});
document.addEventListener('change', ev => { const el = ev.target.closest('[data-chg]'); if (el && CHG[el.dataset.chg]) { UI.deferRender = true; CHG[el.dataset.chg](el.value, el.dataset, el); UI.deferRender = false; } });
document.addEventListener('input', ev => { if (ev.target.dataset.input === 'citySearch') { UI.modal.q = ev.target.value; const pos = ev.target.selectionStart; render(); const i = document.querySelector('.search'); i.focus(); i.setSelectionRange(pos, pos); } });
document.addEventListener('submit', ev => { ev.preventDefault(); if (ev.target.dataset.form === 'chat') { const a = ev.target.querySelector('textarea'), v = a.value.trim(); if (v) { a.value = ''; sendChat(v); } } });
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && UI.modal) close();
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'z' && !ev.target.matches('input,textarea')) { ev.preventDefault(); undo(); }
  if (ev.key === 'Enter' && !ev.shiftKey && ev.target.matches('.composer textarea') && !ev.isComposing) { ev.preventDefault(); ev.target.form.requestSubmit(); }
});

/* 일정 칸 끌기 */
let drag = null, dragMoved = false;
document.addEventListener('pointerdown', ev => {
  const b = ev.target.closest('.blk'); dragMoved = false; if (!b || ev.button) return;
  const r = b.getBoundingClientRect();
  drag = { el: b, id: b.dataset.blk, kind: b.dataset.kind, sx: ev.clientX, sy: ev.clientY, oy: ev.clientY - r.top, ptr: ev.pointerId, touch: ev.pointerType === 'touch' };
});
document.addEventListener('pointermove', ev => {
  if (!drag || drag.touch) return;
  const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
  if (!dragMoved && Math.hypot(dx, dy) < 6) return;
  dragMoved = true; drag.el.classList.add('drag'); drag.el.style.transform = `translate(${dx}px,${dy}px)`;
});
document.addEventListener('pointerup', ev => {
  if (!drag) return; const d = drag; drag = null;
  if (!dragMoved) { openBlock(d); return; }
  d.el.style.visibility = 'hidden';
  const body = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.day-body'); d.el.style.visibility = '';
  if (!body) { render(); return; }
  const r = body.getBoundingClientRect(), start = clamp(Math.round((ev.clientY - d.oy - r.top) / 15) * 15 + HOUR_FROM * 60, 360, 1395), day = +body.dataset.slot;
  commit(t => {
    if (d.kind === 'item') { const it = t.items.find(i => i.id === d.id); if (it) placeItem(t, it, day, start); }
    if (d.kind === 'leg') { const s = t.stops.find(x => 'leg-' + x.id === d.id); if (s) s.leg.dep = start; }
    if (d.id === 'arr') t.flights.out.arr = start;
    if (d.id === 'dep') t.flights.back.dep = start + 180;
  }, '일정 이동');
  setTimeout(() => { dragMoved = false; }, 0);
});
function openBlock(d) {
  if (d.kind === 'item') open('item', { id: d.id });
  else if (d.kind === 'leg') open('leg', { id: d.id.replace('leg-', '') });
  else open('flight');
}
/* 키보드로 칸 열기 */
document.addEventListener('keydown', ev => { const b = ev.target.closest?.('.blk'); if (b && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openBlock({ id: b.dataset.blk, kind: b.dataset.kind }); } });

/* 노선 끌어서 순서 바꾸기 */
document.addEventListener('dragstart', ev => { const li = ev.target.closest?.('.station'); if (li) { ev.dataTransfer.setData('text/plain', li.dataset.stop); ev.dataTransfer.effectAllowed = 'move'; } });
document.addEventListener('dragover', ev => { if (ev.target.closest?.('.station')) ev.preventDefault(); });
document.addEventListener('drop', ev => { const li = ev.target.closest?.('.station'); if (!li) return; ev.preventDefault(); const from = ev.dataTransfer.getData('text/plain'); if (from && from !== li.dataset.stop) commit(t => { const a = t.stops.findIndex(s => s.id === from), b = t.stops.findIndex(s => s.id === li.dataset.stop), [m] = t.stops.splice(a, 1); t.stops.splice(b, 0, m); refreshLegs(t); }, '순서 변경'); });

async function boot() {
  load();
  if (S.curId && trip() && !location.hash) UI.view = 'home';
  render();
  const m = location.hash.match(/^#t=(.+)$/);
  if (m) { try { open('import', { trip: sanitizeTrip(await unpackTrip(m[1])) }); } catch (e) { toast('공유 링크를 읽지 못했습니다'); } }
}
addEventListener('resize', () => { clearTimeout(UI.rs); UI.rs = setTimeout(() => { if (!document.activeElement?.matches('input,textarea')) render(); }, 200); });
boot();
