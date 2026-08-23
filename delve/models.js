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

// The creatures are drawn to MINECRAFT proportions, because that is the whole
// tell of the look: a head that is a big cube in its own right, a torso
// narrower than the head so the head OVERHANGS it, arms hanging clear at the
// shoulders, and two legs with daylight between them. The old models were
// 6-wide blobs with a small head sunk into the mass, which reads as a lump at
// any size, and did at 46 pixels a tile.
//
// They are 9 columns wide with a PINNED total height, so the silhouette is
// fixed and does not drift when `scale` changes. Width 9 splits as 1 arm,
// 5 torso, 2 arm on each side, so the shoulders read wider than the head —
// and the torso is shallower than the head, so the head overhangs the chest.
// That overhang is the whole Minecraft read.
//
// Layers run bottom-up: feet, legs, torso, head. What this camera SHOWS is the
// +x and +y faces, so anything meant to be read — an eye, a visor slit, a lit
// maw — sits on the far edge of those two axes and nowhere else. A detail at
// low x or low y is a detail nobody will ever see.

// The creatures are drawn to be told apart by OUTLINE, before colour and before
// any detail. That is the whole job at thirty-eight pixels a tile.
//
// The first pass at this got the proportions right — Minecraft's own split of
// legs, torso and head — and produced four things with the same silhouette in
// four colours. Measured by overlapping their masks, the delver and the
// sentinel shared 79% of their outline. So this pass starts from the shape:
//
//   the delver    tall, narrow, a pointed hood, a blade out to one side
//   the husk      leaning, lopsided, arms and head thrown out in front
//   the spitter   wider than it is tall, splayed, a snout over the floor
//   the sentinel  broad, pauldrons proud of the shoulders, a small helm
//
// They are 9 columns wide with a PINNED total height, so the silhouette is
// fixed and does not drift when `scale` changes. Layers run bottom-up. What
// this camera SHOWS is the +x and +y faces, so anything meant to be read sits
// on the far edge of those two axes and nowhere else.

