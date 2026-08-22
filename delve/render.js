// DELVE — the look of the place.
//
// One floor, one screen, the whole thing visible at once. That is a design
// choice, not a limitation: you cannot make a fight a puzzle if half the board
// is off camera, and a screenshot of a fully visible board is a screenshot
// somebody might actually post.
import { W, H, WALL, FLOOR, RUBBLE, STAIRS, EXIT, GAP, idx, KINDS, TIER_COL } from './rules.js';
import { MODELS, PROPS } from './models.js';


// Chunkier than the old island: nine tiles have to fill a phone screen.
export const TW = 46, TH = 33, HZ = 18;
const RIM_H = 0.55, PILLAR_H = 1.35;
const WALL_H = PILLAR_H;
export const VIEW_W = (W + H) * TW / 2 + 12;
export const VIEW_H = (W + H) * TH / 2 + WALL_H * HZ + 30;
const OX = VIEW_W / 2, OY = WALL_H * HZ + 17;

export const C = {
  void: '#0b0d12',
  floorA: '#9a9689', floorB: '#8e8a7d', floorMoss: '#7f8a68', grout: '#3b3a33',
  wall: '#8b8173', wallCap: '#9d9384', wallMoss: '#8d9a6b', rim: '#2a2d38',
  rubble: '#b3a894', stair: '#ffc86a', exit: '#ffe08a',
  skin: '#f6e8cd', cloak: '#5b9ad0', steel: '#eef2f7',
  husk: '#9dbb72', spit: '#c977b4', sent: '#6e737f',
  threat: 'rgba(232,74,54,0.60)', aim: 'rgba(255,182,64,0.55)',
  ember: '#ffb347', shadow: 'rgba(8,10,16,0.42)',
  // the light map
  ambient: '#3c4258',           // what an unlit tile is multiplied by: dark and cool
  torch: '#ffc27a',             // and what a lit one gets back
};

const memo = new Map();
// Returns HEX, not rgb(), and that is load-bearing: shade composes with itself
// (the moss jitter shades a colour, then the face shading shades it again).
// It used to return `rgb(...)`, which its own parser could not read back, so a
// second shade produced NaN and every mossy voxel painted pure black. Pillars
// were black silhouettes for exactly that reason. Keep the output parseable by
// the input.
export function shade(col, f) {
  const k = col + ':' + f;
  let v = memo.get(k);
  if (v === undefined) {
    const n = parseInt(col.slice(1), 16);
    const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
    v = '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
    memo.set(k, v);
  }
  return v;
}

const F_RIGHT = 0.80, F_LEFT = 0.62;
export const px = (x, y, z = 0) => [OX + (x - y) * TW / 2, OY + (x + y) * TH / 2 - z * HZ];

// the inverse, so a tap on the screen lands on a tile
export function tileAt(sx, sy) {
  const dx = (sx - OX) / (TW / 2), dy = (sy - OY) / (TH / 2);
  return [Math.round((dx + dy) / 2 - 0.5), Math.round((dy - dx) / 2 - 0.5)];
}

function quad(c, pts, col) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  c.fill();
}

// Only three faces of a box are ever visible — the top, and the two facing the
// camera — so each box is three quads and the paint order does the rest.
//
// The outline is not decoration. On a board where a monster, a lump of rubble
// and a wall are all brown, the silhouette is the only thing that separates
// them at a glance, and a glance is all a player gives it.
export function box(c, x, y, z, w, d, h, col, line = 'rgba(22,17,13,0.55)') {
  const x1 = x + w, y1 = y + d, z1 = z + h;
  quad(c, [px(x, y1, z1), px(x1, y1, z1), px(x1, y1, z), px(x, y1, z)], shade(col, F_LEFT));
  quad(c, [px(x1, y, z1), px(x1, y1, z1), px(x1, y1, z), px(x1, y, z)], shade(col, F_RIGHT));
  quad(c, [px(x, y, z1), px(x1, y, z1), px(x1, y1, z1), px(x, y1, z1)], col);
  if (!line) return;
  const o = [px(x, y, z1), px(x1, y, z1), px(x1, y1, z1), px(x1, y1, z), px(x1, y, z)];
  const o2 = [px(x, y1, z1), px(x1, y1, z1), px(x1, y1, z), px(x, y1, z)];
  c.strokeStyle = line;
  c.lineWidth = 1.1;
  c.lineJoin = 'round';
  for (const path of [o, o2]) {
    c.beginPath();
    c.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) c.lineTo(path[i][0], path[i][1]);
    c.stroke();
  }
}

