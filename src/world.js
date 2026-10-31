import * as THREE from 'three'
import { BLOCKS, getAtlasTexture, isOpaque, isSolid } from './blocks.js'
import { fbm2, hash2, hash3, ridged2, smoothstep } from './noise.js'

export const CHUNK = 16
export const HEIGHT = 64
export const SEA_LEVEL = 28

const CHUNK_VOLUME = CHUNK * CHUNK * HEIGHT

const FACES = [
  {
    normal: [1, 0, 0],
    verts: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
    uvs: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ],
    ao: [
      [
        [0, -1, 0],
        [0, 0, -1],
        [0, -1, -1],
      ],
      [
        [0, 1, 0],
        [0, 0, -1],
        [0, 1, -1],
      ],
      [
        [0, 1, 0],
        [0, 0, 1],
        [0, 1, 1],
      ],
      [
        [0, -1, 0],
        [0, 0, 1],
        [0, -1, 1],
      ],
    ],
    shade: 0.9,
  },
  {
    normal: [-1, 0, 0],
    verts: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    ao: [
      [
        [0, -1, 0],
        [0, 0, -1],
        [0, -1, -1],
      ],
      [
        [0, -1, 0],
        [0, 0, 1],
        [0, -1, 1],
      ],
      [
        [0, 1, 0],
        [0, 0, 1],
        [0, 1, 1],
      ],
      [
        [0, 1, 0],
        [0, 0, -1],
        [0, 1, -1],
      ],
    ],
    shade: 0.86,
  },
  {
    normal: [0, 1, 0],
    verts: [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
    uvs: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ],
    ao: [
      [
        [-1, 1, 0],
        [0, 1, -1],
        [-1, 1, -1],
      ],
      [
        [-1, 1, 0],
        [0, 1, 1],
        [-1, 1, 1],
      ],
      [
        [1, 1, 0],
        [0, 1, 1],
        [1, 1, 1],
      ],
      [
        [1, 1, 0],
        [0, 1, -1],
        [1, 1, -1],
      ],
    ],
    shade: 1,
  },
  {
    normal: [0, -1, 0],
    verts: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    ao: [
      [
        [-1, -1, 0],
        [0, -1, -1],
        [-1, -1, -1],
      ],
      [
        [1, -1, 0],
        [0, -1, -1],
        [1, -1, -1],
      ],
      [
        [1, -1, 0],
        [0, -1, 1],
        [1, -1, 1],
      ],
      [
        [-1, -1, 0],
        [0, -1, 1],
        [-1, -1, 1],
      ],
    ],
    shade: 0.65,
  },
  {
    normal: [0, 0, 1],
    verts: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    ao: [
      [
        [-1, 0, 1],
        [0, -1, 1],
        [-1, -1, 1],
      ],
      [
        [1, 0, 1],
        [0, -1, 1],
        [1, -1, 1],
      ],
      [
        [1, 0, 1],
        [0, 1, 1],
        [1, 1, 1],
      ],
      [
        [-1, 0, 1],
        [0, 1, 1],
        [-1, 1, 1],
      ],
    ],
    shade: 0.95,
  },
  {
    normal: [0, 0, -1],
    verts: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
    uvs: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ],
    ao: [
      [
        [-1, 0, -1],
        [0, -1, -1],
        [-1, -1, -1],
      ],
      [
        [-1, 0, -1],
        [0, 1, -1],
        [-1, 1, -1],
      ],
      [
        [1, 0, -1],
        [0, 1, -1],
        [1, 1, -1],
      ],
      [
        [1, 0, -1],
        [0, -1, -1],
        [1, -1, -1],
      ],
    ],
    shade: 0.9,
  },
]

function chunkKey(cx, cz) {
  return `${cx},${cz}`
}

