/* 저장, 날짜 계산, 일정 검사, 비용 계산. 화면 코드는 views.js에 있습니다. */
const KEY = 'nextstop.v1';
const S = { trips: [], curId: null, settings: { rates: { ...DEFAULT_RATES }, passes: {}, cityPasses: {}, model: 'claude-haiku-5-5', tokenCap: 200000, usage: { month: '', input: 0, output: 0 }, flightDefault: 1200000 }, seen: {} };
const UI = { tab: 'overview', view: 'home', day: 0, modal: null, chatOpen: false, chat: [], busy: false, undo: [], guideCity: null, mapDay: 0, replay: null, proposals: null, railOpen: true };

const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      S.trips = d.trips || []; S.curId = d.curId || null;
      S.settings = { ...S.settings, ...d.settings, rates: { ...DEFAULT_RATES, ...(d.settings?.rates || {}) } };
    }
  } catch (e) { console.warn('저장된 여행을 읽지 못했습니다', e); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify({ trips: S.trips, curId: S.curId, settings: S.settings })); return true; } catch (e) { toast('브라우저 저장 공간이 부족해 저장하지 못했습니다'); return false; } }
const trip = () => S.trips.find(t => t.id === S.curId) || null;

function commit(fn, label) {
  const t = trip();
  if (t) { UI.undo.push({ id: t.id, snap: JSON.stringify(t), label }); if (UI.undo.length > 40) UI.undo.shift(); }
  fn(t); if (t) t.updated = Date.now();
  save(); render();
}
function undo() {
  const u = UI.undo.pop(); if (!u) return;
  const i = S.trips.findIndex(t => t.id === u.id);
  if (i >= 0) S.trips[i] = JSON.parse(u.snap);
  save(); render(); toast('되돌렸습니다' + (u.label ? ': ' + u.label : ''));
}

/* 날짜 */
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const fmtDate = (iso, wd = true) => { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); return `${d.getMonth() + 1}/${d.getDate()}` + (wd ? `(${WD[d.getDay()]})` : ''); };
const dow = iso => new Date(iso + 'T12:00:00').getDay();
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = s => { const [a, b] = String(s).split(':').map(Number); return (a || 0) * 60 + (b || 0); };
const dur = m => (m >= 60 ? Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '') : m + '분');
const won = n => Math.round(n / 1000) * 1000;
const fmtWon = n => won(n).toLocaleString('ko-KR') + '원';