const flat = (c, x, y, col, z = 0) =>
  quad(c, [px(x, y, z), px(x + 1, y, z), px(x + 1, y + 1, z), px(x, y + 1, z)], col);

const SLAB = 0.42;
function slab(c, x, y, col) {
  const x1 = x + 1, y1 = y + 1;
  quad(c, [px(x, y1, 0), px(x1, y1, 0), px(x1, y1, -SLAB), px(x, y1, -SLAB)], shade(col, 0.42));
  quad(c, [px(x1, y, 0), px(x1, y1, 0), px(x1, y1, -SLAB), px(x1, y, -SLAB)], shade(col, 0.30));
  flat(c, x, y, col);
}

// ------------------------------------------------------------- voxel models --
// A model is a stack of layers of little cubes. Two things make that look
// sculpted rather than like a pile of boxes, and both are cheap:
//
//   CULLING   a face with a neighbour against it is never drawn. A solid block
//             becomes a shell, which is both correct and about six times less
//             work than drawing every cube whole.
//   OCCLUSION a face darkens where its neighbours crowd it, so the creases
//             between voxels read as creases instead of as flat colour.

// A model's footprint is however wide it was authored, not a global constant.
// Props are drawn on a 6 grid; creatures need 8, because Minecraft proportions
// are a narrow slab body with arms clear of it, and that cannot be said in six
// columns. Deriving it per model means one library can hold both.
const MODEL_W = 6;
const AO_TOP = 0.86, AO_SIDE = 0.80;

// unpack once: models are text, and text is slow to walk sixty times a second
const packed = new Map();
function pack(model) {
  let p = packed.get(model);
  if (p) return p;
  const at = new Map();
  const list = [];
  model.layers.forEach((layer, z) => {
    layer.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        at.set(`${x},${y},${z}`, ch);
        list.push([x, y, z, ch]);
      });
    });
  });
  // painter order: further from the camera first, then upward
  list.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[2] - b[2]);
  const wide = model.layers.reduce((m2, layer) =>
    layer.reduce((m3, row) => Math.max(m3, row.length), m2), 0);
  p = { at, list, depth: model.layers.length, w: Math.max(MODEL_W, wide) };
  packed.set(model, p);
  return p;
}

// Every pillar is the same pillar and every husk is the same husk, so each one
// is drawn ONCE into its own little canvas and then stamped wherever it is
// needed. Measured before this: 1,938 path fills a frame, which is 116,000 a
// second at sixty frames and far too much for a phone. A stamp is one blit.
//
// The key has to include the device scale, or a sprite baked on one screen is
// blurry on another.
const sprites = new Map();

function spriteFor(model, opts, unit) {
  const key = `${opts.id}|${opts.size}|${opts.height}|${opts.flash}|${JSON.stringify(opts.swap)}|${unit.toFixed(3)}`;
  let sp = sprites.get(key);
  if (sp) return sp;

  // how far the model reaches from its tile origin, in screen pixels
  const s = opts.size / pack(model).w;
  const vh = opts.height === null ? s * (TW / 2) / HZ : opts.height / pack(model).depth;
  const top = (opts.lift0 || 0) + pack(model).depth * vh;
  const xs = [], ys = [];
  for (const [X, Y, Z] of [[0, 0, 0], [opts.size, 0, 0], [0, opts.size, 0], [opts.size, opts.size, 0],
    [0, 0, top], [opts.size, 0, top], [0, opts.size, top], [opts.size, opts.size, top]]) {
    const [sx, sy] = px(X, Y, Z);
    xs.push(sx); ys.push(sy);
  }
  const pad = 2;
  const x0 = Math.floor(Math.min(...xs)) - pad, y0 = Math.floor(Math.min(...ys)) - pad;
  const wpx = Math.ceil(Math.max(...xs)) - x0 + pad, hpx = Math.ceil(Math.max(...ys)) - y0 + pad;

  const cv = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(Math.max(1, Math.round(wpx * unit)), Math.max(1, Math.round(hpx * unit)))
    : Object.assign(document.createElement('canvas'),
      { width: Math.max(1, Math.round(wpx * unit)), height: Math.max(1, Math.round(hpx * unit)) });
  const cc = cv.getContext('2d');
  cc.setTransform(unit, 0, 0, unit, -x0 * unit, -y0 * unit);
  paintModel(cc, model, 0, 0, opts);
  sp = { cv, x0, y0 };
  sprites.set(key, sp);
  return sp;
}

