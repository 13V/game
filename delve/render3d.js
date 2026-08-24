// DELVE — the dungeon in three dimensions.
//
// Same game, same rules, a real camera. rules.js is untouched by everything in
// here: a run still replays byte-identically, which is the only reason the daily
// leaderboard can be trusted. This file only decides what the dungeon LOOKS like.
//
// The one performance idea that matters: a floor is 44x44 tiles and drawing each
// as its own mesh would be two thousand draw calls. Instead every distinct
// stone — eight floors, eight walls, each prop — is ONE InstancedMesh, and a
// tile is a matrix written into it. The whole dungeon comes to about twenty
// draw calls, and the matrices are only rewritten when the delver moves, not
// sixty times a second.
import { W, H, idx, WALL, FLOOR, RUBBLE, STAIRS, EXIT, GAP, SIGHT } from './rules.js';
import { MODELS } from './models.js';
import { MONOGON } from './monogon.js';
import { meshFor } from './mesh3d.js';

// How the camera stands. Close enough that the delver is a figure rather than a
// speck, high enough to see a corridor's turn, and swung 45 degrees so the four
// grid directions land on screen as the diagonals the old flat view used —
// which is the muscle memory this game already taught.
export const VIEW3 = { fov: 42, pitch: 57, dist: 12.5, turn: 45 };

const D3_FLOORS = Object.keys(MONOGON).filter((k) => k.startsWith('mgFloor'));
const D3_WALLS = Object.keys(MONOGON).filter((k) => k.startsWith('mgWall'));
const DRESS = ['mgColumn', 'mgColumn2', 'mgPillar', 'mgBarrel', 'mgCrate', 'mgStatue', 'mgBench'];
const pick3 = (list, x, y, salt = 0) =>
  list[(((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791)) >>> 0) % list.length];

// how far from the delver the world is built — beyond this is dark anyway
const BUILD_R = 13;

let T3 = null;          // three, handed in once
let SC = null;          // the scene and everything hanging off it

/** One InstancedMesh per model, sized for the window, hidden until used. */
function bank(model, cap, opts = {}) {
  const g = meshFor(T3, model);
  const mat = new T3.MeshLambertMaterial({ vertexColors: true });
  const im = new T3.InstancedMesh(g, mat, cap);
  im.instanceMatrix.setUsage(T3.DynamicDrawUsage);
  im.castShadow = opts.castShadow ?? true;
  im.receiveShadow = true;
  im.count = 0;
  im.frustumCulled = false;
  const { w, h } = g.userData;
  im.userData = { w, h, model };
  return im;
}

export function init3d(THREE, canvas) {
  T3 = THREE;
  const renderer = new T3.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T3.PCFSoftShadowMap;

  const scene = new T3.Scene();
  scene.background = new T3.Color(0x0b0805);
  scene.fog = new T3.Fog(0x0b0805, 13, 30);

  const camera = new T3.PerspectiveCamera(VIEW3.fov, 1, 0.5, 90);

  // A dungeon is lit by what burns in it. One warm lamp rides with the delver,
  // a handful of torches sit where the floor put them, and a very dim cool fill
  // keeps the stone from going to pure black where nothing burns.
  scene.add(new T3.AmbientLight(0x3a2f2a, 1.05));
  // a very dim warm top-fill so stone out of torchlight is dark, never dead
  const fill = new T3.DirectionalLight(0xffcf9a, 0.30);
  fill.position.set(-8, 20, -6);
  scene.add(fill);

  const lamp = new T3.PointLight(0xffb765, 30, 17, 1.6);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.camera.near = 0.4;
  lamp.shadow.camera.far = 16;
  lamp.shadow.bias = -0.004;
  scene.add(lamp);

  // a small pool of standing torches, moved to wherever the floor's fires are
  const torches = [];
  for (let i = 0; i < 5; i++) {
    const p = new T3.PointLight(0xff9a3c, 0, 9, 1.7);
    p.visible = false;
    scene.add(p);
    torches.push(p);
  }

  const root = new T3.Group();
  scene.add(root);

  // The delver's own mark. The flat renderer draws a ring on the floor under
  // the player for one reason — four tier colours and three foe colours already
  // crowd the board, and a player who has to be FOUND is a player who gets hit.
  // That is truer under a real camera, where the figure can be small and in
  // shadow, so the ring comes with us.
  const ringGeo = new T3.RingGeometry(0.34, 0.44, 28);
  const ring = new T3.Mesh(ringGeo, new T3.MeshBasicMaterial({
    color: 0x63e0cf, transparent: true, opacity: 0.75, side: T3.DoubleSide,
    depthWrite: false,
  }));
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);

  // and a small clean light that belongs to the delver, not to the room, so a
  // figure in a dark corridor is still a figure
  const selfLight = new T3.PointLight(0xfff0d8, 6, 3.2, 1.4);
  scene.add(selfLight);

  const banks = {};
  const cap = (2 * BUILD_R + 1) * (2 * BUILD_R + 1);
  for (const k of D3_FLOORS) banks[k] = bank(MONOGON[k], cap, { castShadow: false });
  for (const k of D3_WALLS) banks[k] = bank(MONOGON[k], cap);
  for (const k of DRESS) if (MONOGON[k]) banks[k] = bank(MONOGON[k], 64);
  for (const k of ['mgBrazier', 'mgSconce', 'mgArch', 'mgStair']) {
    if (MONOGON[k]) banks[k] = bank(MONOGON[k], 32);
  }
  for (const im of Object.values(banks)) root.add(im);

  // the cast: one mesh each, moved rather than rebuilt
  const mat = () => new T3.MeshLambertMaterial({ vertexColors: true });
  const actors = new Map();

  SC = { renderer, scene, camera, root, banks, lamp, torches, actors, mat,
        ring, selfLight, built: '', dpr: 1 };
  return SC;
}

