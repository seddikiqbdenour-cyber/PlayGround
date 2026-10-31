import * as THREE from 'three'
import { mulberry32 } from './noise.js'

export const ATLAS_COLS = 8
export const TILE = 16
export const ATLAS_PX = ATLAS_COLS * TILE

const T = {
  grassTop: 0,
  grassSide: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  snow: 5,
  logSide: 6,
  logTop: 7,
  leaves: 8,
  planks: 9,
  cobble: 10,
  glass: 11,
  brick: 12,
  gravel: 13,
  coal: 14,
  iron: 15,
  bedrock: 16,
  water: 17,
  sandstone: 18,
  flower: 19,
  tallgrass: 20,
  glowstone: 21,
  obsidian: 22,
  ice: 23,
  pumpkinSide: 24,
  pumpkinTop: 25,
  pumpkinFace: 26,
  cactusSide: 27,
  cactusTop: 28,
  woolWhite: 29,
  woolRed: 30,
  clay: 31,
  mossyCobble: 32,
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0
}

function shade(rgb, amount) {
  return [clampByte(rgb[0] + amount), clampByte(rgb[1] + amount), clampByte(rgb[2] + amount)]
}

function rgba(rgb, alpha = 1) {
  return `rgba(${clampByte(rgb[0])},${clampByte(rgb[1])},${clampByte(rgb[2])},${alpha})`
}

function tileOrigin(t) {
  return { x: (t % ATLAS_COLS) * TILE, y: Math.floor(t / ATLAS_COLS) * TILE }
}

function paintBase(ctx, t, base, spread, seed) {
  const { x: ox, y: oy } = tileOrigin(t)
  const rand = mulberry32(seed)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = (rand() - 0.5) * spread * 2
      ctx.fillStyle = rgba(shade(base, n))
      ctx.fillRect(ox + x, oy + y, 1, 1)
    }
  }
}

function pixel(ctx, t, x, y, rgb, alpha = 1) {
  if (x < 0 || y < 0 || x >= TILE || y >= TILE) return
  const { x: ox, y: oy } = tileOrigin(t)
  ctx.fillStyle = rgba(rgb, alpha)
  ctx.fillRect(ox + x, oy + y, 1, 1)
}

function rect(ctx, t, x, y, w, h, rgb, alpha = 1) {
  const { x: ox, y: oy } = tileOrigin(t)
  ctx.fillStyle = rgba(rgb, alpha)
  ctx.fillRect(ox + x, oy + y, w, h)
}

function speckles(ctx, t, count, seed, colors, minSize = 1, maxSize = 2) {
  const rand = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * TILE)
    const y = Math.floor(rand() * TILE)
    const w = minSize + Math.floor(rand() * (maxSize - minSize + 1))
    const h = minSize + Math.floor(rand() * (maxSize - minSize + 1))
    rect(ctx, t, x, y, w, h, colors[Math.floor(rand() * colors.length)])
  }
}

