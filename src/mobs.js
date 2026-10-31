import * as THREE from 'three'
import { BLOCKS } from './blocks.js'

const box = new THREE.BoxGeometry(1, 1, 1)

function material(color) {
  return new THREE.MeshLambertMaterial({ color })
}

const MAT = {
  pig: material('#e79a9a'),
  pigSnout: material('#c97777'),
  pigEye: material('#241a1a'),
  sheep: material('#ecebe2'),
  sheepFace: material('#d8c6ac'),
  sheepLeg: material('#c9b89e'),
  sheepEye: material('#2a2320'),
  chicken: material('#f3efe4'),
  chickenBeak: material('#e8a83c'),
  chickenComb: material('#c94b45'),
  chickenLeg: material('#d99b45'),
}

function part(parent, mat, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(box, mat)
  mesh.position.set(x, y, z)
  mesh.scale.set(sx, sy, sz)
  parent.add(mesh)
  return mesh
}

export class Mob {
  constructor(scene, world, type, x, z) {
    this.scene = scene
    this.world = world
    this.type = type
    this.group = new THREE.Group()
    this.home = new THREE.Vector2(x, z)
    this.speed = 0
    this.turn = 0
    this.wander = 2 + Math.random() * 5
    this.phase = Math.random() * Math.PI * 2
    this.yaw = Math.random() * Math.PI * 2
    this.legs = []
    this.build()
    const y = world.surfaceY(Math.floor(x), Math.floor(z))
    this.group.position.set(x, y, z)
    this.group.rotation.y = this.yaw
    scene.add(this.group)
  }

  build() {
    const g = this.group
    if (this.type === 'pig') {
      part(g, MAT.pig, 0, 0.72, 0, 0.95, 0.72, 1.35)
      const head = new THREE.Group()
      head.position.set(0, 0.88, 0.78)
      part(head, MAT.pig, 0, 0, 0, 0.68, 0.64, 0.6)
      part(head, MAT.pigSnout, 0, -0.08, 0.34, 0.38, 0.28, 0.16)
      part(head, MAT.pigEye, -0.18, 0.12, 0.29, 0.09, 0.09, 0.04)
      part(head, MAT.pigEye, 0.18, 0.12, 0.29, 0.09, 0.09, 0.04)
      part(head, MAT.pig, -0.25, 0.34, -0.02, 0.2, 0.2, 0.1)
      part(head, MAT.pig, 0.25, 0.34, -0.02, 0.2, 0.2, 0.1)
      g.add(head)
      this.head = head
      const legPositions = [
        [-0.32, 0.38],
        [0.32, 0.38],
        [-0.32, -0.38],
        [0.32, -0.38],
      ]
      for (const [lx, lz] of legPositions) {
        const pivot = new THREE.Group()
        pivot.position.set(lx, 0.38, lz)
        part(pivot, MAT.pigSnout, 0, -0.19, 0, 0.24, 0.38, 0.24)
        g.add(pivot)
        this.legs.push(pivot)
      }
    } else if (this.type === 'sheep') {
      part(g, MAT.sheep, 0, 0.78, 0, 1.08, 0.88, 1.32)
      part(g, MAT.sheep, 0, 1.14, -0.05, 0.92, 0.36, 1.08)
      const head = new THREE.Group()
      head.position.set(0, 0.94, 0.82)
      part(head, MAT.sheepFace, 0, 0, 0.05, 0.56, 0.62, 0.56)
      part(head, MAT.sheep, 0, 0.18, -0.02, 0.62, 0.34, 0.62)
      part(head, MAT.sheepEye, -0.16, 0.08, 0.33, 0.08, 0.1, 0.04)
      part(head, MAT.sheepEye, 0.16, 0.08, 0.33, 0.08, 0.1, 0.04)
      g.add(head)
      this.head = head
      const legPositions = [
        [-0.34, 0.4],
        [0.34, 0.4],
        [-0.34, -0.4],
        [0.34, -0.4],
      ]
      for (const [lx, lz] of legPositions) {
        const pivot = new THREE.Group()
        pivot.position.set(lx, 0.4, lz)
        part(pivot, MAT.sheepLeg, 0, -0.2, 0, 0.22, 0.4, 0.22)
        g.add(pivot)
        this.legs.push(pivot)
      }
    } else {
      part(g, MAT.chicken, 0, 0.52, 0, 0.58, 0.56, 0.78)
      const head = new THREE.Group()
      head.position.set(0, 0.92, 0.28)
      part(head, MAT.chicken, 0, 0, 0, 0.36, 0.38, 0.36)
      part(head, MAT.chickenBeak, 0, -0.02, 0.22, 0.16, 0.12, 0.2)
      part(head, MAT.chickenComb, 0, 0.24, 0, 0.1, 0.16, 0.2)
      part(head, MAT.pigEye, -0.11, 0.07, 0.17, 0.06, 0.07, 0.03)
      part(head, MAT.pigEye, 0.11, 0.07, 0.17, 0.06, 0.07, 0.03)
      g.add(head)
      this.head = head
      const legPositions = [
        [-0.17, 0.18],
        [0.17, 0.18],
        [-0.17, -0.2],
        [0.17, -0.2],
      ]
      for (const [lx, lz] of legPositions) {
        const pivot = new THREE.Group()
        pivot.position.set(lx, 0.3, lz)
        part(pivot, MAT.chickenLeg, 0, -0.15, 0, 0.1, 0.3, 0.1)
        g.add(pivot)
        this.legs.push(pivot)
      }
    }
  }

