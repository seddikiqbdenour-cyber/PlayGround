import * as THREE from 'three'
import { BLOCKS, isSolid } from './blocks.js'

const WIDTH = 0.6
const HALF = WIDTH / 2
const BODY_HEIGHT = 1.8
const EYE_HEIGHT = 1.62
const CROUCH_EYE = 1.32

const GRAVITY = 28
const JUMP_SPEED = 9.1

export class Player {
  constructor(camera, world) {
    this.camera = camera
    this.world = world
    this.pos = new THREE.Vector3(0, 40, 0)
    this.vel = new THREE.Vector3()
    this.yaw = -0.7
    this.pitch = -0.08
    this.onGround = false
    this.inWater = false
    this.flying = false
    this.sprinting = false
    this.crouching = false
    this.eyeHeight = EYE_HEIGHT
    this.bobPhase = 0
    this.bob = 0
    this.walkDistance = 0
    this.stepTimer = 0
    this.onStep = null
    this.onLand = null
    this.onSplash = null
    this.wasInWater = false
    this.input = { forward: 0, right: 0, jump: false, sprint: false, crouch: false }
    this.sensitivity = 1
    this.camera.rotation.order = 'YXZ'
  }

  setSpawn(spawn, yaw = -0.7) {
    this.pos.set(spawn.x, spawn.y, spawn.z)
    this.vel.set(0, 0, 0)
    this.yaw = yaw
    this.pitch = -0.08
    this.flying = false
    this.onGround = false
    this.updateCamera(0)
  }

  toggleFly() {
    this.flying = !this.flying
    this.vel.y = 0
    return this.flying
  }