function localIndex(x, y, z) {
  return (y * CHUNK + z) * CHUNK + x
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export class World {
  constructor(scene, seed) {
    this.scene = scene
    this.seed = seed >>> 0
    this.group = new THREE.Group()
    this.group.name = 'voxel-world'
    scene.add(this.group)

    this.chunks = new Map()
    this.editsByChunk = new Map()
    this.heightCache = new Map()
    this.queue = []
    this.queued = new Set()
    this.dirty = new Set()
    this.lastCx = null
    this.lastCz = null
    this.renderDistance = 5

    const texture = getAtlasTexture()
    this.materials = {
      solid: new THREE.MeshLambertMaterial({ map: texture, vertexColors: true }),
      foliage: new THREE.MeshLambertMaterial({
        map: texture,
        vertexColors: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0x16240f),
        emissiveIntensity: 0.7,
      }),
      transparent: new THREE.MeshLambertMaterial({
        map: texture,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        alphaTest: 0.02,
        side: THREE.DoubleSide,
      }),
    }
  }

  heightAt(x, z) {
    const key = `${x},${z}`
    const cached = this.heightCache.get(key)
    if (cached !== undefined) return cached
    const seed = this.seed
    const continent = fbm2(x * 0.003, z * 0.003, seed, 4)
    const hills = fbm2(x * 0.011, z * 0.011, seed + 17, 4)
    const detail = fbm2(x * 0.045, z * 0.045, seed + 29, 2)
    const ridge = ridged2(x * 0.0065, z * 0.0065, seed + 43, 4)
    let h =
      18 +
      continent * 32 +
      (hills - 0.5) * 14 +
      (detail - 0.5) * 3 +
      Math.pow(ridge, 2.2) * 24 * smoothstep(0.52, 0.85, continent)
    h = Math.max(4, Math.min(HEIGHT - 8, Math.floor(h)))
    if (this.heightCache.size > 160000) this.heightCache.clear()
    this.heightCache.set(key, h)
    return h
  }

  biomeAt(x, z, h = this.heightAt(x, z)) {
    const seed = this.seed
    const temp = fbm2(x * 0.0017, z * 0.0017, seed + 101, 3)
    const moist = fbm2(x * 0.0021, z * 0.0021, seed + 211, 3)
    if (h > 50 || temp < 0.33) return 'snow'
    if (h <= SEA_LEVEL + 1) return 'beach'
    if (temp > 0.62 && moist < 0.47) return 'desert'
    if (moist > 0.57) return 'forest'
    return 'plains'
  }

  biomeName(x, z) {
    const names = { snow: 'Snowy Peaks', beach: 'Shoreline', desert: 'Desert', forest: 'Forest', plains: 'Plains' }
    return names[this.biomeAt(x, z)] || 'Plains'
  }

  findSpawn() {
    for (let r = 0; r < 96; r += 4) {
      const steps = Math.max(1, Math.floor(r * 0.7))
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2
        const x = Math.round(Math.cos(a) * r)
        const z = Math.round(Math.sin(a) * r)
        const h = this.heightAt(x, z)
        const biome = this.biomeAt(x, z, h)
        if (h > SEA_LEVEL + 3 && h < 46 && biome === 'plains') {
          return { x, z, y: h + 1 }
        }
      }
    }
    return { x: 0, z: 0, y: this.heightAt(0, 0) + 1 }
  }

  ensureData(cx, cz) {
    const key = chunkKey(cx, cz)
    let chunk = this.chunks.get(key)
    if (chunk) return chunk
    chunk = {
      cx,
      cz,
      key,
      data: new Uint8Array(CHUNK_VOLUME),
      meshes: [],
      generated: false,
      meshed: false,
      dirty: true,
    }
    this.chunks.set(key, chunk)
    this.generateChunk(chunk)
    // Newly available neighbours need their border faces rebuilt.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue
        const n = this.chunks.get(chunkKey(cx + dx, cz + dz))
        if (n && n.meshed) this.markDirty(n.cx, n.cz)
      }
    }
    return chunk
  }

  setLocal(chunk, x, y, z, id, overwrite = false) {
    if (x < 0 || x >= CHUNK || z < 0 || z >= CHUNK || y < 0 || y >= HEIGHT) return
    const i = localIndex(x, y, z)
    if (!overwrite && chunk.data[i] !== 0) return
    chunk.data[i] = id
  }

  generateChunk(chunk) {
    const data = chunk.data
    const baseX = chunk.cx * CHUNK
    const baseZ = chunk.cz * CHUNK
    const seed = this.seed

    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = baseX + x
        const wz = baseZ + z
        const h = this.heightAt(wx, wz)
        const biome = this.biomeAt(wx, wz, h)
        const underwater = h <= SEA_LEVEL
        let surface = 1
        let sub = 2
        if (underwater) {
          surface = h < SEA_LEVEL - 4 ? 13 : 4
          sub = 4
        } else if (biome === 'snow') {
          surface = 8
          sub = 2
        } else if (biome === 'desert' || biome === 'beach') {
          surface = 4
          sub = h > SEA_LEVEL + 3 ? 17 : 4
        }

        for (let y = 0; y <= h && y < HEIGHT; y++) {
          let id
          if (y === 0) id = 16
          else if (y === h) id = surface
          else if (y >= h - 3) id = sub
          else {
            id = 3
            const r = hash3(wx, y, wz, seed + 900)
            if (r < 0.011 && y > 3 && y < h - 4) id = 14
            else if (r > 0.9945 && y > 4 && y < 42) id = 15
          }
          data[localIndex(x, y, z)] = id
        }

        if (underwater) {
          for (let y = h + 1; y <= SEA_LEVEL && y < HEIGHT; y++) {
            data[localIndex(x, y, z)] = 5
          }
        }
      }
    }

    this.decorateChunk(chunk)

    const edits = this.editsByChunk.get(chunk.key)
    if (edits) {
      for (const [index, id] of edits) data[index] = id
    }
    chunk.generated = true
    chunk.dirty = true
  }

  decorateChunk(chunk) {
    const baseX = chunk.cx * CHUNK
    const baseZ = chunk.cz * CHUNK
    const seed = this.seed
    const margin = 3

    // Trees and cacti are derived from world coordinates, so every chunk
    // independently reproduces the same forest across its borders.
    for (let wz = baseZ - margin; wz < baseZ + CHUNK + margin; wz++) {
      for (let wx = baseX - margin; wx < baseX + CHUNK + margin; wx++) {
        const h = this.heightAt(wx, wz)
        if (h <= SEA_LEVEL + 1 || h >= HEIGHT - 10) continue
        const biome = this.biomeAt(wx, wz, h)
        const roll = hash2(wx, wz, seed + 777)

        if (biome === 'desert') {
          if (roll < 0.0028) {
            const height = 2 + Math.floor(hash2(wx, wz, seed + 778) * 2)
            for (let i = 1; i <= height; i++) {
              this.setLocal(chunk, wx - baseX, h + i, wz - baseZ, 24, true)
            }
          }
          continue
        }

        const chance = biome === 'forest' ? 0.018 : biome === 'snow' ? 0.004 : 0.0028
        if (roll >= chance) continue
        if (hash2(wx, wz, seed + 779) < 0.22) continue

        if (biome === 'snow') {
          this.placeSpruce(chunk, wx, h, wz, baseX, baseZ)
        } else {
          this.placeOak(chunk, wx, h, wz, baseX, baseZ)
        }
      }
    }

    // Ground cover and the occasional pumpkin.
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = baseX + x
        const wz = baseZ + z
        const h = this.heightAt(wx, wz)
        if (h <= SEA_LEVEL + 1 || h >= HEIGHT - 2) continue
        const biome = this.biomeAt(wx, wz, h)
        if (biome === 'desert' || biome === 'beach' || biome === 'snow') continue
        const i = localIndex(x, h + 1, z)
        if (chunk.data[i] !== 0) continue
        const r = hash2(wx, wz, seed + 1500)
        if (r < 0.013) chunk.data[i] = 18
        else if (r < 0.115) chunk.data[i] = 19
        else if (r > 0.9994) chunk.data[i] = 23
      }
    }
  }

  placeOak(chunk, wx, h, wz, baseX, baseZ) {
    const seed = this.seed
    const trunk = 4 + Math.floor(hash2(wx, wz, seed + 801) * 3)
    for (let i = 1; i <= trunk; i++) {
      this.setLocal(chunk, wx - baseX, h + i, wz - baseZ, 6, true)
    }
    for (let dy = trunk - 2; dy <= trunk + 1; dy++) {
      const y = h + 1 + dy
      const radius = dy >= trunk ? 1 : 2
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius) {
            if (hash2(wx + dx, wz + dz, seed + 802) < 0.55) continue
          }
          this.setLocal(chunk, wx - baseX + dx, y, wz - baseZ + dz, 7, false)
        }
      }
    }
    this.setLocal(chunk, wx - baseX, h + trunk + 2, wz - baseZ, 7, false)
  }

  placeSpruce(chunk, wx, h, wz, baseX, baseZ) {
    const seed = this.seed
    const trunk = 6 + Math.floor(hash2(wx, wz, seed + 811) * 3)
    for (let i = 1; i <= trunk; i++) {
      this.setLocal(chunk, wx - baseX, h + i, wz - baseZ, 6, true)
    }
    for (let i = 0; i <= trunk; i++) {
      const y = h + 1 + i
      const radius = Math.max(0, Math.floor((trunk - i) / 2.4))
      if (radius === 0 && i % 2 === 0) continue
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > radius + 0.5) continue
          this.setLocal(chunk, wx - baseX + dx, y, wz - baseZ + dz, 7, false)
        }
      }
    }
  }

  getBlock(x, y, z) {
    if (y < 0) return 16
    if (y >= HEIGHT) return 0
    const cx = Math.floor(x / CHUNK)
    const cz = Math.floor(z / CHUNK)
    const chunk = this.chunks.get(chunkKey(cx, cz))
    if (!chunk) return 0
    const lx = x - cx * CHUNK
    const lz = z - cz * CHUNK
    return chunk.data[localIndex(lx, y, lz)]
  }

  occludes(x, y, z) {
    return isOpaque(this.getBlock(x, y, z)) ? 1 : 0
  }

  setBlock(x, y, z, id, record = true) {
    if (y < 0 || y >= HEIGHT) return false
    const cx = Math.floor(x / CHUNK)
    const cz = Math.floor(z / CHUNK)
    const chunk = this.ensureData(cx, cz)
    const lx = x - cx * CHUNK
    const lz = z - cz * CHUNK
    const index = localIndex(lx, y, lz)
    if (chunk.data[index] === id) return false
    chunk.data[index] = id

    if (record) {
      let edits = this.editsByChunk.get(chunk.key)
      if (!edits) {
        edits = new Map()
        this.editsByChunk.set(chunk.key, edits)
      }
      edits.set(index, id)
    }

    this.markDirty(cx, cz)
    if (lx === 0) this.markDirty(cx - 1, cz)
    if (lx === CHUNK - 1) this.markDirty(cx + 1, cz)
    if (lz === 0) this.markDirty(cx, cz - 1)
    if (lz === CHUNK - 1) this.markDirty(cx, cz + 1)
    if (lx === 0 && lz === 0) this.markDirty(cx - 1, cz - 1)
    if (lx === 0 && lz === CHUNK - 1) this.markDirty(cx - 1, cz + 1)
    if (lx === CHUNK - 1 && lz === 0) this.markDirty(cx + 1, cz - 1)
    if (lx === CHUNK - 1 && lz === CHUNK - 1) this.markDirty(cx + 1, cz + 1)
    return true
  }

  markDirty(cx, cz) {
    const key = chunkKey(cx, cz)
    const chunk = this.chunks.get(key)
    if (!chunk) return
    chunk.dirty = true
    this.dirty.add(key)
  }

  shouldRenderFace(self, neighbor) {
    if (neighbor === 0) return true
    const nd = BLOCKS[neighbor]
    if (!nd) return true
    if (neighbor === self && (self === 5 || self === 7 || self === 11 || self === 22)) return false
    return !nd.opaque
  }

  buildChunkMesh(chunk) {
    if (!chunk) return
    // Border faces and ambient occlusion need the surrounding data.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue
        this.ensureData(chunk.cx + dx, chunk.cz + dz)
      }
    }

    const solid = { pos: [], nor: [], uv: [], col: [], idx: [] }
    const foliage = { pos: [], nor: [], uv: [], col: [], idx: [] }
    const transparent = { pos: [], nor: [], uv: [], col: [], idx: [] }

    const data = chunk.data
    const baseX = chunk.cx * CHUNK
    const baseZ = chunk.cz * CHUNK
    const seed = this.seed

    for (let y = 0; y < HEIGHT; y++) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const id = data[localIndex(x, y, z)]
          if (id === 0) continue
          const def = BLOCKS[id]
          if (!def) continue
          const wx = baseX + x
          const wz = baseZ + z

          if (def.cross) {
            this.addCross(foliage, x, y, z, def.tex[0], wx, wz, seed)
            continue
          }

          const target = def.transparent ? transparent : def.foliage ? foliage : solid

          for (let f = 0; f < 6; f++) {
            const face = FACES[f]
            const nx = wx + face.normal[0]
            const ny = y + face.normal[1]
            const nz = wz + face.normal[2]
            const neighbor = this.getBlock(nx, ny, nz)
            if (!this.shouldRenderFace(id, neighbor)) continue

            const tile = def.tex[f]
            const tileCol = tile % 8
            const tileRow = (tile / 8) | 0
            const start = target.pos.length / 3

            for (let v = 0; v < 4; v++) {
              const vert = face.verts[v]
              target.pos.push(x + vert[0], y + vert[1], z + vert[2])
              target.nor.push(face.normal[0], face.normal[1], face.normal[2])

              const aoOff = face.ao[v]
              const s1 = this.occludes(wx + face.normal[0] + aoOff[0][0], y + face.normal[1] + aoOff[0][1], wz + face.normal[2] + aoOff[0][2])
              const s2 = this.occludes(wx + face.normal[0] + aoOff[1][0], y + face.normal[1] + aoOff[1][1], wz + face.normal[2] + aoOff[1][2])
              const s3 = this.occludes(wx + face.normal[0] + aoOff[2][0], y + face.normal[1] + aoOff[2][1], wz + face.normal[2] + aoOff[2][2])
              const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + s3)
              const brightness = face.shade * (0.82 + (ao / 3) * 0.18)
              target.col.push(brightness, brightness, brightness)

              const uv = face.uvs[v]
              target.uv.push((tileCol + uv[0]) / 8, (7 - tileRow + uv[1]) / 8)
            }

            target.idx.push(start, start + 1, start + 2, start, start + 2, start + 3)
          }
        }
      }
    }

    this.disposeMeshes(chunk)
    const meshes = []
    const makeMesh = (buffers, material, order) => {
      if (buffers.idx.length === 0) return null
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buffers.pos, 3))
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.nor, 3))
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uv, 2))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(buffers.col, 3))
      geo.setIndex(buffers.idx)
      geo.computeBoundingSphere()
      const mesh = new THREE.Mesh(geo, material)
      mesh.position.set(baseX, 0, baseZ)
      mesh.renderOrder = order
      mesh.frustumCulled = true
      this.group.add(mesh)
      return mesh
    }

    const solidMesh = makeMesh(solid, this.materials.solid, 0)
    if (solidMesh) meshes.push(solidMesh)
    const foliageMesh = makeMesh(foliage, this.materials.foliage, 1)
    if (foliageMesh) meshes.push(foliageMesh)
    const transparentMesh = makeMesh(transparent, this.materials.transparent, 2)
    if (transparentMesh) meshes.push(transparentMesh)

    chunk.meshes = meshes
    chunk.meshed = true
    chunk.dirty = false
  }

  addCross(target, x, y, z, tile, wx, wz, seed) {
    const tileCol = tile % 8
    const tileRow = (tile / 8) | 0
    const jitter = (hash2(wx, wz, seed + 1700) - 0.5) * 0.18
    const jz = (hash2(wx, wz, seed + 1701) - 0.5) * 0.18
    const a = 0.15
    const b = 0.85
    const quads = [
      [
        [a + jitter, 0, a + jz],
        [b + jitter, 0, b + jz],
        [b + jitter, 1, b + jz],
        [a + jitter, 1, a + jz],
      ],
      [
        [a + jitter, 0, b + jz],
        [b + jitter, 0, a + jz],
        [b + jitter, 1, a + jz],
        [a + jitter, 1, b + jz],
      ],
    ]
    for (const quad of quads) {
      const start = target.pos.length / 3
      for (let v = 0; v < 4; v++) {
        target.pos.push(x + quad[v][0], y + quad[v][1], z + quad[v][2])
        target.nor.push(0, 1, 0)
        target.col.push(1, 1, 1)
      }
      target.uv.push((tileCol + 0) / 8, (7 - tileRow + 0) / 8)
      target.uv.push((tileCol + 1) / 8, (7 - tileRow + 0) / 8)
      target.uv.push((tileCol + 1) / 8, (7 - tileRow + 1) / 8)
      target.uv.push((tileCol + 0) / 8, (7 - tileRow + 1) / 8)
      target.idx.push(start, start + 1, start + 2, start, start + 2, start + 3)
    }
  }

  disposeMeshes(chunk) {
    for (const mesh of chunk.meshes) {
      this.group.remove(mesh)
      mesh.geometry.dispose()
    }
    chunk.meshes = []
  }

  unloadFar(cx, cz, keep = 2) {
    const limit = this.renderDistance + keep
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - cx) > limit || Math.abs(chunk.cz - cz) > limit) {
        this.disposeMeshes(chunk)
        this.chunks.delete(key)
        this.queued.delete(key)
        this.dirty.delete(key)
      }
    }
  }

  refreshQueue(cx, cz) {
    this.queue = []
    this.queued.clear()
    const r = this.renderDistance
    const list = []
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r + r) continue
        list.push([cx + dx, cz + dz, dx * dx + dz * dz])
      }
    }
    list.sort((a, b) => a[2] - b[2])
    for (const [x, z] of list) {
      const key = chunkKey(x, z)
      const chunk = this.chunks.get(key)
      if (!chunk || !chunk.meshed || chunk.dirty) {
        this.queue.push(key)
        this.queued.add(key)
      }
    }
  }

  update(px, pz, budget = 2) {
    const cx = Math.floor(px / CHUNK)
    const cz = Math.floor(pz / CHUNK)
    if (cx !== this.lastCx || cz !== this.lastCz) {
      this.lastCx = cx
      this.lastCz = cz
      this.unloadFar(cx, cz)
      this.refreshQueue(cx, cz)
    }

    if (this.dirty.size) {
      for (const key of this.dirty) {
        if (!this.queued.has(key)) {
          this.queue.push(key)
          this.queued.add(key)
        }
      }
      this.dirty.clear()
    }

    let built = 0
    while (built < budget && this.queue.length) {
      const key = this.queue.shift()
      this.queued.delete(key)
      const chunk = this.chunks.get(key)
      if (!chunk) continue
      if (Math.abs(chunk.cx - cx) > this.renderDistance + 1 || Math.abs(chunk.cz - cz) > this.renderDistance + 1) continue
      this.buildChunkMesh(chunk)
      built++
    }
    return built
  }

  async preload(cx, cz, radius, onProgress) {
    const list = []
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius + radius) continue
        list.push([cx + dx, cz + dz, dx * dx + dz * dz])
      }
    }
    list.sort((a, b) => a[2] - b[2])
    for (let i = 0; i < list.length; i++) {
      const [x, z] = list[i]
      const chunk = this.ensureData(x, z)
      this.buildChunkMesh(chunk)
      if (onProgress) onProgress((i + 1) / list.length)
      if (i % 2 === 0) await nextFrame()
    }
    this.lastCx = null
    this.lastCz = null
  }

  findOpenSpot(sx, sz) {
    let best = { x: sx, z: sz, score: Infinity }
    for (let dz = -10; dz <= 10; dz += 2) {
      for (let dx = -10; dx <= 10; dx += 2) {
        const x = sx + dx
        const z = sz + dz
        const h = this.heightAt(x, z)
        if (h <= SEA_LEVEL + 2 || h > 48) continue
        const biome = this.biomeAt(x, z, h)
        if (biome !== 'plains' && biome !== 'forest') continue
        let score = Math.hypot(dx, dz) * 0.12
        for (let oz = -7; oz <= 7; oz++) {
          for (let ox = -7; ox <= 7; ox++) {
            for (let y = h + 1; y <= h + 12; y++) {
              const id = this.getBlock(x + ox, y, z + oz)
              if (id === 6 || id === 7) score += 1
            }
          }
        }
        if (score < best.score) best = { x, z, score }
      }
    }
    return best
  }

  prepareSpawn(sx, sz) {
    const spot = this.findOpenSpot(sx, sz)
    sx = spot.x
    sz = spot.z
    const h0 = this.heightAt(sx, sz)
    for (let dz = -8; dz <= 8; dz++) {
      for (let dx = -8; dx <= 8; dx++) {
        const x = sx + dx
        const z = sz + dz
        const h = this.heightAt(x, z)
        for (let y = h + 1; y <= Math.min(HEIGHT - 1, h + 16); y++) {
          this.setBlock(x, y, z, 0)
        }
        const top = this.getBlock(x, h, z)
        if (top === 6 || top === 7) this.setBlock(x, h, z, 0)
        if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) {
          for (let y = h + 1; y <= h0 + 6; y++) this.setBlock(x, y, z, 0)
          for (let y = h + 1; y < h0; y++) this.setBlock(x, y, z, 2)
          this.setBlock(x, h0, z, 1)
        }
      }
    }
    return { x: sx + 0.5, y: h0 + 1, z: sz + 0.5 }
  }

  surfaceY(x, z) {
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z)
      if (isSolid(id)) return y + 1
    }
    return SEA_LEVEL + 1
  }

  getSaveData() {
    const chunks = []
    for (const [key, edits] of this.editsByChunk) {
      if (!edits.size) continue
      const [cx, cz] = key.split(',').map(Number)
      const flat = []
      for (const [index, id] of edits) flat.push(index, id)
      chunks.push([cx, cz, flat])
    }
    return { seed: this.seed, chunks }
  }

  loadSaveData(data) {
    if (!data || !Array.isArray(data.chunks)) return
    for (const [cx, cz, flat] of data.chunks) {
      if (!Array.isArray(flat)) continue
      const edits = new Map()
      for (let i = 0; i < flat.length; i += 2) edits.set(flat[i], flat[i + 1])
      this.editsByChunk.set(chunkKey(cx, cz), edits)
    }
  }

  getEditCount() {
    let n = 0
    for (const edits of this.editsByChunk.values()) n += edits.size
    return n
  }

  dispose() {
    for (const chunk of this.chunks.values()) this.disposeMeshes(chunk)
    this.chunks.clear()
    this.queue = []
    this.queued.clear()
    this.dirty.clear()
  }
}