const TMP = { m: null };
function placeAt(im, n, x, y, opts = {}) {
  if (!TMP.m) TMP.m = new T3.Matrix4();
  const { w, h } = im.userData;
  const size = opts.size ?? im.userData.model.scale ?? 1;
  const s = size / w;
  const sy = opts.height ? opts.height / h : s;
  TMP.m.makeScale(s, sy, s);
  TMP.m.setPosition(x + 0.5, opts.lift || 0, y + 0.5);
  im.setMatrixAt(n, TMP.m);
}

/** Rebuild the instanced world around the delver. Cheap enough for every step. */
function buildAround(run) {
  const counts = {};
  const put = (key, x, y, opts) => {
    const im = SC.banks[key];
    if (!im) return;
    const n = counts[key] || 0;
    if (n >= im.instanceMatrix.count) return;
    placeAt(im, n, x, y, opts);
    counts[key] = n + 1;
  };

  const fires = [];
  for (let dy = -BUILD_R; dy <= BUILD_R; dy++) for (let dx = -BUILD_R; dx <= BUILD_R; dx++) {
    const x = run.x + dx, y = run.y + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (!run.known[idx(x, y)]) continue;
    const tile = run.tiles[idx(x, y)];
    if (tile === GAP) continue;
    const here = run.canSee(x, y);

    if (tile === WALL) {
      // A wall standing between the camera and the delver hides the delver,
      // which is the oldest problem in a 3D dungeon. The camera is at a fixed
      // angle, so the offenders are known without any raycasting: the tiles
      // nearer the camera than the player, in the quadrant it looks from. Those
      // are built as a low course instead — the room still reads as walled, and
      // nothing the player needs to see is behind a slab.
      const near = dx <= 0 && dy <= 0 && (dx > -5 && dy > -5);
      put(pick3(D3_WALLS, x, y), x, y, { height: near ? 0.75 : 2.85 });
      // a wall facing open floor may carry fire
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .filter(([ax, ay]) => run.tiles[idx(x + ax, y + ay)] === FLOOR).length;
      const hh = ((x * 2654435761) ^ (y * 40503)) >>> 0;
      if (open >= 2 && hh % 11 === 0) {
        put('mgSconce', x, y, { lift: 2.2 });
        if (here) fires.push([x, y, 2.4]);
      }
      continue;
    }

    put(pick3(D3_FLOORS, x, y), x, y, { height: 0.16 });
    if (tile === STAIRS) put('mgStair', x, y, { size: 1.4, lift: 0.05 });
    if (tile === EXIT) put('mgArch', x, y, { size: 1.5, lift: 0.05 });

    // dressing, on empty seen floor only, never where the game needs the eye
    if (here && tile === FLOOR && !(run.x === x && run.y === y) && !run.foeAt(x, y)
      && !run.ground.some((g) => g.x === x && g.y === y)) {
      const hh = ((x * 374761393) ^ (y * 668265263)) >>> 0;
      const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .filter(([ax, ay]) => run.tiles[idx(x + ax, y + ay)] === WALL).length;
      if (walls >= 1 && hh % 100 < 18) {
        put(DRESS[(hh >> 9) % DRESS.length], x, y, { lift: 0.16 });
      } else if (walls === 0 && hh % 100 < 3) {
        put('mgBrazier', x, y, { lift: 0.16 });
        if (here) fires.push([x, y, 1.5]);
      }
    }
  }

  for (const [k, im] of Object.entries(SC.banks)) {
    im.count = counts[k] || 0;
    im.instanceMatrix.needsUpdate = true;
  }

  // the fires nearest the delver get a real light; the rest are just models
  fires.sort((a, b) => (Math.abs(a[0] - run.x) + Math.abs(a[1] - run.y))
    - (Math.abs(b[0] - run.x) + Math.abs(b[1] - run.y)));
  SC.torches.forEach((p, i) => {
    const f = fires[i];
    if (!f) { p.visible = false; p.intensity = 0; return; }
    p.visible = true;
    p.position.set(f[0] + 0.5, f[2], f[1] + 0.5);
    p.intensity = 14;
  });
}

