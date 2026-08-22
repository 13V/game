// DELVE — the look of the place.
//
// One floor, one screen, the whole thing visible at once. That is a design
// choice, not a limitation: you cannot make a fight a puzzle if half the board
// is off camera, and a screenshot of a fully visible board is a screenshot
// somebody might actually post.
import { W, H, WALL, FLOOR, RUBBLE, STAIRS, EXIT, idx, KINDS, TIER_COL } from './rules.js';

// Chunkier than the old island: nine tiles have to fill a phone screen.
export const TW = 46, TH = 23, HZ = 13;
const RIM_H = 0.55, PILLAR_H = 1.3;
const WALL_H = PILLAR_H;
export const VIEW_W = (W + H) * TW / 2 + 30;
export const VIEW_H = (W + H) * TH / 2 + WALL_H * HZ + 44;
const OX = VIEW_W / 2, OY = WALL_H * HZ + 24;

export const C = {
  void: '#141110', floorA: '#98928a', floorB: '#8c867e', grout: '#423d37',
  wall: '#312b25', rim: '#221e1a', rubble: '#b0a595', stair: '#e8bd74', exit: '#f7dc8c',
  skin: '#f6e8cd', cloak: '#5b9ad0', steel: '#eef2f7',
  husk: '#9dbb72', spit: '#c977b4', sent: '#6e737f',
  threat: 'rgba(206,68,52,0.55)', aim: 'rgba(230,164,58,0.50)',
  ember: '#ffb347', shadow: 'rgba(20,15,12,0.34)',
};

