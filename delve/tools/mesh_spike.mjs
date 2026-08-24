// Builds a standalone page that renders a few Monogon models as real 3D meshes.
import { readFileSync, writeFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const strip = (s) => s.replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\n/gm, '')
  .replace(/^export (function|const|class) /gm, '$1 ');
const parts = [read('../vendor/three.bundle.js'), strip(read('../models.js')),
  strip(read('../monogon.js')), strip(read('../mesh3d.js'))].join('\n');
const app = `
const cv = document.getElementById('c');
const rn = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
rn.setSize(900, 460, false); rn.setPixelRatio(1);
rn.shadowMap.enabled = true; rn.shadowMap.type = THREE.PCFSoftShadowMap;
const sc = new THREE.Scene(); sc.background = new THREE.Color(0x140f0b);
const cam = new THREE.PerspectiveCamera(38, 900 / 460, 0.1, 200);
cam.position.set(7, 7.5, 10); cam.lookAt(2.6, 0.8, 0);
sc.add(new THREE.AmbientLight(0x6b5540, 1.5));
const key = new THREE.DirectionalLight(0xffd9a8, 1.5);
key.position.set(6, 12, 8); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -12; key.shadow.camera.right = 12;
key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
sc.add(key);
const torch = new THREE.PointLight(0xffa64d, 30, 14); torch.position.set(0, 2.4, 2); sc.add(torch);
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
  new THREE.MeshLambertMaterial({ color: 0x4a3b2c }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
const picks = ['mgWall0', 'mgWall1', 'mgColumn', 'mgBrazier', 'mg_warden', 'mg_breaker', 'mgStatue', 'mgBarrel'];
let x = -5;
for (const nm of picks) {
  const model = MONOGON[nm];
  if (!model) continue;
  const o = modelObject(THREE, model, mat, {});
  o.position.set(x, 0, 0);
  sc.add(o);
  x += 1.6;
}
rn.render(sc, cam);
window.__ok = { tris: rn.info.render.triangles, calls: rn.info.render.calls,
  models: picks.filter((p) => MONOGON[p]).length };
`;
writeFileSync(process.argv[2],
  `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="900" height="460"></canvas>
<script>${parts}\n${app}</script></body></html>`);
console.log('spike page written');