  update(dt, playerPos) {
    this.wander -= dt
    if (this.wander <= 0) {
      this.wander = 2.5 + Math.random() * 6
      if (Math.random() < 0.35) {
        this.speed = 0
      } else {
        this.speed = this.type === 'chicken' ? 1.6 : 1.05
        this.yaw = Math.random() * Math.PI * 2
      }
    }

    const px = this.group.position.x
    const pz = this.group.position.z
    const homeDist = Math.hypot(px - this.home.x, pz - this.home.y)
    if (homeDist > 26) {
      this.yaw = Math.atan2(this.home.x - px, this.home.y - pz)
      this.speed = 1.2
    }

    if (this.speed > 0) {
      const dx = Math.sin(this.yaw) * this.speed * dt
      const dz = Math.cos(this.yaw) * this.speed * dt
      const nextX = px + dx
      const nextZ = pz + dz
      const ground = this.world.surfaceY(Math.floor(nextX), Math.floor(nextZ))
      const ahead = this.world.getBlock(Math.floor(nextX), ground - 1, Math.floor(nextZ))
      const blockAhead = BLOCKS[ahead]
      const blocked = !blockAhead || ahead === 5 || ahead === 7 || Math.abs(ground - this.group.position.y) > 1.1
      if (!blocked) {
        this.group.position.x = nextX
        this.group.position.z = nextZ
        this.group.position.y += (ground - this.group.position.y) * Math.min(1, dt * 8)
      } else {
        this.yaw += Math.PI * (0.45 + Math.random() * 0.4)
        this.speed *= 0.4
      }
    }

    const targetRot = this.yaw
    let diff = targetRot - this.group.rotation.y
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    this.group.rotation.y += diff * Math.min(1, dt * 6)

    const moving = this.speed > 0.05
    this.phase += dt * (moving ? 8.5 : 2.2)
    const swing = moving ? Math.sin(this.phase) * 0.55 : Math.sin(this.phase) * 0.06
    this.legs[0].rotation.x = swing
    this.legs[1].rotation.x = -swing
    this.legs[2].rotation.x = -swing
    this.legs[3].rotation.x = swing
    if (this.head) {
      this.head.rotation.x = moving ? Math.sin(this.phase * 2) * 0.04 : Math.sin(this.phase) * 0.03
    }

    if (playerPos && this.group.position.distanceToSquared(playerPos) > 120 * 120) {
      this.group.visible = false
    } else {
      this.group.visible = true
    }
  }
}

export class Mobs {
  constructor(scene, world) {
    this.scene = scene
    this.world = world
    this.mobs = []
  }

  spawn(count, center) {
    const types = ['pig', 'sheep', 'chicken', 'sheep', 'pig', 'chicken', 'sheep', 'pig', 'chicken', 'sheep']
    for (let i = 0; i < count; i++) {
      let placed = false
      for (let attempt = 0; attempt < 24 && !placed; attempt++) {
        const angle = Math.random() * Math.PI * 2
        const radius = 7 + Math.random() * 22
        const x = center.x + Math.cos(angle) * radius
        const z = center.z + Math.sin(angle) * radius
        const ground = this.world.surfaceY(Math.floor(x), Math.floor(z))
        const below = this.world.getBlock(Math.floor(x), ground - 1, Math.floor(z))
        if (below === 1 || below === 2 || below === 4 || below === 8) {
          if (ground > 5) {
            this.mobs.push(new Mob(this.scene, this.world, types[i % types.length], x, z))
            placed = true
          }
        }
      }
    }
  }

  update(dt, playerPos) {
    for (const mob of this.mobs) mob.update(dt, playerPos)
  }
}
