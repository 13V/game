// DELVE — input, the panels, and the two cards people actually post.
//
// Everything that decides anything lives in rules.js; this file draws it and
// takes taps. The split is not tidiness — the server replays rules.js to check
// a delve, so a rule that leaked into this file would be a rule nothing could
// verify.
import { Run, replay, KINDS, TIERS, TIER_COL, STAIRS, EXIT, hasExit, DIRS, walkable, W, H, WEAPONS, ARMOURS, CLASSES, starterKit, hashStr } from './rules.js';
import { drawFloor, drawFX, tileAt, VIEW_W, VIEW_H, TW, TH, HZ, box, px, C, ANIM, lookAt, classPortrait, FX_LIFE } from './render.js';
import { init3d, draw3d, resize3d, tileAt3d, stats3d, VIEW3 } from './render3d.js';
import { makeCamp, STATIONS, CAMP_STAIR, dayKey, questsFor, loadProgress, creditRun,
  loadStash, saveStash, loadLoadout, saveLoadout, groats, loadClass, saveClass } from './camp.js';

const $ = (id) => document.getElementById(id);
const view = { run: null, hurt: 0, t: 0, dpr: 1, fx: [], mode: 'hub', hub: null, credited: false,
  // Which renderer draws the world. The flat one is the game as it shipped;
  // the deep one is the same rules seen through a real camera. Both read the
  // SAME run — nothing about the rules, the replay, or the board changes with
  // this switch, which is the only reason it is safe to offer at all.
  deep: false, three: null };
const wantsDeep = () => { try { return localStorage.getItem('delve.deep') === '1'; } catch { return false; } };
const setDeep = (on) => { try { localStorage.setItem('delve.deep', on ? '1' : '0'); } catch { /* fine */ } };

// One dungeon a day, the same for everybody. Exact comparison is what makes a
// delve worth talking about — "how far did you get today" only means something
// if it was the same today.
const todaySeed = () => `daily-${new Date().toISOString().slice(0, 10)}`;

// ---------------------------------------------------------------- drawing --
function fit() {
  const c = $('board'), c3 = $('board3d'), stage = $('stage');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const room = stage.getBoundingClientRect();
  const scale = Math.max(0.55, Math.min(room.width / VIEW_W, room.height / VIEW_H));
  view.dpr = dpr * scale;
  const w = Math.round(VIEW_W * scale), h = Math.round(VIEW_H * scale);
  c.width = w * dpr; c.height = h * dpr;
  c.style.width = `${w}px`; c.style.height = `${h}px`;
  if (c3) {
    c3.style.width = `${w}px`; c3.style.height = `${h}px`;
    if (view.three) resize3d(w * dpr, h * dpr);
  }
  c.hidden = !!view.deep;
  if (c3) c3.hidden = !view.deep;
  paint();
}

// The deep renderer is built the first time it is asked for, never at boot: a
// player who never turns it on never pays for it.
function ensure3d() {
  if (view.three) return true;
  if (typeof THREE === 'undefined') return false;
  try {
    view.three = init3d(THREE, $('board3d'));
    const r = $('board3d').getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    resize3d(Math.max(1, r.width * dpr), Math.max(1, r.height * dpr));
    return true;
  } catch (e) {
    view.deep = false;
    $('log').textContent = 'this device cannot draw the deep view';
    return false;
  }
}

function paint() {
  const scene = view.mode === 'hub' ? view.hub : view.run;
  if (!scene) return;
  if (view.deep && view.mode === 'run' && ensure3d()) {
    // the tween the flat renderer uses to slide the world is exactly the
    // position the camera should follow, so the two stay in step
    const a = { px: null, py: null, face: null };
    if (ANIM.cam) {
      const u = Math.min(1, Math.max(0, (view.t - ANIM.cam.t0) / 150));
      const k = 1 - (1 - u) ** 3;
      a.px = ANIM.cam.fx + (scene.x - ANIM.cam.fx) * k;
      a.py = ANIM.cam.fy + (scene.y - ANIM.cam.fy) * k;
    }
    draw3d(scene, view.t, view.hurt > 0, a);
    return;
  }
  const c = $('board').getContext('2d');
  c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawFloor(c, scene, view.t, view.mode === 'run' && view.hurt > 0);
  if (view.mode === 'hub') {
    // the stations say what they are — the camp is a menu you walk around in,
    // and a menu is labelled
    c.save();
    c.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    c.textAlign = 'center';
    // the camper you stand beside gives you their name
    for (const cm of view.hub.campers || []) {
      if (Math.abs(cm.x - view.hub.x) + Math.abs(cm.y - view.hub.y) !== 1) continue;
      const [nx3, ny3] = px(cm.x + 0.5, cm.y + 0.5, 2.3);
      c.font = '600 9px ui-sans-serif, system-ui, sans-serif';
      c.textAlign = 'center';
      c.lineWidth = 3; c.strokeStyle = 'rgba(10,10,14,0.85)';
      c.fillStyle = cm.ghost ? '#9a8fb8' : '#e8ddc4';
      c.strokeText(cm.name, nx3, ny3);
      c.fillText(cm.name, nx3, ny3);
    }
    for (const st of STATIONS) {
      const [sx, sy] = px(st.x + 0.5, st.y + 0.5, 1.5);
      c.lineWidth = 3; c.strokeStyle = 'rgba(10,10,14,0.8)';
      c.strokeText(st.name, sx, sy);
      c.fillStyle = '#e8ddc6';
      c.fillText(st.name, sx, sy);
    }
    const [dx2, dy2] = px(CAMP_STAIR[0] + 0.5, CAMP_STAIR[1] + 0.5, 1.5);
    c.lineWidth = 3; c.strokeStyle = 'rgba(10,10,14,0.8)';
    c.strokeText('DESCEND', dx2, dy2);
    c.fillStyle = '#ffc86a';
    c.fillText('DESCEND', dx2, dy2);
    c.restore();
  }
  const now = performance.now();
  drawFX(c, view.fx, now);
  view.fx = view.fx.filter((f) => now - f.t0 < (f.life || FX_LIFE[f.k] || 300) + 250);
}

