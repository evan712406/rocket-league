import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// All art in this module is generated locally: no remote models or textures.
const BLUE = 0x38a9ff;
const ORANGE = 0xff873e;
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);
const REAR = new THREE.Vector3(0, 0, 1);
const clamp = THREE.MathUtils.clamp;

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...options });
}

function mesh(geometry, mat, position, parent, shadow = false) {
  const object = new THREE.Mesh(geometry, mat);
  if (position) object.position.set(...position);
  object.castShadow = shadow;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(parent, size, position, mat, shadow = false) {
  return mesh(new THREE.BoxGeometry(...size), mat, position, parent, shadow);
}

function lineBetween(parent, from, to, mat) {
  const delta = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
  const object = mesh(new THREE.CylinderGeometry(0.12, 0.12, delta.length(), 8), mat, null, parent);
  object.position.copy(new THREE.Vector3(...from).add(new THREE.Vector3(...to)).multiplyScalar(0.5));
  object.quaternion.setFromUnitVectors(UP, delta.normalize());
  return object;
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,.46)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,.21)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

function ballTexture() {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#edf4f1';
    ctx.fillRect(0, 0, w, h);
    const r = 58;
    for (let row = -1; row < 7; row++) {
      for (let col = -1; col < 13; col++) {
        const x = col * r * Math.sqrt(3) + (row % 2 ? r * Math.sqrt(3) / 2 : 0);
        const y = row * r * 1.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 3 * k + Math.PI / 6;
          const px = x + Math.cos(a) * (r - 2);
          const py = y + Math.sin(a) * (r - 2);
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = (row + col * 2) % 5 === 0 ? '#172e43' : ((row + col) % 3 === 0 ? '#d2e1e1' : '#f0f5ef');
        ctx.fill();
        ctx.strokeStyle = '#677d85';
        ctx.lineWidth = 2;
        ctx.stroke();
        if ((row + col * 2) % 5 === 0) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-0.24);
          ctx.fillStyle = '#5ecbee';
          ctx.fillRect(-19, -3, 38, 6);
          ctx.fillStyle = '#9ee9ff';
          ctx.fillRect(-8, -13, 6, 26);
          ctx.restore();
        }
      }
    }
    // Subtle grain prevents the ball looking like a smooth plastic toy.
    let seed = 2917;
    for (let i = 0; i < 26000; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = (seed % w);
      seed = (seed * 16807) % 2147483647;
      const y = (seed % h);
      ctx.fillStyle = 'rgba(9,32,47,.035)';
      ctx.fillRect(x, y, 1, 1);
    }
  });
}

function bannerTexture(label, color, subtitle = 'CAR FOOTBALL · NIGHT LEAGUE') {
  return canvasTexture(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0c1b2a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 6, h);
    ctx.fillRect(w - 6, 0, 6, h);
    ctx.fillStyle = '#edf7ff';
    ctx.font = '900 51px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, w / 2, 67);
    ctx.fillStyle = color;
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.letterSpacing = '5px';
    ctx.fillText(subtitle, w / 2, 101);
  });
}