// Draw a model on a tile. `size` is how much of a tile it fills; `swap`
// recolours the palette slots a prop leaves open.
export function drawModel(c, model, tx, ty, opts = {}) {
  const full = {
    id: opts.id || model.id || modelId(model), size: opts.size ?? (model.scale || 1),
    lift: opts.lift || 0, lift0: 0, swap: opts.swap || null, alpha: opts.alpha ?? 1,
    flash: opts.flash || null, height: opts.height ?? model.height ?? null,
  };
  // A bob moves the sprite, it does not change it, so it is not part of the key.
  const unit = Math.abs(c.getTransform ? c.getTransform().a : 1) || 1;
  const sp = spriteFor(model, { ...full, lift: 0 }, unit);
  const [ax, ay] = px(tx + 0.5 - full.size / 2, ty + 0.5 - full.size / 2, full.lift);
  const [bx, by] = px(0, 0, 0);
  if (full.alpha !== 1) { c.save(); c.globalAlpha = full.alpha; }
  c.drawImage(sp.cv, ax - bx + sp.x0, ay - by + sp.y0, sp.cv.width / unit, sp.cv.height / unit);
  if (full.alpha !== 1) c.restore();
}

let nextId = 0;
const ids = new WeakMap();
function modelId(model) {
  let id = ids.get(model);
  if (id === undefined) { id = `m${nextId++}`; ids.set(model, id); }
  return id;
}

function paintModel(c, model, tx, ty, opts = {}) {
  const { size = model.scale || 1, lift = 0, swap = null, alpha = 1, flash = null, height = null } = opts;
  const p = pack(model);
  const s = size / p.w;                     // one voxel, in tile units
  // A cube by default; a fixed total height when the thing has to fit a slot,
  // which makes a column read as courses of masonry rather than as one stone.
  const vh = height === null ? s * (TW / 2) / HZ : height / p.depth;
  const ox = tx + 0.5 - size / 2, oy = ty + 0.5 - size / 2;
  const has = (x, y, z) => p.at.has(`${x},${y},${z}`);

  if (alpha !== 1) { c.save(); c.globalAlpha = alpha; }
  for (const [x, y, z, ch] of p.list) {
    let base = flash || swap?.[ch] || model.pal[ch] || '#f0f';
    if (!flash && model.moss) {
      const hv = ((x * 374761393) ^ (y * 668265263) ^ (z * 2246822519)) >>> 0;
      const high = z >= p.depth - 2;
      if (high && hv % 100 < (model.mossy || 0)) base = model.moss;
      else base = shade(base, 0.95 + (hv % 11) * 0.01);
    }
    const bx = ox + x * s, by = oy + y * s, bz = lift + z * vh;
    const x1 = bx + s, y1 = by + s, z1 = bz + vh;

    // left face (+y), only if nothing is against it
    if (!has(x, y + 1, z)) {
      const ao = (has(x, y + 1, z + 1) || has(x - 1, y + 1, z)) ? AO_SIDE : 1;
      quad(c, [px(bx, y1, z1), px(x1, y1, z1), px(x1, y1, bz), px(bx, y1, bz)], shade(base, F_LEFT * ao));
    }
    // right face (+x)
    if (!has(x + 1, y, z)) {
      const ao = (has(x + 1, y, z + 1) || has(x + 1, y - 1, z)) ? AO_SIDE : 1;
      quad(c, [px(x1, by, z1), px(x1, y1, z1), px(x1, y1, bz), px(x1, by, bz)], shade(base, F_RIGHT * ao));
    }
    // top
    if (!has(x, y, z + 1)) {
      const ao = (has(x + 1, y, z + 1) || has(x, y + 1, z + 1) || has(x - 1, y, z + 1) || has(x, y - 1, z + 1)) ? AO_TOP : 1;
      quad(c, [px(bx, by, z1), px(x1, by, z1), px(x1, y1, z1), px(bx, y1, z1)], shade(base, ao));
    }
  }
  if (alpha !== 1) c.restore();
}

