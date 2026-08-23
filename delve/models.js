// DELVE — voxel models.
//
// Everything in the dungeon used to be three or four big boxes: a body, a head,
// a stick for a blade. That reads as programmer art, and at 46x23 pixels a tile
// there is easily room for better. A model here is a stack of LAYERS, each a
// small grid, and it is drawn as many little cubes with a light on it — which
// is what makes a voxel thing look sculpted rather than assembled.
//
// Layers run from the ground up. Within a layer, rows are y and columns are x,
// in grid space — so the bottom of the screen is +x and +y, and the face of a
// creature is drawn toward the lower rows and columns, where the camera is.
//
//   .  nothing
//   others index into that model's own palette
//
// Every model is authored on a 6x6 footprint and scaled to whatever fraction of
// a tile it should occupy, so one number changes how big everything reads.

// THE CAST, drawn to be identified COLD. The test that matters is a person who
// has never seen this game looking at four figures at real size — about forty
// screen pixels — and knowing at once which one is theirs and what each of the
// others is about to do to them. At that size a player reads, in order: colour,
// height, outline. Detail is what you notice second.
//
// So each creature owns one of each:
//
//              colour            height   outline
//   delver     cyan + a lantern  tall     peaked hood, things held out both sides
//   husk       bright green      short    pitched forward, both arms straight out
//   spitter    magenta + orange  lowest   wider than tall, a lit maw at the front
//   sentinel   dark steel        tallest  pauldrons proud of a small buried helm
//
// Every model carries `outline: true`: the renderer bakes a dark rim into the
// sprite so a creature pops off the stone instead of dissolving into it.
//
// Layers run bottom-up on a 9-wide grid with a PINNED total height, so the
// silhouette cannot drift when `scale` changes. What this camera SHOWS is the
// +x and +y faces, so anything meant to be read — eyes, a visor, the maw —
// sits on the far edge of those two axes and nowhere else.

