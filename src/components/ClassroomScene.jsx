import * as THREE from 'three'

const MAT = {
  wall: new THREE.MeshStandardMaterial({
    color: '#c8c0ad',
    roughness: 0.92,
  }),
  wallDark: new THREE.MeshStandardMaterial({
    color: '#29332e',
    roughness: 0.95,
  }),
  floor: new THREE.MeshStandardMaterial({
    color: '#665747',
    roughness: 0.82,
  }),
  wood: new THREE.MeshStandardMaterial({
    color: '#78563d',
    roughness: 0.58,
  }),
  woodLight: new THREE.MeshStandardMaterial({
    color: '#a17b56',
    roughness: 0.54,
  }),
  woodEdge: new THREE.MeshStandardMaterial({
    color: '#4c3528',
    roughness: 0.68,
  }),
  metal: new THREE.MeshStandardMaterial({
    color: '#343a3a',
    metalness: 0.72,
    roughness: 0.3,
  }),
  chair: new THREE.MeshStandardMaterial({
    color: '#53665e',
    roughness: 0.72,
  }),
  chairDark: new THREE.MeshStandardMaterial({
    color: '#35463f',
    roughness: 0.72,
  }),
  paper: new THREE.MeshStandardMaterial({
    color: '#e8dfca',
    roughness: 0.96,
  }),
  paperShadow: new THREE.MeshStandardMaterial({
    color: '#c5bba5',
    roughness: 0.98,
  }),
  notebookCover: new THREE.MeshStandardMaterial({
    color: '#745548',
    roughness: 0.78,
  }),
  bottle: new THREE.MeshStandardMaterial({
    color: '#8fa79d',
    roughness: 0.32,
    metalness: 0.08,
  }),
  chalkboard: new THREE.MeshStandardMaterial({
    color: '#20342d',
    roughness: 0.97,
  }),
  windowGlass: new THREE.MeshStandardMaterial({
    color: '#b8ccca',
    roughness: 0.22,
    metalness: 0.04,
    emissive: '#92b8b2',
    emissiveIntensity: 0.32,
  }),
  exteriorSky: new THREE.MeshStandardMaterial({
    color: '#788f88',
    roughness: 1,
    emissive: '#536e68',
    emissiveIntensity: 0.38,
  }),
  exteriorGreen: new THREE.MeshStandardMaterial({
    color: '#405148',
    roughness: 1,
  }),
  hairChestnut: new THREE.MeshStandardMaterial({
    color: '#30251f',
    roughness: 0.94,
  }),
  hairBrown: new THREE.MeshStandardMaterial({
    color: '#44372d',
    roughness: 0.94,
  }),
  hairBlack: new THREE.MeshStandardMaterial({
    color: '#211f1d',
    roughness: 0.96,
  }),
  beam: new THREE.MeshStandardMaterial({
    color: '#b3aa98',
    roughness: 0.95,
  }),
  hair: new THREE.MeshStandardMaterial({
    color: '#282522',
    roughness: 0.96,
  }),
  faculty: new THREE.MeshStandardMaterial({
    color: '#333e3b',
    roughness: 0.92,
  }),
  facultyHair: new THREE.MeshStandardMaterial({
    color: '#292623',
    roughness: 0.95,
  }),
  black: new THREE.MeshStandardMaterial({
    color: '#111416',
    roughness: 0.3,
    metalness: 0.25,
  }),
  phoneFrame: new THREE.MeshStandardMaterial({
    color: '#292d31',
    roughness: 0.24,
    metalness: 0.72,
  }),
  phoneGlass: new THREE.MeshStandardMaterial({
    color: '#101820',
    roughness: 0.12,
    metalness: 0.15,
    emissive: '#25394a',
    emissiveIntensity: 0.035,
  }),
  screenGlow: new THREE.MeshBasicMaterial({
    color: '#e8f4ff',
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  }),
  skin: new THREE.MeshStandardMaterial({
    color: '#b88b6c',
    roughness: 0.88,
  }),
  shirt: new THREE.MeshStandardMaterial({
    color: '#d4d0c4',
    roughness: 0.88,
  }),
  shirtBlue: new THREE.MeshStandardMaterial({
    color: '#758a89',
    roughness: 0.9,
  }),
  shirtOchre: new THREE.MeshStandardMaterial({
    color: '#b28a5d',
    roughness: 0.9,
  }),
  shirtRust: new THREE.MeshStandardMaterial({
    color: '#986b59',
    roughness: 0.9,
  }),
  skinWarm: new THREE.MeshStandardMaterial({
    color: '#9b6b50',
    roughness: 0.9,
  }),
  skinLight: new THREE.MeshStandardMaterial({
    color: '#d0a482',
    roughness: 0.9,
  }),
  trousers: new THREE.MeshStandardMaterial({
    color: '#303b39',
    roughness: 0.9,
  }),
}

function getCachedGeometry(parent, key, create) {
  let root = parent
  while (root.parent) root = root.parent

  const cache = root.userData.geometryCache ??= new Map()
  let geometry = cache.get(key)

  if (!geometry) {
    geometry = create()
    cache.set(key, geometry)
  }

  return geometry
}

function makeSurfaceTexture(draw, width = 512, height = 512) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create classroom surface texture')

  draw(context)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