/* 거리와 구간 */
function km(a, b) {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function estimateLeg(aId, bId) {
  const seg = SEGMENTS.find(s => (s[0] === aId && s[1] === bId) || (s[1] === aId && s[0] === bId));
  if (seg) return { mode: seg[2], mins: seg[3], fare: seg[4], known: true };
  const a = CITIES[aId], b = CITIES[bId], d = km(a, b);
  if (d > 550 || a.id === 'santorini' || b.id === 'santorini' || a.cc === 'IS' || b.cc === 'IS') return { mode: 'flight', mins: Math.round(70 + d / 11), fare: Math.round(60 + d * .05), known: false };
  return { mode: 'train', mins: Math.round((d * 1.3 / 95 * 60 + 25) / 5) * 5, fare: Math.round(d * .17 + 8), known: false };
}
function legRule(a, b, mode) {
  if (mode === 'flight') return { op: '항공 비교 검색', url: `https://www.skyscanner.co.kr/transport/flights/${a.iata.toLowerCase()}/${b.iata.toLowerCase()}/`, best: 60, note: '수하물 포함 가격으로 비교' };
  if (mode === 'bus') return { op: 'FlixBus 등', url: 'https://www.flixbus.co.kr/', best: 21, note: '짐 규정 확인' };
  if (mode === 'ferry') return { op: '페리 운영사', url: 'https://www.ferryhopper.com/', best: 21, note: '날씨에 따라 결항 가능' };
  if (mode === 'car') return { op: '렌터카 또는 전용 차량', url: 'https://www.rentalcars.com/', best: 45, note: '국경 통과와 주차 조건 확인' };
  return LEG_OVERRIDES[`${a.id}|${b.id}`] || LEG_OVERRIDES[`${b.id}|${a.id}`] || RAIL_RULES[a.cc] || RAIL_RULES._;
}

/* 여행 만들기 */
function newStop(cityId, nights) {
  const c = CITIES[cityId];
  return { id: uid('s'), cityId, nights: nights ?? c.ideal, hotel: { name: '', area: '', perNight: 0, booked: false }, leg: null };
}
function refreshLegs(t) {
  t.stops.forEach((s, i) => {
    const next = t.stops[i + 1];
    if (!next) { s.leg = null; return; }
    if (!s.leg || s.leg.to !== next.cityId) {
      const e = estimateLeg(s.cityId, next.cityId);
      s.leg = { to: next.cityId, mode: e.mode, mins: e.mins, fare: e.fare, known: e.known, dep: 600, price: 0, booked: false };
    }
  });
}
function nextMonthDate(months) {
  const base = new Date(addDays(today(), 60) + 'T12:00:00');
  for (let i = 0; i < 14; i++) { const d = new Date(base.getFullYear(), base.getMonth() + i, 12); if (months.includes(d.getMonth() + 1) && d >= base) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-12`; }
  return addDays(today(), 120);
}
function makeTrip(name, stopsSpec, opts = {}) {
  const start = opts.startDate || addDays(today(), 120);
  const t = { id: uid('t'), name, startDate: start, adults: opts.adults || 2, type: opts.type || 'any', from: 'ICN',
    stops: stopsSpec.map(([c, n]) => newStop(c, n)), items: [], done: {}, custom: [], flights: { out: { dep: 600, arr: 960, price: 0, booked: false, note: '' }, back: { dep: 1140, price: 0, booked: false, note: '' } }, extras: { food: null, local: null }, updated: Date.now() };
  refreshLegs(t); return t;
}
function addTrip(t) { S.trips.unshift(t); S.curId = t.id; UI.view = 'trip'; UI.tab = 'overview'; UI.day = 0; UI.undo = []; save(); render(); }

/* 일정 틀 */
function stopStarts(t) { let d = 0; return t.stops.map(s => { const r = d; d += s.nights; return r; }); }
const totalNights = t => t.stops.reduce((a, s) => a + s.nights, 0);
const dayCount = t => totalNights(t) + 1;
const endDate = t => addDays(t.startDate, totalNights(t));
function daysOf(t) {
  const starts = stopStarts(t), out = [];
  for (let i = 0; i < dayCount(t); i++) {
    const here = t.stops.filter((s, k) => i >= starts[k] && i <= starts[k] + s.nights);
    out.push({ i, date: addDays(t.startDate, i), stops: here, primary: here[here.length - 1] || null });
  }
  return out;
}
function itemDay(t, it) {
  const k = t.stops.findIndex(s => s.id === it.stopId); if (k < 0) return 0;
  const st = stopStarts(t)[k]; return st + clamp(it.off || 0, 0, t.stops[k].nights);
}
function placeItem(t, it, day, start) {
  const starts = stopStarts(t); const d = daysOf(t)[clamp(day, 0, dayCount(t) - 1)];
  let stop = d.primary;
  if (d.stops.length > 1) { const prev = d.stops[0]; if (prev.leg && start < prev.leg.dep) stop = prev; }
  if (!stop) return; it.stopId = stop.id; it.off = d.i - starts[t.stops.indexOf(stop)]; it.start = start;
}
/* 하루 블록: 저장된 일정 + 항공·도시 이동 자동 블록 */
function blocksOf(t, day) {
  const res = t.items.filter(it => itemDay(t, it) === day).map(it => ({ ...it, kind: 'item' }));
  const starts = stopStarts(t);
  t.stops.forEach((s, k) => {
    if (s.leg && starts[k] + s.nights === day) res.push({ id: 'leg-' + s.id, kind: 'leg', stopId: s.id, title: `${CITIES[s.leg.to].ko}행 ${MODES[s.leg.mode]}`, start: s.leg.dep, dur: s.leg.mins, type: 'move', sub: `${CITIES[s.cityId].ko} 출발, ${dur(s.leg.mins)}` });
  });
  if (day === 0 && t.stops[0]) res.push({ id: 'arr', kind: 'flight', title: `${CITIES[t.stops[0].cityId].ko} 도착`, start: t.flights.out.arr, dur: 60, type: 'move', sub: '입국 후 숙소 이동' });
  if (day === dayCount(t) - 1 && t.stops.length) res.push({ id: 'dep', kind: 'flight', title: `${CITIES[t.stops[t.stops.length - 1].cityId].ko} 귀국편`, start: Math.max(0, t.flights.back.dep - 180), dur: 180, type: 'move', sub: '공항 이동과 수속' });
  return res.sort((a, b) => a.start - b.start);
}
const walkMinutes = d => Math.round(d * 1.3 / 4.5 * 60);
const moveMinutes = d => d < 1.2 ? walkMinutes(d) : Math.round(12 + d * 1.3 / 20 * 60);

/* 일정 자동 채우기: AI 없이 쓰는 규칙 기반 */
function autofill(t) {
  const starts = stopStarts(t); const made = [];
  t.stops.forEach((s, k) => {
    const c = CITIES[s.cityId], used = new Set(t.items.filter(i => i.placeId).map(i => i.placeId));
    const list = c.places.filter(p => !used.has(p.id) && p.mins <= 420).slice();
    for (let off = 0; off <= s.nights; off++) {
      const day = starts[k] + off;
      if (off === s.nights && k < t.stops.length - 1) continue;
      if (day === dayCount(t) - 1) continue;
      let clock = (day === 0) ? t.flights.out.arr + 90 : (off === 0 && k > 0 ? t.stops[k - 1].leg.dep + t.stops[k - 1].leg.mins + 75 : 570);
      if (t.items.some(i => itemDay(t, i) === day)) continue;
      const date = addDays(t.startDate, day);
      let lunch = false, last = null;
      while (clock < 1140 && list.length) {
        if (!lunch && clock >= 720 && clock < 870) { made.push({ id: uid('i'), stopId: s.id, off, start: clock, dur: 60, title: '점심', type: 'food', cost: 0, note: '' }); clock += 75; lunch = true; continue; }
        list.sort((p, q) => (last ? km(last, p) - km(last, q) : 0));
        const evening = p => /일몰|야경|저녁/.test(p.name);
        if (clock < 1020 && list.length && list.every(evening)) clock = 1020;
        const idx = list.findIndex(p => !p.closed.includes(dow(date)) && (clock >= 1020 || !evening(p)) && clock + (last ? moveMinutes(km(last, p)) : 0) + p.mins <= 1230);
        if (idx < 0) break;
        const p = list.splice(idx, 1)[0];
        if (last) clock += moveMinutes(km(last, p));
        clock = Math.ceil(clock / 15) * 15;
        made.push({ id: uid('i'), stopId: s.id, off, start: clock, dur: p.mins, title: p.name, type: p.type, placeId: p.id, lat: p.lat, lon: p.lon, cost: 0, note: '', booked: false });
        clock += p.mins + 15; last = p;
      }
    }
  });
  t.items.push(...made); return made.length;
}
function findPlace(id) { const c = CITIES[String(id).split('-')[0]]; return c ? c.places.find(p => p.id === id) : null; }

/* 일정 검사 */
function checkTrip(t) {
  const out = [], push = (level, text, tab, day) => out.push({ level, text, tab, day });
  if (!t.stops.length) return [{ level: 'info', text: '왼쪽 노선에 첫 도시를 추가하세요', tab: 'overview' }];
  const days = daysOf(t), m = new Date(t.startDate + 'T12:00:00').getMonth();
  t.stops.forEach(s => {
    const c = CITIES[s.cityId];
    if (s.nights < c.min) push('warn', `${c.ko} ${s.nights}박은 짧습니다. 권장 ${c.min}박 이상`, 'guide', s.id);
    if (+c.season[m] <= 2) push('warn', `${c.ko}의 ${m + 1}월은 추천도가 낮습니다(${SEASON_WORDS[+c.season[m]]})`, 'guide', s.id);
    if (s.leg && s.leg.mins > 480 && s.leg.mode !== 'flight') push('warn', `${c.ko}에서 ${CITIES[s.leg.to].ko}까지 ${dur(s.leg.mins)}. 항공이나 야간 이동을 비교하세요`, 'transport');
  });
  days.forEach(d => {
    const b = blocksOf(t, d.i);
    for (let i = 1; i < b.length; i++) {
      const p = b[i - 1], q = b[i], gap = q.start - (p.start + p.dur);
      if (gap < 0) { push('alert', `${fmtDate(d.date)} ${p.title}와 ${q.title} 시간이 겹칩니다`, 'schedule', d.i); continue; }
      if (p.lat && q.lat) { const need = moveMinutes(km(p, q)); if (need > gap + 5) push('warn', `${fmtDate(d.date)} ${p.title}에서 ${q.title}까지 약 ${dur(need)} 필요, 여유 ${gap}분`, 'schedule', d.i); }
    }
    const busy = b.filter(x => x.kind === 'item' && x.type !== 'food').reduce((a, x) => a + x.dur, 0);
    if (busy > 600) push('warn', `${fmtDate(d.date)} 관광 ${dur(busy)}로 하루가 빡빡합니다`, 'schedule', d.i);
    b.filter(x => x.placeId).forEach(x => { const p = findPlace(x.placeId); if (p && p.closed.includes(dow(d.date))) push('alert', `${fmtDate(d.date)} ${p.name}은 ${WD[dow(d.date)]}요일 휴무일 수 있습니다`, 'schedule', d.i); });
  });
  t.items.filter(it => { const k = t.stops.findIndex(s => s.id === it.stopId); return k >= 0 && (it.off || 0) > t.stops[k].nights; }).forEach(it => push('warn', `${it.title}이 체류 기간 밖에 있어 마지막 날로 옮겨 표시됩니다`, 'schedule'));
  return out.sort((a, b) => (a.level === 'alert' ? -1 : 0) - (b.level === 'alert' ? -1 : 0));
}

/* 예약 체크리스트 */
function tasksOf(t) {
  if (!t.stops.length) return [];
  const list = [], starts = stopStarts(t), first = CITIES[t.stops[0].cityId], last = CITIES[t.stops[t.stops.length - 1].cityId];
  const add = o => list.push({ ...o, due: addDays(o.at, -o.best), done: !!t.done[o.key] || !!o.bound });
  list.push({ key: 'flight', group: '항공', title: `인천에서 ${first.ko}, ${last.ko}에서 인천 항공권`, at: t.startDate, best: 150, due: addDays(t.startDate, -150), url: flightUrl(t), note: '입국과 출국 도시가 달라도 왕복처럼 비교할 수 있음', done: t.flights.out.booked && t.flights.back.booked, bound: true, edit: 'flight' });
  t.stops.forEach((s, k) => {
    const c = CITIES[s.cityId], a = addDays(t.startDate, starts[k]);
    add({ key: 'hotel-' + s.id, group: '숙소', title: `${c.ko} 숙소 ${s.nights}박`, at: a, best: c.cost >= 3 ? 120 : 75, url: hotelUrl(t, s, k), note: fmtDate(a) + ' 체크인', bound: s.hotel.booked, edit: 'hotel' });
    if (s.leg) {
      const b = CITIES[s.leg.to], r = legRule(c, b, s.leg.mode), when = addDays(t.startDate, starts[k] + s.nights);
      add({ key: 'leg-' + s.id, group: '도시 이동', title: `${c.ko}에서 ${b.ko}, ${MODES[s.leg.mode]}`, at: when, best: r.best, url: r.url, note: `${r.op}. ${r.note}`, bound: s.leg.booked, edit: 'leg', legId: s.id });
    }
  });
  t.items.filter(i => i.placeId).forEach(it => {
    const p = findPlace(it.placeId);
    if (p && p.book) add({ key: 'item-' + it.id, group: '입장권', title: p.name, at: addDays(t.startDate, itemDay(t, it)), best: p.book, url: p.url, note: `${fmtDate(addDays(t.startDate, itemDay(t, it)))} 방문`, bound: it.booked, edit: 'item', itemId: it.id });
  });
  CHECK_BASE.forEach(c => add({ key: 'base-' + c.key, group: '출발 준비', title: c.title, at: t.startDate, best: c.days, url: c.link, note: c.note }));
  if (t.stops.some(s => CITIES[s.cityId].cc === 'GB')) add({ key: 'base-eta', group: '출발 준비', title: '영국 전자여행허가(ETA) 신청', at: t.startDate, best: 21, url: 'https://www.gov.uk/eta', note: '영국 방문 일정이 있어 필요' });
  (t.custom || []).forEach(c => list.push({ key: c.id, group: '내가 추가', title: c.title, at: c.due, due: c.due, url: '', note: '', done: !!t.done[c.id], custom: true }));
  return list.sort((a, b) => a.due.localeCompare(b.due));
}
const flightUrl = t => { const a = CITIES[t.stops[0].cityId].iata, b = CITIES[t.stops[t.stops.length - 1].cityId].iata; return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ICN to ${a} on ${t.startDate} returning from ${b} to ICN on ${endDate(t)}`)}`; };
function hotelUrl(t, s, k) { const c = CITIES[s.cityId], st = stopStarts(t)[k ?? t.stops.indexOf(s)], a = addDays(t.startDate, st), b = addDays(a, s.nights); return `https://www.booking.com/searchresults.ko.html?ss=${encodeURIComponent(c.en)}&checkin=${a}&checkout=${b}&group_adults=${t.adults}&no_rooms=${Math.ceil(t.adults / 2)}`; }
const hotelUrl2 = (s) => `https://www.google.com/travel/search?q=${encodeURIComponent('hotels in ' + CITIES[s.cityId].en)}`;
const routeUrl = (a, b) => `https://www.rome2rio.com/s/${encodeURIComponent(a.en)}/${encodeURIComponent(b.en)}`;
function gmapsDay(points) {
  if (!points.length) return '';
  const p = points.map(x => `${x.lat},${x.lon}`), o = p[0], d = p[p.length - 1], w = p.slice(1, -1).slice(0, 8).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}${w ? '&waypoints=' + encodeURIComponent(w) : ''}&travelmode=transit`;
}

/* 비용: 1인 금액이 아니라 일행 전체 원화 */
const rate = c => S.settings.rates[c] || 1;
function costOf(t) {
  const n = dayCount(t), rooms = Math.ceil(t.adults / 2), eur = rate('EUR'), rows = [];
  const est = S.settings.flightDefault * t.adults, real = t.flights.out.price + t.flights.back.price;
  rows.push({ key: 'flight', name: '국제선 항공', est, real, note: `1인 ${fmtWon(S.settings.flightDefault)} 기준` });
  let hE = 0, hR = 0, lE = 0, lR = 0;
  t.stops.forEach(s => {
    const c = CITIES[s.cityId], perE = [0, 90, 130, 190][c.cost] * eur;
    hE += perE * s.nights * rooms; hR += (s.hotel.perNight || 0) * s.nights;
    if (s.leg) { lE += s.leg.fare * eur * t.adults; lR += s.leg.price || 0; }
  });
  rows.push({ key: 'hotel', name: '숙소', est: hE, real: hR, note: `객실 ${rooms}개, 도시 물가 기준` });
  rows.push({ key: 'legs', name: '도시 이동', est: lE, real: lR, note: '구간 참고 요금 기준' });
  const avgFood = t.stops.reduce((a, s) => a + [0, 30, 42, 55][CITIES[s.cityId].cost] * (s.nights || 1), 0) / Math.max(1, t.stops.reduce((a, s) => a + (s.nights || 1), 0));
  rows.push({ key: 'food', name: '식비', est: avgFood * eur * n * t.adults, real: t.extras.food || 0, note: '1인 하루 평균 약 ' + Math.round(avgFood) + '유로' });
  rows.push({ key: 'local', name: '시내 교통', est: 8 * eur * n * t.adults, real: t.extras.local || 0, note: '1인 하루 8유로 기준' });
  const tickets = t.items.reduce((a, i) => a + (i.cost || 0), 0);
  rows.push({ key: 'tickets', name: '입장권과 투어', est: tickets || 25 * eur * t.items.filter(i => i.placeId && findPlace(i.placeId)?.book).length * t.adults, real: tickets, note: tickets ? '일정에 적은 금액' : '예약 필요 장소당 25유로 기준' });
  const total = rows.reduce((a, r) => a + (r.real || r.est), 0);
  return { rows, total, perPerson: total / t.adults };
}

/* 철도 패스 비교 */
function railCalc(t) {
  const legs = t.stops.filter(s => s.leg && s.leg.mode === 'train').map(s => {
    const a = CITIES[s.cityId], b = CITIES[s.leg.to];
    return { id: s.id, from: a, to: b, fare: s.leg.farePass ?? s.leg.fare, ch: a.cc === 'CH' && b.cc === 'CH', inc: s.leg.inPass !== false, fee: RESERVATION_FEES[a.cc] ?? 0 };
  });
  const eur = rate('EUR'), inc = legs.filter(l => l.inc), people = t.adults;
  const tickets = inc.reduce((a, l) => a + l.fare, 0) * eur * people;
  const options = RAIL_PASSES.map(p => {
    const price = (S.settings.passes[p.id] ?? p.price) * rate(p.cur) * people;
    const pool = p.scope === 'CH' ? inc.filter(l => l.ch) : inc;
    const sorted = [...pool].sort((a, b) => b.fare - a.fare), covered = sorted.slice(0, p.days);
    const coveredIds = new Set(covered.map(l => l.id));
    const fees = covered.reduce((a, l) => a + l.fee, 0) * eur * people;
    const rest = inc.filter(l => !coveredIds.has(l.id)).reduce((a, l) => a + l.fare, 0) * eur * people;
    return { ...p, unit: S.settings.passes[p.id] ?? p.price, total: price + fees + rest, passCost: price, fees, rest, covered: covered.length, usable: covered.length > 0 };
  }).filter(o => o.usable);
  options.sort((a, b) => a.total - b.total);
  return { legs, tickets, options, best: options[0] || null, trainDays: inc.length };
}
function cityPass(id) { const b = CITY_PASSES[id]; if (!b) return null; return { ...b, ...(S.settings.cityPasses[id] || {}) }; }
function ridesPerDay(t, s) {
  const list = t.items.filter(i => i.stopId === s.id && i.lat), byOff = {};
  list.forEach(i => (byOff[i.off || 0] = byOff[i.off || 0] || []).push(i));
  const counts = Object.values(byOff).map(a => { a.sort((x, y) => x.start - y.start); let r = 2; for (let k = 1; k < a.length; k++) if (km(a[k - 1], a[k]) > 1.2) r++; return r; });
  return counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 3;
}

/* 일몰 시각: NOAA 근사식 */
function sunset(lat, lon, iso, cc) {
  const d = new Date(iso + 'T12:00:00Z'), N = Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5), r = Math.PI / 180;
  const g = 2 * Math.PI / 365 * (N - 1 + .5), eq = 229.18 * (.000075 + .001868 * Math.cos(g) - .032077 * Math.sin(g) - .014615 * Math.cos(2 * g) - .040849 * Math.sin(2 * g));
  const dec = .006918 - .399912 * Math.cos(g) + .070257 * Math.sin(g) - .006758 * Math.cos(2 * g) + .000907 * Math.sin(2 * g) - .002697 * Math.cos(3 * g) + .00148 * Math.sin(3 * g);
  const cosH = (Math.cos(90.833 * r) / (Math.cos(lat * r) * Math.cos(dec))) - Math.tan(lat * r) * Math.tan(dec);
  if (Math.abs(cosH) > 1) return null;
  const noonOffset = 720 - 4 * lon - eq, setUtc = noonOffset + Math.acos(cosH) / r * 4;
  const at = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + setUtc * 6e4);
  try { return at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONES[cc] }); } catch (e) { return null; }
}

/* 공유: 여행을 주소에 압축해 담습니다. 첨부 파일은 포함되지 않습니다. */
async function packTrip(t) {
  const bytes = new TextEncoder().encode(JSON.stringify(t));
  if (!window.CompressionStream) return 'r' + btoa(String.fromCharCode(...bytes));
  const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(st).arrayBuffer());
  let bin = ''; buf.forEach(b => bin += String.fromCharCode(b));
  return 'z' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpackTrip(code) {
  const body = code.slice(1).replace(/-/g, '+').replace(/_/g, '/');
  const raw = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  if (code[0] === 'r') return JSON.parse(new TextDecoder().decode(raw));
  const st = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(await new Response(st).arrayBuffer()));
}
function sanitizeTrip(d) {
  if (!d || !Array.isArray(d.stops)) throw new Error('여행 형식이 아닙니다');
  const stops = d.stops.filter(s => CITIES[s.cityId]);
  const t = { ...makeTrip(String(d.name || '받은 여행').slice(0, 60), []), ...d, id: uid('t'), stops, items: Array.isArray(d.items) ? d.items : [], updated: Date.now() };
  refreshLegs(t); return t;
}

/* 첨부 파일: 브라우저 IndexedDB */
function db() { return new Promise((ok, no) => { const r = indexedDB.open('nextstop-files', 1); r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
async function fileOp(mode, fn) { const d = await db(); return new Promise((ok, no) => { const tx = d.transaction('files', mode), q = fn(tx.objectStore('files')); tx.oncomplete = () => ok(q?.result); tx.onerror = () => no(tx.error); if (q) q.onerror = () => no(q.error); }); }
const putFile = f => fileOp('readwrite', s => s.put(f));
const delFile = id => fileOp('readwrite', s => s.delete(id));
const allFiles = () => fileOp('readonly', s => s.getAll());

function icsOf(t) {
  const esc = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//nextstop//KO', 'CALSCALE:GREGORIAN'];
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  tasksOf(t).filter(x => !x.done).forEach(x => {
    const d = x.due < today() ? today() : x.due, c = d.replace(/-/g, ''), e = addDays(d, 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${x.key}-${t.id}@nextstop`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${c}`, `DTEND;VALUE=DATE:${e}`, `SUMMARY:${esc('[' + t.name + '] ' + x.title)}`, `DESCRIPTION:${esc((x.note || '') + (x.url ? '\n' + x.url : ''))}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:예약 확인', 'TRIGGER:-PT9H', 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR'); return lines.join('\r\n');
}
function download(name, text, type = 'text/plain') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name.replace(/[\\/:*?"<>|]/g, ' '); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
