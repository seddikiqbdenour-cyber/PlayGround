import * as THREE from 'three'
import './style.css'
import { World, CHUNK } from './world.js'
import { Player } from './player.js'
import { Sky } from './sky.js'
import { Mobs } from './mobs.js'
import { Sound } from './audio.js'
import {
  BLOCKS,
  HOTBAR_BLOCKS,
  INVENTORY_BLOCKS,
  blockIcon,
  getAtlasTexture,
  particleColor,
} from './blocks.js'
import { hashString } from './noise.js'

const SAVE_KEY = 'blockcraft.save.v2'
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && window.innerWidth < 1000)
if (IS_TOUCH) document.body.classList.add('is-touch')

const $ = (id) => document.getElementById(id)
const canvas = $('game')
const loading = $('loading')
const loadBar = $('loadBar')
const loadText = $('loadText')
const menu = $('menu')
const pause = $('pause')
const hud = $('hud')
const inventory = $('inventory')
const seedInput = $('seedInput')
const menuSeedLabel = $('menuSeedLabel')
const hotbarEl = $('hotbar')
const invGrid = $('invGrid')
const toastEl = $('toast')
const crosshair = $('crosshair')
const ring = crosshair.querySelector('circle')
const coordText = $('coordText')
const biomeText = $('biomeText')
const clockText = $('clockText')
const debugEl = $('debug')
const underwaterEl = $('underwater')
const sensRange = $('sensRange')
const soundBtn = $('soundBtn')
const pauseHint = $('pauseHint')
const invHint = $('invHint')
const invKeys = $('invKeys')

if (IS_TOUCH) {
  pauseHint.textContent = 'Tap Resume to keep exploring.'
  invHint.textContent = 'Tap a block to equip it.'
  invKeys.textContent = 'Tap outside to close.'
}

const ADJECTIVES = ['amber', 'quiet', 'wild', 'golden', 'misty', 'sunlit', 'frosted', 'ancient', 'hidden', 'lunar', 'emerald', 'copper']
const NOUNS = ['fox', 'grove', 'ridge', 'harbor', 'meadow', 'cavern', 'spruce', 'delta', 'island', 'summit', 'willow', 'canyon']

