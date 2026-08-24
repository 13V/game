// DELVE — voxels into triangles.
//
// Every model in this game is a grid of coloured cubes. Drawing them as cubes
// would be tens of thousands of draw calls, so each model is melted ONCE into a
// single mesh: only the faces with nothing against them survive, and each face
// carries its colour in the vertices, so a whole model of sixteen colours is one
// geometry with one material.
//
// The axes: a model's layers are z-major with (x, y) inside, which is Z-up.
// three.js is Y-up, so the model's z becomes the world's y and the model's y
// becomes the world's z. Nothing else in the game needs to know that.
import { expandRLE } from './models.js';

// Which way each face looks, and the four corners it needs, in voxel units.
const FACES = [
  { n: [1, 0, 0], d: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], light: 0.86 },
  { n: [-1, 0, 0], d: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], light: 0.62 },
  { n: [0, 1, 0], d: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], light: 1.00 },
  { n: [0, -1, 0], d: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], light: 0.45 },
  { n: [0, 0, 1], d: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], light: 0.74 },
  { n: [0, 0, -1], d: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]], light: 0.74 },
];

const hexToRGB = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const meshes = new WeakMap();

// The occupancy of a model, as a lookup and a bounding box.
function gridOf(model) {
  expandRLE(model);
  const at = new Map();
  let w = 0, d = 0;
  model.layers.forEach((layer, z) => {
    d = Math.max(d, layer.length);
    layer.forEach((row, y) => {
      w = Math.max(w, row.length);
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch !== '.') at.set(`${x},${y},${z}`, ch);
      }
    });
  });
  return { at, w, d, h: model.layers.length };
}

/**
 * Build a model's geometry, in voxel units, centred on x/z and sitting on y=0.
 * Cached per model: a wall is melted once however many times it is built into
 * the dungeon.
 */
export function meshFor(THREE, model) {
  let g = meshes.get(model);
  if (g) return g;
  const { at, w, d, h } = gridOf(model);
  const pos = [], col = [], nrm = [], idx = [];
  const glow = model.glow || '';
  const cache = new Map();
  const rgbOf = (ch) => {
    let c = cache.get(ch);
    if (!c) { c = hexToRGB(model.pal[ch] || '#ff00ff'); cache.set(ch, c); }
    return c;
  };
  for (const [key, ch] of at) {
    const [x, y, z] = key.split(',').map(Number);
    const base = rgbOf(ch);
    const lit = glow.includes(ch);
    for (const f of FACES) {
      // model x,y,z -> world x, z, y : the face's own axes are in model space
      if (at.has(`${x + f.n[0]},${y + f.n[2]},${z + f.n[1]}`)) continue;
      const start = pos.length / 3;
      // a touch of face shading baked in, so a model reads as solid even in flat light
      const k = lit ? 1 : f.light;
      for (const [dx, dy, dz] of f.d) {
        pos.push(x + dx - w / 2, z + dy, y + dz - d / 2);
        col.push(base[0] * k, base[1] * k, base[2] * k);
        nrm.push(f.n[0], f.n[1], f.n[2]);
      }
      idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.userData = { w, d, h };
  meshes.set(model, g);
  return g;
}

/** A model as a three.js Object3D, scaled so it spans `size` tiles across. */
export function modelObject(THREE, model, mat, opts = {}) {
  const g = meshFor(THREE, model);
  const { w, h } = g.userData;
  const size = opts.size ?? model.scale ?? 1;
  const s = size / w;
  const m = new THREE.Mesh(g, mat);
  m.scale.set(s, opts.height ? opts.height / h : s, s);
  m.castShadow = opts.castShadow ?? true;
  m.receiveShadow = opts.receiveShadow ?? true;
  return m;
}