// ------------------------------------------------------------------ actors --
// A figure has to be legible at a glance on a nine-tile board, which means it
// wants most of a tile — not a polite third of one. Each gets a contact shadow
// so it sits ON the floor rather than floating above it.
function contact(c, x, y, r) {
  const [cx, cy] = px(x + 0.5, y + 0.5);
  c.save();
  c.fillStyle = C.shadow;
  c.beginPath();
  c.ellipse(cx, cy, TW * r * 0.5, TH * r * 0.5, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawPlayer(c, x, y, hurt) {
  contact(c, x, y, 0.66);
  drawModel(c, MODELS.player, x, y, { flash: hurt ? '#d0604f' : null });
}

const FOE_MODEL = { husk: MODELS.husk, spitter: MODELS.spitter, sentinel: MODELS.sentinel };

function drawFoe(c, e) {
  contact(c, e.x, e.y, e.kind === 'sentinel' ? 0.72 : 0.62);
  drawModel(c, FOE_MODEL[e.kind] || MODELS.husk, e.x, e.y);
}

function drawRelic(c, g, t) {
  const b = g.x + 0.5, l = g.y + 0.5;
  const col = TIER_COL[g.relic.tier];
  const bob = Math.sin(t / 420 + g.x + g.y) * 0.06;
  const [cx, cy] = px(b, l);
  // A pool of its own colour on the floor. Loot that you have to hunt for on a
  // board this small is not mysterious, it is missed.
  c.save();
  const glow = c.createRadialGradient(cx, cy, 0, cx, cy, TW * 0.62);
  glow.addColorStop(0, col);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 0.42;
  c.fillStyle = glow;
  c.beginPath();
  c.ellipse(cx, cy, TW * 0.62, TH * 0.62, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  drawModel(c, PROPS.relic, g.x, g.y, {
    lift: bob, swap: { x: shade(col, 0.82), X: col },
  });
}

// ------------------------------------------------------------------ the floor --
export function drawFloor(c, run, t = 0, hurt = false) {
  c.fillStyle = C.void;
  c.fillRect(0, 0, VIEW_W, VIEW_H);

  const threat = run.threat();
  const rings = [];

  const lit = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (run.tiles[idx(x, y)] !== WALL) continue;
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .filter(([dx, dy]) => run.tiles[idx(x + dx, y + dy)] === FLOOR).length;
    if (!open) continue;
    lit.push({ x, y, open, h: ((x * 2654435761) ^ (y * 40503) ^ (run.depth * 97)) >>> 0 });
  }
  // the walls that face the most open floor carry the fire, so the pools land
  // where there is room for them rather than in a corner
  lit.sort((a2, b2) => b2.open - a2.open || a2.h - b2.h);
  const braziers = [];
  for (const cand of lit) {
    if (braziers.length >= 3) break;
    if (braziers.some((b2) => Math.abs(b2[0] - cand.x) + Math.abs(b2[1] - cand.y) < 4)) continue;
    braziers.push([cand.x, cand.y, cand.h % 16]);
  }

  // Painter's algorithm by depth. Ties never overlap, so one pass is enough —
  // but a tall wall CAN cover the tile behind it, which is why this sorts on
  // x+y rather than trusting a plain nested loop.
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells.push([x, y]);
  cells.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);

  for (const [x, y] of cells) {
    const tile = run.tiles[idx(x, y)];
    if (tile === GAP) continue;                    // nothing here — that is the point
    if (tile === WALL) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (edge) { box(c, x, y, 0, 1, 1, RIM_H, C.rim); continue; }
      drawModel(c, PROPS.pillar, x, y, { size: 1, height: PILLAR_H });
      if (braziers.some((b2) => b2[0] === x && b2[1] === y)) {
        drawModel(c, PROPS.brazier, x, y, { lift: PILLAR_H });
      }
      continue;
    }

    // the ground, with a hairline of grout so nine tiles read as nine tiles.
    // Tiles on the cut edge of the plate are drawn as slabs so the edge shows.
    const grain = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const mossy = grain % 100 < 22;
    const base = shade(mossy ? C.floorMoss : ((x + y) % 2 ? C.floorA : C.floorB),
      0.94 + (grain % 9) * 0.013);
    const cut = run.tiles[idx(x + 1, y)] === GAP || run.tiles[idx(x, y + 1)] === GAP
      || x === W - 1 || y === H - 1
      || (x + 1 < W && run.tiles[idx(x + 1, y)] === undefined);
    if (cut) slab(c, x, y, base); else flat(c, x, y, base);
    c.strokeStyle = C.grout; c.lineWidth = 1;
    const p = [px(x, y), px(x + 1, y), px(x + 1, y + 1), px(x, y + 1)];
    c.beginPath(); c.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < 4; i++) c.lineTo(p[i][0], p[i][1]);
    c.closePath(); c.stroke();

    // a couple of chips in the stone, fixed per tile
    if (tile !== STAIRS && tile !== EXIT) {
      c.save();
      c.globalAlpha = 0.5;
      for (let g = 0; g < 2; g++) {
        const gx = 0.18 + ((grain >> (g * 5)) & 7) * 0.085;
        const gy = 0.18 + ((grain >> (g * 5 + 3)) & 7) * 0.085;
        quad(c, [px(x + gx, y + gy), px(x + gx + 0.11, y + gy),
          px(x + gx + 0.11, y + gy + 0.11), px(x + gx, y + gy + 0.11)], shade(base, 0.9));
      }
      c.restore();
    }

    const kind = threat.get(`${x},${y}`);
    if (kind) {
      flat(c, x, y, kind === 'strike' ? C.threat : C.aim, 0.02);
      rings.push([x, y, kind]);
    }

    if (tile === RUBBLE) {
      drawModel(c, PROPS.rubble, x, y, { size: 0.96, height: 0.42 });
    } else if (tile === STAIRS) {
      const door = run.stairs ? run.stairs.findIndex((p) => p[0] === x && p[1] === y) : -1;
      const seen = door >= 0 && run.peeks ? run.peeks[door] : null;
      const badge = seen ? TIER_COL[seen.tier] : C.stair;
      const rings = [badge, shade(badge, 0.55), shade(badge, 0.22), '#080605'];
      for (let s = 0; s < rings.length; s++) {
        const i2 = s * 0.12;
        quad(c, [px(x + i2, y + i2), px(x + 1 - i2, y + i2),
          px(x + 1 - i2, y + 1 - i2), px(x + i2, y + 1 - i2)], rings[s]);
      }
      // a chevron pointing the only way it goes
      c.save();
      c.strokeStyle = badge || C.stair; c.lineWidth = 2.2; c.lineCap = 'round';
      const a1 = px(x + 0.34, y + 0.58), a2 = px(x + 0.58, y + 0.58), a3 = px(x + 0.58, y + 0.34);
      c.beginPath(); c.moveTo(a1[0], a1[1]); c.lineTo(a2[0], a2[1]); c.lineTo(a3[0], a3[1]); c.stroke();
      c.restore();
      // and a gem floating over the mouth in the colour of what is down there
      if (seen) {
        const bob = Math.sin(t / 500 + x) * 0.06;
        const [gx, gy] = px(x + 0.5, y + 0.5, 1.0 + bob);
        c.save();
        c.globalAlpha = 0.35;
        c.fillStyle = badge;
        c.beginPath(); c.ellipse(gx, gy + 6, TW * 0.30, TH * 0.30, 0, 0, Math.PI * 2); c.fill();
        c.restore();
        box(c, x + 0.36, y + 0.36, 0.92 + bob, 0.28, 0.28, 0.28, badge);
        box(c, x + 0.44, y + 0.44, 1.20 + bob, 0.12, 0.12, 0.12, shade(badge, 1.5));
      }
    } else if (tile === EXIT) {
      flat(c, x, y, shade(C.exit, 0.42));
      c.save(); c.globalAlpha = 0.5; flat(c, x + 0.1, y + 0.1, C.exit, 0.02); c.restore();
      box(c, x + 0.10, y + 0.10, 0, 0.17, 0.17, 1.05, shade(C.exit, 0.68));
      box(c, x + 0.10, y + 0.73, 0, 0.17, 0.17, 1.05, shade(C.exit, 0.58));
      box(c, x + 0.10, y + 0.10, 1.05, 0.17, 0.80, 0.15, C.exit);
      // an arrow the way you would leave
      c.save();
      c.strokeStyle = '#fff6d8'; c.lineWidth = 2.4; c.lineCap = 'round';
      const u1 = px(x + 0.62, y + 0.50, 0.02), u2 = px(x + 0.38, y + 0.50, 0.02), u3 = px(x + 0.38, y + 0.74, 0.02);
      c.beginPath(); c.moveTo(u1[0], u1[1]); c.lineTo(u2[0], u2[1]); c.lineTo(u3[0], u3[1]); c.stroke();
      c.restore();
    }

    const g = run.ground.find((r) => r.x === x && r.y === y);
    if (g) drawRelic(c, g, t);
    const e = run.foeAt(x, y);
    if (e) drawFoe(c, e);
    if (run.x === x && run.y === y && !run.over) drawPlayer(c, x, y, hurt);
  }

  lightPass(c, run, t, braziers);

  // After the light, so a warning is exactly as red in the dark as in the
  // light. The mood is paint; the telegraph is the game.
  for (const [x, y, kind] of rings) {
    c.save();
    c.strokeStyle = kind === 'strike' ? '#ff7d63' : '#ffc65c';
    c.lineWidth = 2.6; c.lineJoin = 'round';
    const e0 = px(x + 0.05, y + 0.05, 0.04), e1 = px(x + 0.95, y + 0.05, 0.04);
    const e2 = px(x + 0.95, y + 0.95, 0.04), e3 = px(x + 0.05, y + 0.95, 0.04);
    c.beginPath(); c.moveTo(e0[0], e0[1]); c.lineTo(e1[0], e1[1]);
    c.lineTo(e2[0], e2[1]); c.lineTo(e3[0], e3[1]); c.closePath(); c.stroke();
    c.restore();
  }
}

