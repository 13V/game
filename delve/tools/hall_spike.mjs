// A HAND-AUTHORED Monogon grand hall, to sit beside the procedural dungeon.
//
// The point of this file: the renderer was never the gap between DELVE and the
// Monogon demo shot. The demo is a DESIGNED room — symmetrical, banners on the
// walls, statues flanking a wide walkway, lit as a room rather than as a torch
// pool. This builds one, so the two can be judged side by side.
import { readFileSync, writeFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const strip = (s) => s.replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\n/gm, '')
  .replace(/^export (function|const|class|let) /gm, '$1 ');
const parts = [
  read('../vendor/three.bundle.js'),
  strip(read('../models.js')), strip(read('../monogon.js')), strip(read('../mesh3d.js')),
].join('\n');

const app = `
const cv = document.getElementById('c');
const rn = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
rn.setSize(cv.width, cv.height, false); rn.setPixelRatio(1);
rn.shadowMap.enabled = true; rn.shadowMap.type = THREE.PCFSoftShadowMap;
const sc = new THREE.Scene();
sc.background = new THREE.Color(0x0d0906);
sc.fog = new THREE.Fog(0x0d0906, 22, 46);
const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true });

// ---- the hall ------------------------------------------------------------
// eleven tiles across, eighteen long, walls four units tall. A walkway down
// the middle, colonnades either side, a dais at the far end.
const HALL_W = 11, HALL_L = 20, WALL_H = 4.0;
const put = (name, x, z, o = {}) => {
  const m = MONOGON[name] || MODELS[name];
  if (!m) return null;
  const mesh = modelObject(THREE, m, mat(), o);
  mesh.position.set(x, o.y || 0, z);
  if (o.rx) mesh.rotation.x = o.rx;
  if (o.ry) mesh.rotation.y = o.ry;
  sc.add(mesh);
  return mesh;
};
const wallPick = (i) => 'mgWall' + (i % 8);
const floorPick = (i) => 'mgFloor' + 'abc'[i % 3] + (i % 5);

for (let z = 0; z < HALL_L; z++) {
  for (let x = 0; x < HALL_W; x++) {
    put(floorPick(x * 7 + z * 3), x, z, { height: 0.16 });
  }
  // the two long walls
  put(wallPick(z), -1, z, { height: WALL_H });
  put(wallPick(z + 3), HALL_W, z, { height: WALL_H });
}
// the end walls
for (let x = -1; x <= HALL_W; x++) {
  put(wallPick(x), x, -1, { height: WALL_H });
  put(wallPick(x + 5), x, HALL_L, { height: WALL_H });
}

// ---- the colonnade, and what stands between the columns -------------------
for (let z = 2; z < HALL_L - 2; z += 4) {
  for (const side of [1, HALL_W - 2]) {
    put('mgColumn', side, z, { size: 0.7, height: WALL_H, y: 0.16 });
  }
  // statues on plinths, turned to face the walkway they guard
  for (const [side, face] of [[2, Math.PI / 2], [HALL_W - 3, -Math.PI / 2]]) {
    put('mgPlinth2', side, z + 2, { size: 0.95, height: 0.6, y: 0.16 });
    put('mgStatue', side, z + 2, { size: 1.0, height: 2.0, y: 0.76, ry: face });
  }
}

// ---- the banners: flat models, stood upright against the stone ------------
// A banner is modelled lying down (one voxel thick), so it is tipped ninety
// degrees onto the wall and pushed just clear of the brick.
const BANNERS = ['mgBanner1', 'mgBanner2', 'mgBanner3', 'mgBanner4'];
for (let z = 1, i = 0; z < HALL_L - 1; z += 3, i++) {
  put(BANNERS[i % 4], -0.42, z, { size: 1.7, rx: Math.PI / 2, ry: Math.PI / 2, y: 2.5 });
  put(BANNERS[(i + 2) % 4], HALL_W - 0.58, z, { size: 1.7, rx: Math.PI / 2, ry: -Math.PI / 2, y: 2.5 });
}

// ---- fire ----------------------------------------------------------------
const fires = [];
for (let z = 3; z < HALL_L - 2; z += 5) {
  for (const side of [1, HALL_W - 2]) {
    put('mgBrazier', side, z + 1, { size: 0.8, height: 1.6, y: 0.16 });
    fires.push([side, z + 1, 1.7]);
  }
}
// sconces high on the walls
for (let z = 2; z < HALL_L - 1; z += 3) {
  put('mgSconce', -0.7, z, { size: 0.6, y: 2.6, ry: -Math.PI / 2 });
  put('mgSconce', HALL_W - 0.3, z, { size: 0.6, y: 2.6, ry: Math.PI / 2 });
}

// ---- the dais at the end -------------------------------------------------
for (let x = 3; x < 8; x++) for (let z = HALL_L - 4; z < HALL_L - 1; z++) {
  put(floorPick(x + z), x, z, { height: 0.42 });
}
put('mgAltar', 5, HALL_L - 3, { size: 1.2, y: 0.42 });
put('mgBannerBig', 5, HALL_L - 0.55, { size: 2.8, rx: Math.PI / 2, y: 2.8 });

// ---- the delver, standing in his own hall --------------------------------
const hero = put('mg_warden', 5, 4.5, { size: 1.05, height: 2.23, y: 0.16, ry: Math.PI });

// ---- light: a ROOM, not a torch pool -------------------------------------
sc.add(new THREE.AmbientLight(0x4a3a2e, 1.5));
const key = new THREE.DirectionalLight(0xffd2a0, 0.75);
key.position.set(6, 22, -4); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
const cs = key.shadow.camera;
cs.left = -16; cs.right = 16; cs.top = 26; cs.bottom = -10; cs.near = 1; cs.far = 60;
sc.add(key);
for (const [x, z, y] of fires) {
  const p = new THREE.PointLight(0xffa04a, 22, 13, 1.7);
  p.position.set(x + 0.0, y, z + 0.0);
  sc.add(p);
}

// ---- the camera looks DOWN the hall, like the reference -------------------
const cam = new THREE.PerspectiveCamera(46, cv.width / cv.height, 0.5, 120);
cam.position.set(5, 9.5, -8.5);
cam.lookAt(5, 1.2, 8);
rn.render(sc, cam);
window.__ok = { tris: rn.info.render.triangles, calls: rn.info.render.calls };
window.__cam = (px, py, pz, tx, ty, tz) => { cam.position.set(px, py, pz); cam.lookAt(tx, ty, tz); rn.render(sc, cam); };
`;
writeFileSync(process.argv[2],
  `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="${process.argv[3] || 900}" height="${process.argv[4] || 620}"></canvas>
<script>${parts}\n${app}</script></body></html>`);
console.log('hall page written');