export const MODELS = {
  // THE DELVER. Tall where everything else is squat, with a hood that comes to
  // a point, a blade held clear on one side and a lantern out on the other.
  // He is the only thing down here that carries anything, and the only thing
  // with an outline that reaches out in two directions at once — which is
  // what finally separated him from the husk, who leans out in only one.
  // The lantern is also an answer: the whole floor is lit by this figure,
  // and the model should say where that light comes from.
  player: {
    pal: { c: '#2f93a6', C: '#22707f', d: '#17505c', k: '#0d1a18', m: '#cfd9e4', g: '#d8ae2e', L: '#ffdb96' },
    scale: 0.94, height: 1.92,
    layers: [
      ['.........', '.........', '.........', '..kk.kk..', '..kk.kk..', '..kk.kk..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..dd.dd..', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........'],
      ['.........', '.CCCCCCC.', '.CCCCCCC.', '..dd.dd..', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........'],
      ['.........', '.CCCCCCC.', '.CCCCCCC.', '..dd.dd..', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........'],
      ['.........', '.CCCCCCC.', '.CCCCCCC.', '..dd.dd..', '..dd.dd..', '..dd.dd..', '.........', '.........', '.........'],
      ['.........', '.CCCCCCC.', '.CCCCCCC.', '..dd.dd..', '..dd.dd..', '..dd.dd..', '.........', '...gg....', '...gg....'],
      ['.........', '.CCCCCCC.', '.CCCCCCC.', '..ccccc..', '..ccccc.m', '..ccccc..', '.........', '...LL....', '...LL....'],
      ['.........', '..CCCCC..', '..CCCCC..', '.ccccccc.', '.ccccccgg', '.ccccccc.', '.........', '...LL....', '...LL....'],
      ['.........', '..CCCCC..', '..CCCCC..', '.ccccccc.', '.cccccccm', '.ccccccc.', '.........', '...cc....', '...gg....'],
      ['.........', '..CCCCC..', '..CCCCC..', '.ccccccc.', '.cccccccm', '.ccccccc.', '.........', '...cc....', '.........'],
      ['.........', '..CCCCC..', '..CCCCC..', '.ccccccc.', '.cccccccm', '.ccccccc.', '.........', '...cc....', '.........'],
      ['.........', '.........', '..CCCCC..', '..CCCCC..', '..CCCCC.m', '..CCCCC..', '..CCCCC..', '.........', '.........'],
      ['.........', '.........', '..CCCCC..', '..CCCCC..', '..CCCCk.m', '..CCCCk..', '..CCCCC..', '.........', '.........'],
      ['.........', '.........', '.........', '..CCCCC..', '..CCCCC.m', '..CCCCC..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '...CCC...', '...CCC...', '...CCC...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '.........', '...ccc...', '...ccc...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '.........', '....cc...', '....cc...', '.........', '.........', '.........'],
    ],
  },

  // A SHAMBLER, and everything about it leans. Legs set back, body tipping
  // forward a row at a time, arms thrown out past the body and the head
  // hanging past the arms. Read as an outline it is a thing falling toward
  // you, which is the only warning you get before it arrives.
  husk: {
    pal: { a: '#93b465', b: '#6d8c47', c: '#4a5642', d: '#262c20', e: '#0f1409' },
    scale: 1.00, height: 1.30,
    layers: [
      ['.........', '.........', '...dddd..', '...dddd..', '...dddd..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '...cccc..', '...cccc..', '...cccc..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '...cccc..', '...cccc..', '...cccc..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '...cccc..', '...cccc..', '...cccc..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '...cccc..', '...cccc..', '...cccc..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '..aaaaa..', '..aaaaa..', '..aaaaa..', '.........', '.........', '.........', '.........'],
      ['.........', '.........', '..aaaaa..', '..aaaaa..', '..aaaaa..', '..aaaaa..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..aaaaa..', '..aaaaa..', '..aaaaa..', '.........', '.........', '.........'],
      ['.........', '...bbb...', '...bbb...', '..aaaaa..', '..aaaaa..', '.bbaaabb.', '.bbaaabb.', '.bb...bb.', '.bb...bb.'],
      ['.........', '...bbb...', '...bbb...', '.........', '..aaaaa..', '.bbaaabb.', '.bbaaabb.', '.bb...bb.', '.bb...bb.'],
      ['.........', '...bbb...', '...bbb...', '.........', '.bb......', '.bbaaaa..', '...aaaa..', '...aaaa..', '...aaaa..'],
      ['.........', '.........', '.........', '.........', '.bb......', '.bbaaaa..', '...aaae..', '...aaaa..', '...aaae..'],
      ['.........', '.........', '.........', '.........', '.........', '...aaaa..', '...aaaa..', '...aaaa..', '...aaaa..'],
    ],
  },

  // Low, splayed, and the only thing in the dungeon wider than it is tall,
  // with a lit snout thrust out over the floor. It never chases: its whole
  // job is to be recognised from across a room and to look like it is
  // pointing at you.
  spitter: {
    pal: { p: '#c268b0', q: '#8d4079', r: '#55284a', o: '#ff9d3d', y: '#ffeaa8' },
    scale: 1.06, height: 0.95,
    layers: [
      ['.........', 'rrrrrrrrr', 'rrrrrrrrr', 'rrrrrrrrr', 'rrrrrrrrr', 'rrrrrrrrr', 'rrrrrrrrr', 'rrrrrrrrr', '.........'],
      ['.........', 'rrrrrrrrr', 'rrrrrrrrr', 'rrrrrrrrr', 'rrrrrrrrr', 'rrrrrrrrr', 'rrrrrrrrr', 'rrrrrrrrr', '.........'],
      ['.........', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.........'],
      ['.........', '.........', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqqq.', '.qqqqqppp', '.qqqqqppp', '......ppp', '......ppp'],
      ['.........', '.........', '.ppppppp.', '.ppppppp.', '.ppppppp.', '.pppppppp', '.pppppppo', '......ppo', '......ooo'],
      ['.........', '.........', '..ppppp..', '..ppppp..', '..ppppp..', '..ppppppp', '..ppppppy', '......ppy', '......yyy'],
      ['.........', '.........', '.........', '..ppppp..', '..ppppp..', '..ppppppp', '......ppp', '......ppp', '......ppp'],
      ['.........', '.........', '.........', '...qqq...', '...qqq...', '...qqq...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '...qqq...', '...qqq...', '...qqq...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '.........', '....rr...', '....rr...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '.........', '....r....', '.........', '.........', '.........', '.........'],
    ],
  },

  // The biggest thing on the floor and built to look it: pauldrons standing
  // proud of the shoulders, a small crested helm sunk between them, and one
  // arm reaching the knee. Broad where the delver is narrow, and a head too
  // small for its body — which is what makes it read as armour.
  sentinel: {
    pal: { s: '#8e9bb0', t: '#65728c', u: '#3f495c', v: '#e6edf5', w: '#161b23' },
    scale: 1.08, height: 2.10,
    layers: [
      ['.........', '.........', '.........', '..ww.ww..', '..ww.ww..', '..ww.ww..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..uu.uu..', '..uu.uu..', '..uu.uu..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..uu.uu..', '..uu.uu..', '..uu.uu..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..uu.uu..', '..uu.uu..', '..uu.uu..', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '..uu.uu..', '..uu.uutt', '..uu.uutt', '.......tt', '.........', '.........'],
      ['.........', '.........', '.........', '..uu.uu..', '..uu.uutt', '..uu.uutt', '.......tt', '.........', '.........'],
      ['.........', '.........', '.........', '..uu.uu..', '..uu.uutt', '..uu.uutt', '.......tt', '.........', '.........'],
      ['.........', '.........', '..ttttt..', '..ttttt..', '..ttttttt', '..ttttttt', '..ttttttt', '.........', '.........'],
      ['.........', '.........', '..ttttt..', '..ttttt..', '..ttttttt', '..ttttttt', '..ttttttt', '.........', '.........'],
      ['.........', '.........', '..ttttt..', '..ttttt..', '..ttttttt', '..ttttttt', '..ttttttt', '.........', '.........'],
      ['.........', '.........', '..ttttt..', '..ttttt..', '..ttttttt', '..ttttttt', '..ttttttt', '.........', '.........'],
      ['.........', '.........', '..ttttt..', '..ttttt..', '..ttttttt', '..ttttttt', '..ttttttt', '.........', '.........'],
      ['.........', '.........', 'sstttttss', 'sstttttss', 'ssttttttt', 'ssttttttt', 'ssttttttt', '.........', '.........'],
      ['.........', '.........', 'sstttttss', 'sstttttss', 'ssttttttt', 'ssttttttt', 'ssttttttt', '.........', '.........'],
      ['.........', '.........', 'ss.....ss', 'ss.sss.ss', 'ss.sss.ss', 'ss.sss.ss', 'ss.....ss', '.........', '.........'],
      ['.........', '.........', 'ss.....ss', 'ss.ssw.ss', 'ss.sss.ss', 'ss.ssw.ss', 'ss.....ss', '.........', '.........'],
      ['.........', '.........', '.........', '...sss...', '...sss...', '...sss...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '...sts...', '...sts...', '...sts...', '.........', '.........', '.........'],
      ['.........', '.........', '.........', '....t....', '....t....', '....t....', '.........', '.........', '.........'],
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