// One multiply pass over the finished frame carries the whole mood of the
// place: a warm pool where the player is standing, the dark closing in at the
// edges. Cheaper than lighting anything individually, and it looks better.
// ------------------------------------------------------------- the light map --
// One offscreen canvas the size of the view: dark and cool everywhere, with a
// warm pool added wherever something is burning. Multiplied over the finished
// frame, that is the whole difference between a lit room and a dark room with
// fires in it — and it is four gradient fills, not a lighting engine.
//
// What it must never dim is a warning. The threat rings are painted AFTER this,
// so a tile that is about to be struck is exactly as red in the dark as in the
// light. Readability is the game; mood is the paint over it.
let lightMap = null;
function lightCanvas() {
  if (lightMap) return lightMap;
  const w = Math.ceil(VIEW_W), h = Math.ceil(VIEW_H);
  const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  lightMap = { cv, c: cv.getContext('2d') };
  return lightMap;
}

function lamp(lc, x, y, z, radius, colour, strength) {
  const [sx, sy] = px(x, y, z);
  const g = lc.createRadialGradient(sx, sy, 0, sx, sy, radius);
  g.addColorStop(0, colour);
  g.addColorStop(0.45, shade(colour, 0.55));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  lc.globalAlpha = strength;
  lc.fillStyle = g;
  lc.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  lc.globalAlpha = 1;
}