export const MODELS = {
  // THE DELVER. Tall, cyan, a hood that comes to a point, a blade up one
  // side and a lantern held out on the other — a real block of glowing
  // glass, because the whole floor is lit by this figure and the model
  // should say so. The only thing down here that carries anything.
  player: {
    pal: { c: '#38aec6', C: '#227687', d: '#164e58', k: '#0a1518', m: '#dcebe9', g: '#e2b23c', L: '#ffd27a' },
    scale: 0.95, height: 1.95, outline: true, glow: 'Lm', glowStrength: 0.34, glowTint: { m: '#63e0cf', L: '#ffc95e' },
    layers: [
      ['.........', '.........', '.........', '..kk.kk..', '..kk.kk..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..kk.kk..', '..kk.kk..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '.........', '.........', '..LL.....', '..LL.....'],
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '.........', '.........', '..LL.....', '..LL.....'],
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd.m', '.........', '.........', '..LL.....', '..LL.....'],
      ['.........', '.........', '.........', '..ggggg..', '..ggggg.m', '..ggggg..', '.........', '..LL.....', '..LL.....'],
      ['.........', '.........', '.........', '.CcccccC.', '.Cccccggg', '.CcccccC.', '..CC.....', '..CC.....', '.........'],
      ['.........', '.........', '.........', '.CcccccC.', '.Cccccccm', '.CcccccC.', '..CC.....', '..CC.....', '.........'],
      ['.........', '.........', '.........', '.CcccccC.', '.CcccccCm', '.CcccccC.', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '.CcccccC.', '.CcccccCm', '.CcccccC.', '.........', '.........', '.........'],
      ['.........', '.........', '..CCCCC..', '..CCCCC..', '..CCCCC.m', '..CCCCC..', '..CCCCC..', '.........', '.........'],
      ['.........', '.........', '..CCCCC..', '..CCCCC..', '..CCCCk.m', '..CCCCk..', '..CCkkC..', '.........', '.........'],
      ['.........', '.........', '.........', '...CCC...', '...CCC..m', '...CCC...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '...CC....', '...CC...m', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '.........', '....c....', '.........', '.........', '.........', '.........'],
    ],
  },

  // THE HUSK. The zombie read, which every player alive already knows — and
  // which a blind panel proved must be UPRIGHT: pitched forward it read as
  // a frog, and every judge called it the spitter. A standing biped, both
  // arms straight out, dead eyes, bites torn from its torso.
  husk: {
    pal: { a: '#c3d894', b: '#5f6f45', d: '#2c3820', e: '#cfe0a2' },
    scale: 1.0, height: 1.5, outline: true, glow: 'e', glowStrength: 0.15,
    layers: [
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..bb.bb..', '..bb.bb..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..bb.bb..', '..bb.bb..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..bb.bb..', '..bb.bb..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..bb.bb..', '..bb.bb..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..bb.bb..', '..bb.bb..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..aaaaa..', '..aaaaa..', '..aaaaa..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '...aaaa..', '..aaaaa..', '..aaaaa..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..aaaaa..', '..aaaaa..', '..aaaaa..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..aaaaa..', '..aaaaa..', '..aaaa...', '..aa.aa..', '..aa.ab..', '..ab.....'],
      ['.........', '.........', '.........', '..aaaaa..', '..aaaaa..', '..aaaaa..', '..aa.....', '..aa.....', '..aa.....'],
      ['.........', '.........', '.........', '.........', '....dd...', '....dd...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '...aaa...', '...aaa...', '...aaa...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '...aaa...', '...aaa...', '...eae...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '...bbb...', '...bbb...', '...bb....', '.........', '.........', '.........'],
    ],
  },

  // THE SPITTER. The only thing in the dungeon wider than it is tall, and
  // the panel's one demand was a FACE: a raised head out front with a lit
  // maw two courses tall and two eye bumps, so it has a facing direction
  // instead of being a featureless wedge. Nothing else here is orange.
  spitter: {
    pal: { p: '#d16aa8', q: '#96417a', r: '#5c2749', o: '#ff9430', Y: '#ffd764', k: '#2a0d20' },
    scale: 1.05, height: 0.9, outline: true, glow: 'oY', glowStrength: 0.22,
    layers: [
      ['.........', '.rr...rr.', '.rr...rr.', '.........', '.rr...rr.', '.rr...rr.', '.........', '.........', '.........'],
      ['.........', 'qqqqqqqqq', 'qqqqqqqqq', 'qqqqqqqqq', 'qqqqqqqqq', 'qqqqqqqqq', 'qqqqqqqqq', '.........', '.........'],
      ['.........', 'pqqpppppp', 'pqqpppppp', 'ppppppppp', 'ppppppppp', 'ppppppppp', '..ppppp..', '..ppppo..', '..ooooo..'],
      ['.........', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '..ppppp..', '..pYYYp..', '..pYkYo..', '..oYYYo..'],
      ['.........', '..qqqqq..', '..qqqqq..', '..qqqqq..', '.........', '..q...q..', '.........', '.........', '.........'],
      ['.........', '...r.....', '.........', '.....r...', '.........', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'],
    ],
  },

  // THE SENTINEL. Twice the husk's height and the PALEST thing on the
  // floor — armour plate over dark joints, because dark-on-dark was a
  // silhouette with nothing inside it. A dark helm sunk between proud
  // pauldrons with one amber visor slit, and a pale fist on the ground.
  sentinel: {
    pal: { t: '#8593ad', s: '#c3cdde', u: '#333d52', v: '#eef3fa', w: '#10161f', V: '#ffb648' },
    scale: 1.1, height: 2.35, outline: true, glow: 'V', glowStrength: 0.18,
    layers: [
      ['.........', '.........', '.........', '.www.www.', '.www.www.', '.www.www.', '.........', '.........', '.........'],
      ['.........', '.........', '.....ssss', '.www.ssss', '.www.ssss', '.www.ssss', '.....ssss', '.........', '.........'],
      ['.........', '.........', '.....ssss', '.uuu.ssss', '.uuu.ssss', '.uuu.ssss', '.....ssss', '.........', '.........'],
      ['.........', '.........', '.....ssss', '.uuu.ssss', '.uuu.ssss', '.uuu.ssss', '.....ssss', '.........', '.........'],
      ['.........', '.........', '.........', '.uuu.usss', '.uuu.usss', '.uuu.usss', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '.uuu.uuu.', '.uuu.uuut', '.uuu.uuut', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '.uuu.uuu.', '.uuu.uuut', '.uuu.uuut', '.........', '.........', '.........'],
      ['.........', '.........', '.ttttttt.', '.ttttttt.', '.tttttttt', '.tttttttt', '.ttttttt.', '.........', '.........'],
      ['.........', '.........', '.ttttttt.', '.ttttttt.', '.tttttttt', '.tttttttt', '.ttttttt.', '.........', '.........'],
      ['.........', '.........', '..uuuuu..', '..uuuuu..', '..uuuuu.t', '..uuuuu.t', '..uuuuu..', '.........', '.........'],
      ['.........', '.........', '..uuuuu..', '..uuuuu..', '..uuuuu.t', '..uuuuu.t', '..uuuuu..', '.........', '.........'],
      ['.........', '.........', '.tttttt..', '.tttttt..', '.tttttt.t', '.tttttt.t', '.tttttt..', '.........', '.........'],
      ['.........', '.........', '.tttttt..', '.tttttt..', '.tttttt.t', '.tttttt.t', '.tttttt..', '.........', '.........'],
      ['.........', '.........', 'sstttttss', 'sstttttss', 'sstttttst', 'sstttttst', 'sstttttss', '.........', '.........'],
      ['.........', '.........', 'sstttttss', 'sstttttss', 'sstttttss', 'sstttttss', 'sstttttss', '.........', '.........'],
      ['.........', '.........', 'ss.....ss', 'ss.....ss', 'ss.....ss', 'ss.....ss', 'ss.....ss', '.........', '.........'],
      ['.........', '.........', 'vv.....ss', 'vv.wwV.ss', 'vv.wwV.ss', 'vv.VVV.ss', 'vv.....ss', '.........', '.........'],
      ['.........', '.........', '.......vv', '...wwV.vv', '...wwV.vv', '...VVV.vv', '.......vv', '.........', '.........'],
      ['.........', '.........', '.........', '...www...', '...www...', '...www...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '...www...', '...www...', '...www...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '....s....', '....s....', '....s....', '.........', '.........', '.........'],
    ],
  },
};

// Props share one palette slot 'x' that the caller recolours, so a relic can be
// any tier colour and a stair can be any door colour without a model each.
export const PROPS = {
  // a faceted stone on a low plinth
  relic: {
    pal: { p: '#2f2822', q: '#443a30' },
    scale: 1.0,
    layers: [
      ['.pppp.', 'pppppp', 'pppppp', 'pppppp', '.pppp.', '......'],
      ['..qq..', '.qqqq.', '.qqqq.', '..qq..', '......', '......'],
      ['......', '..xx..', '..xx..', '......', '......', '......'],
      ['......', '.xxxx.', '.xxxx.', '......', '......', '......'],
      ['......', '.xXXx.', '.xXXx.', '......', '......', '......'],
      ['......', '..XX..', '..XX..', '......', '......', '......'],
      ['......', '...X..', '......', '......', '......', '......'],
    ],
  },
  // a dressed column, chipped
  pillar: {
    pal: { a: '#61666d', b: '#4f545a', c: '#6d727a', d: '#3f4348' },
    moss: '#78893f', mossy: 15,
    scale: 1.0,
    layers: [
      ['cccccc', 'cccccc', 'cccccc', 'cccccc', 'cccccc', 'cccccc'],
      ['.bbbb.', 'bbbbbb', 'bbbbbb', 'bbbbbb', 'bbbbb.', '.bbbb.'],
      ['.aaaa.', 'aaaaaa', 'aaaaaa', 'aaaaaa', 'aaaaa.', '.aaaa.'],
      ['.aaaa.', 'aaaaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa', '.aaaa.'],
      ['.aaaa.', 'aadaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa', '.aaaa.'],
      ['.bbbb.', 'bbbbbb', 'bbbbbb', 'bbbbbb', 'bbbbbb', '.bbbb.'],
      ['cccccc', 'cccccc', 'cccccc', 'cccccc', 'cccccc', 'cccccc'],
      ['.cccc.', 'cccccc', 'cccccc', 'cccccc', 'cccccc', '.cccc.'],
    ],
  },
  // A brazier: a stone bowl on a stem with fire in it. These are the only
  // things in the dungeon that light it, so they are placed on walls where they
  // can throw a pool across the floor.
  brazier: {
    pal: { s: '#5c5346', t: '#433c33', o: '#ff8a2b', y: '#ffd166', w: '#fff3c4' },
    scale: 0.86,
    layers: [
      ['..tt..', '.tttt.', '.tttt.', '..tt..', '......', '......'],
      ['..ss..', '..ss..', '..ss..', '..ss..', '......', '......'],
      ['..ss..', '..ss..', '..ss..', '..ss..', '......', '......'],
      ['.ssss.', 'ssssss', 'ssssss', '.ssss.', '......', '......'],
      ['.tttt.', 't.oo.t', 't.oo.t', '.tttt.', '......', '......'],
      ['......', '..oo..', '.oyyo.', '..oo..', '......', '......'],
      ['......', '..yy..', '.ywwy.', '..yy..', '......', '......'],
      ['......', '......', '..ww..', '......', '......', '......'],
    ],
  },

  // a heap of broken stone
  rubble: {
    pal: { a: '#9298a0', b: '#767c85', c: '#5b6068' },
    moss: '#78893f', mossy: 22,
    scale: 1.0,
    layers: [
      ['.bbbb.', 'baaabb', 'baaaab', 'bbaaab', '.bbbb.', '......'],
      ['..ab..', '.aab..', '.aaab.', '..bb..', '......', '......'],
      ['......', '..a...', '..aa..', '......', '......', '......'],
    ],
  },
};