/** An actor mesh, made once and kept: the delver, and whatever is alive. */
function actor(key, model, opts = {}) {
  let a = SC.actors.get(key);
  if (a && a.model === model) return a;
  if (a) { SC.root.remove(a.mesh); a.mesh.geometry = null; }
  const g = meshFor(T3, model);
  const m = new T3.Mesh(g, SC.mat());
  m.castShadow = true; m.receiveShadow = false;
  const { w, h } = g.userData;
  const size = opts.size ?? model.scale ?? 1;
  const s = size / w;
  m.scale.set(s, opts.height ? opts.height / h : s, s);
  SC.root.add(m);
  a = { mesh: m, model };
  SC.actors.set(key, a);
  return a;
}

const D3_FOE = { husk: 'husk', spitter: 'spitter', sentinel: 'sentinel' };

export function draw3d(run, t = 0, hurt = false, anim = null) {
  if (!SC) return;
  const key = `${run.seed}:${run.depth}:${run.x},${run.y}`;
  if (SC.built !== key) { buildAround(run); SC.built = key; }

  // the delver
  const kl = run.klass || 'warden';
  const pm = MONOGON[`mg_${kl}`] || MONOGON.mgKnight || MODELS.player;
  const p = actor('player', pm, { size: 1.05, height: 2.23 });
  const bob = Math.sin(t / 620) * 0.02;
  const ax = anim && anim.px != null ? anim.px : run.x;
  const ay = anim && anim.py != null ? anim.py : run.y;
  p.mesh.position.set(ax + 0.5, 0.16 + bob, ay + 0.5);
  p.mesh.visible = !run.over;
  if (anim && anim.face != null) p.mesh.rotation.y = anim.face;

  // whatever is alive and seen
  const live = new Set();
  for (const e of run.enemies) {
    if (e.hp <= 0 || !run.canSee(e.x, e.y)) continue;
    const k = `foe${e.id}`;
    live.add(k);
    const m = MODELS[D3_FOE[e.kind]] || MODELS.husk;
    const a = actor(k, m, {});
    a.mesh.visible = true;
    a.mesh.position.set(e.x + 0.5, 0.16, e.y + 0.5);
    a.mesh.rotation.y = Math.atan2(run.x - e.x, run.y - e.y);
  }
  for (const [k, a] of SC.actors) {
    if (k.startsWith('foe') && !live.has(k)) a.mesh.visible = false;
  }

  // loot, as a floating token of its own colour
  let n = 0;
  for (const g of run.ground) {
    if (!run.known[idx(g.x, g.y)]) continue;
    const a = actor(`loot${n++}`, MONOGON.mgFirebowl || MODELS.relic, { size: 0.5 });
    a.mesh.visible = true;
    a.mesh.position.set(g.x + 0.5, 0.3 + Math.sin(t / 420 + g.x) * 0.06, g.y + 0.5);
    a.mesh.rotation.y = t / 900;
  }
  for (let k = n; k < 12; k++) {
    const a = SC.actors.get(`loot${k}`);
    if (a) a.mesh.visible = false;
  }

  // the mark and the delver's own light ride with them
  SC.ring.position.set(ax + 0.5, 0.19, ay + 0.5);
  SC.ring.visible = !run.over;
  SC.ring.material.opacity = 0.55 + 0.25 * (0.5 + 0.5 * Math.sin(t / 460));
  SC.selfLight.position.set(ax + 0.5, 1.5, ay + 0.5);
  SC.selfLight.visible = !run.over;

  // the lamp rides with the delver
  SC.lamp.position.set(ax + 0.5, 2.0, ay + 0.5);
  SC.lamp.intensity = hurt ? 40 : 30;

  // the camera looks down the hall, over the delver's shoulder
  const rad = VIEW3.turn * Math.PI / 180;
  const pit = VIEW3.pitch * Math.PI / 180;
  const d = VIEW3.dist;
  SC.camera.position.set(
    ax + 0.5 + Math.sin(rad) * Math.cos(pit) * d,
    Math.sin(pit) * d,
    ay + 0.5 + Math.cos(rad) * Math.cos(pit) * d,
  );
  SC.camera.lookAt(ax + 0.5, 1.15, ay + 0.5);

  SC.renderer.render(SC.scene, SC.camera);
}

export function resize3d(w, h) {
  if (!SC) return;
  SC.renderer.setSize(w, h, false);
  SC.camera.aspect = w / h;
  SC.camera.updateProjectionMatrix();
}

/** Where a tap lands, as a tile — a ray from the camera onto the floor plane. */
export function tileAt3d(nx, ny) {
  if (!SC) return [0, 0];
  const rc = new T3.Raycaster();
  rc.setFromCamera(new T3.Vector2(nx, ny), SC.camera);
  const plane = new T3.Plane(new T3.Vector3(0, 1, 0), -0.16);
  const hit = new T3.Vector3();
  if (!rc.ray.intersectPlane(plane, hit)) return [0, 0];
  return [Math.floor(hit.x), Math.floor(hit.z)];
}

export function stats3d() {
  if (!SC) return null;
  const i = SC.renderer.info.render;
  return { tris: i.triangles, calls: i.calls };
}