// a slow tick, only so relics bob and a wound flashes — the game itself never
// advances without an input
function tick(now) {
  view.t = now;
  if (view.hurt > 0) view.hurt -= 1;
  paint();
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ panels --
function renderAll() {
  if (view.mode === 'hub') return renderHub();
  const r = view.run;
  $('depth').innerHTML = `▼ <b>Floor ${r.depth}</b> · ${r.floorName}`;
  $('b-wait').textContent = 'Hold still';
  $('sec-wield').textContent = 'WIELDING';

  const pips = [];
  for (let i = 0; i < r.maxHp(); i++) pips.push(`<span class="pip${i < r.hp ? '' : ' off'}"></span>`);
  $('hp').innerHTML = pips.join('') + `<span id="hpnum">${Math.max(0, r.hp)}/${r.maxHp()}</span>`;

  const gearRow = (g, slotName) => g
    ? `<div class="relic on"><span class="dot" style="background:${TIER_COL[g.tier]}"></span>`
      + `<b>${g.name}</b><i>${g.blurb}</i></div>`
    : `<div class="relic"><span class="dot" style="background:#3a3027"></span><b class="empty">no ${slotName}</b></div>`;
  const gearEl = $('gear');
  if (gearEl) gearEl.innerHTML = gearRow(r.weapon, 'weapon') + gearRow(r.armour, 'armour');

  // Tapping a weapon or armour in the pack WEARS it — and that costs the turn,
  // which is the whole cost, so the row says so.
  $('carry').innerHTML = r.carried.length
    ? r.carried.map((x) => {
      const wearable = (x.slot === 'weapon' || x.slot === 'armour') && !r.over;
      return `<div class="relic${wearable ? ' wear' : ''}"${wearable ? ` data-equip="${x.id}"` : ''}>`
        + `<span class="dot" style="background:${TIER_COL[x.tier]}"></span>`
        + `<b>${x.name}</b><i>${wearable ? 'tap to wear · costs the turn' : x.blurb}</i></div>`;
    }).join('')
    : '<div class="empty">Nothing yet. Relics lie on the floor — walk onto one to take it.</div>';
  $('carry').querySelectorAll('[data-equip]').forEach((el) => {
    el.onclick = () => play({ t: 'e', id: el.dataset.equip });
  });

  const live = [...new Set(r.enemies.filter((e) => e.hp > 0).map((e) => e.kind))];
  $('foes').innerHTML = live.length
    ? live.map((k) => `<div class="foe"><b>${KINDS[k].name}</b><span>${KINDS[k].blurb}</span></div>`).join('')
    : '<div class="empty">The floor is still.</div>';

  const onStair = r.at(r.x, r.y) === STAIRS;
  const onExit = r.at(r.x, r.y) === EXIT;
  $('b-deep').disabled = !onStair || r.over;
  $('b-out').disabled = !onExit || r.over;
  $('b-wait').disabled = r.over;
  const here = onStair ? r.doorAt(r.x, r.y) : -1;
  const mine = here >= 0 && r.peeks ? r.peeks[here] : null;
  const tight = window.innerWidth <= 620;
  $('b-deep').textContent = onStair
    ? (mine ? (tight ? `▼ ${mine.tier}` : `Take this stair · ${mine.tier}`) : 'Take this stair ▼')
    : 'Go deeper';

  const stairs = $('stairs');
  if (stairs) {
    stairs.innerHTML = (r.peeks || []).map((p2, i) => p2
      ? `<div class="relic${here === i ? ' on' : ''}"><span class="dot" style="background:${TIER_COL[p2.tier]}"></span>`
        + `<b>a ${p2.tier} relic</b><i>waits below</i></div>`
      : '<div class="empty">nothing below</div>').join('')
      + '<div class="empty" style="margin-top:5px;">Two ways down. The badge says what is worth taking, '
      + 'never how dangerous it is.</div>';
  }
  $('b-out').textContent = onExit ? (tight ? `Out · ${r.carried.length}` : `Get out with ${r.carried.length}`)
    : (hasExit(r.depth) ? 'Get out' : (tight ? 'No way out' : 'No way out here'));

  const last = r.log[r.log.length - 1];
  $('log').textContent = last ? last.line : `the lamp is lit. ${r.floorName.toLowerCase()} is listening.`;
}

// -------------------------------------------------------------------- input --
function play(a) {
  const r = view.run;
  if (r.over) return;
  const before = r.hp;
  const px0_ = r.x, py0_ = r.y, d0 = r.depth;
  const foesBefore = r.enemies.map((e) => [e, e.x, e.y]);
  const res = r.act(a);
  if (!res.ok) {
    $('log').textContent = res.why;
    const nowR = performance.now();
    if (!view.lastNo || nowR - view.lastNo > 1200) {
      view.lastNo = nowR;
      view.fx.push({ k: 'failure', x: r.x, y: r.y, z: 2.1, s: 0.7, t0: nowR });
    }
    return;
  }
  if (r.hp < before) view.hurt = 8;
  // the act's event reel becomes transient paint; a stagger between events of
  // the same turn keeps a spit and its wound from landing as one smear
  const now = performance.now();
  // the rules teleported; the screen catches up. Camera glides to the new
  // tile, foes tween theirs, and the event reel drives lunge/flash/shake.
  if (r.depth === d0) {
    if (r.x !== px0_ || r.y !== py0_) { ANIM.cam = { fx: px0_, fy: py0_, t0: now }; ANIM.step = now; }
    for (const [e, ex, ey] of foesBefore) {
      if ((e.x !== ex || e.y !== ey) && r.enemies.includes(e)) {
        const m = ANIM.map.get(e) || {}; m.fx = ex; m.fy = ey; m.t0 = now; ANIM.map.set(e, m);
      }
    }
  } else { ANIM.cam = null; ANIM.lunge = null; }
  for (const ev of r.events || []) {
    if (ev.k === 'swing') ANIM.lunge = { dx: ev.x - r.x, dy: ev.y - r.y, t0: now };
    else if (ev.k === 'lunge') ANIM.lunge = { dx: Math.sign(ev.tx - r.x), dy: Math.sign(ev.ty - r.y), t0: now };
    else if (ev.k === 'wound') ANIM.shake = now;
    else if (ev.k === 'hit' || ev.k === 'riposte') {
      const e = r.enemies.find((e2) => e2.x === ev.x && e2.y === ev.y);
      if (e) { const m = ANIM.map.get(e) || {}; m.hitT = now + 40; ANIM.map.set(e, m); }
    }
  }
  if (r.over && !r.out) r.events.push({ k: 'perish', x: r.x, y: r.y });
  for (const ev of r.events || []) {
    if (ev.k === 'aim' && (ev.at || []).some(([ax, ay]) => ax === r.x && ay === r.y)) {
      view.fx.push({ k: 'warning', x: ev.x, y: ev.y, t0: now + 120 });
    }
  }
  (r.events || []).forEach((ev, i) => view.fx.push({ ...ev, t0: now + i * 60 }));
  if (view.fx.length > 60) view.fx.splice(0, view.fx.length - 60);
  renderAll();
  paint();
  if (r.over) setTimeout(finish, 420);
}

function hubStep(d) {
  const h = view.hub;
  const nx = h.x + DIRS[d][0], ny = h.y + DIRS[d][1];
  if (!walkable(h.tiles, nx, ny) && h.at(nx, ny) !== STAIRS) return;
  ANIM.cam = { fx: h.x, fy: h.y, t0: performance.now() };
  ANIM.step = performance.now();
  h.x = nx; h.y = ny;
  const st = STATIONS.find((s2) => s2.x === nx && s2.y === ny);
  if (st) openStation(st.id);
  if (h.at(nx, ny) === STAIRS) { descend(); return; }
  renderHub();
  paint();
}

function tapped(ev) {
  const settled = view.mode === 'hub' ? view.hub : view.run;
  if (settled) lookAt(settled.x, settled.y);   // a tap lands on the settled board, mid-glide or not
  if (view.mode === 'hub') {
    const h = view.hub;
    const c = $('board'), rect = c.getBoundingClientRect();
    const p = ev.touches ? ev.touches[0] : ev;
    const sx = (p.clientX - rect.left) * (VIEW_W / rect.width);
    const sy = (p.clientY - rect.top) * (VIEW_H / rect.height);
    const [tx, ty] = tileAt(sx, sy);
    const d = DIRS.findIndex(([ddx, ddy]) => h.x + ddx === tx && h.y + ddy === ty);
    if (d >= 0) hubStep(d);
    return;
  }
  const r = view.run;
  if (!r || r.over) return;
  const c = view.deep && view.three ? $('board3d') : $('board');
  const rect = c.getBoundingClientRect();
  const p = ev.touches ? ev.touches[0] : ev;
  let tx, ty;
  if (view.deep && view.three) {
    // A perspective camera has no fixed screen-to-tile maths, so the tap is
    // fired into the world as a ray and read where it meets the floor. Same
    // answer as the flat renderer gives, from any angle.
    const nx = ((p.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((p.clientY - rect.top) / rect.height) * 2 - 1);
    [tx, ty] = tileAt3d(nx, ny);
  } else {
    const sx = (p.clientX - rect.left) * (VIEW_W / rect.width);
    const sy = (p.clientY - rect.top) * (VIEW_H / rect.height);
    [tx, ty] = tileAt(sx, sy);
  }
  if (tx === r.x && ty === r.y) return play({ t: 'w' });
  const d = DIRS.findIndex(([dx, dy]) => r.x + dx === tx && r.y + dy === ty);
  if (d >= 0) return play({ t: 'm', d });

  // Under a real camera the four grid directions land on screen as diagonals,
  // so a tap one tile "down" is a diagonal the rules do not allow and nothing
  // happens — which reads as a broken game rather than an illegal move. A near
  // tap therefore takes ONE step toward what was tapped: still one tap, one
  // turn, no pathfinding, nothing the player did not point at. The flat
  // renderer keeps its stricter rule, because there adjacency is obvious.
  if (view.deep) {
    const ddx = tx - r.x, ddy = ty - r.y;
    if (Math.abs(ddx) + Math.abs(ddy) <= 3) {
      const order = Math.abs(ddx) >= Math.abs(ddy)
        ? [[Math.sign(ddx), 0], [0, Math.sign(ddy)]]
        : [[0, Math.sign(ddy)], [Math.sign(ddx), 0]];
      for (const [sx2, sy2] of order) {
        if (!sx2 && !sy2) continue;
        const k = DIRS.findIndex(([dx, dy]) => dx === sx2 && dy === sy2);
        if (k < 0) continue;
        const nx2 = r.x + sx2, ny2 = r.y + sy2;
        if (walkable(r.tiles, nx2, ny2) || r.foeAt(nx2, ny2)) return play({ t: 'm', d: k });
      }
    }
  }
  // a foe further down a straight line, with a weapon that reaches: strike it
  const reach = (WEAPONS[r.weapon.form] || {}).reach || 1;
  if (reach > 1 && r.foeAt(tx, ty)) {
    const rd = DIRS.findIndex(([dx, dy]) => {
      for (let k = 2; k <= reach; k++) if (r.x + dx * k === tx && r.y + dy * k === ty) return true;
      return false;
    });
    if (rd >= 0) return play({ t: 'r', d: rd });
  }
  $('log').textContent = 'one step at a time — tap a tile beside you';
  const nowQ = performance.now();
  if (!view.lastNo || nowQ - view.lastNo > 1200) {
    view.lastNo = nowQ;
    view.fx.push({ k: 'question', x: r.x, y: r.y, z: 2.1, s: 0.7, t0: nowQ });
  }
}

// The four grid directions read as the four diagonals on an isometric board,
// so the keys are laid out the way the board looks rather than the way the
// array is indexed.
const KEYS = {
  ArrowUp: 3, w: 3, W: 3, ArrowRight: 0, d: 0, D: 0,
  ArrowDown: 2, s: 2, S: 2, ArrowLeft: 1, a: 1, A: 1,
};

// -------------------------------------------------------------------- camp --
const SLOT_ORDER = ['weapon', 'armour', 'charm'];

// Up to fifty of today's real delvers stand around the fire — everyone on the
// board, each in their calling's body, seated by a hash of their name so they
// keep the same spot all day. The dead sit among the living, ghost-pale.
function seatCampers() {
  fetchBoard().then((b) => {
    if (!view.hub) return;
    const mine = localStorage.getItem('delve.name') || '';
    const spots = view.hub.spots || [];
    if (!spots.length) return;
    const taken = new Set();
    const seat = (name) => {
      const i = hashStr(`seat:${name}`) % spots.length;
      for (let k = 0; k < spots.length; k++) {
        const j = (i + k) % spots.length;
        if (!taken.has(j)) { taken.add(j); return spots[j]; }
      }
      return spots[i];
    };
    view.hub.campers = (b.runs || []).filter((r) => r.name !== mine).slice(0, 50).map((r, i2) => {
      const [x, y] = seat(r.name);
      return { x, y, klass: r.gear && CLASSES[r.gear.class] ? r.gear.class : 'warden',
        ghost: !r.out, id: i2, name: r.name };
    });
    paint();
  }).catch(() => {});
}

function fireCheer() {
  const now = performance.now();
  for (const ch of view.cheer || []) view.fx.push({ ...ch, t0: now + (ch.at || 0) });
  view.cheer = [];
}

function goCamp() {
  const cameHome = view.mode === 'run';
  view.mode = 'hub';
  view.hub = view.hub || makeCamp();
  view.hub.klass = loadClass() || 'warden';   // the hub player wears the calling
  if (cameHome) {
    view.fx.push({ k: 'embark', x: CAMP_STAIR[0], y: CAMP_STAIR[1], z: 0.5, s: 1.3, t0: performance.now() });
  }
  seatCampers();
  fireCheer();
  view.credited = false;
  $('over').classList.remove('on');
  closeStation();
  renderHub();
  fit();
}

function descend() {
  closeStation();
  view.mode = 'run';
  begin(todaySeed());
}

function renderHub() {
  const day = dayKey();
  const sheet = questsFor(day);
  const prog = loadProgress(day);
  const loadout = loadLoadout() || {};
  const stash = loadStash();

  const klass = loadClass();
  $('depth').innerHTML = `<b>THE CAMP</b> · ${klass ? CLASSES[klass].noun : day}`;
  $('sec-wield').textContent = 'THE DELVER';
  $('hp').innerHTML = `<span id="hpnum">${groats()} groats</span>`;

  const gearRow = (g, slotName) => g
    ? `<div class="relic on"><span class="dot" style="background:${TIER_COL[g.tier]}"></span>`
      + `<b>${g.name}</b><i>${g.blurb || ''}</i></div>`
    : `<div class="relic"><span class="dot" style="background:#3a3027"></span><b class="empty">no ${slotName}</b></div>`;
  $('gear').innerHTML = (klass
    ? `<div class="relic on"><span class="dot" style="background:${CLASS_COL[klass]}"></span>`
      + `<b>${CLASSES[klass].noun}</b><i>${CLASSES[klass].blurb}</i></div>`
    : '<div class="relic"><span class="dot" style="background:#3a3027"></span><b class="empty">no calling yet</b></div>')
    + SLOT_ORDER.map((sl) => gearRow(loadout[sl], sl)).join('');

  const bySlot = { weapon: 0, armour: 0, charm: 0, treasure: 0 };
  stash.forEach((g) => { bySlot[g.slot] = (bySlot[g.slot] || 0) + 1; });
  $('carry').innerHTML = stash.length
    ? `<div class="empty">${stash.length} in the stash — ${bySlot.weapon} weapons, ${bySlot.armour} armour, ${bySlot.charm} charms. The forge chooses.</div>`
    : '<div class="empty">The stash is empty. Everything you carry out of the dungeon lands here.</div>';

  $('stairs').innerHTML = sheet.quests.map((q) => {
    const got = Math.min(q.need, prog.done[q.id] || 0);
    const done = got >= q.need;
    return `<div class="relic${done ? ' on' : ''}"><span class="dot" style="background:${done ? '#7fa05e' : '#3a3027'}"></span>`
      + `<b>${q.text}</b><i>${got}/${q.need}</i></div>`;
  }).join('') + `<div class="empty" style="margin-top:5px;">All three forge the day's prize: `
    + `<span style="color:${TIER_COL[sheet.prize.tier]}">${sheet.prize.name}</span> (a ${sheet.prize.slot}).</div>`;

  $('sec-ways').textContent = "TODAY'S MARKS";
  $('sec-threat').textContent = 'THE WAY DOWN';
  $('legend').style.display = 'none';
  $('foes').innerHTML = '<div class="empty">Forge — calling and gear. Board — the day\'s marks. '
    + 'Well — everyone else. The stair goes down.</div>';

  if (!view.hinted && klass) {
    const rank = (g) => (g ? TIERS.indexOf(g.tier) : -1);
    const better = stash.some((g) => g.slot === 'weapon'
      && (WEAPONS[g.form] || {}).klass === klass && rank(g) > rank(loadout.weapon));
    if (better) {
      view.hinted = true;
      const forge = STATIONS.find((s2) => s2.id === 'forge');
      view.fx.push({ k: 'lightbulb', x: forge.x, y: forge.y, z: 1.7, s: 0.9, t0: performance.now() + 400 });
    }
  }

  $('b-wait').textContent = 'Forge';
  $('b-deep').textContent = 'Descend ▼';
  $('b-out').textContent = 'Board';
  $('b-wait').disabled = false; $('b-deep').disabled = false; $('b-out').disabled = false;
  const last = 'the fire is warm. the dark is patient.';
  $('log').textContent = last;
}

// ---- the panels ----------------------------------------------------------
const CLASS_COL = { warden: '#7fa9d8', lancer: '#77d6a8', breaker: '#e0a35c', feral: '#c47fd8' };

// one frame of a baked sheet, as an inline-styled chip (CSS crops the strip)
function chip(name, idx, size) {
  if (typeof FX_SHEETS === 'undefined' || !FX_SHEETS[name]) return '';
  const m = FX_SHEETS[name];
  const sc = size / m.fh;
  return `<span style="display:inline-block;width:${Math.round(m.fw * sc)}px;height:${size}px;`
    + `background-image:url(${m.src});background-repeat:no-repeat;`
    + `background-position:-${Math.round(idx * m.fw * sc)}px 0;`
    + `background-size:${Math.round(m.fw * m.n * sc)}px ${size}px;`
    + `image-rendering:pixelated;vertical-align:middle;flex:none;"></span>`;
}

// The one question the camp asks before the first delve. Also reachable from
// the forge, for the day someone regrets their calling.
function openCalling() {
  $('st-title').textContent = 'YOUR CALLING';
  const body = $('st-body');
  const chosen = loadClass();
  body.innerHTML = Object.entries(CLASSES).map(([id, c]) =>
    `<div class="relic wear call${chosen === id ? ' on' : ''}" data-call="${id}">`
    + `<img class="port" alt="" src="${classPortrait(id)}">`
    + `<span class="ct"><b style="color:${CLASS_COL[id]}">${c.noun}</b>`
    + `<i>${c.blurb}. Arms: ${c.weapons.map((w) => WEAPONS[w].noun).join(' & ')}</i></span></div>`).join('')
    + '<div class="empty" style="margin-top:6px;">Four callings, four armouries — an arm of another calling is scrap in your hands. '
    + 'Delve with three friends who chose differently and the day belongs to the warband.</div>';
  body.querySelectorAll('[data-call]').forEach((el) => {
    el.onclick = () => {
      saveClass(el.dataset.call);
      const l = loadLoadout() || {};
      l.weapon = null;                       // back to the new calling's camp arm
      saveLoadout(l);
      closeStation(); renderHub(); paint();
    };
  });
  $('station').classList.add('on');
}

function openStation(id) {
  const body = $('st-body');
  const day = dayKey();
  if (id === 'forge') {
    $('st-title').textContent = 'THE FORGE';
    const loadout = loadLoadout() || {};
    const stash = loadStash();
    const klass = loadClass() || 'warden';
    const row = (g, extra, cls) => `<div class="relic${cls || ''}" ${extra}>`
      + `<span class="dot" style="background:${TIER_COL[g.tier]}"></span><b>${g.name}</b><i>${g.blurb || g.slot}</i></div>`;
    const foreign = stash.filter((g) => g.slot === 'weapon' && (WEAPONS[g.form] || {}).klass !== klass);
    const camp = starterKit(klass).weapon;
    body.innerHTML = `<div class="sec">THE CALLING</div>`
      + `<div class="relic wear call" data-recall="1"><img class="port" alt="" src="${classPortrait(klass)}">`
      + `<span class="ct"><b style="color:${CLASS_COL[klass]}">${CLASSES[klass].noun}</b>`
      + `<i>${CLASSES[klass].blurb} — tap to choose again</i></span></div>`
      + SLOT_ORDER.map((sl) => {
        const options = stash.filter((g) => g.slot === sl
          && (sl !== 'weapon' || (WEAPONS[g.form] || {}).klass === klass));
        const worn = loadout[sl];
        const bare = sl === 'weapon'
          ? `<div class="relic"><span class="dot" style="background:${TIER_COL.common}"></span>`
            + `<b>${camp.name}</b><i>the calling's own arm, always at hand</i></div>`
          : `<div class="empty">nothing ${sl === 'charm' ? 'charming' : 'of the kind'} in the stash</div>`;
        return `<div class="sec">${sl.toUpperCase()}${worn ? '' : ' — bare'}</div>`
          + (worn ? row(worn, `data-unequip="${sl}"`, ' on wear') : '')
          + (options.filter((g) => !worn || g.id !== worn.id)
            .map((g) => row(g, `data-worn="${g.id}"`, ' wear')).join('')
            || (worn ? '' : bare));
      }).join('')
      + (foreign.length ? `<div class="empty" style="margin-top:6px;">${foreign.length} arm${foreign.length > 1 ? 's' : ''} of other callings rest in the stash — scrap in your hands, not in a friend's.</div>` : '');
    body.querySelectorAll('[data-recall]').forEach((el) => { el.onclick = () => openCalling(); });
    body.querySelectorAll('[data-worn]').forEach((el) => {
      el.onclick = () => {
        const g = loadStash().find((x) => x.id === el.dataset.worn);
        if (!g) return;
        const l = loadLoadout() || {};
        l[g.slot] = g;
        saveLoadout(l);
        openStation('forge'); renderHub();
      };
    });
    body.querySelectorAll('[data-unequip]').forEach((el) => {
      el.onclick = () => {
        const l = loadLoadout() || {};
        l[el.dataset.unequip] = null;
        saveLoadout(l);
        openStation('forge'); renderHub();
      };
    });
  } else if (id === 'board') {
    $('st-title').textContent = "TODAY'S MARKS";
    const sheet = questsFor(day);
    const prog = loadProgress(day);
    body.innerHTML = sheet.quests.map((q) => {
      const got = Math.min(q.need, prog.done[q.id] || 0);
      const done = got >= q.need;
      return `<div class="relic${done ? ' on' : ''}"><span class="dot" style="background:${done ? '#7fa05e' : '#3a3027'}"></span>`
        + `<b>${q.text}</b><i>${done ? `done · +${q.reward}` : `${got}/${q.need} · +${q.reward}`}</i></div>`;
    }).join('')
      + `<div class="relic" style="margin-top:8px;"><span class="dot" style="background:${TIER_COL[sheet.prize.tier]}"></span>`
      + `<b>${sheet.prize.name}</b><i>a ${sheet.prize.slot} · ${prog.claimed ? 'forged — it is yours' : 'forged when all three are done'}</i></div>`
      + '<div class="empty" style="margin-top:6px;">The marks are the same for everyone today. Progress adds up across every delve.</div>';
  } else if (id === 'well') {
    $('st-title').textContent = 'THE WELL';
    body.innerHTML = '<div class="empty">Listening…</div>';
    renderWell(body);
  }
  $('station').classList.add('on');
}

function closeStation() { $('station').classList.remove('on'); }

// The well is where everyone else is: today's standings, pulled from the same
// server that verifies every run before it believes it.
let boardCache = null;                       // { day, data } — one fetch a session
async function fetchBoard() {
  const day = dayKey();
  if (boardCache && boardCache.day === day) return boardCache.data;
  const res = await fetch(`/api/delve-board?day=${day}`);
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  boardCache = { day, data };
  return data;
}

async function renderWell(body) {
  try {
    const b = await fetchBoard();
    const mine = localStorage.getItem('delve.name') || '';
    const kOf = (r) => (r.gear && CLASSES[r.gear.class] ? r.gear.class : 'warden');
    const outCalls = new Set((b.runs || []).filter((r) => r.out).map(kOf));
    body.innerHTML = (b.runs || []).length
      ? (outCalls.size >= 4 ? '<div class="empty" style="color:#d8b45e;">THE WARBAND HELD — all four callings came home today.</div>' : '')
        + b.runs.slice(0, 12).map((r, i) =>
        `<div class="relic${r.name === mine ? ' on' : ''}">${i < 8 ? chip(`place${i + 1}`, 2, 20) : `<span class="dot" style="background:${r.out ? '#7fa05e' : '#c4614c'}"></span>`}`
        + `<b>${r.name}</b> <span style="color:${CLASS_COL[kOf(r)]};font-size:11px;">${CLASSES[kOf(r)].noun.toLowerCase()}</span>`
        + `<i>floor ${r.depth} · ${r.score} ${r.out ? '· out' : '· died'}</i></div>`).join('')
        + `<div class="empty" style="margin-top:6px;">${b.deaths?.length || 0} died down there today. Their bones are on your floor.</div>`
      : '<div class="empty">Nobody has come back yet today. Be the first name in the well. '
        + 'Bring three friends of the other callings and hold the warband.</div>';
    const well = STATIONS.find((s2) => s2.id === 'well');
    const now2 = performance.now();
    view.fx.push({ k: (b.runs || []).some((r) => r.name === mine) ? 'music2' : 'music1',
      x: well.x, y: well.y, z: 1.5, s: 0.9, t0: now2 });
    if (outCalls.size >= 4 && !view.warbanded) {
      view.warbanded = true;
      view.fx.push({ k: 'epicboom', x: well.x, y: well.y, z: 1.0, s: 2.2, t0: now2 + 300 });
      view.fx.push({ k: 'firework_y', x: well.x - 1, y: well.y, z: 1.8, s: 1.5, t0: now2 + 800 });
      view.fx.push({ k: 'firework_g', x: well.x + 1, y: well.y, z: 1.8, s: 1.5, t0: now2 + 1100 });
    }
  } catch {
    body.innerHTML = '<div class="empty">The well is quiet — the camp cannot reach the world from here. Delves still count on this device.</div>';
  }
}

// ------------------------------------------------------------------- the card --
// Both endings get a card. In an extraction game people post the losses more
// than the wins, so the death card is not an afterthought — it is the point.
function shareCard(sum) {
  const c = $('share').getContext('2d');
  const W2 = 1200, H2 = 630;
  c.setTransform(1, 0, 0, 1, 0, 0);

  const g = c.createLinearGradient(0, 0, 0, H2);
  g.addColorStop(0, sum.out ? '#241d15' : '#241413');
  g.addColorStop(1, '#12100d');
  c.fillStyle = g; c.fillRect(0, 0, W2, H2);

  c.strokeStyle = sum.out ? '#8d6f2c' : '#7a3a30';
  c.lineWidth = 3; c.strokeRect(16, 16, W2 - 32, H2 - 32);

  c.fillStyle = sum.out ? '#d9b45a' : '#c4614c';
  c.font = '600 30px ui-sans-serif, system-ui, sans-serif';
  c.fillText(sum.out ? 'EXTRACTED' : 'DIED IN THE DARK', 58, 90);

  c.fillStyle = '#ece0cb';
  c.font = '68px Marcellus, Georgia, serif';
  c.fillText(`Floor ${sum.depth}`, 58, 176);
  c.fillStyle = '#a3947f';
  c.font = '27px ui-sans-serif, system-ui, sans-serif';
  c.fillText(sum.floor, 58, 216);

  // the relic itself, drawn rather than described
  const items = sum.out ? sum.kept : sum.lost;
  const headline = sum.best;
  if (headline) {
    const col = TIER_COL[headline.tier];
    c.save();
    c.translate(W2 - 268, 268);
    c.scale(4.6, 4.6);
    if (!sum.out) c.globalAlpha = 0.34;
    const q = (pts, fill) => { c.fillStyle = fill; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fill(); };
    const P2 = (x, y, z) => [(x - y) * 22, (x + y) * 11 - z * 13];
    const cube = (x, y, z, s, fill, f) => {
      const x1 = x + s, y1 = y + s, z1 = z + s * 1.8;
      q([P2(x, y1, z1), P2(x1, y1, z1), P2(x1, y1, z), P2(x, y1, z)], shadeHex(fill, f * 0.62));
      q([P2(x1, y, z1), P2(x1, y1, z1), P2(x1, y1, z), P2(x1, y, z)], shadeHex(fill, f * 0.80));
      q([P2(x, y, z1), P2(x1, y, z1), P2(x1, y1, z1), P2(x, y1, z1)], shadeHex(fill, f));
    };
    cube(-0.4, -0.4, 0, 0.8, col, 1);
    cube(-0.2, -0.2, 1.5, 0.4, col, 1.45);
    c.restore();

    c.fillStyle = col;
    c.font = '600 21px ui-sans-serif, system-ui, sans-serif';
    c.fillText(headline.tier.toUpperCase(), 58, 300);
    c.fillStyle = sum.out ? '#ece0cb' : '#8a7d6c';
    c.font = '42px Marcellus, Georgia, serif';
    c.fillText(headline.name, 58, 350);
    if (items.length > 1) {
      c.fillStyle = '#7a6d5c';
      c.font = '21px ui-sans-serif, system-ui, sans-serif';
      c.fillText(`and ${items.length - 1} more`, 58, 386);
    }
  } else {
    c.fillStyle = '#7a6d5c';
    c.font = '30px ui-sans-serif, system-ui, sans-serif';
    c.fillText('carrying nothing', 58, 320);
  }

  const tierPts = { common: 10, rare: 40, epic: 120, mythic: 400 };
  const lostWorth = sum.lost.reduce((a, r) => a + tierPts[r.tier], 0);
  const stats = sum.out
    ? [['FELLED', sum.felled], ['TURNS', sum.turns],
      ['HEALTH', `${sum.hp}/${sum.maxHp}`], ['SCORE', sum.score.toLocaleString()]]
    : [['FELLED', sum.felled], ['TURNS', sum.turns],
      ['RELICS LOST', sum.lost.length], ['LEFT BEHIND', lostWorth.toLocaleString()]];
  stats.forEach(([k, v], i) => {
    const x = 58 + i * 178;
    c.fillStyle = '#6b5f50';
    c.font = '15px ui-sans-serif, system-ui, sans-serif';
    c.fillText(k, x, 478);
    c.fillStyle = '#ece0cb';
    c.font = '600 32px ui-sans-serif, system-ui, sans-serif';
    c.fillText(String(v), x, 516);
  });

  c.fillStyle = '#6b5f50';
  c.font = '19px ui-sans-serif, system-ui, sans-serif';
  c.fillText(`DELVE · ${sum.seed} · same dungeon for everyone today`, 58, 578);

  // the arcade stamps: a grade for the run, and the verdict — drawn once the
  // sheets decode, which is faster than anyone opens the card
  if (typeof FX_SHEETS !== 'undefined') {
    const grade = sum.score >= 800 ? 'S' : sum.score >= 500 ? 'A' : sum.score >= 300 ? 'B'
      : sum.score >= 150 ? 'C' : sum.score >= 50 ? 'D' : 'F';
    const stamp = (name, frame, x, y, scale) => {
      const m = FX_SHEETS[name];
      if (!m) return;
      const img = new Image();
      img.onload = () => {
        c.save();
        c.imageSmoothingEnabled = false;
        c.drawImage(img, frame * m.fw, 0, m.fw, m.fh, x, y, m.fw * scale, m.fh * scale);
        c.restore();
      };
      img.src = m.src;
    };
    stamp(`rank${grade}`, 2, W2 - 160, 42, 2.6);
    stamp(sum.out ? 'youwon' : 'youlost', 8, W2 - (sum.out ? 460 : 540), 500, 2.0);
  }
}

function shadeHex(col, f) {
  const n = parseInt(col.slice(1), 16);
  const v = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${v(16)},${v(8)},${v(0)})`;
}

function finish() {
  const sum = view.run.summary();
  // the camp is paid exactly once per run, whatever buttons get pressed after
  let credit = null;
  // only the daily pays into the camp: a borrowed dungeon replayed from a
  // shared link must not farm the day's marks, the stash, or the groats —
  // and a run begun before midnight credits the day it was begun for
  const daily = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(String(view.run.seed));
  let doneBefore = null;
  if (!view.credited && daily) {
    const p0 = loadProgress(daily[1]);
    const s0 = questsFor(daily[1]);
    doneBefore = s0.quests.filter((q) => (p0.done[q.id] || 0) >= q.need).length;
    view.credited = true;
    credit = creditRun(sum, daily[1]);
  }
  // the homecoming: what this run earned plays out at the camp's stations
  view.cheer = [];
  const board = STATIONS.find((s2) => s2.id === 'board');
  if (credit) {
    const doneNow = credit.sheet.quests.filter((q) => (credit.progress.done[q.id] || 0) >= q.need).length;
    for (let i = 0; i < doneNow - (doneBefore || 0); i++) {
      view.cheer.push({ k: 'success', x: board.x, y: board.y, z: 1.6, s: 0.9, at: 300 + i * 350 });
    }
    if (credit.coined) view.cheer.push({ k: 'coins', x: board.x, y: board.y, z: 0.8, s: 1.2, at: 250 });
    if (credit.prized) {
      view.cheer.push({ k: 'bolt', x: board.x, y: board.y, z: 1.2, s: 1.6, at: 500 });
      view.cheer.push({ k: 'bigflash', x: board.x, y: board.y, z: 0.9, s: 1.5, at: 640 });
      view.cheer.push({ k: 'finalboom', x: board.x, y: board.y, z: 0.9, s: 1.9, at: 720 });
      view.cheer.push({ k: 'firework_y', x: board.x + 1, y: board.y - 1, z: 1.8, s: 1.5, at: 1000 });
      view.cheer.push({ k: 'firework_g', x: board.x - 1, y: board.y + 1, z: 1.8, s: 1.5, at: 1250 });
    }
  }
  if (sum.out) view.cheer.push({ k: 'thumbsup', x: CAMP_STAIR[0], y: CAMP_STAIR[1], z: 1.8, s: 0.85, at: 400 });
  shareCard(sum);
  $('over-title').textContent = sum.out ? 'YOU GOT OUT' : 'YOU DIED DOWN THERE';
  $('over-why').textContent = sum.out
    ? (sum.kept.length ? `You carried ${sum.kept.length} relic${sum.kept.length > 1 ? 's' : ''} into the light.`
      : 'You got out with nothing. That still counts as getting out.')
    : (sum.lost.length ? `${sum.lost.length} relic${sum.lost.length > 1 ? 's' : ''} stayed down there with you.`
      : 'You were carrying nothing, at least.');
  const lines = [];
  if (credit && credit.coined) lines.push(`Treasure coined into ${credit.coined} groats.`);
  if (credit && credit.prized) lines.push(`All three marks done — the ${credit.prized.name} is forged into your stash.`);
  lines.push(sum.out
    ? 'What you carried out is in the stash. The forge decides what goes down next.'
    : 'Everything you found stayed down there. The camp\'s own gear came home.');
  $('over-fine').textContent = lines.join(' ');
  $('over').classList.add('on');
  submitRun(sum);
}

async function copyCard() {
  const btn = $('c-copy');
  try {
    const blob = await new Promise((res) => $('share').toBlob(res, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    btn.textContent = 'Copied';
  } catch { btn.textContent = 'Long-press the image to copy'; }
  setTimeout(() => { btn.textContent = 'Copy the card'; }, 1800);
}

// Fire-and-forget: the day's run goes up to be verified and ranked. The whole
// submission is (seed, loadout, acts) — the server replays it with the same
// rules before it believes a word of the summary.
function submitRun(sum) {
  try {
    const name = localStorage.getItem('delve.name')
      || `delver-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem('delve.name', name);
    const r = view.run;
    const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(String(r.seed));
    if (!m) return;                                      // only the daily ranks
    fetch('/api/delve-run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ day: m[1], name, acts: r.acts, loadout: r.loadout, claim: sum }),
    }).then(async (res) => {
      boardCache = null;                                 // the well hears about you
      try {
        const j = await res.json();
        if (j && j.rank === 1 && j.out) {
          (view.cheer = view.cheer || []).push(
            { k: 'crown', x: 22, y: 22, z: 2.4, s: 1.0, at: 1500 },
            { k: 'firework_y', x: 21, y: 21, z: 1.8, s: 1.6, at: 1800 },
            { k: 'firework_g', x: 23, y: 23, z: 1.8, s: 1.6, at: 2100 });
          if (view.mode === 'hub') fireCheer();
        }
      } catch { /* the crown can wait */ }
    }).catch(() => {});
  } catch { /* offline is a fine way to play */ }
}