const memo = new Map();
function shade(col, f) {
  const k = col + f;
  let v = memo.get(k);
  if (v === undefined) {
    const n = parseInt(col.slice(1), 16);
    const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
    v = `rgb(${c(16)},${c(8)},${c(0)})`;
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
  const b = x + 0.5, l = y + 0.5;
  contact(c, x, y, 0.62);
  // a ring on the floor, so on a crowded board you can always find yourself
  c.save();
  c.strokeStyle = 'rgba(255,236,190,0.75)'; c.lineWidth = 2;
  const g0 = px(x + 0.10, y + 0.10, 0.02), g1 = px(x + 0.90, y + 0.10, 0.02);
  const g2 = px(x + 0.90, y + 0.90, 0.02), g3 = px(x + 0.10, y + 0.90, 0.02);
  c.beginPath(); c.moveTo(g0[0], g0[1]); c.lineTo(g1[0], g1[1]);
  c.lineTo(g2[0], g2[1]); c.lineTo(g3[0], g3[1]); c.closePath(); c.stroke();
  c.restore();
  const body = hurt ? '#d0604f' : C.cloak;
  box(c, b - 0.26, l - 0.26, 0, 0.52, 0.52, 0.62, body);                  // cloak
  box(c, b - 0.19, l - 0.19, 0.62, 0.38, 0.38, 0.32, C.skin);             // head
  box(c, b - 0.21, l - 0.21, 0.90, 0.42, 0.42, 0.10, shade(body, 1.18));  // hood brim
  box(c, b + 0.16, l - 0.05, 0.34, 0.10, 0.10, 0.78, C.steel);            // the blade
}

function drawFoe(c, e) {
  const b = e.x + 0.5, l = e.y + 0.5;
  contact(c, e.x, e.y, 0.60);
  if (e.kind === 'husk') {
    box(c, b - 0.25, l - 0.25, 0, 0.50, 0.50, 0.50, C.husk);
    box(c, b - 0.17, l - 0.17, 0.50, 0.34, 0.34, 0.30, shade(C.husk, 0.80));
    box(c, b - 0.05, l - 0.20, 0.66, 0.10, 0.10, 0.08, '#2a2a1c');        // one eye
  } else if (e.kind === 'spitter') {
    box(c, b - 0.30, l - 0.30, 0, 0.60, 0.60, 0.22, shade(C.spit, 0.74)); // squat base
    box(c, b - 0.17, l - 0.17, 0.22, 0.34, 0.34, 0.46, C.spit);
    box(c, b - 0.09, l - 0.09, 0.68, 0.18, 0.18, 0.20, C.ember);          // the glowing maw
  } else {
    box(c, b - 0.32, l - 0.32, 0, 0.64, 0.64, 0.66, C.sent);              // the big one
    box(c, b - 0.22, l - 0.22, 0.66, 0.44, 0.44, 0.34, shade(C.sent, 0.84));
    box(c, b - 0.40, l - 0.08, 0.30, 0.80, 0.16, 0.14, shade(C.sent, 0.68)); // the arm
    box(c, b - 0.12, l - 0.12, 1.00, 0.24, 0.24, 0.10, C.steel);          // a crown of plate
  }
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
  box(c, b - 0.26, l - 0.26, 0, 0.52, 0.52, 0.10, '#2f2822');
  box(c, b - 0.21, l - 0.21, 0.10, 0.42, 0.42, 0.06, shade(col, 0.55));
  box(c, b - 0.17, l - 0.17, 0.20 + bob, 0.34, 0.34, 0.40, col);
  box(c, b - 0.10, l - 0.10, 0.60 + bob, 0.20, 0.20, 0.22, shade(col, 1.25));
}

// ------------------------------------------------------------------ the floor --
export function drawFloor(c, run, t = 0, hurt = false) {
  c.fillStyle = C.void;
  c.fillRect(0, 0, VIEW_W, VIEW_H);

  const threat = run.threat();

  // Painter's algorithm by depth. Ties never overlap, so one pass is enough —
  // but a tall wall CAN cover the tile behind it, which is why this sorts on
  // x+y rather than trusting a plain nested loop.
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells.push([x, y]);
  cells.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);

  for (const [x, y] of cells) {
    const tile = run.tiles[idx(x, y)];
    if (tile === WALL) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      box(c, x, y, 0, 1, 1, edge ? RIM_H : PILLAR_H, edge ? C.rim : C.wall);
      continue;
    }

    // the ground, with a hairline of grout so nine tiles read as nine tiles
    flat(c, x, y, (x + y) % 2 ? C.floorA : C.floorB);
    c.strokeStyle = C.grout; c.lineWidth = 1;
    const p = [px(x, y), px(x + 1, y), px(x + 1, y + 1), px(x, y + 1)];
    c.beginPath(); c.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < 4; i++) c.lineTo(p[i][0], p[i][1]);
    c.closePath(); c.stroke();

    const kind = threat.get(`${x},${y}`);
    if (kind) {
      flat(c, x, y, kind === 'strike' ? C.threat : C.aim, 0.02);
      c.save();
      c.strokeStyle = kind === 'strike' ? '#ff6a52' : '#ffbe4a';
      c.lineWidth = 2.4; c.lineJoin = 'round';
      const e0 = px(x + 0.04, y + 0.04, 0.03), e1 = px(x + 0.96, y + 0.04, 0.03);
      const e2 = px(x + 0.96, y + 0.96, 0.03), e3 = px(x + 0.04, y + 0.96, 0.03);
      c.beginPath(); c.moveTo(e0[0], e0[1]); c.lineTo(e1[0], e1[1]);
      c.lineTo(e2[0], e2[1]); c.lineTo(e3[0], e3[1]); c.closePath(); c.stroke();
      c.restore();
    }

    if (tile === RUBBLE) {
      box(c, x + 0.12, y + 0.12, 0, 0.5, 0.6, 0.30, C.rubble);
      box(c, x + 0.50, y + 0.24, 0, 0.34, 0.4, 0.20, shade(C.rubble, 0.86));
    } else if (tile === STAIRS) {
      const rings = [C.stair, '#8a6c33', '#3a2c15', '#080605'];
      for (let s = 0; s < rings.length; s++) {
        const i2 = s * 0.12;
        quad(c, [px(x + i2, y + i2), px(x + 1 - i2, y + i2),
          px(x + 1 - i2, y + 1 - i2), px(x + i2, y + 1 - i2)], rings[s]);
      }
      // a chevron pointing the only way it goes
      c.save();
      c.strokeStyle = C.stair; c.lineWidth = 2.2; c.lineCap = 'round';
      const a1 = px(x + 0.34, y + 0.58), a2 = px(x + 0.58, y + 0.58), a3 = px(x + 0.58, y + 0.34);
      c.beginPath(); c.moveTo(a1[0], a1[1]); c.lineTo(a2[0], a2[1]); c.lineTo(a3[0], a3[1]); c.stroke();
      c.restore();
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

  torchlight(c);
}

// One multiply pass over the finished frame carries the whole mood of the
// place: a warm pool where the player is standing, the dark closing in at the
// edges. Cheaper than lighting anything individually, and it looks better.
function torchlight(c) {
  c.save();
  c.globalCompositeOperation = 'multiply';
  const g = c.createRadialGradient(VIEW_W / 2, VIEW_H * 0.52, VIEW_W * 0.34, VIEW_W / 2, VIEW_H * 0.52, VIEW_W * 0.82);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.74, '#ffffff');
  g.addColorStop(1, '#bebcb9');
  c.fillStyle = g;
  c.fillRect(0, 0, VIEW_W, VIEW_H);
  c.restore();
}
