import * as THREE from 'three'
import { smoothstep } from './noise.js'

const SKY_RADIUS = 430

function radialTexture(size, inner, outer, edgeAlpha = 0) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.45, outer)
  g.addColorStop(1, `rgba(255,255,255,${edgeAlpha})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function moonTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size * 0.45, size * 0.42, 4, size / 2, size / 2, size * 0.48)
  g.addColorStop(0, 'rgba(244,248,255,1)')
  g.addColorStop(0.7, 'rgba(212,224,244,0.95)')
  g.addColorStop(1, 'rgba(180,200,230,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2)
  ctx.fill()
  const craters = [
    [0.38, 0.42, 0.07],
    [0.58, 0.36, 0.045],
    [0.53, 0.6, 0.08],
    [0.33, 0.62, 0.04],
    [0.64, 0.54, 0.035],
  ]
  ctx.fillStyle = 'rgba(156,172,200,0.35)'
  for (const [x, y, r] of craters) {
    ctx.beginPath()
    ctx.arc(size * x, size * y, size * r, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function cloudTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  const blobs = [
    [0.28, 0.45, 0.16],
    [0.42, 0.36, 0.19],
    [0.58, 0.44, 0.17],
    [0.7, 0.5, 0.13],
    [0.4, 0.55, 0.14],
    [0.55, 0.58, 0.12],
    [0.24, 0.56, 0.1],
  ]
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(size * x, size * y, 0, size * x, size * y, size * r)
    g.addColorStop(0, 'rgba(255,255,255,0.85)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.45)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class Sky {
  constructor(scene, sunLight, hemiLight, ambientLight) {
    this.scene = scene
    this.sunLight = sunLight
    this.hemiLight = hemiLight
    this.ambientLight = ambientLight

    this.uniforms = {
      topColor: { value: new THREE.Color('#4b9fe4') },
      bottomColor: { value: new THREE.Color('#cfe9ff') },
      horizonColor: { value: new THREE.Color('#e8f6ff') },
      sunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.4) },
      sunColor: { value: new THREE.Color('#fff3c9') },
    }

    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        varying vec3 vDir;
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, -1.0, 1.0);
          float t = pow(clamp(h, 0.0, 1.0), 0.55);
          vec3 col = mix(bottomColor, topColor, t);
          float horizon = pow(1.0 - abs(h), 9.0);
          col = mix(col, horizonColor, horizon * 0.78);
          float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);
          col += sunColor * pow(sunDot, 700.0) * 2.6;
          col += sunColor * pow(sunDot, 16.0) * 0.14;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 20), skyMaterial)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -100
    scene.add(this.sky)

    const sunTex = radialTexture(128, 'rgba(255,255,244,1)', 'rgba(255,226,140,0.9)', 0)
    this.sun = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunTex,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    )
    this.sun.scale.set(46, 46, 1)
    scene.add(this.sun)

    this.moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonTexture(),
        transparent: true,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        fog: false,
      }),
    )
    this.moon.scale.set(26, 26, 1)
    scene.add(this.moon)

    const starCount = 900
    const positions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(1 - Math.random() * 1.35)
      const r = 390
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r
      positions[i * 3 + 1] = Math.cos(phi) * r
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xdfe9ff,
      size: 1.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
    this.stars = new THREE.Points(starGeo, this.starMaterial)
    this.stars.frustumCulled = false
    scene.add(this.stars)

    this.cloudGroup = new THREE.Group()
    const cloudTex = cloudTexture()
    this.clouds = []
    const cloudGeo = new THREE.PlaneGeometry(1, 1)
    for (let i = 0; i < 30; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(cloudGeo, mat)
      const scale = 26 + Math.random() * 42
      mesh.scale.set(scale, scale, 1)
      mesh.rotation.x = -Math.PI / 2
      mesh.rotation.z = Math.random() * Math.PI * 2
      mesh.position.set((Math.random() - 0.5) * 320, 82 + Math.random() * 18, (Math.random() - 0.5) * 320)
      mesh.userData.baseX = mesh.position.x
      mesh.userData.baseZ = mesh.position.z
      mesh.userData.drift = Math.random() * 320
      mesh.renderOrder = -50
      this.cloudGroup.add(mesh)
      this.clouds.push(mesh)
    }
    scene.add(this.cloudGroup)

    this.fogColor = new THREE.Color('#cfe9ff')
    this.dayFactor = 1
    this.sunDir = new THREE.Vector3(0.4, 0.8, 0.4)
    this._dayTop = new THREE.Color('#4b9fe4')
    this._dayBottom = new THREE.Color('#cfe9ff')
    this._dayHorizon = new THREE.Color('#e8f6ff')
    this._duskTop = new THREE.Color('#24345f')
    this._duskBottom = new THREE.Color('#ff9d5c')
    this._duskHorizon = new THREE.Color('#ffd79a')
    this._nightTop = new THREE.Color('#050a18')
    this._nightBottom = new THREE.Color('#101c36')
    this._nightHorizon = new THREE.Color('#1d2c50')
    this._tmp = new THREE.Color()
    this._tmp2 = new THREE.Color()
  }

  update(dt, dayTime, camera) {
    const angle = (dayTime - 0.25) * Math.PI * 2
    const elevation = Math.sin(angle)
    const sunDir = this.sunDir.set(Math.cos(angle) * 0.72, Math.sin(angle), 0.5).normalize()
    const dayFactor = smoothstep(-0.12, 0.2, elevation)
    const sunset = Math.exp(-Math.pow(elevation / 0.24, 2))
    this.dayFactor = dayFactor

    const top = this._tmp.copy(this._nightTop).lerp(this._dayTop, dayFactor)
    top.lerp(this._duskTop, sunset * 0.62)
    const bottom = this._tmp2.copy(this._nightBottom).lerp(this._dayBottom, dayFactor)
    bottom.lerp(this._duskBottom, sunset * 0.7)
    const horizon = new THREE.Color().copy(this._nightHorizon).lerp(this._dayHorizon, dayFactor)
    horizon.lerp(this._duskHorizon, sunset * 0.8)

    this.uniforms.topColor.value.copy(top)
    this.uniforms.bottomColor.value.copy(bottom)
    this.uniforms.horizonColor.value.copy(horizon)
    this.uniforms.sunDirection.value.copy(sunDir)
    this.uniforms.sunColor.value.setRGB(
      1,
      0.9 + sunset * 0.08,
      0.72 + dayFactor * 0.2,
    )

    this.fogColor.copy(bottom).lerp(horizon, 0.62)

    this.sky.position.copy(camera.position)
    this.stars.position.copy(camera.position)
    this.cloudGroup.position.set(camera.position.x, 0, camera.position.z)

    this.sun.position.copy(camera.position).addScaledVector(sunDir, 300)
    this.moon.position.copy(camera.position).addScaledVector(sunDir, -300)
    this.sun.material.opacity = Math.max(0, smoothstep(-0.08, 0.12, elevation))
    this.moon.material.opacity = Math.max(0, smoothstep(-0.05, 0.15, -elevation)) * 0.95
    this.starMaterial.opacity = Math.max(0, 1 - dayFactor) * 0.9

    const lightDir = elevation >= 0 ? sunDir : sunDir.clone().negate()
    this.sunLight.position.copy(camera.position).addScaledVector(lightDir, 120)
    this.sunLight.target.position.copy(camera.position)
    this.sunLight.target.updateMatrixWorld()
    this.sunLight.intensity = 0.16 + dayFactor * 1.05
    if (dayFactor < 0.25) {
      this.sunLight.color.set('#a9c7ff')
    } else if (sunset > 0.35) {
      this.sunLight.color.set('#ffc08a')
    } else {
      this.sunLight.color.set('#fff1cf')
    }

    this.hemiLight.intensity = 0.24 + dayFactor * 0.8
    this.hemiLight.color.set(dayFactor > 0.4 ? '#c3e7ff' : '#7f9bd0')
    this.hemiLight.groundColor.set(dayFactor > 0.4 ? '#6d5c42' : '#1d2436')
    this.ambientLight.intensity = 0.08 + dayFactor * 0.1

    const cloudTint = this._tmp.copy(new THREE.Color('#ffffff')).lerp(new THREE.Color('#7f8eae'), 1 - dayFactor)
    for (const cloud of this.clouds) {
      cloud.material.opacity = 0.16 + dayFactor * 0.5
      cloud.material.color.copy(cloudTint)
      cloud.userData.drift += dt * 0.55
      const drift = cloud.userData.drift
      cloud.position.x = ((cloud.userData.baseX + drift + 160) % 320) - 160
      cloud.position.z = cloud.userData.baseZ
    }
  }
}