function drawTiles(ctx) {
  // 0 — grass top
  paintBase(ctx, T.grassTop, [96, 154, 68], 9, 11)
  speckles(ctx, T.grassTop, 18, 12, [
    [78, 134, 54],
    [112, 172, 80],
    [86, 144, 60],
  ])
  speckles(ctx, T.grassTop, 6, 13, [[124, 184, 92]], 1, 1)

  // 1 — grass side
  paintBase(ctx, T.grassSide, [120, 86, 54], 12, 21)
  const fringeRand = mulberry32(22)
  for (let x = 0; x < TILE; x++) {
    const depth = 3 + Math.floor(fringeRand() * 3)
    for (let y = 0; y < depth; y++) {
      const c = y === depth - 1 ? [68, 132, 44] : [88, 160, 60]
      pixel(ctx, T.grassSide, x, y, shade(c, (fringeRand() - 0.5) * 18))
    }
  }
  speckles(ctx, T.grassSide, 16, 23, [[96, 66, 40], [146, 105, 66]])

  // 2 — dirt
  paintBase(ctx, T.dirt, [126, 88, 56], 14, 31)
  speckles(ctx, T.dirt, 18, 32, [[104, 70, 42], [146, 104, 66]], 1, 2)

  // 3 — stone
  paintBase(ctx, T.stone, [130, 134, 140], 8, 41)
  speckles(ctx, T.stone, 14, 42, [[112, 116, 122], [148, 152, 158]], 1, 2)
  const crack = mulberry32(43)
  for (let i = 0; i < 3; i++) {
    let x = 2 + Math.floor(crack() * 11)
    let y = 2 + Math.floor(crack() * 9)
    for (let j = 0; j < 4; j++) {
      pixel(ctx, T.stone, x, y, [96, 101, 108])
      x += crack() > 0.5 ? 1 : 0
      y += 1
    }
  }

  // 4 — sand
  paintBase(ctx, T.sand, [220, 205, 152], 8, 51)
  speckles(ctx, T.sand, 20, 52, [[206, 188, 134], [236, 222, 176]], 1, 1)

  // 5 — snow
  paintBase(ctx, T.snow, [238, 246, 252], 4, 61)
  speckles(ctx, T.snow, 12, 62, [[224, 238, 250], [252, 254, 255]], 1, 1)

  // 6 — log side
  paintBase(ctx, T.logSide, [106, 76, 46], 8, 71)
  const barkRand = mulberry32(72)
  for (let x = 0; x < TILE; x++) {
    if (x % 4 === 1) {
      for (let y = 0; y < TILE; y++) {
        if (barkRand() > 0.12) pixel(ctx, T.logSide, x, y, [78, 52, 28])
      }
    } else if (x % 4 === 3) {
      for (let y = 0; y < TILE; y++) {
        if (barkRand() > 0.5) pixel(ctx, T.logSide, x, y, [132, 96, 58])
      }
    }
  }

  // 7 — log top
  paintBase(ctx, T.logTop, [158, 120, 74], 10, 81)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
      const ring = Math.floor(d)
      if (ring % 2 === 0) pixel(ctx, T.logTop, x, y, [122, 88, 52])
      if (d < 1.5) pixel(ctx, T.logTop, x, y, [92, 64, 38])
    }
  }
  rect(ctx, T.logTop, 7, 7, 2, 2, [84, 57, 32])

  // 8 — leaves
  paintBase(ctx, T.leaves, [62, 118, 50], 18, 91)
  speckles(ctx, T.leaves, 30, 92, [
    [42, 92, 36],
    [76, 140, 58],
    [96, 158, 68],
  ], 1, 2)
  const holes = mulberry32(93)
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(holes() * TILE)
    const y = Math.floor(holes() * TILE)
    ctx.fillStyle = 'rgba(0,0,0,1)'
    ctx.fillRect(tileOrigin(T.leaves).x + x, tileOrigin(T.leaves).y + y, 1 + (holes() > 0.75 ? 1 : 0), 1)
  }
  ctx.restore()

  // 9 — planks
  paintBase(ctx, T.planks, [174, 132, 80], 7, 101)
  for (let y = 0; y < TILE; y++) {
    if (y % 4 === 3) {
      for (let x = 0; x < TILE; x++) pixel(ctx, T.planks, x, y, [118, 84, 46])
    }
  }
  const grain = mulberry32(102)
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(grain() * 14)
    const y = Math.floor(grain() * 15)
    rect(ctx, T.planks, x, y, 2 + Math.floor(grain() * 4), 1, [150, 108, 60])
  }
  rect(ctx, T.planks, 3, 0, 1, 3, [132, 94, 52])
  rect(ctx, T.planks, 11, 8, 1, 3, [132, 94, 52])

  // 10 — cobblestone
  paintBase(ctx, T.cobble, [122, 127, 133], 10, 111)
  const cob = mulberry32(112)
  const stones = [
    [1, 1, 6, 4],
    [9, 1, 5, 5],
    [1, 7, 5, 3],
    [7, 7, 4, 3],
    [12, 7, 3, 5],
    [1, 12, 6, 3],
    [9, 12, 6, 3],
    [12, 2, 3, 3],
  ]
  for (const [x, y, w, h] of stones) {
    const base = [116 + Math.floor(cob() * 30), 120 + Math.floor(cob() * 30), 126 + Math.floor(cob() * 30)]
    rect(ctx, T.cobble, x, y, w, h, base)
    rect(ctx, T.cobble, x, y, w, 1, shade(base, 18))
    rect(ctx, T.cobble, x, y + h - 1, w, 1, shade(base, -22))
  }

  // 11 — glass
  rect(ctx, T.glass, 0, 0, 16, 16, [186, 226, 242], 0.08)
  for (let x = 0; x < TILE; x++) {
    pixel(ctx, T.glass, x, 0, [206, 238, 250], 0.62)
    pixel(ctx, T.glass, x, 15, [206, 238, 250], 0.62)
    pixel(ctx, T.glass, 0, x, [206, 238, 250], 0.62)
    pixel(ctx, T.glass, 15, x, [206, 238, 250], 0.62)
  }
  for (let i = 0; i < 5; i++) {
    pixel(ctx, T.glass, 3 + i, 10 - i, [255, 255, 255], 0.35)
    pixel(ctx, T.glass, 4 + i, 10 - i, [255, 255, 255], 0.18)
  }
  pixel(ctx, T.glass, 4, 4, [255, 255, 255], 0.28)
  pixel(ctx, T.glass, 11, 12, [255, 255, 255], 0.2)

  // 12 — bricks
  rect(ctx, T.brick, 0, 0, 16, 16, [190, 174, 152])
  const brickRand = mulberry32(121)
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 === 0 ? 0 : 4
    for (let col = -1; col < 3; col++) {
      const x = col * 8 + offset
      const y = row * 4
      const c = [158 + Math.floor(brickRand() * 18), 66 + Math.floor(brickRand() * 16), 50 + Math.floor(brickRand() * 12)]
      rect(ctx, T.brick, x + 1, y + 1, 6, 2, c)
      rect(ctx, T.brick, x + 1, y + 1, 6, 1, shade(c, 16))
    }
  }

  // 13 — gravel
  paintBase(ctx, T.gravel, [122, 118, 114], 22, 131)
  speckles(ctx, T.gravel, 34, 132, [[84, 82, 80], [160, 156, 150], [104, 100, 96]], 1, 2)

  // 14 — coal ore
  paintBase(ctx, T.coal, [128, 132, 138], 10, 141)
  speckles(ctx, T.coal, 8, 142, [[74, 78, 84], [150, 154, 160]], 1, 1)
  const coalRand = mulberry32(143)
  for (let i = 0; i < 5; i++) {
    const x = 1 + Math.floor(coalRand() * 12)
    const y = 1 + Math.floor(coalRand() * 12)
    rect(ctx, T.coal, x, y, 2, 2, [34, 36, 40])
    pixel(ctx, T.coal, x, y, [58, 60, 66])
  }

  // 15 — iron ore
  paintBase(ctx, T.iron, [128, 132, 138], 10, 151)
  speckles(ctx, T.iron, 8, 152, [[74, 78, 84], [150, 154, 160]], 1, 1)
  const ironRand = mulberry32(153)
  for (let i = 0; i < 5; i++) {
    const x = 1 + Math.floor(ironRand() * 12)
    const y = 1 + Math.floor(ironRand() * 12)
    rect(ctx, T.iron, x, y, 2, 2, [196, 152, 98])
    pixel(ctx, T.iron, x, y, [224, 186, 132])
  }

  // 16 — bedrock
  paintBase(ctx, T.bedrock, [68, 72, 80], 24, 161)
  speckles(ctx, T.bedrock, 26, 162, [[34, 36, 42], [102, 106, 114], [52, 54, 62]], 1, 3)

  // 17 — water
  rect(ctx, T.water, 0, 0, 16, 16, [48, 116, 196], 0.82)
  const waterRand = mulberry32(171)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = waterRand()
      if (n > 0.82) pixel(ctx, T.water, x, y, [96, 170, 232], 0.55)
      else if (n < 0.12) pixel(ctx, T.water, x, y, [30, 84, 152], 0.5)
    }
  }
  for (let i = 0; i < 4; i++) {
    const y = 2 + i * 4
    rect(ctx, T.water, 1 + (i % 2) * 3, y, 7, 1, [122, 190, 242], 0.4)
  }

  // 18 — sandstone
  paintBase(ctx, T.sandstone, [216, 198, 145], 10, 181)
  for (let y = 0; y < TILE; y++) {
    if (y === 0 || y === 5 || y === 10 || y === 15) {
      for (let x = 0; x < TILE; x++) pixel(ctx, T.sandstone, x, y, [186, 166, 114])
    }
  }
  speckles(ctx, T.sandstone, 12, 182, [[198, 180, 128], [230, 214, 164]], 1, 1)

  // 19 — red flower
  rect(ctx, T.flower, 7, 8, 2, 8, [70, 132, 48])
  pixel(ctx, T.flower, 6, 11, [82, 152, 56])
  pixel(ctx, T.flower, 9, 12, [82, 152, 56])
  pixel(ctx, T.flower, 5, 12, [92, 166, 62])
  pixel(ctx, T.flower, 10, 13, [92, 166, 62])
  rect(ctx, T.flower, 6, 4, 4, 4, [210, 58, 52])
  pixel(ctx, T.flower, 5, 5, [230, 76, 66])
  pixel(ctx, T.flower, 10, 6, [230, 76, 66])
  rect(ctx, T.flower, 7, 5, 2, 2, [255, 206, 74])
  pixel(ctx, T.flower, 7, 3, [242, 96, 82])
  pixel(ctx, T.flower, 8, 3, [242, 96, 82])

  // 20 — tall grass
  const grassRand = mulberry32(201)
  for (let i = 0; i < 9; i++) {
    const x = 1 + Math.floor(grassRand() * 14)
    const h = 5 + Math.floor(grassRand() * 9)
    const lean = grassRand() > 0.5 ? 1 : -1
    for (let j = 0; j < h; j++) {
      const px = x + Math.round((j / h) * lean * 1.5)
      pixel(ctx, T.tallgrass, px, 15 - j, shade([72, 146, 52], (grassRand() - 0.5) * 26))
    }
  }

  // 21 — glowstone
  paintBase(ctx, T.glowstone, [232, 184, 84], 14, 211)
  speckles(ctx, T.glowstone, 30, 212, [[255, 232, 150], [206, 150, 58], [255, 246, 198]], 1, 2)

  // 22 — obsidian
  paintBase(ctx, T.obsidian, [34, 26, 50], 7, 221)
  speckles(ctx, T.obsidian, 20, 222, [[72, 50, 116], [20, 16, 32], [102, 72, 150]], 1, 2)

  // 23 — ice
  rect(ctx, T.ice, 0, 0, 16, 16, [154, 214, 244], 0.62)
  const iceRand = mulberry32(231)
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(iceRand() * 14)
    const y = Math.floor(iceRand() * 14)
    rect(ctx, T.ice, x, y, 2 + Math.floor(iceRand() * 3), 1, [224, 246, 255], 0.55)
  }
  rect(ctx, T.ice, 0, 0, 16, 1, [232, 250, 255], 0.7)
  rect(ctx, T.ice, 0, 15, 16, 1, [120, 184, 224], 0.6)

  // 24 — pumpkin side
  paintBase(ctx, T.pumpkinSide, [224, 132, 36], 10, 241)
  for (let x = 0; x < TILE; x++) {
    if (x % 4 === 0) {
      for (let y = 0; y < TILE; y++) {
        if ((x + y) % 7 !== 0) pixel(ctx, T.pumpkinSide, x, y, [188, 100, 24])
      }
    }
  }
  rect(ctx, T.pumpkinSide, 0, 0, 16, 1, [246, 164, 62])
  rect(ctx, T.pumpkinSide, 0, 15, 16, 1, [174, 92, 22])

  // 25 — pumpkin top
  paintBase(ctx, T.pumpkinTop, [226, 138, 42], 10, 251)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
      if (Math.floor(d) % 2 === 0 && d > 2) pixel(ctx, T.pumpkinTop, x, y, [196, 108, 28])
    }
  }
  rect(ctx, T.pumpkinTop, 6, 6, 4, 4, [86, 132, 52])
  rect(ctx, T.pumpkinTop, 7, 7, 2, 2, [58, 98, 40])

  // 26 — pumpkin face
  paintBase(ctx, T.pumpkinFace, [224, 132, 36], 10, 261)
  for (let x = 0; x < TILE; x++) {
    if (x % 4 === 0) {
      for (let y = 0; y < TILE; y++) {
        if ((x + y) % 7 !== 0) pixel(ctx, T.pumpkinFace, x, y, [188, 100, 24])
      }
    }
  }
  // carved eyes
  for (let i = 0; i < 3; i++) {
    rect(ctx, T.pumpkinFace, 3 + i, 4 + i, 2, 1, [36, 20, 10])
    rect(ctx, T.pumpkinFace, 10 + i, 4 + i, 2, 1, [36, 20, 10])
    rect(ctx, T.pumpkinFace, 4 - i + 1, 4 + i, 1, 1, [36, 20, 10])
    rect(ctx, T.pumpkinFace, 11 - i + 1, 4 + i, 1, 1, [36, 20, 10])
  }
  // grin
  for (let x = 4; x < 12; x++) pixel(ctx, T.pumpkinFace, x, 11, [36, 20, 10])
  pixel(ctx, T.pumpkinFace, 4, 10, [36, 20, 10])
  pixel(ctx, T.pumpkinFace, 11, 10, [36, 20, 10])
  pixel(ctx, T.pumpkinFace, 6, 12, [36, 20, 10])
  pixel(ctx, T.pumpkinFace, 9, 12, [36, 20, 10])
  rect(ctx, T.pumpkinFace, 0, 0, 16, 1, [246, 164, 62])
  rect(ctx, T.pumpkinFace, 0, 15, 16, 1, [174, 92, 22])

  // 27 — cactus side
  paintBase(ctx, T.cactusSide, [58, 128, 56], 9, 271)
  for (let x = 0; x < TILE; x++) {
    if (x % 5 === 2) {
      for (let y = 0; y < TILE; y++) pixel(ctx, T.cactusSide, x, y, [42, 102, 44])
    }
  }
  const spine = mulberry32(272)
  for (let i = 0; i < 12; i++) {
    pixel(ctx, T.cactusSide, Math.floor(spine() * 16), Math.floor(spine() * 16), [212, 226, 178])
  }

  // 28 — cactus top
  paintBase(ctx, T.cactusTop, [64, 138, 60], 10, 281)
  rect(ctx, T.cactusTop, 3, 3, 10, 10, [78, 154, 70])
  rect(ctx, T.cactusTop, 6, 6, 4, 4, [96, 174, 84])
  speckles(ctx, T.cactusTop, 10, 282, [[44, 104, 46], [206, 222, 172]], 1, 1)

  // 29 — white wool
  paintBase(ctx, T.woolWhite, [232, 232, 224], 7, 291)
  speckles(ctx, T.woolWhite, 22, 292, [[214, 214, 206], [244, 244, 238]], 1, 2)

  // 30 — red wool
  paintBase(ctx, T.woolRed, [176, 58, 58], 12, 301)
  speckles(ctx, T.woolRed, 22, 302, [[148, 44, 46], [198, 76, 72]], 1, 2)

  // 31 — clay
  paintBase(ctx, T.clay, [160, 166, 178], 8, 311)
  speckles(ctx, T.clay, 20, 312, [[142, 148, 162], [180, 186, 196]], 1, 2)

  // 32 — mossy cobble
  paintBase(ctx, T.mossyCobble, [112, 124, 110], 12, 321)
  speckles(ctx, T.mossyCobble, 30, 322, [[78, 112, 62], [58, 92, 50], [136, 148, 130]], 1, 2)
  rect(ctx, T.mossyCobble, 2, 9, 5, 2, [76, 114, 62])
  rect(ctx, T.mossyCobble, 10, 3, 4, 2, [70, 106, 56])
}

