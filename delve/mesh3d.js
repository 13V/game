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
// World-space normal and baked face shading for each model axis and direction.
// Model x -> world x, model y -> world z, model z -> world y (up).
const FACE_BY_AXIS = [
  [{ n: [1, 0, 0], light: 0.86 }, { n: [-1, 0, 0], light: 0.62 }],   // model x
  [{ n: [0, 0, 1], light: 0.74 }, { n: [0, 0, -1], light: 0.74 }],   // model y -> world z
  [{ n: [0, 1, 0], light: 1.00 }, { n: [0, -1, 0], light: 0.45 }],   // model z -> world y
];

const hexToRGB = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const meshes = new WeakMap();

// The occupancy of a model, as a lookup and a bounding box.
function voxelGrid(model) {
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
  const { at, w, d, h } = voxelGrid(model);
  const glow = model.glow || '';
  const cache = new Map();
  const rgbOf = (ch) => {
    let c = cache.get(ch);
    if (!c) { c = hexToRGB(model.pal[ch] || '#ff00ff'); cache.set(ch, c); }
    return c;
  };

  const pos = [], col = [], nrm = [], idx = [];
  const dims = [w, d, h];                       // model x, y, z
  const solid = (p) => at.get(`${p[0]},${p[1]},${p[2]}`);

  // GREEDY MESHING. A brick wall drawn face-by-face is two and a half thousand
  // triangles, nearly all of them coplanar neighbours of the same colour. So
  // each of the six directions is swept slice by slice: build a mask of the
  // faces that are actually exposed, then eat the biggest same-colour rectangle
  // out of it at a time. A wall drops to a few hundred triangles and looks
  // exactly the same, because it IS exactly the same surface.
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const dir of [1, -1]) {
      const face = FACE_BY_AXIS[axis][dir === 1 ? 0 : 1];
      for (let s2 = 0; s2 < dims[axis]; s2++) {
        // the mask: which faces on this slice are open to the air
        const mask = new Array(dims[u] * dims[v]).fill(null);
        const p = [0, 0, 0], q = [0, 0, 0];
        for (let j = 0; j < dims[v]; j++) for (let i = 0; i < dims[u]; i++) {
          p[axis] = s2; p[u] = i; p[v] = j;
          const ch = solid(p);
          if (!ch) continue;
          q[axis] = s2 + dir; q[u] = i; q[v] = j;
          if (solid(q)) continue;
          mask[j * dims[u] + i] = ch;
        }
        // eat rectangles
        for (let j = 0; j < dims[v]; j++) for (let i = 0; i < dims[u];) {
          const ch = mask[j * dims[u] + i];
          if (!ch) { i++; continue; }
          let iw = 1;
          while (i + iw < dims[u] && mask[j * dims[u] + i + iw] === ch) iw++;
          let jh = 1;
          grow: while (j + jh < dims[v]) {
            for (let k = 0; k < iw; k++) {
              if (mask[(j + jh) * dims[u] + i + k] !== ch) break grow;
            }
            jh++;
          }
          for (let b = 0; b < jh; b++) for (let a = 0; a < iw; a++) mask[(j + b) * dims[u] + i + a] = null;

          // corners of the rectangle, in model space
          const base = [0, 0, 0];
          base[axis] = s2 + (dir === 1 ? 1 : 0);
          base[u] = i; base[v] = j;
          const du = [0, 0, 0]; du[u] = iw;
          const dv = [0, 0, 0]; dv[v] = jh;
          const c0 = base;
          const c1 = [base[0] + du[0], base[1] + du[1], base[2] + du[2]];
          const c2 = [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]];
          const c3 = [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]];
          // Winding is checked, not assumed. Model space is Z-up and world space
          // is Y-up, so mapping (x, y, z) -> (x, z, y) SWAPS two axes and flips
          // handedness — a quad wound correctly in model space comes out facing
          // backwards and is culled. Rather than hand-tune an order per axis,
          // the world-space normal is computed and the quad flipped if it
          // disagrees with the face it is supposed to be.
          const world = (c) => [c[0] - w / 2, c[2], c[1] - d / 2];
          let quad = [world(c0), world(c1), world(c2), world(c3)];
          const e1 = [quad[1][0] - quad[0][0], quad[1][1] - quad[0][1], quad[1][2] - quad[0][2]];
          const e2 = [quad[2][0] - quad[0][0], quad[2][1] - quad[0][1], quad[2][2] - quad[0][2]];
          const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2],
                      e1[0] * e2[1] - e1[1] * e2[0]];
          if (cr[0] * face.n[0] + cr[1] * face.n[1] + cr[2] * face.n[2] < 0) quad = quad.reverse();

          const rgb = rgbOf(ch);
          const k2 = glow.includes(ch) ? 1 : face.light;
          const start = pos.length / 3;
          for (const c of quad) {
            pos.push(c[0], c[1], c[2]);
            col.push(rgb[0] * k2, rgb[1] * k2, rgb[2] * k2);
            nrm.push(face.n[0], face.n[1], face.n[2]);
          }
          idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
          i += iw;
        }
      }
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