function randomSeedString() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${a}-${n}-${Math.floor(Math.random() * 9000 + 1000)}`
}

function readSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
  } catch {
    return null
  }
}

const params = new URLSearchParams(location.search)
const fresh = params.get('fresh') === '1'
let save = readSave()
if (fresh) {
  save = null
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}

const paramSeed = params.get('seed')
let seedString = (paramSeed || save?.seedString || randomSeedString()).slice(0, 40)
let seed = /^\d+$/.test(seedString) ? Number(seedString) >>> 0 : hashString(seedString)
if (!/^\d+$/.test(seedString) && seed === 0) seed = 1

// ---------------- renderer & scene ----------------

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
  stencil: false,
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.6 : 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.06

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xcfe9ff, 52, 112)

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 620)
camera.rotation.order = 'YXZ'

const hemi = new THREE.HemisphereLight(0xc3e7ff, 0x5d4a32, 1.05)
const sunLight = new THREE.DirectionalLight(0xfff1cf, 1.5)
sunLight.target.position.set(0, 0, 0)
const ambient = new THREE.AmbientLight(0xffffff, 0.34)
const fillLight = new THREE.DirectionalLight(0xbfd8ff, 0.5)
fillLight.position.set(-60, 40, -30)
scene.add(hemi, sunLight, sunLight.target, ambient, fillLight)

const sky = new Sky(scene, sunLight, hemi, ambient)
const world = new World(scene, seed)
if (save && save.seed === seed && save.edits) world.loadSaveData(save.edits)
const player = new Player(camera, world)
const mobs = new Mobs(scene, world)
const sound = new Sound()

// Exposed for diagnostics and playful console tinkering.
window.__blockcraft = { state: null, world, scene, camera, player, renderer, mobs, THREE }

// ---------------- state ----------------

const state = {
  started: false,
  paused: true,
  menu: true,
  inventory: false,
  dayTime: typeof save?.dayTime === 'number' ? save.dayTime : 0.31,
  dayLength: 780,
  dayCount: typeof save?.dayCount === 'number' ? save.dayCount : 1,
  selected: 0,
  hotbar: [...HOTBAR_BLOCKS],
  sensitivity: 1,
  soundOn: true,
  debug: false,
  spawn: { x: 0, y: 40, z: 0 },
  menuAngle: 0.6,
  target: null,
  breakProgress: 0,
  breakKey: '',
  mining: false,
  placing: false,
  placeTimer: 0,
  swing: 0,
  pointerLocked: false,
  underwater: false,
  saveDirty: false,
  saveTimer: 0,
  fps: 60,
  hudTimer: 0,
  drawCalls: 0,
  triangles: 0,
}

const keys = new Set()
const touchMove = { x: 0, y: 0 }
const touchState = { jump: false, mine: false, place: false }
window.__blockcraft.state = state

player.sensitivity = state.sensitivity
player.onStep = (kind) => sound.step(kind)
player.onLand = (intensity) => sound.land(intensity)
player.onSplash = () => sound.splash()

const savedSpawn = save && save.seed === seed && save.spawn ? save.spawn : null
const hasExistingWorld = !!(save && save.seed === seed)

// ---------------- target highlight ----------------

const highlightGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006))
const highlightMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.72,
  depthTest: true,
})
const highlight = new THREE.LineSegments(highlightGeo, highlightMat)
highlight.visible = false
highlight.renderOrder = 5
scene.add(highlight)

// ---------------- particles ----------------

const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12)
const particles = []

function spawnParticles(x, y, z, blockId, count = 10) {
  const [r, g, b] = particleColor(blockId)
  for (let i = 0; i < count; i++) {
    const color = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace)
    color.offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.12)
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    const mesh = new THREE.Mesh(particleGeo, mat)
    mesh.position.set(x + (Math.random() - 0.5) * 0.7, y + (Math.random() - 0.5) * 0.7, z + (Math.random() - 0.5) * 0.7)
    const s = 0.55 + Math.random() * 0.9
    mesh.scale.setScalar(s)
    scene.add(mesh)
    particles.push({
      mesh,
      vel: new THREE.Vector3((Math.random() - 0.5) * 3.2, 1.2 + Math.random() * 3.2, (Math.random() - 0.5) * 3.2),
      life: 0.45 + Math.random() * 0.55,
      max: 1,
      spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    })
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life -= dt
    if (p.life <= 0) {
      scene.remove(p.mesh)
      p.mesh.material.dispose()
      particles.splice(i, 1)
      continue
    }
    p.vel.y -= 20 * dt
    p.mesh.position.addScaledVector(p.vel, dt)
    p.mesh.rotation.x += p.spin.x * dt
    p.mesh.rotation.y += p.spin.y * dt
    p.mesh.material.opacity = Math.min(1, p.life / 0.35)
    p.mesh.scale.multiplyScalar(1 - dt * 0.45)
  }
}

// ---------------- held block ----------------

const heldScene = new THREE.Scene()
const heldCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
heldCamera.position.set(0, 0, 4)
heldCamera.lookAt(0, 0, 0)
const heldAmbient = new THREE.AmbientLight(0xffffff, 1.8)
const heldLight = new THREE.DirectionalLight(0xffffff, 2.1)
heldLight.position.set(2, 3, 4)
heldScene.add(heldAmbient, heldLight)
const heldPivot = new THREE.Group()
heldScene.add(heldPivot)
const heldMaterial = new THREE.MeshLambertMaterial({
  map: getAtlasTexture(),
  transparent: true,
  alphaTest: 0.08,
  side: THREE.DoubleSide,
})
let heldMesh = null

function tileUv(tile, corners) {
  const col = tile % 8
  const row = (tile / 8) | 0
  return corners.map(([u, v]) => [(col + u) / 8, (7 - row + v) / 8])
}

const BOX_UV_ORDER = [
  [0, 1],
  [1, 1],
  [0, 0],
  [1, 0],
]

function setHeldBlock(id) {
  const def = BLOCKS[id]
  if (!def) return
  let geo
  if (def.cross) {
    geo = new THREE.PlaneGeometry(0.95, 0.95)
    const uvs = tileUv(def.tex[0], BOX_UV_ORDER)
    geo.attributes.uv.array.set(uvs.flat())
    geo.attributes.uv.needsUpdate = true
  } else {
    geo = new THREE.BoxGeometry(0.9, 0.9, 0.9)
    const uvArray = geo.attributes.uv.array
    for (let f = 0; f < 6; f++) {
      const uvs = tileUv(def.tex[f], BOX_UV_ORDER)
      for (let v = 0; v < 4; v++) {
        const i = (f * 4 + v) * 2
        uvArray[i] = uvs[v][0]
        uvArray[i + 1] = uvs[v][1]
      }
    }
    geo.attributes.uv.needsUpdate = true
  }
  if (heldMesh) {
    heldPivot.remove(heldMesh)
    heldMesh.geometry.dispose()
  }
  heldMesh = new THREE.Mesh(geo, heldMaterial)
  heldPivot.add(heldMesh)
  heldPivot.rotation.set(0.18, -0.65, 0.08)
}

function layoutHeldCamera() {
  const aspect = window.innerWidth / window.innerHeight
  const viewHeight = 1.25
  heldCamera.left = -viewHeight * aspect
  heldCamera.right = viewHeight * aspect
  heldCamera.top = viewHeight
  heldCamera.bottom = -viewHeight
  heldCamera.updateProjectionMatrix()
  heldPivot.position.set(viewHeight * aspect * 0.6, -0.74, 0)
  heldPivot.scale.setScalar(0.5)
}

function renderHeld(dt) {
  // Touch controls already occupy the lower-right corner; a large held block
  // there obscures the buttons and the hotbar. The selected hotbar slot is the
  // clearer indicator on phones.
  if (!state.started || state.menu || state.inventory || IS_TOUCH) return
  const daylight = 0.3 + sky.dayFactor * 0.7
  heldAmbient.intensity = 0.55 + daylight * 1.35
  heldLight.intensity = 0.5 + daylight * 1.7
  state.swing = Math.max(0, state.swing - dt * 5.5)
  const bob = Math.sin(player.bobPhase) * 0.014
  const swing = state.swing
  heldPivot.rotation.set(0.18 + swing * 0.35, -0.65 + swing * 0.35, 0.08 - swing * 0.7)
  heldPivot.position.y = -0.74 + bob - swing * 0.12
  renderer.autoClear = false
  renderer.clearDepth()
  renderer.render(heldScene, heldCamera)
  renderer.autoClear = true
}

// ---------------- UI ----------------

let toastTimer = 0
function showToast(text, duration = 1500) {
  toastEl.textContent = text
  toastEl.classList.add('is-on')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl.classList.remove('is-on'), duration)
}

function buildHotbar() {
  hotbarEl.innerHTML = ''
  state.hotbar.forEach((id, index) => {
    const def = BLOCKS[id]
    const slot = document.createElement('button')
    slot.className = 'slot' + (index === state.selected ? ' is-selected' : '')
    slot.dataset.index = String(index)
    slot.title = def.name
    slot.setAttribute('aria-label', def.name)
    const icon = blockIcon(id, 64)
    icon.className = 'slot-icon'
    slot.appendChild(icon)
    const key = document.createElement('span')
    key.className = 'slot-key'
    key.textContent = String(index + 1)
    slot.appendChild(key)
    slot.addEventListener('click', (e) => {
      e.stopPropagation()
      selectSlot(index)
    })
    hotbarEl.appendChild(slot)
  })
}

function updateHotbar() {
  for (const slot of hotbarEl.children) {
    slot.classList.toggle('is-selected', Number(slot.dataset.index) === state.selected)
  }
  setHeldBlock(state.hotbar[state.selected])
  for (const item of invGrid.children) {
    item.classList.toggle('is-current', Number(item.dataset.id) === state.hotbar[state.selected])
  }
}

function selectSlot(index) {
  if (index < 0 || index >= state.hotbar.length) return
  state.selected = index
  updateHotbar()
  const def = BLOCKS[state.hotbar[index]]
  showToast(def.name)
}

function buildInventory() {
  invGrid.innerHTML = ''
  for (const id of INVENTORY_BLOCKS) {
    const def = BLOCKS[id]
    const button = document.createElement('button')
    button.className = 'inv-item'
    button.dataset.id = String(id)
    button.title = def.name
    const icon = blockIcon(id, 96)
    button.appendChild(icon)
    const label = document.createElement('span')
    label.textContent = def.name
    button.appendChild(label)
    button.addEventListener('click', () => {
      state.hotbar[state.selected] = id
      buildHotbar()
      updateHotbar()
      showToast(def.name)
      closeInventory(true)
    })
    invGrid.appendChild(button)
  }
}

function updateHud(dt) {
  state.hudTimer -= dt
  if (state.hudTimer > 0) return
  state.hudTimer = 0.12
  const px = Math.floor(player.pos.x)
  const py = Math.floor(player.pos.y)
  const pz = Math.floor(player.pos.z)
  coordText.textContent = `${px}, ${py}, ${pz}`
  biomeText.textContent = world.biomeName(px, pz)
  const hours = (state.dayTime * 24) % 24
  const hh = String(Math.floor(hours)).padStart(2, '0')
  const mm = String(Math.floor((hours % 1) * 60)).padStart(2, '0')
  clockText.textContent = `Day ${state.dayCount} · ${hh}:${mm}`

  if (state.debug) {
    const info = { calls: state.drawCalls, triangles: state.triangles }
    debugEl.textContent = [
      `BLOCKCRAFT  seed ${seedString}`,
      `fps ${state.fps.toFixed(1)}   draw ${info.calls}   tris ${(info.triangles / 1000).toFixed(1)}k`,
      `xyz ${player.pos.x.toFixed(2)} ${player.pos.y.toFixed(2)} ${player.pos.z.toFixed(2)}`,
      `chunk ${Math.floor(player.pos.x / CHUNK)}, ${Math.floor(player.pos.z / CHUNK)}   biome ${world.biomeName(px, pz)}`,
      `mode ${player.flying ? 'fly' : player.onGround ? 'ground' : 'air'}${player.inWater ? ' · water' : ''}`,
      `edits ${world.getEditCount()}   chunks ${world.chunks.size}   day ${state.dayTime.toFixed(3)}`,
      `target ${state.target ? `${state.target.def.name} @ ${state.target.x},${state.target.y},${state.target.z}` : '—'}`,
    ].join('\n')
  }
}

function toggleDebug() {
  state.debug = !state.debug
  debugEl.classList.toggle('is-on', state.debug)
}

function openInventory() {
  if (!state.started || state.inventory) return
  state.inventory = true
  inventory.classList.add('is-open')
  if (document.pointerLockElement) document.exitPointerLock()
  updateHotbar()
}

function closeInventory(resume = false) {
  if (!state.inventory) return
  state.inventory = false
  inventory.classList.remove('is-open')
  if (resume && state.started && !state.paused && !IS_TOUCH) requestLock()
}

function openPause() {
  if (!state.started) return
  state.paused = true
  pause.classList.add('is-open')
  state.mining = false
  state.placing = false
  touchState.mine = false
  touchState.place = false
  if (document.pointerLockElement) document.exitPointerLock()
}

function closePause() {
  if (!state.started) return
  state.paused = false
  pause.classList.remove('is-open')
  if (!IS_TOUCH) requestLock()
}

function requestLock() {
  if (IS_TOUCH) return
  try {
    const promise = canvas.requestPointerLock?.()
    if (promise && promise.catch) promise.catch(() => {})
  } catch {
    /* ignore */
  }
}

function startGame() {
  const inputSeed = seedInput.value.trim()
  if (inputSeed && inputSeed !== seedString) {
    const targetSeed = inputSeed.slice(0, 40)
    const isExisting = save && save.seedString === targetSeed
    location.href = `?seed=${encodeURIComponent(targetSeed)}${isExisting ? '' : '&fresh=1'}`
    return
  }
  sound.init()
  sound.setEnabled(state.soundOn)
  state.started = true
  state.paused = false
  state.menu = false
  menu.classList.remove('is-open')
  hud.classList.add('is-active')
  loading.classList.remove('is-open')
  player.setSpawn(state.spawn)
  player.sensitivity = state.sensitivity * (IS_TOUCH ? 1.35 : 1)
  updateHotbar()
  showToast(IS_TOUCH ? 'Drag to look · use the controls below' : 'WASD to move · click to lock the mouse', 2600)
  if (!IS_TOUCH) requestLock()
  saveSoon()
}

function saveSoon() {
  state.saveDirty = true
}

function saveNow() {
  if (!state.started) return
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 2,
        seedString,
        seed,
        dayTime: state.dayTime,
        dayCount: state.dayCount,
        spawn: state.spawn,
        edits: world.getSaveData(),
      }),
    )
    state.saveDirty = false
  } catch {
    /* storage can be full; the world still runs */
  }
}

function newWorld() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
  location.href = `?seed=${encodeURIComponent(randomSeedString())}&fresh=1`
}

window.__blockcraft.save = saveNow

// ---------------- interaction ----------------

function breakBlock(hit) {
  if (!hit) return
  if (!Number.isFinite(hit.def.hardness)) {
    showToast('Bedrock is unbreakable', 1100)
    return
  }
  const id = hit.id
  if (world.setBlock(hit.x, hit.y, hit.z, 0, true)) {
    spawnParticles(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, id, 12)
    sound.breakBlock(id)
    state.swing = 1
    state.breakProgress = 0
    state.breakKey = ''
    saveSoon()
  }
}

function placeBlock(hit) {
  if (!hit) return
  const id = state.hotbar[state.selected]
  const def = BLOCKS[id]
  if (!def || !def.placeable) return
  const x = hit.x + hit.normal[0]
  const y = hit.y + hit.normal[1]
  const z = hit.z + hit.normal[2]
  if (y < 0 || y >= 64) return
  const existing = world.getBlock(x, y, z)
  if (existing !== 0 && existing !== 5 && !BLOCKS[existing]?.cross) return
  if (def.solid && player.blockIntersectsPlayer(x, y, z)) return
  if (world.setBlock(x, y, z, id, true)) {
    spawnParticles(x + 0.5, y + 0.5, z + 0.5, id, 4)
    sound.place()
    state.swing = 1
    saveSoon()
  }
}

function updateInteraction(dt) {
  if (!state.started || state.paused || state.inventory) {
    highlight.visible = false
    crosshair.classList.remove('is-mining')
    return
  }
  const hit = player.raycast(6.5)
  state.target = hit
  if (hit) {
    highlight.visible = true
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
    highlightMat.color.set(state.breakProgress > 0.02 ? 0xffc857 : 0xffffff)
    highlightMat.opacity = 0.55 + state.breakProgress * 0.45
  } else {
    highlight.visible = false
  }

  const mining = (state.mining || touchState.mine) && hit
  if (mining && hit) {
    const key = `${hit.x},${hit.y},${hit.z}`
    if (key !== state.breakKey) {
      state.breakKey = key
      state.breakProgress = 0
    }
    const hardness = hit.def.hardness
    if (Number.isFinite(hardness)) {
      state.breakProgress = Math.min(1, state.breakProgress + dt / Math.max(0.06, hardness))
      if (state.breakProgress >= 1) breakBlock(hit)
    }
  } else {
    state.breakProgress = 0
    state.breakKey = ''
  }

  const progress = state.breakProgress
  crosshair.classList.toggle('is-mining', progress > 0.01)
  ring.style.strokeDashoffset = String(100 - progress * 100)

  const placing = state.placing || touchState.place
  if (placing && hit) {
    state.placeTimer -= dt
    if (state.placeTimer <= 0) {
      placeBlock(hit)
      state.placeTimer = 0.19
    }
  } else {
    state.placeTimer = 0
  }
}

// ---------------- input ----------------

function syncKeys() {
  const keyF = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
  const keyR = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
  player.input.forward = Math.max(-1, Math.min(1, keyF + touchMove.y))
  player.input.right = Math.max(-1, Math.min(1, keyR + touchMove.x))
  player.input.jump = keys.has('Space') || touchState.jump
  player.input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight')
  player.input.crouch = keys.has('ControlLeft') || keys.has('ControlRight')
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault()
    toggleDebug()
    return
  }
  if (e.code === 'Escape') {
    if (state.inventory) {
      closeInventory(true)
    } else if (state.started) {
      if (state.paused) closePause()
      else openPause()
    }
    return
  }
  if (!state.started || state.paused || state.inventory) return
  if (e.code === 'KeyE') {
    e.preventDefault()
    openInventory()
    return
  }
  if (e.code === 'KeyF') {
    e.preventDefault()
    const flying = player.toggleFly()
    sound.toggleFly(flying)
    showToast(flying ? 'Flying' : 'Walking')
    return
  }
  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5)) - 1
    if (n >= 0 && n < 9) selectSlot(n)
    return
  }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(e.code)) {
    e.preventDefault()
    keys.add(e.code)
  }
})

window.addEventListener('keyup', (e) => {
  keys.delete(e.code)
})

window.addEventListener('blur', () => {
  keys.clear()
  state.mining = false
  state.placing = false
  touchState.jump = false
  touchState.mine = false
  touchState.place = false
})

canvas.addEventListener('mousedown', (e) => {
  if (!state.started || state.paused || state.inventory) return
  if (!IS_TOUCH && !document.pointerLockElement) {
    requestLock()
    return
  }
  if (e.button === 0) state.mining = true
  if (e.button === 2) state.placing = true
})

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) state.mining = false
  if (e.button === 2) state.placing = false
})

canvas.addEventListener('contextmenu', (e) => e.preventDefault())

document.addEventListener('mousemove', (e) => {
  if (!state.pointerLocked || !state.started || state.paused || state.inventory) return
  player.look(e.movementX || 0, e.movementY || 0)
})

canvas.addEventListener('wheel', (e) => {
  if (!state.started || state.paused || state.inventory) return
  e.preventDefault()
  const dir = e.deltaY > 0 ? 1 : -1
  selectSlot((state.selected + dir + state.hotbar.length) % state.hotbar.length)
}, { passive: false })

document.addEventListener('pointerlockchange', () => {
  state.pointerLocked = document.pointerLockElement === canvas
  if (state.pointerLocked) {
    if (state.started && !state.inventory) {
      state.paused = false
      pause.classList.remove('is-open')
    }
  } else if (state.started && !state.inventory && !IS_TOUCH) {
    openPause()
  }
})

canvas.addEventListener('click', () => {
  if (state.started && !state.paused && !state.inventory && !IS_TOUCH && !document.pointerLockElement) requestLock()
})

// ---------------- touch controls ----------------

const joystick = $('joystick')
const stick = $('stick')
const lookZone = $('lookZone')
let joyPointer = null
let joyCenter = { x: 0, y: 0 }
let lookPointer = null
let lookLast = { x: 0, y: 0 }

joystick.addEventListener('pointerdown', (e) => {
  if (!state.started || state.paused || state.inventory) return
  e.preventDefault()
  joyPointer = e.pointerId
  const rect = joystick.getBoundingClientRect()
  joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  joystick.setPointerCapture(e.pointerId)
  moveJoystick(e.clientX, e.clientY)
})

function moveJoystick(clientX, clientY) {
  const radius = 42
  let dx = clientX - joyCenter.x
  let dy = clientY - joyCenter.y
  const dist = Math.hypot(dx, dy)
  if (dist > radius) {
    dx = (dx / dist) * radius
    dy = (dy / dist) * radius
  }
  touchMove.x = dx / radius
  touchMove.y = -dy / radius
  stick.style.transform = `translate(${dx}px, ${dy}px)`
}

joystick.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joyPointer) return
  e.preventDefault()
  moveJoystick(e.clientX, e.clientY)
})

function releaseJoystick(e) {
  if (e.pointerId !== joyPointer) return
  joyPointer = null
  touchMove.x = 0
  touchMove.y = 0
  stick.style.transform = 'translate(0, 0)'
}

joystick.addEventListener('pointerup', releaseJoystick)
joystick.addEventListener('pointercancel', releaseJoystick)

lookZone.addEventListener('pointerdown', (e) => {
  if (!state.started || state.paused || state.inventory) return
  e.preventDefault()
  lookPointer = e.pointerId
  lookLast = { x: e.clientX, y: e.clientY }
  lookZone.setPointerCapture(e.pointerId)
})

lookZone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookPointer) return
  e.preventDefault()
  const dx = e.clientX - lookLast.x
  const dy = e.clientY - lookLast.y
  lookLast = { x: e.clientX, y: e.clientY }
  player.look(dx * 1.15, dy * 1.15)
})

function releaseLook(e) {
  if (e.pointerId === lookPointer) lookPointer = null
}
lookZone.addEventListener('pointerup', releaseLook)
lookZone.addEventListener('pointercancel', releaseLook)

for (const button of document.querySelectorAll('[data-action]')) {
  const action = button.dataset.action
  const down = (e) => {
    if (!state.started || state.paused || state.inventory) return
    e.preventDefault()
    button.classList.add('is-down')
    if (action === 'jump') touchState.jump = true
    if (action === 'mine') touchState.mine = true
    if (action === 'place') touchState.place = true
    if (action === 'fly') {
      const flying = player.toggleFly()
      sound.toggleFly(flying)
      showToast(flying ? 'Flying' : 'Walking')
    }
    if (action === 'inventory') openInventory()
  }
  const up = (e) => {
    e.preventDefault()
    button.classList.remove('is-down')
    if (action === 'jump') touchState.jump = false
    if (action === 'mine') touchState.mine = false
    if (action === 'place') touchState.place = false
  }
  button.addEventListener('pointerdown', down)
  button.addEventListener('pointerup', up)
  button.addEventListener('pointercancel', up)
  button.addEventListener('pointerleave', (e) => {
    if (e.buttons) up(e)
  })
}

// ---------------- UI wiring ----------------

$('playBtn').addEventListener('click', startGame)
$('randomBtn').addEventListener('click', () => {
  seedInput.value = randomSeedString()
  seedInput.focus()
  seedInput.select()
})
$('resumeBtn').addEventListener('click', closePause)
$('pauseInvBtn').addEventListener('click', () => {
  pause.classList.remove('is-open')
  state.paused = false
  openInventory()
})
$('newWorldBtn').addEventListener('click', newWorld)
$('invClose').addEventListener('click', () => closeInventory(true))
$('hudPauseBtn').addEventListener('click', openPause)
soundBtn.addEventListener('click', () => {
  state.soundOn = !state.soundOn
  sound.setEnabled(state.soundOn)
  soundBtn.textContent = `Sound: ${state.soundOn ? 'on' : 'off'}`
})
sensRange.addEventListener('input', () => {
  state.sensitivity = Number(sensRange.value)
  player.sensitivity = state.sensitivity * (IS_TOUCH ? 1.35 : 1)
})
inventory.addEventListener('click', (e) => {
  if (e.target === inventory) closeInventory(true)
})

window.addEventListener('resize', () => {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.6 : 2))
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  layoutHeldCamera()
})

window.addEventListener('beforeunload', saveNow)
window.addEventListener('pagehide', saveNow)

// ---------------- boot & loop ----------------

function updateMenuCamera(dt) {
  state.menuAngle += dt * 0.045
  const s = state.spawn
  const radius = 34
  const x = s.x + Math.cos(state.menuAngle) * radius
  const z = s.z + Math.sin(state.menuAngle) * radius
  // Keep the cinematic orbit above nearby hills so the menu never dips
  // through the terrain while still showing a low, scenic horizon.
  const clearance = world.surfaceY(Math.floor(x), Math.floor(z)) + 6
  const y = Math.max(s.y + 14 + Math.sin(state.menuAngle * 0.8) * 1.5, clearance)
  camera.position.set(x, y, z)
  camera.lookAt(s.x, s.y + 4, s.z)
}

function updateGame(dt) {
  syncKeys()
  state.dayTime += dt / state.dayLength
  if (state.dayTime >= 1) {
    state.dayTime -= 1
    state.dayCount++
  }
  player.update(dt)
  world.update(player.pos.x, player.pos.z, IS_TOUCH ? 1 : 2)
  mobs.update(dt, player.pos)
  updateInteraction(dt)
  updateParticles(dt)
  sound.update(dt, sky.dayFactor)

  const targetFov = player.sprinting ? 78 : 72
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8)
  camera.updateProjectionMatrix()

  state.underwater = !!player.headInWater
  underwaterEl.classList.toggle('is-on', state.underwater)

  state.saveTimer += dt
  if (state.saveDirty && state.saveTimer > 8) {
    state.saveTimer = 0
    saveNow()
  }
}

let last = performance.now()
let fpsAccum = 0
let fpsFrames = 0

function frame(now) {
  const rawDt = (now - last) / 1000
  last = now
  const dt = Math.min(0.05, Math.max(0, rawDt))
  fpsAccum += rawDt
  fpsFrames++
  if (fpsAccum > 0.4) {
    state.fps = fpsFrames / fpsAccum
    fpsAccum = 0
    fpsFrames = 0
  }

  if (state.menu) {
    updateMenuCamera(dt)
    mobs.update(dt, camera.position)
  } else if (!state.paused && !state.inventory) {
    updateGame(dt)
  }

  sky.update(dt, state.dayTime, camera)
  if (state.started) {
    const fogNear = state.underwater ? 1.5 : 52
    const fogFar = state.underwater ? 24 : 112
    scene.fog.near += (fogNear - scene.fog.near) * Math.min(1, dt * 5)
    scene.fog.far += (fogFar - scene.fog.far) * Math.min(1, dt * 5)
    if (state.underwater) scene.fog.color.set('#1b5c86')
    else scene.fog.color.copy(sky.fogColor)
    updateHud(dt)
  }

  renderer.render(scene, camera)
  state.drawCalls = renderer.info.render.calls
  state.triangles = renderer.info.render.triangles
  renderHeld(dt)
  requestAnimationFrame(frame)
}

async function boot() {
  seedInput.value = seedString
  menuSeedLabel.textContent = seedString
  const choice = savedSpawn
    ? { x: Math.floor(savedSpawn.x), z: Math.floor(savedSpawn.z), y: Math.floor(savedSpawn.y) }
    : world.findSpawn()
  state.spawn = savedSpawn || { x: choice.x + 0.5, y: choice.y, z: choice.z + 0.5 }
  await world.preload(Math.floor(choice.x / CHUNK), Math.floor(choice.z / CHUNK), 4, (p) => {
    const pct = Math.round(p * 100)
    loadBar.style.width = `${pct}%`
    loadText.textContent = `Shaping the world… ${pct}%`
  })
  // Clearing the spawn area is only for a brand-new world. Re-running it on
  // every load would erase anything the player built near their spawn point.
  const spawn = hasExistingWorld ? state.spawn : world.prepareSpawn(choice.x, choice.z)
  state.spawn = spawn
  // Rebuild any spawn-clearing edits before the menu camera reveals the world.
  world.update(spawn.x, spawn.z, 32)
  player.setSpawn(spawn)
  mobs.spawn(IS_TOUCH ? 6 : 9, spawn)
  layoutHeldCamera()
  setHeldBlock(state.hotbar[state.selected])
  buildHotbar()
  buildInventory()
  updateHotbar()
  loading.classList.remove('is-open')
  menu.classList.add('is-open')
  if (fresh) {
    try {
      history.replaceState(null, '', `?seed=${encodeURIComponent(seedString)}`)
    } catch {
      /* ignore */
    }
  }
  requestAnimationFrame(frame)
}

// Avoid a blank first frame while the world is being shaped.
renderer.render(scene, camera)
boot()