let atlasCache = null

export function getAtlas() {
  if (atlasCache) return atlasCache
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_PX
  canvas.height = ATLAS_PX
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, ATLAS_PX, ATLAS_PX)
  drawTiles(ctx)

  const image = ctx.getImageData(0, 0, ATLAS_PX, ATLAS_PX).data
  const averages = new Float32Array(ATLAS_COLS * ATLAS_COLS * 3)
  for (let t = 0; t < ATLAS_COLS * ATLAS_COLS; t++) {
    const ox = (t % ATLAS_COLS) * TILE
    const oy = Math.floor(t / ATLAS_COLS) * TILE
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const i = ((oy + y) * ATLAS_PX + ox + x) * 4
        const a = image[i + 3]
        if (a > 30) {
          r += image[i]
          g += image[i + 1]
          b += image[i + 2]
          n++
        }
      }
    }
    if (n === 0) n = 1
    averages[t * 3] = r / n / 255
    averages[t * 3 + 1] = g / n / 255
    averages[t * 3 + 2] = b / n / 255
  }

  atlasCache = { canvas, ctx, averages }
  return atlasCache
}

let textureCache = null

export function getAtlasTexture() {
  if (textureCache) return textureCache
  const { canvas } = getAtlas()
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  textureCache = tex
  return tex
}