function saveCard() {
  const a = document.createElement('a');
  a.href = $('share').toDataURL('image/png');
  a.download = `delve-${view.run.summary().seed}-floor${view.run.depth}.png`;
  a.click();
}

// ------------------------------------------------------------------- start --
function begin(seed) {
  let loadout = null;
  try { loadout = JSON.parse(localStorage.getItem('delve.loadout') || 'null'); } catch { loadout = null; }
  loadout = { ...(loadout || {}), class: loadClass() || 'warden' };
  ANIM.cam = null; ANIM.lunge = null;
  view.run = new Run(seed || todaySeed(), loadout);
  view.mode = 'run';
  view.credited = false;
  // the day's dead, as bones on the same floors — the dungeon is shared, so
  // their tiles are your tiles. Arrives whenever the well answers; a run that
  // never hears back simply has a lonelier dungeon.
  if (String(view.run.seed) === todaySeed()) {
    const mine = view.run;
    fetchBoard().then((b) => {
      if (view.run !== mine) return;
      mine.ghosts = (b.deaths || []).filter((d) => Number.isInteger(d.x) && Number.isInteger(d.y)
        && Number.isInteger(d.depth)).slice(0, 200);
    }).catch(() => {});
  }
  view.hurt = 0;
  $('sec-ways').textContent = 'THE TWO WAYS DOWN';
  $('sec-threat').textContent = 'WHAT IS ABOUT TO HAPPEN';
  $('legend').style.display = '';
  $('over').classList.remove('on');
  renderAll();
  fit();
}

