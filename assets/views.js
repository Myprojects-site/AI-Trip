/* 화면 그리기. 모든 사용자 입력은 h()로 이스케이프합니다. */
const TABS = [['overview', '한눈에'], ['schedule', '일정표'], ['route', '동선'], ['tasks', '예약'], ['transport', '교통'], ['hotels', '숙소'], ['budget', '비용'], ['files', '서류'], ['book', '안내서']];
const TYPE_LABEL = { sight: '명소', museum: '미술관·박물관', view: '전망', food: '식사', shop: '쇼핑', nature: '자연', move: '이동', etc: '기타' };
const ICON = { train: '기차', bus: '버스', flight: '항공', ferry: '페리', car: '차량' };
let toastTimer;
function toast(msg) { const el = document.getElementById('toast'); if (!el) return; el.textContent = msg; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2800); }

function focusSig() {
  const a = document.activeElement; if (!a || a === document.body) return null;
  const parts = ['chg', 'id', 'f', 'key', 'act', 'd'].map(k => a.dataset[k] ? `[data-${k}="${CSS.escape(a.dataset[k])}"]` : '').join('');
  return parts || (a.name ? `[name="${a.name}"]` : null);
}
function render() {
  if (UI.deferRender) { UI.deferRender = false; setTimeout(render, 0); return; }
  const root = document.getElementById('app'), work0 = document.querySelector('.work'), scroll = work0?.scrollTop || 0, sx = document.querySelector('.grid-scroll')?.scrollLeft || 0, sy = document.querySelector('.grid-scroll')?.scrollTop, railY = document.querySelector('.rail')?.scrollTop || 0, sig = focusSig();
  const draft = document.querySelector('.composer textarea')?.value; if (draft !== undefined) UI.draft = draft;
  const t = trip();
  root.innerHTML = (UI.view === 'trip' && t) ? tripShell(t) : homeView();
  const w = document.querySelector('.work'); if (w) w.scrollTop = scroll;
  const g = document.querySelector('.grid-scroll'); if (g) { g.scrollLeft = sx; g.scrollTop = sy ?? 120; }
  const rl = document.querySelector('.rail'); if (rl) rl.scrollTop = railY;
  document.getElementById('modal').innerHTML = UI.modal ? modalView() : '';
  document.body.classList.toggle('modal-open', !!UI.modal);
  if (typeof renderChat === 'function') renderChat();
  if (sig) { try { document.querySelector(sig)?.focus({ preventScroll: true }); } catch (e) { /* 선택자 실패는 무시 */ } }
}

/* 첫 화면 */
function homeView() {
  const cards = S.trips.map(t => {
    const names = t.stops.map(s => CITIES[s.cityId].ko);
    return `<li class="trip-row"><button class="trip-open" data-act="open" data-id="${t.id}"><strong>${h(t.name)}</strong><span class="num">${fmtDate(t.startDate)} 출발, ${totalNights(t)}박</span><span class="trip-line">${names.map(h).join(' - ') || '도시 없음'}</span></button><button class="ghost danger" data-act="delTrip" data-id="${t.id}">삭제</button></li>`;
  }).join('');
  return `<div class="home">
   <header class="home-top"><div class="brand"><span class="mark" aria-hidden="true"></span>다음역</div><button class="ghost" data-act="settings">설정</button></header>
   <main class="home-main">
    <section class="start"><div class="start-copy"><h1>어디서 내리고, 얼마나 머물까요</h1><p>도시를 고르면 일정표, 예약 시기, 비용이 함께 만들어집니다.</p>
     <div class="start-actions">
      <button class="primary big" data-act="newBlank">빈 노선으로 시작</button>
      <button class="secondary big" data-act="openSurvey">조건으로 추천받기</button>
      <label class="secondary big file-btn">예약 파일로 만들기<input type="file" accept="application/pdf,image/*" multiple data-chg="aiFiles" hidden></label>
      <label class="ghost big file-btn">받은 여행 파일 열기<input type="file" accept=".json,application/json" data-chg="importJson" hidden></label>
     </div></div><div class="start-map" aria-hidden="true">${europeMap(makeTrip('예시', TEMPLATES[0].stops), undefined, 1.45)}</div></section>
    ${S.trips.length ? `<section><h2>내 여행</h2><ul class="trip-list">${cards}</ul></section>` : ''}
    <section><h2>노선 예시에서 시작</h2><div class="tpl-grid">${TEMPLATES.map(tplCard).join('')}</div></section>
   </main>
   <footer class="home-foot">여행 내용은 이 브라우저에만 저장됩니다. 다른 기기로 옮기려면 공유 링크나 파일 내보내기를 쓰세요.</footer>
  </div>`;
}
function tplCard(tp) {
  const n = tp.stops.reduce((a, s) => a + s[1], 0);
  return `<button class="tpl" data-act="useTpl" data-id="${tp.id}"><span class="tpl-head"><strong>${h(tp.name)}</strong><span class="num">${n}박</span></span><span class="tpl-line">${tp.stops.map(s => `<i>${CITIES[s[0]].ko} ${s[1]}</i>`).join('')}</span><span class="tpl-note">${h(tp.note)}</span></button>`;
}

/* 여행 화면 뼈대 */
function tripShell(t) {
  const c = t.stops.length ? costOf(t) : null, tasks = tasksOf(t), todo = tasks.filter(x => !x.done), late = todo.filter(x => x.due <= today()).length;
  const dd = dayDiff(today(), t.startDate);
  return `<div class="shell tab-${UI.tab} ${UI.chatOpen ? 'with-chat' : ''}">
   <header class="sign">
    <button class="sign-home" data-act="home" aria-label="내 여행 목록"><span class="mark" aria-hidden="true"></span><span>다음역</span></button>
    <input class="sign-name" value="${h(t.name)}" data-chg="tripName" aria-label="여행 이름">
    <dl class="sign-facts">
     <div><dt>출발</dt><dd class="num"><input type="date" value="${t.startDate}" data-chg="startDate" aria-label="출발일"></dd></div>
     <div><dt>${dd >= 0 ? '남은 날' : '지난 날'}</dt><dd class="num">${Math.abs(dd)}일</dd></div>
     <div><dt>기간</dt><dd class="num">${totalNights(t)}박 ${dayCount(t)}일</dd></div>
     <div><dt>인원</dt><dd class="num stepper"><button data-act="adults" data-d="-1" aria-label="인원 줄이기">-</button>${t.adults}명<button data-act="adults" data-d="1" aria-label="인원 늘리기">+</button></dd></div>
     <div><dt>1인 예상</dt><dd class="num">${c ? fmtWon(c.perPerson) : '-'}</dd></div>
     <div class="${late ? 'hot' : ''}"><dt>지금 할 예약</dt><dd class="num">${late}건</dd></div>
    </dl>
    <div class="sign-actions">
     <button class="ghost" data-act="undo" ${UI.undo.length ? '' : 'disabled'}>되돌리기</button>
     <button class="ghost" data-act="share">공유</button>
     <button class="ghost" data-act="settings">설정</button>
     <button class="dark" data-act="toggleChat" aria-pressed="${UI.chatOpen}">AI 비서</button>
    </div>
   </header>
   <aside class="rail" aria-label="여행 노선">${railView(t)}</aside>
   <main class="main">
    <nav class="tabs" aria-label="여행 도구">${TABS.map(([k, n]) => `<button class="${UI.tab === k ? 'on' : ''}" data-act="tab" data-id="${k}" ${UI.tab === k ? 'aria-current="page"' : ''}>${n}${k === 'tasks' && late ? `<b class="num">${late}</b>` : ''}</button>`).join('')}</nav>
    <div class="work">${tabView(t)}</div>
   </main>
   <aside class="chat" id="chat" ${UI.chatOpen ? '' : 'hidden'} aria-label="AI 비서"></aside>
  </div>`;
}