const cube = (name, tex, opts = {}) => ({
  name,
  tex: Array.isArray(tex) ? tex : [tex, tex, tex, tex, tex, tex],
  solid: true,
  opaque: true,
  transparent: false,
  foliage: false,
  cross: false,
  placeable: true,
  hardness: 0.4,
  ...opts,
})

export const BLOCKS = {
  0: { name: 'Air', solid: false, opaque: false, transparent: true, placeable: false, hardness: Infinity, tex: [0, 0, 0, 0, 0, 0] },
  1: cube('Grass Block', [T.grassSide, T.grassSide, T.grassTop, T.dirt, T.grassSide, T.grassSide], {
    hardness: 0.35,
  }),
  2: cube('Dirt', T.dirt, { hardness: 0.35 }),
  3: cube('Stone', T.stone, { hardness: 0.9 }),
  4: cube('Sand', T.sand, { hardness: 0.3 }),
  5: cube('Water', T.water, {
    solid: false,
    opaque: false,
    transparent: true,
    placeable: false,
    hardness: Infinity,
    tex: [T.water, T.water, T.water, T.water, T.water, T.water],
  }),
  6: cube('Oak Log', [T.logSide, T.logSide, T.logTop, T.logTop, T.logSide, T.logSide], { hardness: 0.7 }),
  7: cube('Leaves', T.leaves, { opaque: false, foliage: true, hardness: 0.15 }),
  8: cube('Snow', T.snow, { hardness: 0.25 }),
  9: cube('Oak Planks', T.planks, { hardness: 0.55 }),
  10: cube('Cobblestone', T.cobble, { hardness: 0.9 }),
  11: cube('Glass', T.glass, { opaque: false, transparent: true, hardness: 0.2 }),
  12: cube('Bricks', T.brick, { hardness: 0.9 }),
  13: cube('Gravel', T.gravel, { hardness: 0.45 }),
  14: cube('Coal Ore', T.coal, { hardness: 1.1 }),
  15: cube('Iron Ore', T.iron, { hardness: 1.3 }),
  16: cube('Bedrock', T.bedrock, { hardness: Infinity, placeable: false }),
  17: cube('Sandstone', T.sandstone, { hardness: 0.6 }),
  18: cube('Poppy', T.flower, {
    solid: false,
    opaque: false,
    foliage: true,
    cross: true,
    hardness: 0.05,
    tex: [T.flower, T.flower, T.flower, T.flower, T.flower, T.flower],
  }),
  19: cube('Tall Grass', T.tallgrass, {
    solid: false,
    opaque: false,
    foliage: true,
    cross: true,
    hardness: 0.05,
    tex: [T.tallgrass, T.tallgrass, T.tallgrass, T.tallgrass, T.tallgrass, T.tallgrass],
  }),
  20: cube('Glowstone', T.glowstone, { hardness: 0.3 }),
  21: cube('Obsidian', T.obsidian, { hardness: 2.6 }),
  22: cube('Ice', T.ice, { opaque: false, transparent: true, hardness: 0.35 }),
  23: cube('Jack o’Lantern', [T.pumpkinSide, T.pumpkinSide, T.pumpkinTop, T.pumpkinTop, T.pumpkinFace, T.pumpkinFace], {
    hardness: 0.5,
  }),
  24: cube('Cactus', [T.cactusSide, T.cactusSide, T.cactusTop, T.cactusTop, T.cactusSide, T.cactusSide], {
    hardness: 0.4,
  }),
  25: cube('White Wool', T.woolWhite, { hardness: 0.3 }),
  26: cube('Red Wool', T.woolRed, { hardness: 0.3 }),
  27: cube('Clay', T.clay, { hardness: 0.4 }),
  28: cube('Mossy Cobblestone', T.mossyCobble, { hardness: 0.9 }),
}