export function boot() {
  const c = $('board');
  c.addEventListener('click', tapped);
  const c3 = $('board3d');
  if (c3) c3.addEventListener('click', tapped);
  window.addEventListener('resize', fit);

  // the deep view: same run, same rules, a real camera
  const deepBtn = $('b-deep3d');
  const sayDeep = () => {
    if (!deepBtn) return;
    deepBtn.textContent = `Deep view: ${view.deep ? 'on' : 'off'}`;
    deepBtn.style.borderColor = view.deep ? 'var(--goldD)' : 'var(--line)';
    deepBtn.style.color = view.deep ? 'var(--gold)' : 'var(--ink)';
  };
  view.deep = wantsDeep();
  if (deepBtn) {
    deepBtn.onclick = () => {
      view.deep = !view.deep;
      if (view.deep && !ensure3d()) view.deep = false;
      setDeep(view.deep);
      sayDeep();
      fit();
    };
    sayDeep();
  }
  window.addEventListener('keydown', (e) => {
    if ($('intro').classList.contains('on')) { if (e.key === 'Enter' || e.key === ' ') $('i-go').click(); return; }
    if ($('station').classList.contains('on')) { if (e.key === 'Escape') closeStation(); return; }
    if (view.mode === 'hub') {
      if ($('station').classList.contains('on') && e.key === 'Escape') return closeStation();
      if (e.key in KEYS) { e.preventDefault(); return hubStep(KEYS[e.key]); }
      return;
    }
    if (view.run && view.run.over) return;
    if (e.key in KEYS) { e.preventDefault(); return play({ t: 'm', d: KEYS[e.key] }); }
    if (e.key === ' ' || e.key === '.') { e.preventDefault(); return play({ t: 'w' }); }
    if (e.key === '>' || e.key === 'Enter') return play({ t: 'd' });
  });

  $('b-wait').onclick = () => (view.mode === 'hub' ? openStation('forge') : play({ t: 'w' }));
  $('b-deep').onclick = () => (view.mode === 'hub' ? descend() : play({ t: 'd' }));
  $('b-out').onclick = () => (view.mode === 'hub' ? openStation('board') : play({ t: 'x' }));
  $('st-close').onclick = closeStation;
  $('c-camp').onclick = goCamp;
  $('c-copy').onclick = copyCard;
  $('c-save').onclick = saveCard;
  $('c-again').onclick = () => begin();
  $('i-go').onclick = () => {
    $('intro').classList.remove('on'); fit();
    if (view.mode === 'hub' && !loadClass()) openCalling();
  };

  // The whole ruleset already runs in the browser — a server replays it to check
  // anything that matters — so there is nothing to hide by keeping it private,
  // and a handle on the live run is what lets a headless browser play the game
  // and prove it works.
  // The geometry goes out with it, so anything measuring this page — the phone
  // harness, the luminance probe, the frame-fill check — reads the board's real
  // size rather than keeping a copy that goes stale the moment the floor grows.
  // Every instrument that hardcoded 9x9 and 426 wide silently reported nonsense
  // for one round after the floors got bigger.
  window.DELVE = {
    view, play, begin, paint, Run, replay,
    hubStep, closeStation, STATIONS, CAMP_STAIR, ANIM,
    setDeep: (on) => { view.deep = on; ensure3d(); fit(); }, stats3d, VIEW3, tileAt3d,
    geom: { VIEW_W, VIEW_H, TW, TH, HZ, W, H, px, tileAt },
  };

  // a seed in the hash replays somebody else's dungeon, which is how a shared
  // card turns into a game somebody else plays
  // a shared seed goes straight down somebody else's hole; otherwise you wake
  // at the camp
  const m = /seed=([a-z0-9-]+)/i.exec(location.hash || '');
  if (m) { view.mode = 'run'; begin(m[1]); } else goCamp();
  requestAnimationFrame(tick);
}