function lightPass(c, run, t, braziers) {
  const { cv, c: lc } = lightCanvas();
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalCompositeOperation = 'source-over';
  lc.fillStyle = C.ambient;
  lc.fillRect(0, 0, cv.width, cv.height);
  lc.globalCompositeOperation = 'lighter';
  lamp(lc, (W - 1) / 2 + 0.5, (H - 1) / 2 + 0.5, 0.8, TW * 5.4, '#464c60', 0.36);

  // a fire never burns steady
  const flick = (seed) => 0.86 + Math.sin(t / 190 + seed * 2.1) * 0.09 + Math.sin(t / 77 + seed) * 0.05;
  for (const [bx, by, seed] of braziers) lamp(lc, bx + 0.5, by + 0.5, PILLAR_H + 0.7, TW * 2.9, C.torch, 0.88 * flick(seed));
  if (!run.over) lamp(lc, run.x + 0.5, run.y + 0.5, 0.9, TW * 2.3, '#ffdcae', 0.76 * flick(7));
  if (run.exit) lamp(lc, run.exit[0] + 0.5, run.exit[1] + 0.5, 0.6, TW * 1.7, C.exit, 0.85);
  (run.stairs || []).forEach((p, i) => {
    const seen = run.peeks && run.peeks[i];
    lamp(lc, p[0] + 0.5, p[1] + 0.5, 0.2, TW * 1.25, seen ? TIER_COL[seen.tier] : C.stair, 0.75);
  });
  for (const g of run.ground) lamp(lc, g.x + 0.5, g.y + 0.5, 0.5, TW * 0.95, TIER_COL[g.relic.tier], 0.9);

  c.save();
  c.globalCompositeOperation = 'multiply';
  c.drawImage(cv, 0, 0, VIEW_W, VIEW_H);
  c.restore();
}