/* 왼쪽 노선도: 이 앱의 중심 */
function railView(t) {
  const starts = stopStarts(t);
  const stations = t.stops.map((s, k) => {
    const c = CITIES[s.cityId], d = addDays(t.startDate, starts[k]);
    const leg = s.leg ? `<li class="leg"><button data-act="editLeg" data-id="${s.id}"><span>${ICON[s.leg.mode]}</span><span class="num">${dur(s.leg.mins)}</span>${s.leg.booked ? '<em>예약됨</em>' : ''}</button><button class="insert" data-act="addCity" data-at="${k + 1}" aria-label="${c.ko} 다음에 도시 추가">추가</button></li>` : '';
    return `<li class="station ${UI.guideCity === s.id ? 'on' : ''}" draggable="true" data-stop="${s.id}">
      <button class="st-name" data-act="guide" data-id="${s.id}"><span class="dot"></span><strong>${c.ko}</strong><span class="num st-date">${fmtDate(d, false)}</span></button>
      <span class="st-tools"><span class="stepper num"><button data-act="nights" data-id="${s.id}" data-d="-1" aria-label="${c.ko} 하루 줄이기">-</button><span>${s.nights}박</span><button data-act="nights" data-id="${s.id}" data-d="1" aria-label="${c.ko} 하루 늘리기">+</button></span>
      <button class="updown" data-act="moveStop" data-id="${s.id}" data-d="-1" aria-label="${c.ko} 위로">위</button><button class="updown" data-act="moveStop" data-id="${s.id}" data-d="1" aria-label="${c.ko} 아래로">아래</button><button class="updown" data-act="delStop" data-id="${s.id}" aria-label="${c.ko} 삭제">삭제</button></span></li>${leg}`;
  }).join('');
  return `<div class="rail-head"><h2>노선</h2><button class="ghost small" data-act="addCity" data-at="${t.stops.length}">도시 추가</button></div>
   <ol class="line"><li class="term"><button data-act="editFlight"><span class="dot"></span><strong>인천</strong><span class="num st-date">${fmtDate(t.startDate, false)}</span>${t.flights.out.booked ? '<em>예약됨</em>' : ''}</button></li>${stations}<li class="term end"><button data-act="editFlight"><span class="dot"></span><strong>인천 귀국</strong><span class="num st-date">${fmtDate(endDate(t), false)}</span></button></li><li class="add-end"><button class="ghost small" data-act="addCity" data-at="${t.stops.length}">도시 추가</button></li></ol>
   ${t.stops.length ? '' : '<p class="rail-empty">첫 도시를 추가하세요.</p>'}`;
}

function tabView(t) {
  if (!t.stops.length) return `<div class="empty"><h2>첫 도시를 고르세요</h2><p>입국 도시부터 순서대로 추가하면 일정이 이어집니다.</p><button class="primary" data-act="addCity" data-at="0">도시 추가</button></div>`;
  return ({ overview: overviewTab, schedule: scheduleTab, route: routeTab, tasks: tasksTab, transport: transportTab, hotels: hotelsTab, budget: budgetTab, files: filesTab, book: bookTab })[UI.tab](t);
}