function createWoodGrainTexture() {
  return makeSurfaceTexture((context) => {
    let seed = 41
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }

    context.fillStyle = '#f6f2e9'
    context.fillRect(0, 0, 512, 512)

    for (let i = 0; i < 150; i++) {
      const y = random() * 512
      const drift = (random() - 0.5) * 18
      context.beginPath()
      context.moveTo(0, y)
      context.bezierCurveTo(150, y + drift, 360, y - drift, 512, y + drift * 0.4)
      context.strokeStyle = i % 4 === 0
        ? 'rgba(255, 255, 255, 0.24)'
        : 'rgba(76, 48, 29, 0.11)'
      context.lineWidth = 0.5 + random() * 1.6
      context.stroke()
    }
  })
}

function createChalkboardTexture() {
  return makeSurfaceTexture((context) => {
    let seed = 23
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }

    context.fillStyle = '#f4f1e9'
    context.fillRect(0, 0, context.canvas.width, context.canvas.height)

    for (let i = 0; i < 260; i++) {
      const x = random() * context.canvas.width
      const y = random() * context.canvas.height
      const length = 8 + random() * 42
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(x + length, y + (random() - 0.5) * 2)
      context.strokeStyle = 'rgba(20, 45, 37, 0.075)'
      context.lineWidth = 0.5 + random()
      context.stroke()
    }

  }, 1536, 512)
}

function createChalkWritingTexture() {
  return makeSurfaceTexture((context) => {
    context.fillStyle = 'rgba(238, 235, 217, 0.82)'
    context.font = 'italic 72px "Comic Sans MS", "Trebuchet MS", cursive'
    context.fillText("Newton's Laws of Motion", 120, 185)
    context.font = 'italic 82px "Comic Sans MS", "Trebuchet MS", cursive'
    context.fillText('F = ma', 150, 340)
    context.font = 'italic 48px "Comic Sans MS", "Trebuchet MS", cursive'
    context.fillText('Force  ·  Mass  ·  Acceleration', 470, 340)
  }, 1536, 512)
}