export const HOTBAR_BLOCKS = [1, 3, 9, 6, 7, 10, 11, 12, 20]

export const INVENTORY_BLOCKS = [
  1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
]

export function isSolid(id) {
  const def = BLOCKS[id]
  return !!def && def.solid
}

export function isOpaque(id) {
  const def = BLOCKS[id]
  return !!def && def.opaque
}

export function particleColor(id) {
  const def = BLOCKS[id]
  if (!def) return [0.7, 0.7, 0.7]
  const { averages } = getAtlas()
  const t = def.tex[2] ?? def.tex[0]
  return [averages[t * 3], averages[t * 3 + 1], averages[t * 3 + 2]]
}

function drawTileTo(ctx, tile, dx, dy, dw, dh) {
  const { canvas } = getAtlas()
  const ox = (tile % ATLAS_COLS) * TILE
  const oy = Math.floor(tile / ATLAS_COLS) * TILE
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(canvas, ox, oy, TILE, TILE, dx, dy, dw, dh)
}

function drawFace(ctx, tile, p0, p1, p2, p3, shadeAlpha = 0) {
  const ux = (p1[0] - p0[0]) / TILE
  const uy = (p1[1] - p0[1]) / TILE
  const vx = (p3[0] - p0[0]) / TILE
  const vy = (p3[1] - p0[1]) / TILE
  ctx.save()
  ctx.setTransform(ux, uy, vx, vy, p0[0], p0[1])
  drawTileTo(ctx, tile, 0, 0, TILE, TILE)
  ctx.restore()
  if (shadeAlpha > 0) {
    ctx.save()
    ctx.setTransform(ux, uy, vx, vy, p0[0], p0[1])
    ctx.fillStyle = `rgba(0,0,0,${shadeAlpha})`
    ctx.fillRect(0, 0, TILE, TILE)
    ctx.restore()
  }
}

export function blockIcon(id, size = 64) {
  const def = BLOCKS[id]
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  if (!def) return canvas
  if (def.cross) {
    drawTileTo(ctx, def.tex[0], size * 0.1, size * 0.05, size * 0.8, size * 0.9)
    return canvas
  }
  const s = size
  const top = [s * 0.5, s * 0.07]
  const right = [s * 0.93, s * 0.3]
  const bottom = [s * 0.5, s * 0.53]
  const left = [s * 0.07, s * 0.3]
  const dl = [s * 0.07, s * 0.73]
  const dr = [s * 0.5, s * 0.96]
  const rr = [s * 0.93, s * 0.73]

  drawFace(ctx, def.tex[2], left, top, right, bottom, 0)
  drawFace(ctx, def.tex[0], left, dl, dr, bottom, 0.22)
  drawFace(ctx, def.tex[4], bottom, dr, rr, right, 0.08)
  return canvas
}