/* 한눈에 */
function overviewTab(t) {
  const issues = checkTrip(t), tasks = tasksOf(t).filter(x => !x.done).slice(0, 5), starts = stopStarts(t);
  const rows = t.stops.map((s, k) => {
    const c = CITIES[s.cityId], a = addDays(t.startDate, starts[k]);
    return `<tr><th scope="row"><button class="link" data-act="guide" data-id="${s.id}">${c.ko}</button></th><td class="num">${fmtDate(a)}</td><td class="num">${s.nights}박</td><td>${s.hotel.name ? h(s.hotel.name) : `<button class="link" data-act="tab" data-id="hotels">숙소 정하기</button>`}</td><td class="status"><span class="tag ${s.hotel.booked ? 'ok' : ''}">${s.hotel.booked ? '예약됨' : '미예약'}</span></td><td>${s.leg ? `${ICON[s.leg.mode]} <span class="num">${dur(s.leg.mins)}</span>` : '-'}</td></tr>`;
  }).join('');
  return `<div class="two">
   <section class="panel map-panel"><div class="map-head"><h2>전체 노선</h2><button class="ghost small" data-act="tab" data-id="route">동선 재생</button></div>${europeMap(t)}</section>
   <div class="stack">
    <section class="panel"><div class="p-head"><h2>지금 할 일</h2><button class="link" data-act="tab" data-id="tasks">전체 보기</button></div>
     <ul class="todo">${tasks.map(x => taskRow(x, true)).join('') || '<li class="muted">남은 일이 없습니다.</li>'}</ul></section>
    <section class="panel"><div class="p-head"><h2>일정 점검</h2><span class="num muted">${issues.length}건</span></div>
     <ul class="issues">${issues.slice(0, 6).map(i => `<li class="${i.level}"><button data-act="jump" data-tab="${i.tab}" data-day="${i.day ?? ''}">${h(i.text)}</button></li>`).join('') || '<li class="clean">겹치거나 무리한 일정이 없습니다.</li>'}</ul></section>
   </div></div>
   <section class="panel"><div class="p-head"><h2>도시별 현황</h2>${t.items.length ? '' : '<button class="primary small" data-act="autofill">일정 초안 채우기</button>'}</div>
   <div class="table-wrap"><table><thead><tr><th>도시</th><th>도착</th><th>체류</th><th>숙소</th><th>상태</th><th>다음 이동</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function taskRow(x, compact) {
  const late = x.due <= today() && !x.done;
  return `<li class="task ${x.done ? 'done' : ''} ${late ? 'late' : ''}"><label><input type="checkbox" ${x.done ? 'checked' : ''} data-chg="taskDone" data-key="${x.key}" data-edit="${x.edit || ''}" data-leg="${x.legId || ''}" data-item="${x.itemId || ''}"><span class="t-title">${h(x.title)}</span></label><span class="num t-due">${late ? '지금' : fmtDate(x.due, false)}</span>${compact ? '' : `<span class="t-note">${h(x.note)}</span>`}${x.url ? `<a href="${h(x.url)}" target="_blank" rel="noopener">열기</a>` : '<span></span>'}</li>`;
}

/* 점 지도 */
function project(lon, lat) { return [(lon + 26) * Math.cos(50 * Math.PI / 180) * 10, (72 - lat) * 10]; }
function inPoly(x, y, p) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const dotCache = {};
function landPath(b, step) {
  const k = [b.minLon, b.maxLon, b.minLat, b.maxLat, step].map(n => n.toFixed(2)).join();
  if (dotCache[k]) return dotCache[k];
  let d = '', row = 0;
  for (let lat = Math.ceil(b.minLat / step) * step; lat <= b.maxLat; lat += step, row++) {
    for (let lon = Math.ceil(b.minLon / step) * step + (row % 2 ? step / 2 : 0); lon <= b.maxLon; lon += step / .64) {
      if (LAND.some(p => inPoly(lon, lat, p))) { const [x, y] = project(lon, lat); d += `M${x.toFixed(1)} ${y.toFixed(1)}h0`; }
    }
  }
  return (dotCache[k] = d);
}
function europeMap(t, active, scale = 1) {
  const pts = t.stops.map(s => CITIES[s.cityId]);
  const b = { minLat: Math.min(...pts.map(p => p.lat)) - 2.2, maxLat: Math.max(...pts.map(p => p.lat)) + 2.2, minLon: Math.min(...pts.map(p => p.lon)) - 3.5, maxLon: Math.max(...pts.map(p => p.lon)) + 3.5 };
  const spanLat = b.maxLat - b.minLat; if (spanLat < 9) { const m = (9 - spanLat) / 2; b.minLat -= m; b.maxLat += m; }
  const needLon = Math.max(15, (b.maxLat - b.minLat) * 1.3 / .64 / .9), spanLon = b.maxLon - b.minLon; if (spanLon < needLon) { const m = (needLon - spanLon) / 2; b.minLon -= m; b.maxLon += m; }
  const [x0, y0] = project(b.minLon, b.maxLat), [x1, y1] = project(b.maxLon, b.minLat), w = x1 - x0, hh = y1 - y0;
  const step = clamp(hh / 10 / 46, .12, .55), small = window.innerWidth < 760, u = w / 100, fs = (small ? 3.7 : 1.9) * u * scale, sr = (small ? 1.5 : 1) * Math.sqrt(scale), placed = [];
  const xy = t.stops.map(s => project(CITIES[s.cityId].lon, CITIES[s.cityId].lat));
  const label = (s, k) => { const [x, y] = xy[k], c = CITIES[s.cityId], first = t.stops.findIndex(o => o.cityId === s.cityId) === k, sameAs = t.stops.findIndex(o => o.cityId === s.cityId);
    if (!first) return '';
    const nights = t.stops.filter(o => o.cityId === s.cityId).reduce((a, o) => a + o.nights, 0), tw = (c.ko.length + 2.6) * fs * .95, gap = 1.5 * sr * u;
    const box = dir => dir > 0 ? [x + gap, x + gap + tw] : [x - gap - tw, x - gap], hit = dir => { const [a, b] = box(dir); return placed.some(p => a < p[1] && b > p[0] && Math.abs(y - p[2]) < fs * 1.15); };
    let flip = x + gap + tw > x0 + w; if (!flip && hit(1) && !hit(-1) && box(-1)[0] > x0) flip = true;
    const [ba, bb] = box(flip ? -1 : 1); placed.push([ba, bb, y]);
    return `<g class="m-label"><text x="${x + (flip ? -1 : 1) * gap}" y="${y + fs * .3}" text-anchor="${flip ? 'end' : 'start'}" font-size="${fs}">${c.ko} <tspan class="m-n">${nights}박</tspan></text></g>`; };
  return `<svg class="eumap" viewBox="${x0} ${y0} ${w} ${hh}" role="img" aria-label="여행 노선 지도: ${t.stops.map(s => CITIES[s.cityId].ko).join(', ')}">
    <path d="${landPath(b, step)}" class="m-land" stroke-width="${step * 10 * .52}"/>
    <polyline points="${xy.map(p => p.join(',')).join(' ')}" class="m-route" stroke-width="${.8 * u}"/>
    ${xy.map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="${(k === active ? 1.25 : .85) * u * sr}" class="m-stop ${k === active ? 'on' : ''}" stroke-width="${.42 * u * sr}"/>`).join('')}
    ${t.stops.map(label).join('')}</svg>`;
}

/* 일정표 */
const HOUR_FROM = 6, HOUR_TO = 24, PX = 1; /* 1분 = 1px */
function scheduleTab(t) {
  const days = daysOf(t); UI.day = clamp(UI.day, 0, days.length - 1);
  const hours = []; for (let i = HOUR_FROM; i < HOUR_TO; i++) hours.push(`<span class="hr num" style="top:${(i - HOUR_FROM) * 60}px">${String(i).padStart(2, '0')}</span>`);
  const cols = days.map(d => {
    const blocks = blocksOf(t, d.i), c = d.primary ? CITIES[d.primary.cityId] : null, ss = c ? sunset(c.lat, c.lon, d.date, c.cc) : null;
    const issues = [];
    for (let i = 1; i < blocks.length; i++) { const p = blocks[i - 1], q = blocks[i]; if (p.lat && q.lat) { const need = moveMinutes(km(p, q)); const gap = q.start - p.start - p.dur; issues.push(`<span class="gap ${need > gap + 5 ? 'bad' : ''} num" style="top:${(q.start - HOUR_FROM * 60) - 16}px">이동 ${need}분</span>`); } }
    return `<div class="day ${d.i === UI.day ? 'cur' : ''}" data-day="${d.i}">
     <button class="day-head" data-act="day" data-id="${d.i}"><strong class="num">${fmtDate(d.date)}</strong><span>${d.stops.map(s => CITIES[s.cityId].ko).join(', ')}</span>${ss ? `<small class="num">일몰 ${ss}</small>` : ''}</button>
     <div class="day-body" data-slot="${d.i}" style="height:${(HOUR_TO - HOUR_FROM) * 60}px">
      ${blocks.map(b => blockView(b)).join('')}${issues.join('')}
     </div></div>`;
  }).join('');
  return `<div class="sched-bar"><div><strong>일정표</strong><span class="muted">빈 시간을 누르면 추가하고, 칸을 끌면 옮깁니다.</span></div><div class="row"><button class="ghost small" data-act="addItem" data-day="${UI.day}">일정 추가</button><button class="ghost small" data-act="autofill">빈 날 채우기</button></div></div>
   <div class="day-chips">${days.map(d => `<button class="${d.i === UI.day ? 'on' : ''}" data-act="day" data-id="${d.i}"><span class="num">${fmtDate(d.date, false)}</span>${d.primary ? CITIES[d.primary.cityId].ko : ''}</button>`).join('')}</div>
   <div class="grid-scroll"><div class="grid"><div class="hours" style="height:${(HOUR_TO - HOUR_FROM) * 60}px">${hours.join('')}</div>${cols}</div></div>`;
}
function blockView(b) {
  const top = clamp(b.start - HOUR_FROM * 60, 0, (HOUR_TO - HOUR_FROM) * 60 - 20), ht = Math.max(26, b.dur);
  return `<button class="blk t-${b.type} k-${b.kind}" style="top:${top}px;height:${ht}px" data-blk="${b.id}" data-kind="${b.kind}"><span class="num b-time">${hm(b.start)}</span><span class="b-title">${h(b.title)}</span>${b.sub ? `<span class="b-sub">${h(b.sub)}</span>` : ''}</button>`;
}

/* 동선 */
function routeTab(t) {
  const days = daysOf(t); UI.mapDay = clamp(UI.mapDay, 0, days.length - 1);
  const d = days[UI.mapDay], blocks = blocksOf(t, d.i).filter(b => b.lat), c = d.primary ? CITIES[d.primary.cityId] : null, ss = c ? sunset(c.lat, c.lon, d.date, c.cc) : null;
  const k = d.primary ? t.stops.indexOf(d.primary) : 0, step = UI.replay ?? null;
  const url = gmapsDay(blocks);
  return `<div class="two wide-left"><section class="panel map-panel"><div class="map-head"><h2>도시 간 노선</h2><div class="row"><button class="ghost small" data-act="playTrip">${UI.playing ? '재생 중' : '여행 전체 재생'}</button></div></div>${europeMap(t, k)}</section>
   <section class="panel"><div class="p-head"><h2>${fmtDate(d.date)} ${c ? c.ko : ''}</h2><div class="row"><button class="ghost small" data-act="mapDay" data-d="-1" aria-label="이전 날">이전</button><button class="ghost small" data-act="mapDay" data-d="1" aria-label="다음 날">다음</button></div></div>
    ${ss ? `<p class="muted num">일몰 약 ${ss}</p>` : ''}
    ${blocks.length ? `${cityMap(blocks, step)}<ol class="stops">${blocks.map((b, i) => `<li class="${step === i ? 'on' : ''}"><button data-act="replayStep" data-id="${i}"><span class="num">${hm(b.start)}</span><strong>${h(b.title)}</strong><span class="muted">${dur(b.dur)}${i ? `, 이동 약 ${moveMinutes(km(blocks[i - 1], b))}분` : ''}</span></button></li>`).join('')}</ol>
     <div class="row"><a class="btn ghost" href="${url}" target="_blank" rel="noopener">Google 지도에서 대중교통 경로 보기</a></div>` : `<div class="empty small"><p>이 날짜에 장소가 없습니다.</p><button class="primary small" data-act="tab" data-id="schedule">일정표로 이동</button></div>`}
   </section></div>`;
}
function cityMap(blocks, step) {
  const lat = blocks.map(b => b.lat), lon = blocks.map(b => b.lon), W = 460, H = 280, pad = 34;
  const minLat = Math.min(...lat), maxLat = Math.max(...lat), minLon = Math.min(...lon), maxLon = Math.max(...lon), cos = Math.cos(minLat * Math.PI / 180);
  const sx = (maxLon - minLon) * cos || .01, sy = (maxLat - minLat) || .01, sc = Math.min((W - pad * 2) / sx, (H - pad * 2) / sy);
  const pt = b => [W / 2 + ((b.lon - (minLon + maxLon) / 2) * cos * sc), H / 2 - ((b.lat - (minLat + maxLat) / 2) * sc)];
  const P = blocks.map(pt), kmPerPx = 111 / sc, nice = [.2, .5, 1, 2, 5, 10, 20, 50, 100].find(k => k / kmPerPx > 50) || 100;
  return `<svg class="citymap" viewBox="0 0 ${W} ${H}" role="img" aria-label="하루 동선 간이 지도"><polyline points="${P.map(p => p.join(',')).join(' ')}" class="c-line"/>${P.map(([x, y], i) => `<g class="c-stop ${step === i ? 'on' : ''}"><circle cx="${x}" cy="${y}" r="12"/><text x="${x}" y="${y + 4}" text-anchor="middle">${i + 1}</text></g>`).join('')}<g class="c-scale"><line x1="14" x2="${14 + nice / kmPerPx}" y1="${H - 14}" y2="${H - 14}"/><text x="14" y="${H - 20}">${nice}km</text></g></svg>`;
}

/* 예약 */
function tasksTab(t) {
  const all = tasksOf(t), left = all.filter(x => !x.done), late = left.filter(x => x.due <= today()), soon = left.filter(x => x.due > today() && dayDiff(today(), x.due) <= 30), later = left.filter(x => dayDiff(today(), x.due) > 30), done = all.filter(x => x.done);
  const sec = (name, list, cls = '') => list.length ? `<section class="panel"><div class="p-head"><h2>${name}</h2><span class="num muted">${list.length}건</span></div><ul class="todo full ${cls}">${list.map(x => taskRow(x)).join('')}</ul></section>` : '';
  return `<div class="sched-bar"><div><strong>예약 체크리스트</strong><span class="muted">날짜는 권장 시점입니다. 표 공개일은 운영사에서 확인하세요.</span></div><div class="row"><button class="ghost small" data-act="ics">캘린더로 내보내기</button><button class="ghost small" data-act="addTask">할 일 추가</button></div></div>
   ${sec('지금 예약', late, 'late')}${sec('30일 안에', soon)}${sec('그 이후', later)}${sec('끝난 일', done)}`;
}

/* 교통 */
function transportTab(t) {
  const calc = railCalc(t), starts = stopStarts(t);
  const rows = t.stops.filter(s => s.leg).map(s => {
    const a = CITIES[s.cityId], b = CITIES[s.leg.to], r = legRule(a, b, s.leg.mode), date = addDays(t.startDate, starts[t.stops.indexOf(s)] + s.nights);
    return `<tr><th scope="row"><button class="link" data-act="editLeg" data-id="${s.id}">${a.ko}에서 ${b.ko}</button></th><td class="num">${fmtDate(date)}</td><td>${ICON[s.leg.mode]}</td><td class="num">${dur(s.leg.mins)}${s.leg.known ? '' : ' 추정'}</td><td class="num">${s.leg.fare}유로</td><td><a href="${h(r.url)}" target="_blank" rel="noopener">${h(r.op)}</a></td><td><a href="${routeUrl(a, b)}" target="_blank" rel="noopener">경로 비교</a></td></tr>`;
  }).join('');
  const pass = calc.legs.length ? `<section class="panel"><div class="p-head"><h2>철도 패스 비교</h2><span class="muted">일행 ${t.adults}명 합계</span></div>
    <div class="verdict ${calc.best && calc.best.total < calc.tickets ? 'yes' : 'no'}"><strong>${calc.best && calc.best.total < calc.tickets ? `${h(calc.best.name)}가 ${fmtWon(calc.tickets - calc.best.total)} 저렴합니다` : '구간권이 더 저렴합니다'}</strong><span>구간권 합계 <b class="num">${fmtWon(calc.tickets)}</b></span></div>
    <div class="two even"><div><h3>기차 구간</h3><ul class="legs">${calc.legs.map(l => `<li><label><input type="checkbox" ${l.inc ? 'checked' : ''} data-chg="legInPass" data-id="${l.id}">${l.from.ko}에서 ${l.to.ko}</label><span class="unit"><input class="num" type="number" min="0" value="${l.fare}" data-chg="legFare" data-id="${l.id}" aria-label="${l.from.ko}에서 ${l.to.ko} 요금">유로</span></li>`).join('')}</ul></div>
    <div><h3>패스별 총액</h3><div class="table-wrap"><table class="tight"><thead><tr><th>패스</th><th>적용</th><th>총액</th></tr></thead><tbody>${calc.options.slice(0, 5).map(o => `<tr class="${o === calc.best && o.total < calc.tickets ? 'best' : ''}"><th scope="row">${h(o.name)}<small><a href="${h(o.source)}" target="_blank" rel="noopener">가격 확인</a><span class="unit"><input class="num" type="number" min="0" value="${o.unit}" data-chg="passPrice" data-id="${o.id}" aria-label="${h(o.name)} 1인 가격">${o.cur}</span></small></th><td class="num">${o.covered}구간</td><td class="num">${fmtWon(o.total)}</td></tr>`).join('')}</tbody></table></div>
    <p class="fine">요금이 높은 구간부터 패스를 적용하고 나머지는 구간권으로 더했습니다. 좌석 예약비를 일부 포함한 추정이며, 탑승일 1일에 한 구간을 가정합니다. 만 27세 이하와 만 60세 이상 할인은 공식 사이트에서 확인하세요.</p></div></div></section>` : '';
  const city = t.stops.filter((s, i, a) => cityPass(s.cityId) && a.findIndex(o => o.cityId === s.cityId) === i).map(s => {
    const c = CITIES[s.cityId], p = cityPass(s.cityId), rides = ridesPerDay(t, s), days = Math.max(1, s.nights), singles = p.single * rides * days, passes = p.day * days;
    return `<tr><th scope="row">${c.ko}<small>${h(p.name)}</small></th><td class="num">${rides}회</td><td class="unit"><input class="num" type="number" step="0.1" min="0" value="${p.single}" data-chg="cityFare" data-id="${s.cityId}" data-f="single" aria-label="${c.ko} 1회권">${p.cur}</td><td class="unit"><input class="num" type="number" step="0.1" min="0" value="${p.day}" data-chg="cityFare" data-id="${s.cityId}" data-f="day" aria-label="${c.ko} 1일권">${p.cur}</td><td><strong>${singles <= passes ? '1회권' : '1일권'}</strong> <span class="num muted">${Math.abs(Math.round((singles - passes) * rate(p.cur) / 100) * 100).toLocaleString()}원 차이</span></td></tr>`;
  }).join('');
  return `<section class="panel"><div class="p-head"><h2>도시 이동</h2><span class="muted">시간과 요금은 참고값</span></div><div class="table-wrap"><table><thead><tr><th>구간</th><th>날짜</th><th>수단</th><th>시간</th><th>1인 요금</th><th>예약처</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">도시를 2곳 이상 추가하세요.</td></tr>'}</tbody></table></div></section>
   ${pass}
   ${city ? `<section class="panel"><div class="p-head"><h2>도시 교통권</h2><span class="muted">요금은 참고값이고 고칠 수 있습니다</span></div><div class="table-wrap"><table><thead><tr><th>도시</th><th>하루 승차</th><th>1회권</th><th>1일권</th><th>추천</th></tr></thead><tbody>${city}</tbody></table></div></section>` : ''}`;
}

/* 숙소 */
function hotelsTab(t) {
  const starts = stopStarts(t);
  return t.stops.map((s, k) => {
    const c = CITIES[s.cityId], a = addDays(t.startDate, starts[k]), b = addDays(a, s.nights);
    const pref = TRAVELER_TYPES[t.type]?.slice(0, 2) || '';
    const hoods = [...c.hoods].sort((x, y) => (y.suits.includes(pref) ? 1 : 0) - (x.suits.includes(pref) ? 1 : 0));
    return `<section class="panel hotel"><div class="p-head"><h2>${c.ko} <span class="num muted">${fmtDate(a)} ~ ${fmtDate(b)}, ${s.nights}박</span></h2><div class="row"><a class="btn ghost small" href="${hotelUrl(t, s, k)}" target="_blank" rel="noopener">Booking에서 찾기</a><a class="btn ghost small" href="${hotelUrl2(s)}" target="_blank" rel="noopener">Google 호텔</a></div></div>
    <div class="two even"><ul class="hoods">${hoods.map(n => `<li><button data-act="pickHood" data-id="${s.id}" data-v="${h(n.name)}" class="${s.hotel.area === n.name ? 'on' : ''}"><strong>${h(n.name)}</strong><span class="suits">${h(n.suits)}</span><span>${h(n.note)}</span></button></li>`).join('')}</ul>
    <div class="form"><label>숙소 이름<input value="${h(s.hotel.name)}" data-chg="hotel" data-f="name" data-id="${s.id}"></label><label>1박 금액(원)<input class="num" type="number" min="0" step="1000" value="${s.hotel.perNight || ''}" data-chg="hotel" data-f="perNight" data-id="${s.id}"></label><label class="check"><input type="checkbox" ${s.hotel.booked ? 'checked' : ''} data-chg="hotelBooked" data-id="${s.id}">예약 완료</label></div></div></section>`;
  }).join('');
}

/* 비용 */
function budgetTab(t) {
  const c = costOf(t), input = r => r.key === 'food' || r.key === 'local' ? `<input class="num" type="number" min="0" step="10000" value="${r.real || ''}" placeholder="직접 입력" data-chg="extra" data-f="${r.key}" aria-label="${r.name} 실제 금액">` : `<span class="num">${r.real ? fmtWon(r.real) : '-'}</span>`;
  return `<section class="panel"><div class="total"><div><span>예상 총액</span><strong class="num">${fmtWon(c.total)}</strong></div><div><span>1인</span><strong class="num">${fmtWon(c.perPerson)}</strong></div></div>
   <div class="table-wrap"><table><thead><tr><th>항목</th><th>추정</th><th>확정</th><th>비율</th><th>기준</th></tr></thead><tbody>${c.rows.map(r => `<tr><th scope="row">${r.name}</th><td class="num">${fmtWon(r.est)}</td><td>${input(r)}</td><td class="num">${Math.round((r.real || r.est) / c.total * 100)}%</td><td class="muted">${h(r.note)}</td></tr>`).join('')}</tbody></table></div>
   <p class="fine">확정 금액이 있으면 추정 대신 합계에 반영합니다. 항공은 노선의 출발 칸, 숙소는 숙소 탭, 구간 요금은 노선의 이동 칸에서 입력합니다.</p></section>
   <section class="panel"><div class="p-head"><h2>기준값</h2></div><div class="form inline"><label>1인 왕복 항공 기준(원)<input class="num" type="number" step="10000" value="${S.settings.flightDefault}" data-chg="flightDefault"></label>${['EUR', 'GBP', 'CHF', 'USD'].map(k => `<label>1 ${k}(원)<input class="num" type="number" value="${S.settings.rates[k]}" data-chg="rate" data-id="${k}"></label>`).join('')}</div></section>`;
}

/* 서류 */
function filesTab(t) {
  const list = (UI.files || []).filter(f => f.tripId === t.id);
  if (UI.files === undefined) refreshFiles();
  return `<section class="panel"><div class="p-head"><h2>항공권과 바우처</h2><label class="btn ghost small file-btn">파일 추가<input type="file" multiple accept="application/pdf,image/*" data-chg="addFiles" hidden></label></div>
  ${list.length ? `<ul class="files">${list.map(f => `<li><strong>${h(f.name)}</strong><span class="num muted">${Math.ceil(f.size / 1024)}KB</span><button class="link" data-act="openFile" data-id="${f.id}">열기</button>${S.settings.key ? `<button class="link" data-act="readFile" data-id="${f.id}">AI로 일정에 넣기</button>` : ''}<button class="link danger" data-act="delFile" data-id="${f.id}">삭제</button></li>`).join('')}</ul>` : '<div class="empty small"><p>예약 확인서를 올려 두면 여행 중 바로 꺼내 볼 수 있습니다.</p></div>'}
  <p class="fine">파일은 이 브라우저에만 저장되고 공유 링크에는 포함되지 않습니다. 브라우저 데이터를 지우면 함께 삭제되므로 원본을 따로 보관하세요.</p></section>`;
}

/* 안내서 */
function bookTab(t) {
  const days = daysOf(t), cities = [...new Set(t.stops.map(s => s.cityId))].map(id => CITIES[id]);
  return `<div class="sched-bar noprint"><div><strong>내 여행 안내서</strong><span class="muted">인쇄 창에서 PDF로 저장을 고르세요.</span></div><button class="primary small" data-act="print">PDF로 저장</button></div>
  <article class="book">
   <header><h1>${h(t.name)}</h1><p class="num">${fmtDate(t.startDate)} ~ ${fmtDate(endDate(t))}, ${totalNights(t)}박 ${dayCount(t)}일, ${t.adults}명</p><p>${t.stops.map(s => `${CITIES[s.cityId].ko} ${s.nights}박`).join(' - ')}</p></header>
   <section><h2>긴급 연락처</h2><table><tbody>${EMERGENCY.map(e => `<tr><th scope="row">${e[0]}</th><td class="num">${e[1]}</td></tr>`).join('')}</tbody></table></section>
   <section><h2>예약 현황</h2><table><thead><tr><th>구분</th><th>내용</th><th>상태</th></tr></thead><tbody>
    <tr><th scope="row">입국 항공</th><td>${h(t.flights.out.note) || '미입력'}</td><td>${t.flights.out.booked ? '예약됨' : '미예약'}</td></tr>
    ${t.stops.map(s => `<tr><th scope="row">${CITIES[s.cityId].ko} 숙소</th><td>${h(s.hotel.name) || '미입력'}${s.hotel.area ? ', ' + h(s.hotel.area) : ''}</td><td>${s.hotel.booked ? '예약됨' : '미예약'}</td></tr>${s.leg ? `<tr><th scope="row">${CITIES[s.cityId].ko}에서 ${CITIES[s.leg.to].ko}</th><td>${MODES[s.leg.mode]} ${hm(s.leg.dep)} 출발, ${dur(s.leg.mins)}</td><td>${s.leg.booked ? '예약됨' : '미예약'}</td></tr>` : ''}`).join('')}
    <tr><th scope="row">귀국 항공</th><td>${h(t.flights.back.note) || '미입력'}</td><td>${t.flights.back.booked ? '예약됨' : '미예약'}</td></tr></tbody></table></section>
   <section><h2>날짜별 일정</h2>${days.map(d => { const b = blocksOf(t, d.i); return `<div class="bk-day"><h3 class="num">${fmtDate(d.date)} ${d.stops.map(s => CITIES[s.cityId].ko).join(', ')}</h3>${b.length ? `<ul>${b.map(x => `<li><span class="num">${hm(x.start)}</span>${h(x.title)}${x.note ? ` <em>${h(x.note)}</em>` : ''}</li>`).join('')}</ul>` : '<p class="muted">자유 일정</p>'}</div>`; }).join('')}</section>
   <section><h2>도시 메모</h2>${cities.map(c => { const p = cityPass(c.id); return `<div class="bk-day"><h3>${c.ko}</h3><p>${h(c.blurb)}${p ? `. 교통: ${h(p.name)}, 1회 ${p.single} ${p.cur}, 1일 ${p.day} ${p.cur}(참고값)` : ''}</p></div>`; }).join('')}</section>
  </article>`;
}

/* 모달 */
function modalView() {
  const m = UI.modal, t = trip(), wrap = (title, body, foot = '') => `<div class="scrim" data-act="closeModalBg"><div class="sheet ${m.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${h(title)}"><header><h2>${h(title)}</h2><button class="ghost small" data-act="closeModal">닫기</button></header><div class="sheet-body">${body}</div>${foot ? `<footer>${foot}</footer>` : ''}</div></div>`;
  if (m.type === 'city') {
    const q = (m.q || '').trim().toLowerCase(), mon = t ? new Date(t.startDate + 'T12:00:00').getMonth() : 0;
    const list = Object.values(CITIES).filter(c => !q || c.ko.includes(q) || c.en.toLowerCase().includes(q) || (COUNTRIES[c.cc] || '').includes(q));
    return wrap('도시 추가', `<input class="search" placeholder="도시나 나라 검색" value="${h(m.q || '')}" data-input="citySearch" aria-label="도시 검색"><ul class="city-pick">${list.map(c => `<li><button data-act="pickCity" data-id="${c.id}"><strong>${c.ko}</strong><span class="muted">${COUNTRIES[c.cc]}</span><span class="num">권장 ${c.ideal}박</span><span class="tag s${c.season[mon]}">${mon + 1}월 ${SEASON_WORDS[+c.season[mon]]}</span></button></li>`).join('') || '<li class="muted">검색 결과가 없습니다.</li>'}</ul>`);
  }
  if (m.type === 'guide') {
    const s = t.stops.find(x => x.id === m.id), c = CITIES[s.cityId], mon = new Date(t.startDate + 'T12:00:00').getMonth();
    return wrap(c.ko, `<p>${h(c.blurb)}</p><p class="muted">권장 체류 ${c.ideal}박, 최소 ${c.min}박</p>
     <h3>월별 추천도</h3><ol class="months">${[...c.season].map((v, i) => `<li class="s${v} ${i === mon ? 'cur' : ''}"><span class="num">${i + 1}</span><b class="num">${v}</b></li>`).join('')}</ol><p class="fine">5가 가장 좋음. 날씨, 혼잡, 운영 시기를 고려해 정리한 편집 기준입니다.</p>
     <h3>장소</h3><ul class="places">${c.places.map(p => `<li><div><strong>${h(p.name)}</strong><span class="muted">${TYPE_LABEL[p.type]}, ${dur(p.mins)}${p.book ? `, ${p.book}일 전 예약 권장` : ''}${p.closed.length ? `, ${p.closed.map(d => WD[d]).join('·')}요일 휴무 가능` : ''}</span></div><span class="row">${p.url ? `<a href="${h(p.url)}" target="_blank" rel="noopener">공식</a>` : ''}<button class="ghost small" data-act="addPlace" data-id="${p.id}" data-stop="${s.id}">일정에 넣기</button></span></li>`).join('')}</ul>`,
      `<button class="ghost danger" data-act="delStopModal" data-id="${s.id}">노선에서 빼기</button><button class="ghost" data-act="moveStopModal" data-id="${s.id}" data-d="-1">앞으로</button><button class="ghost" data-act="moveStopModal" data-id="${s.id}" data-d="1">뒤로</button>`);
  }
  if (m.type === 'item') {
    const it = m.isNew ? m.draft : t.items.find(i => i.id === m.id); if (!it) return '';
    const days = daysOf(t), cur = m.isNew ? m.day : itemDay(t, it), stop = days[cur]?.primary, c = stop ? CITIES[stop.cityId] : null;
    return wrap(m.isNew ? '일정 추가' : '일정 수정', `<form class="form" data-form="item">
      ${m.isNew && c ? `<label>장소에서 고르기<select name="place"><option value="">직접 입력</option>${c.places.map(p => `<option value="${p.id}">${h(p.name)}</option>`).join('')}</select></label>` : ''}
      <label>제목<input name="title" value="${h(it.title)}" ${m.isNew ? '' : 'required'}></label>
      <div class="cols"><label>날짜<select name="day">${days.map(d => `<option value="${d.i}" ${d.i === cur ? 'selected' : ''}>${fmtDate(d.date)} ${d.primary ? CITIES[d.primary.cityId].ko : ''}</option>`).join('')}</select></label><label>시작<input type="time" name="start" value="${hm(it.start)}" step="900"></label><label>분<input type="number" name="dur" min="15" step="15" value="${it.dur}"></label></div>
      <div class="cols"><label>종류<select name="type">${Object.entries(TYPE_LABEL).filter(e => e[0] !== 'move').map(([k, v]) => `<option value="${k}" ${it.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>금액(원)<input type="number" name="cost" min="0" step="1000" value="${it.cost || ''}"></label></div>
      <label>메모<textarea name="note" rows="2">${h(it.note || '')}</textarea></label></form>`,
      `${m.isNew ? '' : `<button class="ghost danger" data-act="delItem" data-id="${it.id}">삭제</button>`}<button class="primary" data-act="saveItem">${m.isNew ? '추가' : '저장'}</button>`);
  }
  if (m.type === 'leg') {
    const s = t.stops.find(x => x.id === m.id), a = CITIES[s.cityId], b = CITIES[s.leg.to];
    return wrap(`${a.ko}에서 ${b.ko}`, `<form class="form" data-form="leg"><div class="cols"><label>수단<select name="mode">${Object.entries(MODES).map(([k, v]) => `<option value="${k}" ${s.leg.mode === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>출발<input type="time" name="dep" value="${hm(s.leg.dep)}" step="300"></label><label>소요(분)<input type="number" name="mins" min="10" value="${s.leg.mins}"></label></div><div class="cols"><label>1인 참고 요금(유로)<input type="number" name="fare" min="0" value="${s.leg.fare}"></label><label>실제 총액(원)<input type="number" name="price" min="0" step="1000" value="${s.leg.price || ''}"></label></div><label class="check"><input type="checkbox" name="booked" ${s.leg.booked ? 'checked' : ''}>예약 완료</label></form>`, `<a class="btn ghost" href="${routeUrl(a, b)}" target="_blank" rel="noopener">경로 비교</a><button class="primary" data-act="saveLeg" data-id="${s.id}">저장</button>`);
  }
  if (m.type === 'flight') {
    const f = t.flights;
    return wrap('국제선 항공', `<form class="form" data-form="flight"><h3>입국</h3><div class="cols"><label>도착 시각<input type="time" name="arr" value="${hm(f.out.arr)}"></label><label>금액(원)<input type="number" name="outPrice" min="0" step="10000" value="${f.out.price || ''}"></label></div><label>편명과 메모<input name="outNote" value="${h(f.out.note)}"></label><label class="check"><input type="checkbox" name="outBooked" ${f.out.booked ? 'checked' : ''}>예약 완료</label><h3>귀국</h3><div class="cols"><label>출발 시각<input type="time" name="dep" value="${hm(f.back.dep)}"></label><label>금액(원)<input type="number" name="backPrice" min="0" step="10000" value="${f.back.price || ''}"></label></div><label>편명과 메모<input name="backNote" value="${h(f.back.note)}"></label><label class="check"><input type="checkbox" name="backBooked" ${f.back.booked ? 'checked' : ''}>예약 완료</label></form>`, `<a class="btn ghost" href="${t.stops.length ? flightUrl(t) : '#'}" target="_blank" rel="noopener">항공권 검색</a><button class="primary" data-act="saveFlight">저장</button>`);
  }
  if (m.type === 'survey') {
    return wrap('조건으로 추천받기', `<form class="form" data-form="survey"><div class="cols"><label>출발일<input type="date" name="date" value="${h(m.date || addDays(today(), 120))}"></label><label>기간(박)<input type="number" name="nights" min="3" max="40" value="10"></label><label>인원<input type="number" name="adults" min="1" max="12" value="2"></label></div><label>누구와 가나요<select name="type">${Object.entries(TRAVELER_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label>바라는 점<textarea name="wish" rows="2" placeholder="예: 이동은 적게, 미술관과 와인 위주"></textarea></label></form>${m.results ? `<h3>추천 노선</h3><div class="tpl-grid one">${m.results.map(proposalCard).join('')}</div>` : ''}${m.error ? `<p class="error">${h(m.error)}</p>` : ''}`,
      `<button class="ghost" data-act="surveyRule">예시 노선에서 찾기</button><button class="primary" data-act="surveyAi" ${UI.busy ? 'disabled' : ''}>${UI.busy ? '만드는 중' : 'AI로 맞춤 제안'}</button>`);
  }
  if (m.type === 'share') {
    return wrap('여행 공유', `<p>링크를 받은 사람은 자기 브라우저에 사본을 만듭니다. 내 원본은 바뀌지 않습니다.</p><label class="form">공유 링크<textarea readonly rows="4" id="shareUrl">${h(m.url || '만드는 중')}</textarea></label><p class="fine">첨부 파일과 API 키는 포함되지 않습니다. 메모와 예약 내용은 링크에 함께 담기므로 믿을 수 있는 사람에게만 보내세요.</p>`, `<button class="ghost" data-act="exportJson">파일로 내보내기</button><button class="primary" data-act="copyShare">링크 복사</button>`);
  }
  if (m.type === 'task') {
    return wrap('할 일 추가', `<form class="form" data-form="task"><label>할 일<input name="title" required maxlength="80"></label><label>날짜<input type="date" name="due" value="${addDays(today(), 7)}"></label></form>`, `<button class="primary" data-act="saveTask">추가</button>`);
  }
  if (m.type === 'confirm') {
    return wrap('여행 삭제', `<p>${h(m.name)}을 삭제합니다. 되돌릴 수 없습니다.</p>`, `<button class="ghost" data-act="closeModal">취소</button><button class="primary" data-act="confirmDel" data-id="${m.id}">삭제</button>`);
  }
  if (m.type === 'import') {
    return wrap('받은 여행', `<p><strong>${h(m.trip.name)}</strong></p><p>${m.trip.stops.map(s => `${CITIES[s.cityId].ko} ${s.nights}박`).join(' - ')}</p>`, `<button class="ghost" data-act="closeModal">취소</button><button class="primary" data-act="acceptImport">내 여행에 추가</button>`);
  }
  if (m.type === 'settings') {
    const u = S.settings.usage;
    return wrap('설정', `<form class="form"><h3>AI 연결</h3><label>Anthropic API 키<input type="password" autocomplete="off" value="${h(S.settings.key || '')}" data-chg="apiKey" placeholder="sk-ant-로 시작"></label><p class="fine">키는 이 브라우저에만 저장되고 Anthropic API로만 전송됩니다. 공용 PC에서는 입력하지 마세요. 키를 저장소나 공유 링크에 넣으면 안 됩니다.</p>
      <label>모델<select data-chg="model"><option value="claude-haiku-5-5" ${S.settings.model === 'claude-haiku-5-5' ? 'selected' : ''}>Haiku 5.5, 빠르고 저렴함</option><option value="claude-sonnet-5-5" ${S.settings.model === 'claude-sonnet-5-5' ? 'selected' : ''}>Sonnet 5.5, 복잡한 일정에 적합</option></select></label>
      <label>월 토큰 한도<input class="num" type="number" min="0" step="10000" value="${S.settings.tokenCap}" data-chg="tokenCap"></label><p class="num">이번 달 사용량: 입력 ${u.input.toLocaleString()}, 출력 ${u.output.toLocaleString()}</p>
      <h3>데이터</h3><p class="fine">여행은 이 브라우저에 저장됩니다. 사이트 주소가 바뀌면 다시 보이지 않을 수 있으니 중요한 여행은 파일로 내보내세요.</p></form>`);
  }
  return '';
}
function proposalCard(p, i) {
  const n = p.stops.reduce((a, s) => a + s[1], 0);
  return `<button class="tpl" data-act="useProposal" data-id="${i}"><span class="tpl-head"><strong>${h(p.name)}</strong><span class="num">${n}박</span></span><span class="tpl-line">${p.stops.map(s => `<i>${CITIES[s[0]].ko} ${s[1]}</i>`).join('')}</span><span class="tpl-note">${h(p.note || '')}</span></button>`;
}