function addMesh(parent, geometry, material, position, rotation) {
  const mesh = new THREE.Mesh(geometry, material)
  if (position) mesh.position.set(...position)
  if (rotation) mesh.rotation.set(...rotation)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function box(parent, size, material, position, rotation) {
  return addMesh(
    parent,
    getCachedGeometry(parent, `box:${size.join(',')}`, () =>
      new THREE.BoxGeometry(size[0], size[1], size[2])
    ),
    material,
    position,
    rotation
  )
}

function cylinder(parent, radiusTop, radiusBottom, height, material, position, segments = 12) {
  return addMesh(
    parent,
    getCachedGeometry(
      parent,
      `cylinder:${radiusTop}:${radiusBottom}:${height}:${segments}`,
      () => new THREE.CylinderGeometry(
        radiusTop,
        radiusBottom,
        height,
        segments
      )
    ),
    material,
    position
  )
}

function sphere(parent, radius, material, position, scale = [1, 1, 1]) {
  const mesh = addMesh(
    parent,
    getCachedGeometry(parent, `sphere:${radius}`, () =>
      new THREE.SphereGeometry(radius, 20, 14)
    ),
    material,
    position
  )
  mesh.scale.set(...scale)
  return mesh
}

function plane(parent, width, height, material, position, rotation) {
  return addMesh(
    parent,
    getCachedGeometry(parent, `plane:${width}:${height}`, () =>
      new THREE.PlaneGeometry(width, height)
    ),
    material,
    position,
    rotation
  )
}

function roundedBox(parent, size, radius, material, position) {
  // Beveled-looking prop assembled from a central box and rounded edges.
  const group = new THREE.Group()
  group.position.set(...position)
  parent.add(group)

  box(
    group,
    [
      Math.max(0.01, size[0] - radius * 2),
      size[1],
      size[2],
    ],
    material,
    [0, 0, 0]
  )

  box(
    group,
    [
      size[0],
      Math.max(0.01, size[1] - radius * 2),
      size[2],
    ],
    material,
    [0, 0, 0]
  )

  const cornerPositions = [
    [-size[0] / 2 + radius, -size[1] / 2 + radius],
    [size[0] / 2 - radius, -size[1] / 2 + radius],
    [-size[0] / 2 + radius, size[1] / 2 - radius],
    [size[0] / 2 - radius, size[1] / 2 - radius],
  ]

  cornerPositions.forEach(([x, y]) => {
    const corner = addMesh(
      group,
      getCachedGeometry(
        group,
        `cylinder:${radius}:${radius}:${size[2]}:12`,
        () => new THREE.CylinderGeometry(radius, radius, size[2], 12)
      ),
      material,
      [x, y, 0],
      [Math.PI / 2, 0, 0]
    )
    corner.rotation.x = Math.PI / 2
  })

  return group
}

function createDesk(parent, x, z, width = 2.25, depth = 1.05) {
  const desk = new THREE.Group()
  desk.position.set(x, 0, z)
  parent.add(desk)

  // Main desktop slab and edge band.
  box(
    desk,
    [width, 0.12, depth],
    MAT.wood,
    [0, 1.12, 0]
  )
  box(
    desk,
    [width + 0.025, 0.035, depth + 0.025],
    MAT.woodEdge,
    [0, 1.055, 0]
  )

  // Front apron.
  box(
    desk,
    [width * 0.72, 0.16, 0.08],
    MAT.woodEdge,
    [0, 0.96, depth * 0.38]
  )

  // Metal legs.
  const legX = width * 0.42
  const legZ = depth * 0.38
  ;[
    [-legX, 0.54, -legZ],
    [legX, 0.54, -legZ],
    [-legX, 0.54, legZ],
    [legX, 0.54, legZ],
  ].forEach((position) => {
    box(desk, [0.055, 1.02, 0.055], MAT.metal, position)
  })

  // Lower cross braces.
  box(
    desk,
    [width * 0.82, 0.035, 0.045],
    MAT.metal,
    [0, 0.27, -legZ]
  )
  box(
    desk,
    [0.045, 0.035, depth * 0.72],
    MAT.metal,
    [-legX, 0.27, 0]
  )

  // Small pencil groove along the back edge.
  box(
    desk,
    [width * 0.72, 0.018, 0.025],
    MAT.woodEdge,
    [0, 1.19, -depth * 0.43]
  )

  return desk
}

function addStudyMaterials(parent, x, z, variant = 0) {
  const cover = variant % 2 ? MAT.notebookCover : MAT.woodEdge
  const book = new THREE.Group()
  book.position.set(x - 0.38, 1.21, z - 0.08)
  book.rotation.y = variant % 2 ? -0.08 : 0.06
  parent.add(book)

  box(book, [0.52, 0.045, 0.66], cover, [0, 0, 0])
  box(book, [0.46, 0.012, 0.58], MAT.paper, [0, 0.026, 0])
  box(book, [0.012, 0.014, 0.56], MAT.paperShadow, [0, 0.035, 0])

  for (let line = 0; line < 4; line++) {
    box(
      book,
      [0.16 + (line % 2) * 0.04, 0.006, 0.008],
      MAT.paperShadow,
      [-0.08, 0.035, -0.18 + line * 0.09]
    )
  }

  if (variant % 2 === 0) {
    cylinder(
      parent,
      0.075,
      0.075,
      0.34,
      MAT.bottle,
      [x + 0.62, 1.38, z + 0.15],
      12
    )
    cylinder(
      parent,
      0.045,
      0.045,
      0.055,
      MAT.woodEdge,
      [x + 0.62, 1.58, z + 0.15],
      12
    )
  } else {
    const phone = new THREE.Group()
    phone.position.set(x + 0.52, 1.22, z - 0.22)
    phone.rotation.x = -Math.PI / 2
    phone.scale.setScalar(0.26)
    parent.add(phone)

    roundedBox(
      phone,
      [0.78, 1.48, 0.075],
      0.06,
      MAT.phoneFrame,
      [0, 0, 0]
    )
    box(
      phone,
      [0.66, 1.3, 0.012],
      MAT.phoneGlass,
      [0, 0, 0.045]
    )
  }
}

function createChair(parent, x, z, rotation = 0) {
  const chair = new THREE.Group()
  chair.position.set(x, 0, z)
  chair.rotation.y = rotation
  parent.add(chair)

  // Seat.
  box(
    chair,
    [0.72, 0.09, 0.68],
    MAT.chair,
    [0, 0.57, 0]
  )

  // Curved-looking backrest built from a panel and side supports.
  box(
    chair,
    [0.72, 0.62, 0.09],
    MAT.chair,
    [0, 1.02, -0.29],
    [-0.08, 0, 0]
  )

  box(
    chair,
    [0.78, 0.07, 0.1],
    MAT.chairDark,
    [0, 1.34, -0.29]
  )

  // Legs.
  const legPositions = [
    [-0.29, 0.28, -0.24],
    [0.29, 0.28, -0.24],
    [-0.29, 0.28, 0.24],
    [0.29, 0.28, 0.24],
  ]

  legPositions.forEach((position) => {
    box(
      chair,
      [0.045, 0.55, 0.045],
      MAT.metal,
      position
    )
  })

  // Rear frame supports.
  box(
    chair,
    [0.045, 0.78, 0.045],
    MAT.metal,
    [-0.3, 0.91, -0.25],
    [-0.08, 0, 0]
  )
  box(
    chair,
    [0.045, 0.78, 0.045],
    MAT.metal,
    [0.3, 0.91, -0.25],
    [-0.08, 0, 0]
  )

  return chair
}

function createPhone(parent) {
  const phone = new THREE.Group()
  phone.position.set(0, 1.22, 2.7)
  phone.rotation.set(-Math.PI / 2, -0.08, -0.12)
  phone.scale.setScalar(0.4)
  parent.add(phone)

  // Phone body.
  roundedBox(
    phone,
    [0.78, 1.48, 0.075],
    0.06,
    MAT.phoneFrame,
    [0, 0, 0]
  )

  // Screen surface.
  const phoneScreen = box(
    phone,
    [0.69, 1.34, 0.012],
    MAT.phoneGlass,
    [0, 0, 0.045]
  )

  // Earpiece and front camera.
  box(
    phone,
    [0.16, 0.018, 0.008],
    MAT.black,
    [0, 0.62, 0.055]
  )
  cylinder(
    phone,
    0.025,
    0.025,
    0.008,
    MAT.black,
    [0.15, 0.62, 0.055],
    16
  )

  // Side buttons.
  box(
    phone,
    [0.025, 0.18, 0.035],
    MAT.phoneFrame,
    [-0.405, 0.25, 0]
  )
  box(
    phone,
    [0.025, 0.12, 0.035],
    MAT.phoneFrame,
    [0.405, 0.18, 0]
  )

  // Notification banner.
  const alertGroup = new THREE.Group()
  alertGroup.position.set(0, 0.25, 0.058)
  phone.add(alertGroup)

  box(
    alertGroup,
    [0.57, 0.25, 0.012],
    new THREE.MeshBasicMaterial({
      color: '#34413e',
      transparent: true,
      opacity: 0.94,
    }),
    [0, 0, 0]
  )

  sphere(
    alertGroup,
    0.035,
    new THREE.MeshBasicMaterial({ color: '#d16d55' }),
    [-0.23, 0.055, 0.012]
  )

  box(
    alertGroup,
    [0.28, 0.018, 0.008],
    new THREE.MeshBasicMaterial({ color: '#69747b' }),
    [0.055, 0.055, 0.012]
  )

  box(
    alertGroup,
    [0.38, 0.014, 0.008],
    new THREE.MeshBasicMaterial({ color: '#a3abb0' }),
    [0.005, -0.015, 0.012]
  )

  const phoneAlert = alertGroup
  phoneAlert.visible = false

  return {
    phone,
    phoneScreen,
    phoneAlert,
  }
}

function createNotebook(parent) {
  const notebook = new THREE.Group()
  notebook.position.set(-1.25, 1.22, 2.7)
  notebook.rotation.set(-0.05, -0.12, 0.02)
  notebook.scale.setScalar(0.42)
  parent.add(notebook)

  // Cover and pages.
  box(
    notebook,
    [1.52, 0.08, 1.92],
    MAT.woodEdge,
    [0, 0, 0]
  )

  box(
    notebook,
    [1.43, 0.055, 1.82],
    MAT.paperShadow,
    [0, 0.045, 0]
  )

  const notebookPages = new THREE.Group()
  notebookPages.position.set(0, 0.08, 0)
  notebook.add(notebookPages)

  // Center binding.
  box(
    notebookPages,
    [0.045, 0.03, 1.78],
    MAT.paperShadow,
    [0, 0.03, 0]
  )

  const leftPage = new THREE.Group()
  const rightPage = new THREE.Group()
  notebookPages.add(leftPage, rightPage)

  box(leftPage, [0.69, 0.025, 1.78], MAT.paper, [-0.345, 0.015, 0])
  box(rightPage, [0.69, 0.025, 1.78], MAT.paper, [0.345, 0.015, 0])

  // Printed page rules.
  const lineMaterial = new THREE.MeshBasicMaterial({
    color: '#9daeb5',
    transparent: true,
    opacity: 0.48,
  })

  for (let i = 0; i < 11; i++) {
    const y = 0.035
    const z = -0.68 + i * 0.13

    box(
      leftPage,
      [0.56, 0.006, 0.008],
      lineMaterial,
      [-0.37, y, z]
    )

    box(
      rightPage,
      [0.56, 0.006, 0.008],
      lineMaterial,
      [0.37, y, z]
    )
  }

  // Red margin lines.
  box(
    leftPage,
    [0.008, 0.007, 1.52],
    new THREE.MeshBasicMaterial({
      color: '#c78f82',
      transparent: true,
      opacity: 0.5,
    }),
    [-0.58, 0.04, 0]
  )

  box(
    rightPage,
    [0.008, 0.007, 1.52],
    new THREE.MeshBasicMaterial({
      color: '#c78f82',
      transparent: true,
      opacity: 0.5,
    }),
    [0.16, 0.04, 0]
  )

  const coverHinge = new THREE.Group()
  coverHinge.position.set(-0.76, 0.2, 0)
  notebook.add(coverHinge)
  box(
    coverHinge,
    [1.52, 0.055, 1.82],
    MAT.notebookCover,
    [0.76, 0, 0]
  )
  coverHinge.rotation.z = 0
  notebook.userData.coverHinge = coverHinge

  return notebook
}

function createFacultyDisplay(parent) {
  const display = new THREE.Group()
  display.position.set(0.15, 2.45, -6.25)
  parent.add(display)

  // Screen frame.
  box(
    display,
    [2.5, 1.52, 0.12],
    MAT.black,
    [0, 0, 0]
  )

  const screenMaterial = new THREE.MeshBasicMaterial({
    color: '#0d1411',
  })

  box(
    display,
    [2.32, 1.34, 0.018],
    screenMaterial,
    [0, 0, 0.07]
  )

  // Stand and base.
  box(
    display,
    [0.16, 0.48, 0.14],
    MAT.metal,
    [0, -0.96, 0]
  )
  box(
    display,
    [0.78, 0.08, 0.45],
    MAT.metal,
    [0, -1.22, 0]
  )

  // QR graphic rendered to a canvas texture.
  const qrCanvas = document.createElement('canvas')
  qrCanvas.width = 256
  qrCanvas.height = 256

  const ctx = qrCanvas.getContext('2d')
  ctx.fillStyle = '#f8f7f0'
  ctx.fillRect(0, 0, 256, 256)

  // Deterministic QR-like matrix for the scene illustration.
  // This is a visual prop, not a scannable session token.
  let seed = 23
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }

  const cells = 29
  const cellSize = 7
  const offset = 26

  ctx.fillStyle = '#17211d'

  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const inFinder =
        (row < 7 && col < 7) ||
        (row < 7 && col >= cells - 7) ||
        (row >= cells - 7 && col < 7)

      if (inFinder) continue

      if (random() > 0.52) {
        ctx.fillRect(
          offset + col * cellSize,
          offset + row * cellSize,
          cellSize,
          cellSize
        )
      }
    }
  }

  const drawFinder = (x, y) => {
    ctx.fillStyle = '#17211d'
    ctx.fillRect(x, y, 49, 49)
    ctx.fillStyle = '#f8f7f0'
    ctx.fillRect(x + 7, y + 7, 35, 35)
    ctx.fillStyle = '#17211d'
    ctx.fillRect(x + 14, y + 14, 21, 21)
  }

  drawFinder(offset, offset)
  drawFinder(offset + (cells - 7) * cellSize, offset)
  drawFinder(offset, offset + (cells - 7) * cellSize)

  const qrTexture = new THREE.CanvasTexture(qrCanvas)
  qrTexture.colorSpace = THREE.SRGBColorSpace

  const qr = plane(
    display,
    0.66,
    0.66,
    new THREE.MeshBasicMaterial({
      map: qrTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    [0.55, 0.02, 0.09]
  )

  // Screen UI labels and status lines.
  box(
    display,
    [0.75, 0.035, 0.008],
    new THREE.MeshBasicMaterial({ color: '#d7b48b' }),
    [-0.52, 0.43, 0.085]
  )

  box(
    display,
    [0.88, 0.025, 0.008],
    new THREE.MeshBasicMaterial({ color: '#91a49a' }),
    [-0.45, 0.29, 0.085]
  )

  box(
    display,
    [0.7, 0.025, 0.008],
    new THREE.MeshBasicMaterial({ color: '#657a70' }),
    [-0.54, 0.17, 0.085]
  )

  const screenGlow = plane(
    display,
    2.25,
    1.25,
    new THREE.MeshBasicMaterial({
      color: '#8bb6a0',
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    [0, 0, 0.085]
  )

  return { display, qr, screenGlow }
}

function createPerson(
  parent,
  x,
  z,
  scale = 1,
  facing = 0,
  hairMaterial = MAT.hair,
  shirtMaterial = MAT.shirt,
  skinMaterial = MAT.skin
) {
  const person = new THREE.Group()
  person.position.set(x, 0, z)
  person.rotation.y = facing
  person.scale.setScalar(scale)
  parent.add(person)

  // Seated body and head.
  box(
    person,
    [0.48, 0.7, 0.36],
    shirtMaterial,
    [0, 1.25, 0]
  )

  sphere(
    person,
    0.22,
    skinMaterial,
    [0, 1.82, -0.02],
    [0.9, 1.1, 0.95]
  )

  // Hair cap.
  sphere(
    person,
    0.225,
    hairMaterial,
    [0, 1.96, -0.015],
    [1.08, 0.88, 1.08]
  )

  sphere(person, 0.12, hairMaterial, [0, 1.99, 0.14], [1.35, 0.56, 0.72])
  sphere(person, 0.115, hairMaterial, [0, 1.95, 0.18], [1.05, 0.62, 0.48])

  // Bent legs sit on the chair and extend toward the desk.
  box(
    person,
    [0.2, 0.18, 0.48],
    MAT.trousers,
    [-0.13, 0.68, 0.24]
  )
  box(
    person,
    [0.2, 0.18, 0.48],
    MAT.trousers,
    [0.13, 0.68, 0.24]
  )
  box(
    person,
    [0.16, 0.45, 0.16],
    MAT.trousers,
    [-0.13, 0.34, 0.52],
    [-0.08, 0, -0.02]
  )
  box(
    person,
    [0.16, 0.45, 0.16],
    MAT.trousers,
    [0.13, 0.34, 0.52],
    [-0.08, 0, 0.02]
  )

  const placeArmSegment = (start, end, radius) => {
    const direction = new THREE.Vector3().subVectors(end, start)
    const segment = cylinder(
      person,
      radius * 0.9,
      radius,
      1,
      skinMaterial,
      [0, 0, 0],
      8
    )
    segment.position.copy(start).add(end).multiplyScalar(0.5)
    segment.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize()
    )
    segment.scale.y = direction.length()
  }

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * 0.2, 1.48, 0.08)
    const elbow = new THREE.Vector3(side * 0.3, 1.31, 0.3)
    const wrist = new THREE.Vector3(side * 0.34, 1.16, 0.52)
    placeArmSegment(shoulder, elbow, 0.075)
    placeArmSegment(elbow, wrist, 0.065)
    sphere(person, 0.075, skinMaterial, wrist.toArray(), [1, 0.8, 0.8])
  }

  return person
}

