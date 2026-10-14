import * as CANNON from 'cannon-es';

export const ARENA = Object.freeze({ width: 76, length: 112, height: 26, goalWidth: 20, goalHeight: 8, goalDepth: 8, ballRadius: 1.7 });
export const FIXED_DT = 1 / 120;
const Y = new CANNON.Vec3(0, 1, 0);
const FORWARD = new CANNON.Vec3(0, 0, -1);
const RIGHT = new CANNON.Vec3(1, 0, 0);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export class ArenaPhysics {
  constructor(onEvent = () => {}) {
    this.onEvent = onEvent;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 12;
    this.world.allowSleep = false;
    this.time = 0;
    this.cars = [];
    this.materials = {
      arena: new CANNON.Material('arena'),
      car: new CANNON.Material('car'),
      ball: new CANNON.Material('ball'),
    };
    const { arena, car, ball } = this.materials;
    // The chassis slides; directional tire grip is applied in controlCar, including powerslides.
    for (const [a, b, friction, restitution] of [[arena, car, 0, 0.05], [arena, ball, 0.18, 0.74], [car, ball, 0.03, 0.72], [car, car, 0.02, 0.2]]) {
      this.world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution, contactEquationStiffness: 1e7, contactEquationRelaxation: 3 }));
    }
    this.buildArena();
    this.ball = new CANNON.Body({ mass: 30, material: ball, shape: new CANNON.Sphere(ARENA.ballRadius), linearDamping: 0.13, angularDamping: 0.2, collisionFilterGroup: 1 });
    this.world.addBody(this.ball);
    this.lastBallSound = -1;
    this.ball.addEventListener('collide', (e) => {
      const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (impact > 1.8 && this.time - this.lastBallSound > 0.07) {
        this.onEvent({ type: 'hit', intensity: clamp(impact / 25, 0.12, 1), ball: true });
        this.lastBallSound = this.time;
      }
    });
    this.pads = [];
    for (const x of [-30, 30]) for (const z of [-44, 0, 44]) this.pads.push({ x, z, big: true, active: true, timer: 0 });
    for (const x of [-20, 0, 20]) for (const z of [-36, -18, 0, 18, 36]) {
      if (x || z) this.pads.push({ x, z, big: false, active: true, timer: 0 });
    }
    this.createCars('duel');
  }

  box(half, position, rotation = null) {
    const body = new CANNON.Body({ mass: 0, material: this.materials.arena, collisionFilterGroup: 4 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(...half)));
    body.position.set(...position);
    if (rotation) body.quaternion.setFromAxisAngle(new CANNON.Vec3(...rotation.axis), rotation.angle);
    this.world.addBody(body);
    return body;
  }

  buildArena() {
    this.box([42, 0.5, 67], [0, -0.5, 0]);
    this.box([39, 0.5, 57], [0, 26.5, 0]);
    for (const sign of [-1, 1]) {
      this.box([0.6, 13, 56.6], [sign * 38.6, 13, 0]);
      // Leave a genuine opening in each end wall: the ball can enter the goal pocket.
      for (const x of [-24.5, 24.5]) this.box([14.5, 13, 0.6], [x, 13, sign * 56.6]);
      this.box([10, 9, 0.6], [0, 17, sign * 56.6]);
      this.box([0.4, 4, 4.4], [-10.4, 4, sign * 60]);
      this.box([0.4, 4, 4.4], [10.4, 4, sign * 60]);
      this.box([10.8, 4, 0.5], [0, 4, sign * 64.5]);
      this.box([10.8, 0.4, 4.4], [0, 8.4, sign * 60]);
      // Closely spaced ramp segments connect the pitch to the walls.
      const segments = 16;
      const radius = 5;
      const increment = Math.PI / (2 * segments);
      for (let i = 0; i < segments; i++) {
        const angle = (i + 0.5) * increment;
        const edge = 33 + radius * Math.sin(angle);
        const height = radius * (1 - Math.cos(angle));
        const halfLength = radius * increment / 2 + 0.025;
        this.box([halfLength, 0.22, 56], [sign * (edge + 0.18 * Math.sin(angle)), height - 0.18 * Math.cos(angle), 0], { axis: [0, 0, 1], angle: sign * angle });
        for (const x of [-25, 25]) {
          const z = 51 + radius * Math.sin(angle);
          this.box([13, 0.22, halfLength], [x, height - 0.18 * Math.cos(angle), sign * (z + 0.18 * Math.sin(angle))], { axis: [1, 0, 0], angle: -sign * angle });
        }
      }
    }
  }

  createCars(mode) {
    for (const car of this.cars) this.world.removeBody(car.body);
    const roster = [{ id: 'player', team: 'blue' }];
    if (mode !== 'training') roster.push({ id: 'rival', team: 'orange' });
    if (mode === 'doubles') roster.push({ id: 'ally', team: 'blue' }, { id: 'rival-2', team: 'orange' });
    this.cars = roster.map(({ id, team }) => {
      const body = new CANNON.Body({ mass: 180, material: this.materials.car, linearDamping: 0.06, angularDamping: 0.6, collisionFilterGroup: 2 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(1.02, 0.44, 1.78)), new CANNON.Vec3(0, 0.22, 0));
      // Rounded tire contacts let the rigid chassis negotiate the curved walls without snagging.
      for (const x of [-0.94, 0.94]) for (const z of [-1.23, 1.23]) {
        body.addShape(new CANNON.Sphere(0.36), new CANNON.Vec3(x, -0.43, z));
      }
      this.world.addBody(body);
      body.addEventListener('collide', (e) => {
        const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (impact > 8 && e.body !== this.ball) this.onEvent({ type: 'hit', intensity: clamp(impact / 40, 0.1, 0.7), ball: false });
      });
      return { id, team, body, boost: 34, boosting: false, grounded: true, jumpCount: 0, lastJump: -10, firstJump: -10, flipUntil: 0, steering: 0, speed: 0, normal: new CANNON.Vec3(0, 1, 0), stuckTime: 0, reverseUntil: 0, botJumpAt: 0 };
    });
    this.resetKickoff();
  }

  resetKickoff() {
    this.ball.position.set(0, ARENA.ballRadius + 0.05, 0);
    this.ball.velocity.setZero();
    this.ball.angularVelocity.setZero();
    this.ball.quaternion.set(0, 0, 0, 1);
    for (const car of this.cars) {
      const side = car.team === 'blue' ? 1 : -1;
      const teammate = this.cars.filter((c) => c.team === car.team).indexOf(car);
      const teamSize = this.cars.filter((c) => c.team === car.team).length;
      car.body.position.set(teamSize > 1 ? (teammate === 0 ? -7 : 7) * side : 0, 0.84, side * (teammate ? 39 : 31));
      car.body.quaternion.setFromAxisAngle(Y, side === 1 ? 0 : Math.PI);
      car.body.velocity.setZero();
      car.body.angularVelocity.setZero();
      car.body.force.setZero();
      car.body.torque.setZero();
      Object.assign(car, { boost: 34, boosting: false, grounded: true, jumpCount: 0, lastJump: -10, firstJump: -10, flipUntil: 0, stuckTime: 0, reverseUntil: 0, speed: 0 });
      car.normal.set(0, 1, 0);
      car.body.wakeUp();
      car.body.aabbNeedsUpdate = true;
    }
    this.ball.aabbNeedsUpdate = true;
    this.ball.wakeUp();
    for (const pad of this.pads) { pad.active = true; pad.timer = 0; }
    this.world.broadphase.dirty = true;
  }

  getPlayer() { return this.cars[0]; }

  surface(car) {
    const body = car.body;
    const up = body.quaternion.vmult(Y);
    const candidates = [up];
    // An overturned car can recover on a jump or gradually settle onto its wheels.
    if (up.y < 0.65) candidates.push(Y);
    let found = null;
    let distance = car.jumpCount > 0 ? 1.42 : 2.15;
    const rayLength = distance;
    for (const direction of candidates) {
      const end = body.position.vsub(direction.scale(rayLength));
      const result = new CANNON.RaycastResult();
      if (this.world.raycastClosest(body.position, end, { collisionFilterMask: 4, skipBackfaces: true }, result) && result.distance < distance) {
        distance = result.distance;
        found = result.hitNormalWorld.clone();
      }
    }
    car.grounded = !!found && this.time - car.lastJump > 0.22;
    if (found) car.normal.copy(found);
  }

  controlCar(car, control = {}, dt) {
    this.surface(car);
    const b = car.body;
    let forward = b.quaternion.vmult(FORWARD);
    const right = b.quaternion.vmult(RIGHT);
    const up = b.quaternion.vmult(Y);
    const throttle = clamp(control.throttle || 0, -1, 1);
    const steer = clamp(control.steer || 0, -1, 1);
    car.steering = steer;
    car.boosting = !!control.boost && car.boost > 0;
    if (control.jumpPressed) {
      if (car.grounded) {
        const verticalSpeed = b.velocity.dot(car.normal);
        b.velocity.vadd(car.normal.scale(9.5 - Math.min(verticalSpeed, 2)), b.velocity);
        car.jumpCount = 1;
        car.firstJump = this.time;
        car.lastJump = this.time;
        car.grounded = false;
        if (up.dot(car.normal) < 0.2) {
          b.angularVelocity.copy(right.scale(6));
          car.flipUntil = this.time + 0.5;
        }
      } else if (car.jumpCount < 2 && this.time - car.firstJump < 1.5 && this.time - car.lastJump > 0.12) {
        car.jumpCount = 2;
        car.lastJump = this.time;
        const hasDirection = Math.abs(throttle) + Math.abs(steer) > 0.2;
        if (hasDirection) {
          const direction = forward.scale(throttle).vadd(right.scale(-steer));
          direction.normalize();
          b.velocity.vadd(direction.scale(11), b.velocity);
          b.velocity.vadd(up.scale(2), b.velocity);
          const flipAxis = right.scale(-throttle).vadd(forward.scale(-steer));
          flipAxis.normalize();
          b.angularVelocity.copy(flipAxis.scale(10.5));
          car.flipUntil = this.time + 0.55;
        } else {
          b.velocity.vadd(up.scale(8.5), b.velocity);
        }
      }
    }
    if (car.grounded) {
      car.jumpCount = 0;
      car.firstJump = this.time;
      const normal = car.normal;
      // Surface alignment and tire grip are driving assists; contacts remain rigid-body physics.
      const alignment = new CANNON.Quaternion();
      alignment.setFromVectors(up, normal);
      const targetRotation = alignment.mult(b.quaternion);
      b.quaternion.slerp(targetRotation, Math.min(1, dt * 28), b.quaternion);
      forward = b.quaternion.vmult(FORWARD);
      forward.vsub(normal.scale(forward.dot(normal)), forward);
      forward.normalize();
      const lateral = forward.cross(normal);
      const longitudinalSpeed = b.velocity.dot(forward);
      const lateralSpeed = b.velocity.dot(lateral);
      const slide = !!control.slide;
      const grip = slide ? 1.1 : 11;
      b.velocity.vsub(lateral.scale(lateralSpeed * Math.min(1, dt * grip)), b.velocity);
      const braking = throttle * longitudinalSpeed < -1;
      const acceleration = braking ? 35 : 21;
      let change = throttle * acceleration * dt;
      const maxSpeed = throttle < 0 ? 16 : 32;
      if (!braking && Math.abs(longitudinalSpeed) > maxSpeed) change = 0;
      if (!throttle && !car.boosting) change -= longitudinalSpeed * dt * 1.1;
      b.velocity.vadd(forward.scale(change), b.velocity);
      const speedFactor = Math.min(1, Math.abs(longitudinalSpeed) / 5);
      const turnRate = (slide ? 2.7 : 1.9) / (1 + Math.abs(longitudinalSpeed) / 65);
      const yaw = steer * turnRate * speedFactor * (longitudinalSpeed < -0.5 ? -1 : 1);
      b.angularVelocity.copy(normal.scale(yaw));
      const rampAdhesion = normal.y > 0.06 && normal.y < 0.98 ? longitudinalSpeed * longitudinalSpeed / 4.5 : 0;
      b.applyForce(normal.scale(-180 * (28 + rampAdhesion)));
    } else if (this.time > car.flipUntil) {
      const pitch = right.scale(-throttle * dt * 5.5);
      const yaw = up.scale(steer * dt * 3.5);
      const roll = forward.scale((control.roll || 0) * dt * 6.5);
      b.angularVelocity.vadd(pitch, b.angularVelocity);
      b.angularVelocity.vadd(yaw, b.angularVelocity);
      b.angularVelocity.vadd(roll, b.angularVelocity);
      const angularSpeed = b.angularVelocity.length();
      if (angularSpeed > 7) b.angularVelocity.scale(7 / angularSpeed, b.angularVelocity);
    }
    if (car.boosting) {
      car.boost = Math.max(0, car.boost - 27 * dt);
      b.applyForce(forward.scale(180 * 32));
    }
    const speed = b.velocity.length();
    if (speed > 52) b.velocity.scale(52 / speed, b.velocity);
    car.speed = speed * 3.6;
    if (!Number.isFinite(b.position.x) || b.position.y < -12 || Math.abs(b.position.x) > 48 || Math.abs(b.position.z) > 75) {
      b.position.set(0, 2, car.team === 'blue' ? 30 : -30);
      b.velocity.setZero();
      b.angularVelocity.setZero();
      b.quaternion.setFromAxisAngle(Y, car.team === 'blue' ? 0 : Math.PI);
    }
  }

  step(dt, controls = {}) {
    this.time += dt;
    for (const car of this.cars) this.controlCar(car, controls[car.id], dt);
    this.world.step(dt);
    const ballSpeed = this.ball.velocity.length();
    if (ballSpeed > 68) this.ball.velocity.scale(68 / ballSpeed, this.ball.velocity);
    for (const pad of this.pads) {
      if (!pad.active) {
        pad.timer -= dt;
        if (pad.timer <= 0) pad.active = true;
      }
      if (!pad.active) continue;
      for (const car of this.cars) {
        const p = car.body.position;
        if (car.boost < 99.5 && p.y < 2.4 && Math.hypot(p.x - pad.x, p.z - pad.z) < (pad.big ? 2.6 : 2)) {
          car.boost = pad.big ? 100 : Math.min(100, car.boost + 12);
          pad.active = false;
          pad.timer = pad.big ? 10 : 4;
          if (car.id === 'player') this.onEvent({ type: 'pad', big: pad.big });
          break;
        }
      }
    }
    if (this.ball.position.y < -15 || !Number.isFinite(this.ball.position.y)) {
      this.ball.position.set(0, 3, 0);
      this.ball.velocity.setZero();
    }
  }

  detectGoal() {
    const p = this.ball.position;
    const r = ARENA.ballRadius;
    if (Math.abs(p.z) > 56 + r && Math.abs(p.x) + r <= 10.03 && p.y + r <= 8.03 && p.y >= 0) return p.z < 0 ? 'blue' : 'orange';
    return null;
  }

  snapshot() {
    return {
      cars: this.cars.map((c) => ({ id: c.id, team: c.team, position: c.body.position, quaternion: c.body.quaternion, speed: c.speed, boosting: c.boosting, steering: c.steering, grounded: c.grounded })),
      ball: { position: this.ball.position, quaternion: this.ball.quaternion },
      pads: this.pads,
      playerId: 'player',
      time: this.time,
    };
  }
}

