// DELVE — input, the panels, and the two cards people actually post.
//
// Everything that decides anything lives in rules.js; this file draws it and
// takes taps. The split is not tidiness — the server replays rules.js to check
// a delve, so a rule that leaked into this file would be a rule nothing could
// verify.
import { Run, KINDS, TIERS, TIER_COL, STAIRS, EXIT, hasExit, DIRS, walkable, W, H, WEAPONS, ARMOURS } from './rules.js';
import { drawFloor, drawFX, tileAt, VIEW_W, VIEW_H, TW, TH, HZ, box, px, C } from './render.js';

const $ = (id) => document.getElementById(id);
const view = { run: null, hurt: 0, t: 0, dpr: 1, fx: [] };

// One dungeon a day, the same for everybody. Exact comparison is what makes a
// delve worth talking about — "how far did you get today" only means something
// if it was the same today.
const todaySeed = () => `daily-${new Date().toISOString().slice(0, 10)}`;

// ---------------------------------------------------------------- drawing --
function fit() {
  const c = $('board'), stage = $('stage');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const room = stage.getBoundingClientRect();
  const scale = Math.max(0.55, Math.min(room.width / VIEW_W, room.height / VIEW_H));
  view.dpr = dpr * scale;
  c.width = Math.round(VIEW_W * scale * dpr);
  c.height = Math.round(VIEW_H * scale * dpr);
  c.style.width = `${VIEW_W * scale}px`;
  c.style.height = `${VIEW_H * scale}px`;
  paint();
}

function paint() {
  if (!view.run) return;
  const c = $('board').getContext('2d');
  c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawFloor(c, view.run, view.t, view.hurt > 0);
  const now = performance.now();
  drawFX(c, view.fx, now);
  view.fx = view.fx.filter((f) => now - f.t0 < 600);
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
  const r = view.run;
  $('depth').innerHTML = `▼ <b>Floor ${r.depth}</b> · ${r.floorName}`;

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
        + `<b>${p2.tier}</b><i>${p2.blurb}</i></div>`
      : '<div class="empty">nothing below</div>').join('')
      + '<div class="empty" style="margin-top:5px;">Two ways down. The badge says what is worth taking, '
      + 'never how dangerous it is.</div>';
  }
  $('b-out').textContent = onExit ? (tight ? `Out · ${r.carried.length}` : `Get out with ${r.carried.length}`)
    : (hasExit(r.depth) ? 'Get out' : (tight ? 'No way out' : 'No way out here'));

  const last = r.log[r.log.length - 1];
  if (last) $('log').textContent = last.line;
}

// -------------------------------------------------------------------- input --
function play(a) {
  const r = view.run;
  if (r.over) return;
  const before = r.hp;
  const res = r.act(a);
  if (!res.ok) { $('log').textContent = res.why; return; }
  if (r.hp < before) view.hurt = 8;
  // the act's event reel becomes transient paint; a stagger between events of
  // the same turn keeps a spit and its wound from landing as one smear
  const now = performance.now();
  (r.events || []).forEach((ev, i) => view.fx.push({ ...ev, t0: now + i * 60 }));
  if (view.fx.length > 60) view.fx.splice(0, view.fx.length - 60);
  renderAll();
  paint();
  if (r.over) setTimeout(finish, 420);
}

function tapped(ev) {
  const r = view.run;
  if (!r || r.over) return;
  const c = $('board'), rect = c.getBoundingClientRect();
  const p = ev.touches ? ev.touches[0] : ev;
  const sx = (p.clientX - rect.left) * (VIEW_W / rect.width);
  const sy = (p.clientY - rect.top) * (VIEW_H / rect.height);
  const [tx, ty] = tileAt(sx, sy);
  if (tx === r.x && ty === r.y) return play({ t: 'w' });
  const d = DIRS.findIndex(([dx, dy]) => r.x + dx === tx && r.y + dy === ty);
  if (d >= 0) return play({ t: 'm', d });
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
}

// The four grid directions read as the four diagonals on an isometric board,
// so the keys are laid out the way the board looks rather than the way the
// array is indexed.
const KEYS = {
  ArrowUp: 3, w: 3, W: 3, ArrowRight: 0, d: 0, D: 0,
  ArrowDown: 2, s: 2, S: 2, ArrowLeft: 1, a: 1, A: 1,
};

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
}

function shadeHex(col, f) {
  const n = parseInt(col.slice(1), 16);
  const v = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${v(16)},${v(8)},${v(0)})`;
}

function finish() {
  const sum = view.run.summary();
  shareCard(sum);
  $('over-title').textContent = sum.out ? 'YOU GOT OUT' : 'YOU DIED DOWN THERE';
  $('over-why').textContent = sum.out
    ? (sum.kept.length ? `You carried ${sum.kept.length} relic${sum.kept.length > 1 ? 's' : ''} into the light.`
      : 'You got out with nothing. That still counts as getting out.')
    : (sum.lost.length ? `${sum.lost.length} relic${sum.lost.length > 1 ? 's' : ''} stayed down there with you.`
      : 'You were carrying nothing, at least.');
  $('over-fine').textContent = sum.out
    ? 'Nothing is minted yet — this is the game before the chain. Post the card and tell me how deep you got.'
    : 'Every relic you were holding is gone. That is the whole game.';
  $('over').classList.add('on');
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
  view.run = new Run(seed || todaySeed(), loadout);
  view.hurt = 0;
  $('over').classList.remove('on');
  renderAll();
  fit();
}

export function boot() {
  const c = $('board');
  c.addEventListener('click', tapped);
  window.addEventListener('resize', fit);
  window.addEventListener('keydown', (e) => {
    if ($('intro').classList.contains('on')) { if (e.key === 'Enter' || e.key === ' ') $('i-go').click(); return; }
    if (view.run && view.run.over) return;
    if (e.key in KEYS) { e.preventDefault(); return play({ t: 'm', d: KEYS[e.key] }); }
    if (e.key === ' ' || e.key === '.') { e.preventDefault(); return play({ t: 'w' }); }
    if (e.key === '>' || e.key === 'Enter') return play({ t: 'd' });
  });

  $('b-wait').onclick = () => play({ t: 'w' });
  $('b-deep').onclick = () => play({ t: 'd' });
  $('b-out').onclick = () => play({ t: 'x' });
  $('c-copy').onclick = copyCard;
  $('c-save').onclick = saveCard;
  $('c-again').onclick = () => begin();
  $('i-go').onclick = () => { $('intro').classList.remove('on'); fit(); };

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
    view, play, begin, paint, Run, replay: (seed, acts) => new Run(seed) && acts,
    geom: { VIEW_W, VIEW_H, TW, TH, HZ, W, H, px, tileAt },
  };

  // a seed in the hash replays somebody else's dungeon, which is how a shared
  // card turns into a game somebody else plays
  const m = /seed=([a-z0-9-]+)/i.exec(location.hash || '');
  begin(m ? m[1] : todaySeed());
  requestAnimationFrame(tick);
}