function createClassroomArchitecture(scene) {
  const architecture = new THREE.Group()
  scene.add(architecture)

  // Floor.
  box(
    architecture,
    [22, 0.18, 24],
    MAT.floor,
    [0, -0.12, -2]
  )

  // Back wall and side walls.
  box(
    architecture,
    [22, 7.5, 0.28],
    MAT.wall,
    [0, 3.65, -13.8]
  )
  const windowCenters = [-9, -3.4, 2.2]
  let wallStart = -14

  windowCenters.forEach((center) => {
    const windowStart = center - 1.75
    const windowEnd = center + 1.75

    if (windowStart > wallStart) {
      const depth = windowStart - wallStart
      box(
        architecture,
        [0.28, 7.5, depth],
        MAT.wall,
        [-10.9, 3.65, wallStart + depth / 2]
      )
    }

    box(
      architecture,
      [0.28, 3.2, 3.5],
      MAT.wall,
      [-10.9, 1.5, center]
    )
    box(
      architecture,
      [0.28, 1.7, 3.5],
      MAT.wall,
      [-10.9, 6.55, center]
    )
    wallStart = windowEnd
  })

  if (wallStart < 10) {
    const depth = 10 - wallStart
    box(
      architecture,
      [0.28, 7.5, depth],
      MAT.wall,
      [-10.9, 3.65, wallStart + depth / 2]
    )
  }

  box(
    architecture,
    [0.28, 7.5, 24],
    MAT.wall,
    [10.9, 3.65, -2]
  )

  // Front teaching wall / chalkboard.
  box(
    architecture,
    [8.4, 3.1, 0.16],
    MAT.wallDark,
    [0, 3.15, -13.58]
  )

  box(
    architecture,
    [7.7, 2.45, 0.045],
    MAT.chalkboard,
    [0, 3.18, -13.46]
  )

  const chalkWritingTexture = createChalkWritingTexture()
  chalkWritingTexture.colorSpace = THREE.SRGBColorSpace
  plane(
    architecture,
    7.3,
    2.25,
    new THREE.MeshBasicMaterial({
      map: chalkWritingTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    [0, 3.18, -13.42]
  )

  // A quiet timber frame gives the board a clear place in the room.
  box(architecture, [7.95, 0.075, 0.12], MAT.woodEdge, [0, 4.46, -13.42])
  box(architecture, [7.95, 0.075, 0.12], MAT.woodEdge, [0, 1.91, -13.42])
  box(architecture, [0.075, 2.62, 0.12], MAT.woodEdge, [-3.94, 3.18, -13.42])
  box(architecture, [0.075, 2.62, 0.12], MAT.woodEdge, [3.94, 3.18, -13.42])

  // Chalk tray.
  box(
    architecture,
    [7.9, 0.08, 0.22],
    MAT.woodEdge,
    [0, 1.88, -13.36]
  )

  // Recessed glass and timber mullions let the morning light into the room.
  box(architecture, [0.08, 7.5, 24], MAT.exteriorSky, [-11.18, 3.65, -2])
  box(architecture, [0.09, 1.4, 24], MAT.exteriorGreen, [-11.12, 0.68, -2])

  windowCenters.forEach((z) => {
    box(
      architecture,
      [0.06, 2.65, 3.5],
      MAT.windowGlass,
      [-10.9, 4.45, z]
    )

    // Outer frame, center muntin, and sill.
    ;[-1.76, 0, 1.76].forEach((offset) => {
      box(
        architecture,
        [0.12, 2.82, 0.08],
        MAT.woodEdge,
        [-10.72, 4.45, z + offset]
      )
    })
    box(
      architecture,
      [0.12, 0.075, 3.62],
      MAT.woodEdge,
      [-10.72, 5.82, z]
    )
    box(
      architecture,
      [0.12, 0.075, 3.62],
      MAT.woodEdge,
      [-10.72, 3.08, z]
    )
    box(
      architecture,
      [0.18, 0.12, 3.78],
      MAT.woodEdge,
      [-10.74, 3.02, z]
    )
  })

  // Ceiling beams.
  for (let i = 0; i < 5; i++) {
    box(
      architecture,
      [21.5, 0.16, 0.22],
      MAT.beam,
      [0, 7.2, -11 + i * 4.5]
    )
  }

  return architecture
}

function createSunShafts(scene) {
  const shafts = new THREE.Group()
  scene.add(shafts)

  const shaftMaterial = new THREE.MeshBasicMaterial({
    color: '#f2d7a6',
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })

  for (let i = 0; i < 4; i++) {
    const shaft = plane(
      shafts,
      1.5 + i * 0.18,
      10,
      shaftMaterial.clone(),
      [2.2 + i * 0.85, 4.2, -2.5 + i * 2.5],
      [0.12, -0.3, -0.22]
    )

    shaft.material.opacity = 0.03 + i * 0.006
  }

  return shafts
}

export function createClassroomScene(canvas) {
  const isMobile = window.matchMedia(
    '(max-width: 680px), (pointer: coarse)'
  ).matches
  const deviceMemory = navigator.deviceMemory || 8
  const hardwareConcurrency = navigator.hardwareConcurrency || 8
  const lowQuality = isMobile || deviceMemory <= 4 || hardwareConcurrency <= 4
  const warmTone = new THREE.Color('#252d28')
  const coolTone = new THREE.Color('#293039')
  const warmSunTone = new THREE.Color('#ffe0ad')
  const coolSunTone = new THREE.Color('#c6d9e3')
  MAT.wood.map = createWoodGrainTexture()
  MAT.woodLight.map = MAT.wood.map
  MAT.chalkboard.map = createChalkboardTexture()
  const scene = new THREE.Scene()
  scene.background = warmTone.clone()
  scene.fog = new THREE.FogExp2(warmTone, 0.018)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isMobile,
    alpha: false,
    powerPreference: lowQuality ? 'default' : 'high-performance',
  })

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, lowQuality ? 1.2 : 1.6)
  )
  renderer.shadowMap.enabled = !lowQuality
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.18

  const camera = new THREE.PerspectiveCamera(
    isMobile ? 43 : 37,
    1,
    0.1,
    100
  )

  const lookTarget = new THREE.Vector3(0, 2.1, -4.5)

  // Ambient fill.
  const ambient = new THREE.HemisphereLight(
    '#d5dfd8',
    '#3a3026',
    1.45
  )
  scene.add(ambient)

  // Warm directional key light from the windows.
  const sunLight = new THREE.DirectionalLight('#ffe0ad', 4.1)
  sunLight.position.set(-12, 12, 4)
  sunLight.castShadow = !lowQuality
  sunLight.shadow.mapSize.set(lowQuality ? 512 : 1536, lowQuality ? 512 : 1536)
  sunLight.shadow.camera.left = -16
  sunLight.shadow.camera.right = 16
  sunLight.shadow.camera.top = 14
  sunLight.shadow.camera.bottom = -14
  sunLight.shadow.bias = -0.00025
  scene.add(sunLight)

  // Cool room fill.
  const coolFill = new THREE.DirectionalLight('#b9c9c8', 0.9)
  coolFill.position.set(8, 7, -8)
  scene.add(coolFill)

  createClassroomArchitecture(scene)
  createSunShafts(scene)
  const chalkboardGlow = plane(
    scene,
    7.2,
    2.1,
    new THREE.MeshBasicMaterial({
      color: '#d7b48b',
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    [0, 3.18, -13.42]
  )

  // Classroom desk rows.
  const desks = new THREE.Group()
  scene.add(desks)

  const rowZ = [-8.2, -4.5, -0.8, 2.9, 6.6]
  const colX = isMobile ? [-2.45, 2.45] : [-4.1, 0, 4.1]

  rowZ.forEach((z, row) => {
    colX.forEach((x, col) => {
      // Keep the faculty display's sightline clear in the close-up chapter.
      if (row < 2 && x === 0) return
      // The large foreground desk replaces the center seat in this row.
      if (row === 3 && x === 0) return
      // Leave central foreground space for the close-up props.
      if (row === 4 && col === 1) return

      createDesk(desks, x, z, 2.15, 1.02)
      createChair(
        desks,
        x,
        z + 1.18,
        Math.PI
      )
    })
  })

  let studyMaterialIndex = 0
  rowZ.forEach((z, row) => {
    colX.forEach((x, col) => {
      // The foreground desk has its own phone and notebook.
      if (row === 3) return
      if ((row < 2 && x === 0) || (row === 4 && col === 1)) return
      addStudyMaterials(scene, x, z, studyMaterialIndex++)
    })
  })

  // Faculty lectern near the board.
  const lectern = new THREE.Group()
  lectern.position.set(-4.1, 0, -10.1)
  scene.add(lectern)

  box(
    lectern,
    [1.15, 1.5, 0.82],
    MAT.wood,
    [0, 0.75, 0]
  )
  box(
    lectern,
    [1.35, 0.12, 0.95],
    MAT.woodLight,
    [0, 1.55, 0]
  )
  box(
    lectern,
    [0.8, 0.06, 0.62],
    MAT.woodEdge,
    [0, 0.12, 0]
  )

  // Faculty display and QR illustration.
  const { display, qr, screenGlow } = createFacultyDisplay(scene)

  // Foreground desk for phone and notebook shot.
  createDesk(scene, 0, 2.7, 3.6, 1.7)
  createChair(scene, 0, 3.88, Math.PI)

  // Phone and notebook attached to the foreground desk group.
  const foregroundProps = new THREE.Group()
  foregroundProps.position.set(0, 0, 0)
  scene.add(foregroundProps)

  const {
    phone,
    phoneScreen,
    phoneAlert,
  } = createPhone(foregroundProps)

  const notebook = createNotebook(foregroundProps)

  // Fill the main desk rows while leaving a few seats naturally empty.
  const people = new THREE.Group()
  scene.add(people)

  const studentSeats = [
    [-4.1, -7.02, 0.88, Math.PI - 0.05, MAT.hairChestnut, MAT.shirtBlue, MAT.skinLight],
    [4.1, -7.02, 0.86, Math.PI + 0.08, MAT.hairBrown, MAT.shirtOchre, MAT.skin],
    [-4.1, -3.32, 0.88, Math.PI + 0.04, MAT.hair, MAT.shirtOchre, MAT.skinWarm],
    [4.1, -3.32, 0.88, Math.PI + 0.05, MAT.hairChestnut, MAT.shirtBlue, MAT.skin],
    [-4.1, 0.38, 0.92, Math.PI - 0.04, MAT.hairBrown, MAT.shirtRust, MAT.skinLight],
    [0, 0.38, 0.88, Math.PI + 0.06, MAT.hairBlack, MAT.shirtOchre, MAT.skinWarm],
    [4.1, 0.38, 0.92, Math.PI - 0.06, MAT.hairBlack, MAT.shirt, MAT.skin],
    [-4.1, 4.08, 0.9, Math.PI + 0.05, MAT.hairChestnut, MAT.shirtBlue, MAT.skinWarm],
    [4.1, 4.08, 0.9, Math.PI - 0.04, MAT.hairBrown, MAT.shirtRust, MAT.skinLight],
  ]

  studentSeats.forEach(([
    x,
    z,
    scale,
    facing,
    hairMaterial,
    shirtMaterial,
    skinMaterial,
  ]) => {
    if (isMobile && x === 0) return

    createPerson(
      people,
      isMobile ? Math.sign(x) * 2.45 : x,
      z,
      scale,
      facing,
      hairMaterial,
      shirtMaterial,
      skinMaterial
    )
  })

  // Faculty silhouette standing near the teaching wall.
  const faculty = new THREE.Group()
  faculty.position.set(2.9, 0, -10.4)
  scene.add(faculty)

  box(
    faculty,
    [0.58, 1.3, 0.38],
    MAT.faculty,
    [0, 1.65, 0]
  )

  sphere(
    faculty,
    0.23,
    MAT.skin,
    [0, 2.52, -0.02],
    [0.92, 1.12, 0.96]
  )

  sphere(
    faculty,
    0.23,
    MAT.facultyHair,
    [0, 2.7, -0.025],
    [1.08, 0.82, 1.08]
  )
  sphere(
    faculty,
    0.12,
    MAT.facultyHair,
    [0, 2.72, 0.13],
    [1.35, 0.56, 0.72]
  )
  sphere(
    faculty,
    0.12,
    MAT.facultyHair,
    [0, 2.69, 0.17],
    [1.05, 0.62, 0.48]
  )

  box(
    faculty,
    [0.22, 0.88, 0.24],
    MAT.trousers,
    [-0.16, 0.48, 0]
  )
  box(
    faculty,
    [0.22, 0.88, 0.24],
    MAT.trousers,
    [0.16, 0.48, 0]
  )

  // Dust particles.
  const dustCount = lowQuality ? 72 : 180
  const dustPositions = new Float32Array(dustCount * 3)

  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = -8 + Math.random() * 9
    dustPositions[i * 3 + 1] = 1.2 + Math.random() * 6
    dustPositions[i * 3 + 2] = -8 + Math.random() * 14
  }

  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(dustPositions, 3)
  )

  const dustMaterial = new THREE.PointsMaterial({
    color: '#f4d9a8',
    size: 0.035,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    sizeAttenuation: true,
  })

  const dust = new THREE.Points(dustGeometry, dustMaterial)
  dust.userData.basePositions = dustPositions.slice()
  dust.castShadow = false
  dust.receiveShadow = false
  scene.add(dust)

  // Camera choreography.
  const cameraPath = {
    positions: [
      {
        at: 0,
        value: new THREE.Vector3(-0.6, 5.4, 15.8),
      },
      {
        at: 0.12,
        value: new THREE.Vector3(0.5, 3.2, 5.7),
      },
      {
        at: 0.2,
        value: new THREE.Vector3(1.35, 1.8, 3.85),
      },
      {
        at: 0.36,
        value: new THREE.Vector3(1.35, 1.8, 3.85),
      },
      {
        at: 0.48,
        value: new THREE.Vector3(0.15, 2.55, -1.1),
      },
      {
        at: 0.63,
        value: new THREE.Vector3(0, 4.8, 6.6),
      },
      {
        at: 0.74,
        value: new THREE.Vector3(0, 4.8, 6.6),
      },
      {
        at: 0.8,
        value: new THREE.Vector3(0, 4.8, 6.6),
      },
      {
        at: 0.86,
        value: new THREE.Vector3(-0.6, 5.2, 14.8),
      },
      {
        at: 1,
        value: new THREE.Vector3(-0.6, 5.4, 15.8),
      },
    ],
    targets: [
      {
        at: 0,
        value: new THREE.Vector3(-0.3, 2.25, -4.8),
      },
      {
        at: 0.12,
        value: new THREE.Vector3(0, 1.8, 2.2),
      },
      {
        at: 0.2,
        value: new THREE.Vector3(0, 1.22, 2.7),
      },
      {
        at: 0.36,
        value: new THREE.Vector3(0, 1.22, 2.7),
      },
      {
        at: 0.48,
        value: new THREE.Vector3(-0.45, 2.45, -6.2),
      },
      {
        at: 0.63,
        value: new THREE.Vector3(0, 1.35, 2.7),
      },
      {
        at: 0.74,
        value: new THREE.Vector3(0, 1.35, 2.7),
      },
      {
        at: 0.8,
        value: new THREE.Vector3(0, 1.35, 2.7),
      },
      {
        at: 0.86,
        value: new THREE.Vector3(-0.3, 2.25, -4.8),
      },
      {
        at: 1,
        value: new THREE.Vector3(-0.3, 2.25, -4.8),
      },
    ],
  }

  if (isMobile) {
    cameraPath.positions[1].value.set(1.35, 1.8, 3.85)
    cameraPath.positions[2].value.set(1.35, 1.8, 3.85)
    cameraPath.positions[4].value.set(0.15, 2.55, -1.1)

    cameraPath.targets[1].value.set(0, 1.22, 2.7)
    cameraPath.targets[2].value.set(0, 1.22, 2.7)
    cameraPath.targets[4].value.set(0.15, 2.45, -6.2)
  }

  camera.position.copy(cameraPath.positions[0].value)
  camera.lookAt(lookTarget)

  const resize = () => {
    const width = Math.max(canvas.clientWidth, 1)
    const height = Math.max(canvas.clientHeight, 1)
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      lowQuality ? 1.2 : 1.6
    )

    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  const render = () => {
    renderer.render(scene, camera)
  }

  const displayCorners = Array.from({ length: 4 }, () => new THREE.Vector3())
  const displayLocalCorners = [
    new THREE.Vector3(-1.1, 0.61, 0.082),
    new THREE.Vector3(1.1, 0.61, 0.082),
    new THREE.Vector3(1.1, -0.61, 0.082),
    new THREE.Vector3(-1.1, -0.61, 0.082),
  ]
  const getDisplayBounds = () => {
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld()

    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    const corners = []
    const width = Math.max(canvas.clientWidth, 1)
    const height = Math.max(canvas.clientHeight, 1)

    displayLocalCorners.forEach((corner, index) => {
      const point = displayCorners[index]
        .copy(corner)
        .applyMatrix4(display.matrixWorld)
        .project(camera)
      const x = (point.x * 0.5 + 0.5) * width
      const y = (-point.y * 0.5 + 0.5) * height
      corners.push({ x, y })
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    })

    return {
      left,
      top,
      width: right - left,
      height: bottom - top,
      corners,
    }
  }

  resize()

  return {
    scene,
    renderer,
    camera,
    lookTarget,
    resize,
    render,
    getDisplayBounds,
    parts: {
      phone,
      phoneScreen,
      phoneAlert,
      screenGlow,
      notebook,
      qr,
      chalkboardGlow,
      sunLight,
      coolFill,
      dust,
      cameraPath,
      scene,
      fog: scene.fog,
      warmTone,
      coolTone,
      warmSunTone,
      coolSunTone,
    },
  }
}