function rampGeometry(axis, sign, start, end) {
  const positions = [];
  const indices = [];
  const segments = 18;
  for (let i = 0; i <= segments; i++) {
    const theta = i / segments * Math.PI / 2;
    const lateral = (axis === 'x' ? 33 : 51) + Math.sin(theta) * 5;
    const y = 5 - Math.cos(theta) * 5;
    if (axis === 'x') positions.push(sign * lateral, y, start, sign * lateral, y, end);
    else positions.push(start, y, sign * lateral, end, y, sign * lateral);
    if (i < segments) {
      const n = i * 2;
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function cabinGeometry() {
  // A low, faceted original sports-car silhouette, front facing local -Z.
  const vertices = [
    [-0.79, 0.30, -0.92], [0.79, 0.30, -0.92],
    [-0.59, 0.91, -0.25], [0.59, 0.91, -0.25],
    [-0.62, 0.91, 0.72], [0.62, 0.91, 0.72],
    [-0.82, 0.30, 1.14], [0.82, 0.30, 1.14],
  ];
  const faces = [[0, 1, 3, 2], [2, 3, 5, 4], [4, 5, 7, 6], [0, 2, 4, 6], [1, 7, 5, 3]];
  const positions = [];
  for (const face of faces) for (const i of [0, 1, 2, 0, 2, 3]) positions.push(...vertices[face[i]]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function batchStaticMeshes(root) {
  // Retain moving pivots; combine the fixed parts into one draw per material.
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  const batches = new Map();
  const visit = object => {
    if (object.userData.animated || object.isInstancedMesh) return;
    if (object.isMesh && !Array.isArray(object.material)) {
      const key = `${object.material.id}:${object.castShadow}:${object.receiveShadow}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(object);
    }
    for (const child of object.children) visit(child);
  };
  for (const child of root.children) visit(child);
  for (const objects of batches.values()) {
    if (objects.length < 2) continue;
    const geometries = objects.map(object => {
      const source = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      matrix.multiplyMatrices(inverseRoot, object.matrixWorld);
      source.applyMatrix4(matrix);
      return source;
    });
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const combined = new THREE.Mesh(merged, objects[0].material);
    combined.castShadow = objects[0].castShadow;
    combined.receiveShadow = objects[0].receiveShadow;
    for (const object of objects) {
      object.removeFromParent();
      object.geometry.dispose();
    }
    root.add(combined);
  }
}

export class GameScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x091220);
    this.scene.fog = new THREE.Fog(0x091220, 82, 195);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.15, 250);
    this.camera.position.set(0, 7, 17);
    this.cameraTarget = new THREE.Vector3();
    this.cameraDesired = new THREE.Vector3();
    this.focusDesired = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.scratch = new THREE.Vector3();
    this.scratchQuaternion = new THREE.Quaternion();
    this.orbitYaw = 0;
    this.orbitPitch = 0.18;
    this.cameraInitialized = false;
    this.quality = 'medium';
    this.cars = new Map();
    this.pads = [];
    this.padSignature = '';
    this.clock = 0;
    this.shadowTexture = glowTexture();
    this.buildLighting();
    this.buildStadium();
    this.buildBall();
    this.buildParticles();
    this.resize();
  }

  buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xc5eaff, 0x10313a, 1.65));
    const main = new THREE.DirectionalLight(0xf0f6ff, 2.5);
    main.position.set(-23, 55, 22);
    main.castShadow = true;
    main.shadow.mapSize.set(2048, 2048);
    main.shadow.camera.left = -68;
    main.shadow.camera.right = 68;
    main.shadow.camera.top = 76;
    main.shadow.camera.bottom = -76;
    main.shadow.camera.near = 1;
    main.shadow.camera.far = 150;
    main.shadow.bias = -0.0004;
    main.shadow.normalBias = 0.1;
    this.scene.add(main);
    const rim = new THREE.DirectionalLight(0x76bfff, 1.3);
    rim.position.set(33, 22, -42);
    this.scene.add(rim);
    const orangeLight = new THREE.PointLight(ORANGE, 130, 40, 2);
    orangeLight.position.set(0, 9, -58);
    this.scene.add(orangeLight);
    const blueLight = new THREE.PointLight(BLUE, 130, 40, 2);
    blueLight.position.set(0, 9, 58);
    this.scene.add(blueLight);
  }

  buildStadium() {
    const stadium = new THREE.Group();
    this.scene.add(stadium);
    const steel = material(0x172b3c, { metalness: 0.65, roughness: 0.38 });
    const dark = material(0x101d2c, { metalness: 0.2 });
    const white = new THREE.MeshBasicMaterial({ color: 0xa0bdc5 });
    const blueGlow = material(BLUE, { emissive: BLUE, emissiveIntensity: 2.4, roughness: 0.4 });
    const orangeGlow = material(ORANGE, { emissive: ORANGE, emissiveIntensity: 2.4, roughness: 0.4 });
    const pitchTexture = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#174650';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1a4c55';
      ctx.fillRect(0, 0, w, h / 2);
      for (let i = 0; i < h; i += 3) {
        ctx.fillStyle = i % 6 === 0 ? 'rgba(214,255,249,.028)' : 'rgba(0,0,0,.025)';
        ctx.fillRect(0, i, w, 1);
      }
    });
    pitchTexture.wrapS = THREE.RepeatWrapping;
    pitchTexture.wrapT = THREE.RepeatWrapping;
    pitchTexture.repeat.set(4, 7);
    pitchTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const pitch = material(0xffffff, { map: pitchTexture, roughness: 0.98 });
    const floor = mesh(new THREE.PlaneGeometry(76, 112), pitch, [0, 0, 0], stadium);
    floor.rotation.x = -Math.PI / 2;
    box(stadium, [98, 0.6, 144], [0, -0.36, 0], dark);
    const rampMat = material(0x19424b, { roughness: 0.93, side: THREE.DoubleSide });
    for (const sign of [-1, 1]) {
      mesh(rampGeometry('x', sign, -56, 56), rampMat, null, stadium);
      mesh(rampGeometry('z', sign, -38, -12), rampMat, null, stadium);
      mesh(rampGeometry('z', sign, 12, 38), rampMat, null, stadium);
    }
    // Crisp field lines sit just above the grass to prevent z fighting.
    const field = new THREE.Group();
    field.position.y = 0.023;
    stadium.add(field);
    const stripe = (width, length, x, z, mat = white) => {
      const marking = mesh(new THREE.PlaneGeometry(width, length), mat, [x, 0, z], field);
      marking.rotation.x = -Math.PI / 2;
    };
    stripe(65, 0.17, 0, 0);
    for (const sign of [-1, 1]) {
      stripe(0.14, 101, sign * 31.8, 0);
      stripe(63.6, 0.14, 0, sign * 50.5);
      stripe(0.15, 16, -17, sign * 43);
      stripe(0.15, 16, 17, sign * 43);
      stripe(34, 0.15, 0, sign * 35);
      stripe(0.15, 6, -10, sign * 47.5);
      stripe(0.15, 6, 10, sign * 47.5);
      stripe(20, 0.15, 0, sign * 44.5);
      const arc = mesh(new THREE.TorusGeometry(5, 0.045, 4, 56, Math.PI), white, [0, 0.008, sign * 35], field);
      arc.rotation.x = -Math.PI / 2;
      if (sign < 0) arc.rotation.z = Math.PI;
    }
    const centerRing = mesh(new THREE.TorusGeometry(9, 0.06, 5, 80), white, [0, 0.008, 0], field);
    centerRing.rotation.x = -Math.PI / 2;
    const centerSpot = mesh(new THREE.CircleGeometry(0.43, 24), white, [0, 0.015, 0], field);
    centerSpot.rotation.x = -Math.PI / 2;
    // Original geometric center crest, understated enough to keep the ball visible.
    const crestMat = new THREE.MeshBasicMaterial({ color: 0x36717a, transparent: true, opacity: 0.65 });
    for (const sign of [-1, 1]) {
      const crest = mesh(new THREE.RingGeometry(2.6, 3.1, 3), crestMat, [sign * 4, 0.006, 0], field);
      crest.rotation.x = -Math.PI / 2;
      crest.rotation.z = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    const glass = new THREE.MeshPhysicalMaterial({ color: 0x668b9d, transparent: true, opacity: 0.075, roughness: 0.12, metalness: 0.12, side: THREE.DoubleSide, depthWrite: false });
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x66869a, transparent: true, opacity: 0.23 });
    const gridPositions = [];
    for (const side of [-1, 1]) {
      const glow = side > 0 ? blueGlow : orangeGlow;
      box(stadium, [0.2, 0.13, 112], [side * 38, 5.15, 0], steel);
      box(stadium, [0.2, 0.13, 56], [side * 38, 5.24, 28], blueGlow);
      box(stadium, [0.2, 0.13, 56], [side * 38, 5.24, -28], orangeGlow);
      box(stadium, [0.1, 18, 112], [side * 38.08, 14, 0], glass);
      box(stadium, [0.4, 0.35, 112], [side * 38.3, 23.3, 0], steel);
      for (let z = -56; z <= 56; z += 8) {
        gridPositions.push(side * 38.12, 5, z, side * 38.12, 23, z);
        box(stadium, [0.36, 20, 0.36], [side * 38.35, 13.2, z], steel);
      }
      for (let y = 8; y <= 23; y += 4) gridPositions.push(side * 38.12, y, -56, side * 38.12, y, 56);
      // End walls have clear goal mouths and a full upper containment panel.
      box(stadium, [76, 15, 0.1], [0, 15.5, side * 56.1], glass);
      box(stadium, [26, 8, 0.1], [-25, 4, side * 56.1], glass);
      box(stadium, [26, 8, 0.1], [25, 4, side * 56.1], glass);
      box(stadium, [76, 0.24, 0.4], [0, 23.3, side * 56.3], steel);
      for (let x = -38; x <= 38; x += 8) gridPositions.push(x, 8, side * 56.12, x, 23, side * 56.12);
      for (let y = 8; y <= 23; y += 4) gridPositions.push(-38, y, side * 56.12, 38, y, side * 56.12);
      this.buildGoal(stadium, side, glow, steel);
    }
    const grid = new THREE.BufferGeometry();
    grid.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
    stadium.add(new THREE.LineSegments(grid, gridMaterial));

    // Tiered grandstands are batched into a single instanced draw call.
    const seatGeometry = new THREE.BoxGeometry(0.9, 0.52, 0.86);
    const seatMaterial = material(0xffffff, { roughness: 0.95 });
    const seating = [];
    for (let row = 0; row < 9; row++) {
      const y = 5.5 + row * 1.55;
      const offset = 43 + row * 1.75;
      for (const side of [-1, 1]) {
        box(stadium, [1.9, 1.55, 124], [side * offset, y - 0.6, 0], dark);
        for (let z = -60; z <= 60; z += 1.38) seating.push({ x: side * offset, y, z, row });
        box(stadium, [86, 1.55, 1.9], [0, y - 0.6, side * (61 + row * 1.75)], dark);
        for (let x = -42; x <= 42; x += 1.38) seating.push({ x, y, z: side * (61 + row * 1.75), row });
      }
    }
    const seats = new THREE.InstancedMesh(seatGeometry, seatMaterial, seating.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    seating.forEach((seat, index) => {
      dummy.position.set(seat.x, seat.y, seat.z);
      dummy.updateMatrix();
      seats.setMatrixAt(index, dummy.matrix);
      color.setHex(seat.z > 0 ? 0x235881 : 0x815337);
      if ((index * 17) % 9 === 0) color.setHex(0xb8c8ce);
      color.multiplyScalar(0.7 + (index % 4) * 0.08);
      seats.setColorAt(index, color);
    });
    stadium.add(seats);
    for (const x of [-61, 61]) {
      box(stadium, [0.5, 0.32, 146], [x, 21.7, 0], steel);
      box(stadium, [0.17, 0.15, 72], [x, 21.93, 36], blueGlow);
      box(stadium, [0.17, 0.15, 72], [x, 21.93, -36], orangeGlow);
    }
    for (const z of [-79, 79]) box(stadium, [124, 0.3, 0.3], [0, 21.7, z], z > 0 ? blueGlow : orangeGlow);
    // Repeated arena billboards use only two original canvas textures.
    const bannerBlue = new THREE.MeshBasicMaterial({ map: bannerTexture('VELOCITY', '#45baff') });
    const bannerOrange = new THREE.MeshBasicMaterial({ map: bannerTexture('PLAY ABOVE', '#ff924f', 'BOOST · FLY · SCORE') });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const board = mesh(new THREE.PlaneGeometry(16, 2), i < 3 ? bannerOrange : bannerBlue, [side * 40.3, 3.1, -46 + i * 18.4], stadium);
        board.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      const arenaSign = mesh(new THREE.PlaneGeometry(31, 3.9), bannerBlue, [0, 21, side * 66], stadium);
      if (side > 0) arenaSign.rotation.y = Math.PI;
    }
    // Four visible lighting rigs give the night sky a believable stadium scale.
    const lamp = new THREE.MeshBasicMaterial({ color: 0xf2f8ff });
    for (const x of [-47, 47]) for (const z of [-60, 60]) {
      box(stadium, [0.9, 31, 0.9], [x, 15.5, z], steel);
      const rig = new THREE.Group();
      rig.position.set(x, 31, z);
      rig.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      rig.rotation.x = -0.3;
      stadium.add(rig);
      box(rig, [8.7, 2.6, 0.7], [0, 0, 0], dark);
      for (let row = -1; row <= 1; row += 2) for (let i = -3; i <= 3; i++) box(rig, [0.88, 0.73, 0.1], [i * 1.13, row * 0.55, 0.42], lamp);
    }
    // Roof trusses frame the playing area without enclosing the night sky.
    for (const x of [-39, 39]) {
      lineBetween(stadium, [x, 25, -58], [x * 1.15, 31, 0], steel);
      lineBetween(stadium, [x * 1.15, 31, 0], [x, 25, 58], steel);
    }
    const stars = [];
    for (let i = 0; i < 170; i++) {
      const azimuth = i * 2.39996;
      const altitude = 0.18 + ((i * 37) % 100) / 150;
      stars.push(Math.cos(azimuth) * 145 * Math.cos(altitude), Math.sin(altitude) * 145, Math.sin(azimuth) * 145 * Math.cos(altitude));
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
    this.scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xc1d4e8, size: 0.22, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.6 })));
    batchStaticMeshes(stadium);
  }

  buildGoal(stadium, sign, glow, steel) {
    const goal = new THREE.Group();
    goal.position.z = sign * 56;
    stadium.add(goal);
    const netMat = new THREE.LineBasicMaterial({ color: sign > 0 ? BLUE : ORANGE, transparent: true, opacity: 0.35 });
    const goalFloorMat = material(sign > 0 ? 0x153e58 : 0x553522, { roughness: 0.8 });
    box(goal, [20, 0.1, 8], [0, -0.02, sign * 4], goalFloorMat);
    box(goal, [0.3, 8.3, 0.3], [-10, 4, 0], glow);
    box(goal, [0.3, 8.3, 0.3], [10, 4, 0], glow);
    box(goal, [20.3, 0.32, 0.32], [0, 8, 0], glow);
    box(goal, [20.4, 0.22, 0.25], [0, 8, sign * 8], steel);
    for (const x of [-10, 10]) {
      box(goal, [0.22, 8, 0.25], [x, 4, sign * 8], steel);
      box(goal, [0.22, 0.25, 8], [x, 8, sign * 4], steel);
    }
    const positions = [];
    for (let x = -10; x <= 10; x += 1) {
      positions.push(x, 0, sign * 8, x, 8, sign * 8);
      positions.push(x, 8, 0, x, 8, sign * 8);
    }
    for (let y = 0; y <= 8; y += 1) {
      positions.push(-10, y, sign * 8, 10, y, sign * 8);
      positions.push(-10, y, 0, -10, y, sign * 8);
      positions.push(10, y, 0, 10, y, sign * 8);
    }
    for (let z = 0; z <= 8; z += 1) {
      positions.push(-10, 8, sign * z, 10, 8, sign * z);
      positions.push(-10, 0, sign * z, -10, 8, sign * z);
      positions.push(10, 0, sign * z, 10, 8, sign * z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    goal.add(new THREE.LineSegments(geometry, netMat));
    // Ground arrows make the scoring direction readable at high speeds.
    for (const x of [-6, 0, 6]) {
      const arrow = mesh(new THREE.ConeGeometry(0.6, 1.8, 3), glow, [x, 0.045, sign * 2], goal);
      arrow.rotation.x = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
      arrow.scale.z = 0.01;
    }
  }

  buildBall() {
    this.ball = mesh(new THREE.SphereGeometry(1.7, 40, 28), new THREE.MeshPhysicalMaterial({ map: ballTexture(), roughness: 0.59, metalness: 0.05, clearcoat: 0.15 }), [0, 1.7, 0], this.scene, true);
    this.ballShadow = mesh(new THREE.PlaneGeometry(5.5, 5.5), new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false, opacity: 0.65 }), [0, 0.032, 0], this.scene);
    this.ballShadow.rotation.x = -Math.PI / 2;
    const locatorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
    this.ballLocator = mesh(new THREE.RingGeometry(1.9, 1.97, 40), locatorMat, [0, 0.045, 0], this.scene);
    this.ballLocator.rotation.x = -Math.PI / 2;
  }

  createCar(car) {
    const teamColor = car.team === 'orange' ? ORANGE : BLUE;
    const group = new THREE.Group();
    this.scene.add(group);
    const paint = material(teamColor, { metalness: 0.58, roughness: 0.29 });
    const bodyDark = material(0x13202d, { metalness: 0.55, roughness: 0.4 });
    const rubber = material(0x0c1117, { roughness: 0.86 });
    const metal = material(0x8494a3, { metalness: 0.84, roughness: 0.3 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b2638, roughness: 0.12, metalness: 0.45, clearcoat: 1, side: THREE.DoubleSide });
    const glow = material(teamColor, { emissive: teamColor, emissiveIntensity: 2.2 });
    const lamps = material(0xe9f9ff, { emissive: 0xbdedff, emissiveIntensity: 3 });
    const tail = material(0xee403b, { emissive: 0xff2929, emissiveIntensity: 1.7 });
    box(group, [1.94, 0.38, 3.45], [0, 0.04, 0], paint, true);
    box(group, [2.05, 0.16, 3.68], [0, -0.20, -0.01], bodyDark, true);
    const bonnet = box(group, [1.86, 0.22, 1.15], [0, 0.25, -1.22], paint, true);
    bonnet.rotation.x = -0.07;
    box(group, [1.82, 0.24, 0.59], [0, 0.28, 1.40], paint, true);
    mesh(cabinGeometry(), glass, null, group, true);
    box(group, [1.21, 0.08, 1.04], [0, 0.94, 0.24], paint, true);
    for (const sign of [-1, 1]) {
      lineBetween(group, [sign * 0.79, 0.31, -0.92], [sign * 0.59, 0.91, -0.25], paint);
      lineBetween(group, [sign * 0.62, 0.91, 0.72], [sign * 0.82, 0.31, 1.14], paint);
      box(group, [0.07, 0.51, 0.07], [sign * 0.70, 0.58, 0.26], paint);
      box(group, [0.13, 0.12, 2.6], [sign * 1, -0.19, 0], glow);
      box(group, [0.43, 0.15, 0.08], [sign * 0.62, 0.23, -1.84], lamps);
      box(group, [0.55, 0.12, 0.09], [sign * 0.59, 0.23, 1.78], tail);
      box(group, [0.1, 0.38, 0.12], [sign * 0.62, 0.50, 1.59], bodyDark);
      const mirror = box(group, [0.22, 0.11, 0.19], [sign * 0.98, 0.48, -0.56], paint);
      mirror.rotation.y = sign * 0.15;
      for (const z of [-1.23, 1.23]) {
        const fender = mesh(new THREE.TorusGeometry(0.51, 0.09, 6, 16, Math.PI), paint, [sign * 1.0, -0.13, z], group, true);
        fender.rotation.y = Math.PI / 2;
        fender.rotation.z = Math.PI / 2;
      }
    }
    box(group, [2.12, 0.1, 0.42], [0, 0.72, 1.57], paint, true);
    box(group, [0.30, 0.012, 1.06], [0, 0.379, -1.22], bodyDark);
    box(group, [0.25, 0.013, 0.98], [0, 0.988, 0.24], bodyDark);
    box(group, [1.26, 0.21, 0.08], [0, -0.08, -1.90], rubber);
    box(group, [1.51, 0.10, 0.19], [0, -0.30, -1.85], bodyDark);
    const wheels = [];
    for (const side of [-1, 1]) for (const z of [-1.23, 1.23]) {
      const steering = new THREE.Group();
      steering.userData.animated = true;
      steering.position.set(side * 1.0, -0.28, z);
      group.add(steering);
      const spin = new THREE.Group();
      steering.add(spin);
      const tire = mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.30, 16), rubber, null, spin, true);
      tire.rotation.z = Math.PI / 2;
      const rim = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.315, 12), metal, null, spin);
      rim.rotation.z = Math.PI / 2;
      const hub = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.335, 8), glow, null, spin);
      hub.rotation.z = Math.PI / 2;
      for (let i = 0; i < 5; i++) {
        const spoke = box(spin, [0.035, 0.51, 0.07], [side * 0.167, 0, 0], bodyDark);
        spoke.rotation.x = i / 5 * Math.PI;
      }
      wheels.push({ steering, spin, front: z < 0 });
      batchStaticMeshes(spin);
    }
    const flames = [];
    for (const x of [-0.57, 0.57]) {
      const pipe = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.35, 10), metal, [x, -0.05, 1.82], group);
      pipe.rotation.x = Math.PI / 2;
      const flame = mesh(new THREE.ConeGeometry(0.29, 1.8, 8), new THREE.MeshBasicMaterial({ color: 0x43c4ff, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false }), [x, -0.05, 2.60], group);
      flame.rotation.x = Math.PI / 2;
      const core = mesh(new THREE.ConeGeometry(0.15, 1.2, 7), new THREE.MeshBasicMaterial({ color: 0xe4faff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), [x, -0.05, 2.3], group);
      core.rotation.x = Math.PI / 2;
      flame.userData.animated = true;
      core.userData.animated = true;
      flames.push(flame, core);
    }
    const shadow = mesh(new THREE.PlaneGeometry(4.1, 5.7), new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, opacity: 0.72, depthWrite: false }), [0, 0.035, 0], this.scene);
    shadow.rotation.x = -Math.PI / 2;
    // A small unobtrusive colored marker makes opponents readable at a distance.
    const marker = mesh(new THREE.ConeGeometry(0.25, 0.48, 4), new THREE.MeshBasicMaterial({ color: teamColor }), [0, 2.45, 0], this.scene);
    marker.rotation.z = Math.PI;
    batchStaticMeshes(group);
    const entry = { group, wheels, flames, shadow, marker, team: car.team, emission: 0 };
    this.cars.set(car.id, entry);
    return entry;
  }

  createPads(pads) {
    if (this.padBases) {
      this.scene.remove(this.padBases);
      this.padBases.geometry.dispose();
      this.padBases.material.dispose();
      this.padBases = null;
    }
    for (const entry of this.pads) {
      this.scene.remove(entry.group);
      entry.group.traverse(object => {
        object.geometry?.dispose();
        if (object.material && !Array.isArray(object.material)) object.material.dispose();
      });
    }
    const dummy = new THREE.Object3D();
    const baseGeometry = new THREE.CylinderGeometry(1, 1.04, 0.12, 24);
    const baseMaterial = material(0x1c2a35, { metalness: 0.65, roughness: 0.4 });
    this.padBases = new THREE.InstancedMesh(baseGeometry, baseMaterial, pads.length);
    this.padBases.receiveShadow = true;
    this.scene.add(this.padBases);
    this.pads = pads.map((pad, index) => {
      const group = new THREE.Group();
      group.position.set(pad.x, 0.025, pad.z);
      this.scene.add(group);
      const radius = pad.big ? 1.35 : 0.76;
      dummy.position.set(pad.x, 0.055, pad.z);
      dummy.scale.set(radius + 0.14, 1, radius + 0.14);
      dummy.updateMatrix();
      this.padBases.setMatrixAt(index, dummy.matrix);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc966, transparent: true, opacity: 0.88 });
      const ring = mesh(new THREE.TorusGeometry(radius, pad.big ? 0.11 : 0.065, 6, 32), ringMat, [0, 0.12, 0], group);
      ring.rotation.x = -Math.PI / 2;
      const disc = mesh(new THREE.CircleGeometry(radius - 0.2, 24), new THREE.MeshBasicMaterial({ color: 0xffb943, transparent: true, opacity: 0.32, depthWrite: false }), [0, 0.107, 0], group);
      disc.rotation.x = -Math.PI / 2;
      const gem = mesh(pad.big ? new THREE.OctahedronGeometry(0.55) : new THREE.SphereGeometry(0.19, 8, 6), material(0xffca68, { emissive: 0xffa52b, emissiveIntensity: 2 }), [0, pad.big ? 0.77 : 0.3, 0], group);
      return { group, ring, disc, gem, big: pad.big };
    });
  }

  buildParticles() {
    this.particleCount = 680;
    this.particleCursor = 0;
    this.particlePosition = new Float32Array(this.particleCount * 3);
    this.particleColor = new Float32Array(this.particleCount * 3);
    this.particleSize = new Float32Array(this.particleCount);
    this.particleAlpha = new Float32Array(this.particleCount);
    this.particleVelocity = new Float32Array(this.particleCount * 3);
    this.particleLife = new Float32Array(this.particleCount);
    this.particleAge = new Float32Array(this.particleCount);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePosition, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.particleColor, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.particleSize, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.particleAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 350 } },
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vColor; varying float vAlpha; uniform float uScale;
        void main(){vColor=aColor;vAlpha=aAlpha;vec4 p=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*p;gl_PointSize=clamp(aSize*uScale/max(1.0,-p.z),1.0,72.0);}`,
      fragmentShader: `varying vec3 vColor; varying float vAlpha;
        void main(){float d=length(gl_PointCoord-vec2(.5))*2.0;if(d>1.0)discard;
        gl_FragColor=vec4(vColor,pow(1.0-d,1.8)*vAlpha);}`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.particleMesh = new THREE.Points(geometry, mat);
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
  }

  emitParticle(position, velocity, color, size = 0.6, life = 0.6) {
    const index = this.particleCursor;
    this.particleCursor = (index + 1) % this.particleCount;
    const offset = index * 3;
    this.particlePosition[offset] = position.x;
    this.particlePosition[offset + 1] = position.y;
    this.particlePosition[offset + 2] = position.z;
    this.particleVelocity[offset] = velocity.x;
    this.particleVelocity[offset + 1] = velocity.y;
    this.particleVelocity[offset + 2] = velocity.z;
    this.particleColor[offset] = color.r;
    this.particleColor[offset + 1] = color.g;
    this.particleColor[offset + 2] = color.b;
    this.particleSize[index] = size;
    this.particleLife[index] = life;
    this.particleAge[index] = 0;
    this.particleAlpha[index] = 1;
  }

  goalBurst(team) {
    const color = new THREE.Color(team === 'blue' ? BLUE : ORANGE);
    const origin = this.ball.position.clone();
    const velocity = new THREE.Vector3();
    for (let i = 0; i < 220; i++) {
      velocity.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(9 + Math.random() * 18);
      this.emitParticle(origin, velocity, color, 0.6 + Math.random() * 1.4, 1.3 + Math.random() * 1.2);
    }
  }

  updateParticles(dt) {
    for (let i = 0; i < this.particleCount; i++) {
      if (this.particleAlpha[i] <= 0) continue;
      this.particleAge[i] += dt;
      if (this.particleAge[i] >= this.particleLife[i]) {
        this.particleAlpha[i] = 0;
        continue;
      }
      const offset = i * 3;
      this.particlePosition[offset] += this.particleVelocity[offset] * dt;
      this.particlePosition[offset + 1] += this.particleVelocity[offset + 1] * dt;
      this.particlePosition[offset + 2] += this.particleVelocity[offset + 2] * dt;
      this.particleVelocity[offset + 1] -= dt * 4;
      this.particleAlpha[i] = 1 - this.particleAge[i] / this.particleLife[i];
    }
    for (const attr of Object.values(this.particleMesh.geometry.attributes)) attr.needsUpdate = true;
  }

  update(state, dt, input = {}) {
    dt = clamp(Number.isFinite(dt) ? dt : 1 / 60, 0, 0.05);
    this.clock += dt;
    const time = Number.isFinite(state.time) ? state.time : this.clock;
    const ids = new Set();
    const particleColor = new THREE.Color(0x59cfff);
    for (const car of state.cars || []) {
      ids.add(car.id);
      const entry = this.cars.get(car.id) || this.createCar(car);
      entry.group.position.set(car.position.x, car.position.y, car.position.z);
      if (car.quaternion) entry.group.quaternion.set(car.quaternion.x, car.quaternion.y, car.quaternion.z, car.quaternion.w);
      for (const wheel of entry.wheels) {
        wheel.spin.rotation.x -= (car.speed || 0) * dt / 0.49;
        wheel.steering.rotation.y = wheel.front ? (car.steering || 0) * 0.42 : 0;
      }
      const boost = !!car.boosting;
      const flameScale = 0.88 + Math.sin(time * 57) * 0.15;
      entry.flames.forEach(flame => { flame.visible = boost; flame.scale.y = flameScale; });
      entry.shadow.position.set(car.position.x, 0.034, car.position.z);
      entry.shadow.material.opacity = clamp(0.72 - (car.position.y - 0.8) * 0.055, 0.06, 0.72);
      this.scratch.copy(FORWARD).applyQuaternion(entry.group.quaternion);
      entry.shadow.rotation.z = Math.atan2(this.scratch.x, -this.scratch.z);
      entry.shadow.scale.setScalar(1 + Math.max(0, car.position.y - 1) * 0.025);
      entry.marker.visible = car.id !== state.playerId;
      entry.marker.position.set(car.position.x, car.position.y + 2.5, car.position.z);
      if (boost) {
        entry.emission += dt * 80;
        this.direction.copy(REAR).applyQuaternion(entry.group.quaternion);
        while (entry.emission >= 1) {
          entry.emission -= 1;
          this.scratch.set((Math.random() - 0.5) * 0.7, -0.04, 2.08).applyQuaternion(entry.group.quaternion).add(entry.group.position);
          const velocity = this.direction.clone().multiplyScalar(8 + Math.random() * 3);
          velocity.y += (Math.random() - 0.5) * 2;
          this.emitParticle(this.scratch, velocity, particleColor, 0.65 + Math.random() * 0.4, 0.32 + Math.random() * 0.22);
        }
      } else entry.emission = 0;
    }
    for (const [id, entry] of this.cars) if (!ids.has(id)) {
      this.scene.remove(entry.group, entry.shadow, entry.marker);
      this.cars.delete(id);
      for (const object of [entry.group, entry.shadow, entry.marker]) object.traverse(child => {
        child.geometry?.dispose();
        if (child.material && !Array.isArray(child.material)) child.material.dispose();
      });
    }
    if (state.ball) {
      const p = state.ball.position;
      this.ball.position.set(p.x, p.y, p.z);
      const q = state.ball.quaternion;
      if (q) this.ball.quaternion.set(q.x, q.y, q.z, q.w);
      this.ballShadow.position.set(p.x, 0.032, p.z);
      this.ballShadow.material.opacity = clamp(0.75 - Math.max(0, p.y - 1.7) * 0.035, 0.12, 0.75);
      this.ballShadow.scale.setScalar(1 + Math.max(0, p.y - 1.7) * 0.045);
      this.ballLocator.position.set(p.x, 0.045, p.z);
      this.ballLocator.visible = p.y > 3.8;
      this.ballLocator.material.opacity = clamp((p.y - 3.8) / 20, 0, 0.5);
    }
    const pads = state.pads || [];
    const signature = pads.map(p => `${p.x},${p.z},${p.big}`).join(';');
    if (signature !== this.padSignature) {
      this.padSignature = signature;
      this.createPads(pads);
    }
    this.pads.forEach((entry, index) => {
      const active = pads[index].active !== false;
      entry.gem.visible = active;
      entry.disc.visible = active;
      entry.ring.material.opacity = active ? 0.84 + Math.sin(time * 3 + index) * 0.12 : 0.12;
      entry.gem.rotation.y = time * 1.5 + index;
      entry.gem.position.y = (entry.big ? 0.75 : 0.28) + Math.sin(time * 3 + index) * (entry.big ? 0.13 : 0.04);
    });
    this.updateParticles(dt);
    this.updateCamera(state, dt, input);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(state, dt, input) {
    const car = (state.cars || []).find(entry => entry.id === state.playerId) || state.cars?.[0];
    if (!car) return;
    const position = new THREE.Vector3(car.position.x, car.position.y, car.position.z);
    if (state.phase === 'menu') {
      // Leave space for the menu at left; the actual playable car stays at right.
      this.cameraDesired.set(position.x - 7 + Math.sin(this.clock * 0.11) * 0.7, 7.2, position.z + 12);
      this.focusDesired.set(position.x - 7, 1.8, position.z - 18);
      if (!this.cameraInitialized) {
        this.camera.position.copy(this.cameraDesired);
        this.cameraTarget.copy(this.focusDesired);
        this.cameraInitialized = true;
      } else {
        this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-dt * 2));
        this.cameraTarget.lerp(this.focusDesired, 1 - Math.exp(-dt * 2));
      }
      this.camera.fov += (61 - this.camera.fov) * (1 - Math.exp(-dt * 3));
      this.camera.lookAt(this.cameraTarget);
      this.camera.updateProjectionMatrix();
      return;
    }
    this.orbitYaw += (input.lookX || 0) * 0.003;
    this.orbitPitch = clamp(this.orbitPitch + (input.lookY || 0) * 0.002, -0.2, 0.8);
    // Mouse orbit returns slowly to the driving direction after the player lets go.
    if (!input.lookX && !input.lookY) {
      this.orbitYaw *= Math.exp(-dt * 1.2);
      this.orbitPitch += (0.18 - this.orbitPitch) * (1 - Math.exp(-dt * 1.5));
    }
    const quaternion = car.quaternion;
    if (quaternion) this.scratchQuaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    else this.scratchQuaternion.identity();
    this.direction.copy(FORWARD).applyQuaternion(this.scratchQuaternion);
    this.direction.y = 0;
    if (this.direction.lengthSq() < 0.08) this.direction.set(0, 0, -1);
    this.direction.normalize();
    if (state.ballCam && state.ball) {
      this.direction.set(state.ball.position.x - position.x, 0, state.ball.position.z - position.z);
      if (this.direction.lengthSq() < 2) this.direction.copy(FORWARD).applyQuaternion(this.scratchQuaternion).setY(0);
      this.direction.normalize();
    }
    this.direction.applyAxisAngle(UP, this.orbitYaw);
    const speed = Math.abs(car.speed || 0);
    const distance = 10.8 + Math.min(speed / 30, 1) * 2.4;
    const height = 4.8 + this.orbitPitch * 6;
    this.cameraDesired.copy(position).addScaledVector(this.direction, -distance);
    this.cameraDesired.y += height;
    // Keep the lens inside containment even when the car drives up a side wall.
    this.cameraDesired.x = clamp(this.cameraDesired.x, -36.3, 36.3);
    this.cameraDesired.z = clamp(this.cameraDesired.z, -54.2, 54.2);
    this.cameraDesired.y = clamp(this.cameraDesired.y, 2.6, 23.7);
    this.focusDesired.copy(position).addScaledVector(this.direction, 4.3);
    this.focusDesired.y = position.y + 1.1;
    if (state.ballCam && state.ball) {
      const ballPosition = new THREE.Vector3(state.ball.position.x, state.ball.position.y, state.ball.position.z);
      const range = position.distanceTo(ballPosition);
      // Close ball camera follows the ball; distant shots preserve the car in view.
      this.focusDesired.lerp(ballPosition, clamp(8 / Math.max(8, range), 0.22, 0.82));
    }
    if (!this.cameraInitialized) {
      this.camera.position.copy(this.cameraDesired);
      this.cameraTarget.copy(this.focusDesired);
      this.cameraInitialized = true;
    } else {
      this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-dt * 7));
      this.cameraTarget.lerp(this.focusDesired, 1 - Math.exp(-dt * 10));
    }
    this.camera.lookAt(this.cameraTarget);
    const wantedFov = 66 + (car.boosting ? 6 : 0) + Math.min(speed / 40, 1) * 3;
    this.camera.fov += (wantedFov - this.camera.fov) * (1 - Math.exp(-dt * 3));
    this.camera.updateProjectionMatrix();
  }

  resetCamera() {
    this.cameraInitialized = false;
    this.orbitYaw = 0;
    this.orbitPitch = 0.18;
  }

  setQuality(value) {
    this.quality = ['low', 'medium', 'high'].includes(value) ? value : 'medium';
    const maximum = this.quality === 'low' ? 1 : this.quality === 'high' ? 1.5 : 1.25;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maximum));
    const shadows = this.quality !== 'low';
    if (shadows !== this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse(object => {
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        for (const mat of mats) if (mat) mat.needsUpdate = true;
      });
    }
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.particleMesh) this.particleMesh.material.uniforms.uScale.value = height * this.renderer.getPixelRatio() * 0.6;
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set([this.shadowTexture]);
    this.scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of mats) if (mat) {
        materials.add(mat);
        for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
    for (const texture of textures) texture.dispose();
    this.renderer.dispose();
  }
}