  look(dx, dy) {
    const sens = 0.0022 * this.sensitivity
    this.yaw -= dx * sens
    this.pitch -= dy * sens
    const limit = Math.PI / 2 - 0.02
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch))
  }

  collidesAt(x, y, z) {
    const minX = Math.floor(x - HALF + 0.0001)
    const maxX = Math.floor(x + HALF - 0.0001)
    const minY = Math.floor(y + 0.0001)
    const maxY = Math.floor(y + BODY_HEIGHT - 0.0001)
    const minZ = Math.floor(z - HALF + 0.0001)
    const maxZ = Math.floor(z + HALF - 0.0001)
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          if (isSolid(this.world.getBlock(bx, by, bz))) return true
        }
      }
    }
    return false
  }

  moveAxis(axis, amount) {
    if (amount === 0) return false
    this.pos[axis] += amount
    if (this.collidesAt(this.pos.x, this.pos.y, this.pos.z)) {
      this.pos[axis] -= amount
      if (axis === 'y') {
        if (amount < 0) {
          this.onGround = true
          if (this.vel.y < -9 && this.onLand) this.onLand(Math.abs(this.vel.y))
        }
        this.vel[axis] = 0
      }
      return true
    }
    return false
  }

  update(dt) {
    const input = this.input
    const wasOnGround = this.onGround
    this.onGround = false
    this.inWater = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z)) === 5
    const headWater = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE_HEIGHT), Math.floor(this.pos.z)) === 5
    this.headInWater = headWater
    if (this.inWater && !this.wasInWater && this.onSplash) this.onSplash()
    this.wasInWater = this.inWater

    const fwd = (input.forward || 0)
    const right = (input.right || 0)
    let wishX = -Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * right
    let wishZ = -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * right
    const wishLen = Math.hypot(wishX, wishZ)
    if (wishLen > 1) {
      wishX /= wishLen
      wishZ /= wishLen
    }

    this.crouching = !!input.crouch && !this.flying
    this.sprinting = !!input.sprint && !this.crouching && wishLen > 0.1

    let speed = this.flying ? 12.5 : this.crouching ? 2.1 : this.sprinting ? 7.4 : 4.6
    if (this.inWater && !this.flying) speed *= 0.62

    const accel = this.flying ? 10 : this.onGround || wasOnGround ? 16 : 5
    const k = 1 - Math.exp(-accel * dt)
    const targetX = wishX * speed
    const targetZ = wishZ * speed
    this.vel.x += (targetX - this.vel.x) * k
    this.vel.z += (targetZ - this.vel.z) * k

    if (this.flying) {
      let targetY = 0
      if (input.jump) targetY += 1
      if (input.crouch) targetY -= 1
      this.vel.y += (targetY * 9 - this.vel.y) * (1 - Math.exp(-9 * dt))
    } else if (this.inWater) {
      this.vel.y -= 9 * dt
      if (input.jump) this.vel.y = Math.min(this.vel.y + 22 * dt, 4.2)
      this.vel.y = Math.max(this.vel.y, -4)
      this.vel.y *= 1 - Math.min(0.9, 2.2 * dt)
    } else {
      if (input.jump && (wasOnGround || this.onGround)) {
        this.vel.y = JUMP_SPEED
        this.onGround = false
      }
      this.vel.y -= GRAVITY * dt
      if (this.vel.y < -52) this.vel.y = -52
    }

    const dx = this.vel.x * dt
    const dz = this.vel.z * dt
    const dy = this.vel.y * dt

    this.moveAxis('x', dx)
    this.moveAxis('z', dz)
    const hitY = this.moveAxis('y', dy)

    // Ground probe keeps the player grounded while walking over small dips.
    if (!this.onGround && !this.flying && this.vel.y <= 0) {
      if (this.collidesAt(this.pos.x, this.pos.y - 0.08, this.pos.z)) {
        this.onGround = true
      }
    }

    if (this.pos.y < -8) {
      this.pos.y = 80
      this.vel.set(0, 0, 0)
    }

    const horizontalSpeed = Math.hypot(this.vel.x, this.vel.z)
    if (this.onGround && horizontalSpeed > 0.5) {
      this.walkDistance += horizontalSpeed * dt
      this.stepTimer += dt * horizontalSpeed
      const stepInterval = this.sprinting ? 1.9 : 2.5
      if (this.stepTimer > stepInterval) {
        this.stepTimer = 0
        if (this.onStep) this.onStep(this.inWater ? 'water' : 'grass')
      }
    }

    if (this.onGround && horizontalSpeed > 0.5) {
      this.bobPhase += dt * (this.sprinting ? 13 : 9.5)
      this.bob = Math.sin(this.bobPhase) * 0.035
    } else {
      this.bob *= Math.max(0, 1 - dt * 8)
    }

    const targetEye = this.crouching ? CROUCH_EYE : EYE_HEIGHT
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 14)

    this.updateCamera(dt, horizontalSpeed)
    return { hitY, wasOnGround }
  }

  updateCamera(dt, horizontalSpeed = 0) {
    const bobY = this.bob * (this.flying ? 0 : 1)
    const sway = this.onGround ? Math.sin(this.bobPhase * 0.5) * 0.006 * Math.min(1, horizontalSpeed / 4) : 0
    this.camera.position.set(this.pos.x, this.pos.y + this.eyeHeight + bobY, this.pos.z)
    this.camera.rotation.set(this.pitch, this.yaw, sway, 'YXZ')
  }

  getEye(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight + this.bob, this.pos.z)
  }

  getForward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch)
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize()
  }

  raycast(maxDist = 6.5) {
    const origin = this.getEye()
    const dir = this.getForward()
    let x = Math.floor(origin.x)
    let y = Math.floor(origin.y)
    let z = Math.floor(origin.z)
    const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0
    const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0
    const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0
    const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / dir.x)
    const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / dir.y)
    const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dir.z)
    let tMaxX =
      stepX === 0 ? Infinity : stepX > 0 ? (x + 1 - origin.x) * tDeltaX : (origin.x - x) * tDeltaX
    let tMaxY =
      stepY === 0 ? Infinity : stepY > 0 ? (y + 1 - origin.y) * tDeltaY : (origin.y - y) * tDeltaY
    let tMaxZ =
      stepZ === 0 ? Infinity : stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : (origin.z - z) * tDeltaZ

    let normal = [0, 0, 0]
    let dist = 0
    for (let i = 0; i < 160; i++) {
      const id = this.world.getBlock(x, y, z)
      if (id !== 0 && id !== 5) {
        return { x, y, z, id, normal, dist, def: BLOCKS[id] }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        if (tMaxX > maxDist) break
        x += stepX
        dist = tMaxX
        tMaxX += tDeltaX
        normal = [-stepX, 0, 0]
      } else if (tMaxY < tMaxZ) {
        if (tMaxY > maxDist) break
        y += stepY
        dist = tMaxY
        tMaxY += tDeltaY
        normal = [0, -stepY, 0]
      } else {
        if (tMaxZ > maxDist) break
        z += stepZ
        dist = tMaxZ
        tMaxZ += tDeltaZ
        normal = [0, 0, -stepZ]
      }
    }
    return null
  }

  blockIntersectsPlayer(bx, by, bz) {
    const minX = bx
    const maxX = bx + 1
    const minY = by
    const maxY = by + 1
    const minZ = bz
    const maxZ = bz + 1
    return (
      maxX > this.pos.x - HALF &&
      minX < this.pos.x + HALF &&
      maxY > this.pos.y &&
      minY < this.pos.y + BODY_HEIGHT &&
      maxZ > this.pos.z - HALF &&
      minZ < this.pos.z + HALF
    )
  }
}