export function botControls(physics, car, difficulty = 'normal') {
  const now = physics.time;
  const ball = physics.ball;
  const b = car.body;
  const skill = { easy: 0.6, normal: 0.85, hard: 1 }[difficulty] || 0.85;
  const attackSign = car.team === 'blue' ? -1 : 1;
  const homeZ = -attackSign * 48;
  const enemyZ = attackSign * 56;
  const prediction = difficulty === 'hard' ? 0.32 : difficulty === 'normal' ? 0.16 : 0.05;
  const bx = clamp(ball.position.x + ball.velocity.x * prediction, -32, 32);
  const bz = clamp(ball.position.z + ball.velocity.z * prediction, -51, 51);
  const distanceToBall = Math.hypot(b.position.x - bx, b.position.z - bz);
  const teammates = physics.cars.filter((c) => c.team === car.team && c !== car);
  const support = teammates.some((c) => Math.hypot(c.body.position.x - bx, c.body.position.z - bz) + 5 < distanceToBall);
  let targetX, targetZ;
  if (support) {
    targetX = bx * 0.5;
    targetZ = clamp(bz - attackSign * 18, -46, 46);
  } else {
    // Approach from behind the ball, then follow through toward the opponent's goal.
    const dx = -bx;
    const dz = enemyZ - bz;
    const length = Math.hypot(dx, dz);
    const shotX = dx / length;
    const shotZ = dz / length;
    const behind = (b.position.x - bx) * shotX + (b.position.z - bz) * shotZ;
    const offset = Math.abs((b.position.x - bx) * shotZ - (b.position.z - bz) * shotX);
    const follow = behind < 1.5 && offset < 4.5;
    targetX = bx + shotX * (follow ? 4 : -5);
    targetZ = bz + shotZ * (follow ? 4 : -5);
    if (bz * attackSign < -35 && distanceToBall > 25) {
      targetX = clamp(bx * 0.7, -8, 8);
      targetZ = homeZ;
    }
  }
  const forward = b.quaternion.vmult(FORWARD);
  const tx = targetX - b.position.x;
  const tz = targetZ - b.position.z;
  const distance = Math.max(0.01, Math.hypot(tx, tz));
  const dot = (forward.x * tx + forward.z * tz) / distance;
  const cross = (forward.z * tx - forward.x * tz) / distance;
  const angle = Math.atan2(cross, dot);
  let steer = clamp(angle * 2.6, -1, 1);
  let throttle = (Math.abs(angle) > 1.8 ? 0.5 : 1) * skill;
  if (car.speed < 7 && car.grounded) car.stuckTime += FIXED_DT;
  else car.stuckTime = 0;
  if (car.stuckTime > 1.8) {
    car.reverseUntil = now + 0.8;
    car.stuckTime = 0;
  }
  if (now < car.reverseUntil) { throttle = -0.8; steer *= -1; }
  const boost = difficulty !== 'easy' && dot > 0.94 && distance > 16 && car.boost > 8 && now >= car.reverseUntil;
  let jumpPressed = false;
  if (difficulty !== 'easy' && car.grounded && ball.position.y > 2.7 && ball.position.y < 7 && distanceToBall < 6 && dot > 0.7 && now > car.botJumpAt) {
    jumpPressed = true;
    car.botJumpAt = now + 1.8;
  }
  return { throttle, steer, boost, slide: Math.abs(angle) > 0.85 && car.speed > 40, jumpPressed, roll: 0 };
}
