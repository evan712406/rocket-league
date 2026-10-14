import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, ArenaPhysics, FIXED_DT, botControls } from '../src/physics.js';

function training() {
  const physics = new ArenaPhysics();
  physics.createCars('training');
  // Driving comparisons deliberately exclude boost pickups and other cars.
  physics.pads = [];
  const car = physics.getPlayer();
  car.body.position.set(-12, 0.84, 25);
  return { physics, car };
}

function run(physics, seconds, control = {}, observe = () => {}) {
  for (let i = 0; i < Math.ceil(seconds / FIXED_DT); i++) {
    physics.step(FIXED_DT, { player: control });
    observe();
  }
}

function finite(body) {
  for (const vector of [body.position, body.velocity, body.angularVelocity]) {
    assert.ok([vector.x, vector.y, vector.z].every(Number.isFinite));
  }
}

test('forward acceleration, coasting and braking produce distinct motion', () => {
  const { physics, car } = training();
  run(physics, 0.4, { throttle: 1 });
  const earlySpeed = -car.body.velocity.z;
  run(physics, 0.6, { throttle: 1 });
  const fastSpeed = -car.body.velocity.z;
  assert.ok(earlySpeed > 3 && fastSpeed > earlySpeed + 6);
  assert.ok(car.body.position.z < 20);
  run(physics, 0.3);
  const coastSpeed = -car.body.velocity.z;
  assert.ok(coastSpeed > 0 && coastSpeed < fastSpeed);
  run(physics, 0.3, { throttle: -1 });
  assert.ok(-car.body.velocity.z < coastSpeed - 5);
  finite(car.body);
});

test('reverse moves away from kickoff without accelerating to forward speed', () => {
  const { physics, car } = training();
  run(physics, 1.3, { throttle: -1 });
  assert.ok(car.body.position.z > 34);
  assert.ok(car.body.velocity.z > 10 && car.body.velocity.z < 18);
});

test('boost uses reserve and increases speed without pad assistance', () => {
  const normal = training();
  const boosted = training();
  run(normal.physics, 1, { throttle: 1 });
  run(boosted.physics, 1, { throttle: 1, boost: true });
  assert.ok(boosted.car.body.velocity.length() > normal.car.body.velocity.length() + 15);
  assert.ok(boosted.car.boost > 5 && boosted.car.boost < 9);
  assert.equal(normal.car.boost, 34);
  run(boosted.physics, 0.4, { boost: true });
  assert.equal(boosted.car.boost, 0);
  boosted.physics.step(FIXED_DT, { player: { boost: true } });
  assert.equal(boosted.car.boosting, false);
});

test('steering turns the car and powerslide retains more lateral momentum', () => {
  const gripped = training();
  const sliding = training();
  for (const { car } of [gripped, sliding]) car.body.velocity.set(10, 0, -15);
  run(gripped.physics, 0.2, { throttle: 1 });
  run(sliding.physics, 0.2, { throttle: 1, slide: true });
  assert.ok(sliding.car.body.velocity.x > gripped.car.body.velocity.x + 4);
  run(gripped.physics, 0.5, { throttle: 1, steer: 1 });
  assert.ok(Math.abs(gripped.car.body.quaternion.y) > 0.15);
  assert.ok(Math.abs(gripped.car.body.position.x + 12) > 1);
});

test('first jump leaves the ground and an undirected second jump adds lift', () => {
  const { physics, car } = training();
  run(physics, 0.1);
  const groundHeight = car.body.position.y;
  physics.step(FIXED_DT, { player: { jumpPressed: true } });
  assert.equal(car.jumpCount, 1);
  assert.equal(car.grounded, false);
  assert.ok(car.body.velocity.y > 8);
  run(physics, 0.2);
  const before = car.body.velocity.y;
  physics.step(FIXED_DT, { player: { jumpPressed: true } });
  assert.equal(car.jumpCount, 2);
  assert.ok(car.body.velocity.y > before + 7);
  assert.ok(car.body.position.y > groundHeight + 1);
  run(physics, 0.15);
  physics.step(FIXED_DT, { player: { jumpPressed: true } });
  assert.equal(car.jumpCount, 2, 'a third jump is unavailable before landing');
});

test('forward and lateral flips add a directional impulse and rotate in air', () => {
  for (const control of [{ throttle: 1 }, { throttle: -1 }, { steer: 1 }, { steer: -1 }]) {
    const { physics, car } = training();
    physics.step(FIXED_DT, { player: { jumpPressed: true } });
    run(physics, 0.2);
    physics.step(FIXED_DT, { player: { ...control, jumpPressed: true } });
    assert.equal(car.jumpCount, 2);
    assert.ok(car.body.angularVelocity.length() > 9);
    if (control.throttle) assert.ok(-car.body.velocity.z * control.throttle > 9);
    else assert.ok(-car.body.velocity.x * control.steer > 9);
    run(physics, 0.2);
    assert.ok(Math.hypot(car.body.quaternion.x, car.body.quaternion.z) > 0.5);
    finite(car.body);
  }
});

test('air boost gains altitude when pitched upwards and air controls rotate', () => {
  const { physics, car } = training();
  car.body.position.set(-12, 8, 25);
  car.body.quaternion.setFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
  run(physics, 0.5, { boost: true });
  assert.ok(car.body.position.y > 9);
  assert.ok(car.body.velocity.y > 5);
  run(physics, 0.25, { throttle: 0.5, steer: 0.5, roll: 1 });
  assert.ok(car.body.angularVelocity.length() > 1);
  finite(car.body);
});

test('high speed landing is contained and restores grounded jumping', () => {
  const { physics, car } = training();
  car.body.position.set(-12, 10, 25);
  car.body.velocity.set(0, -45, 0);
  let lowest = Infinity;
  run(physics, 1.2, {}, () => { lowest = Math.min(lowest, car.body.position.y); });
  assert.ok(lowest > 0.2, 'the chassis must not tunnel below the pitch');
  assert.ok(car.body.position.y > 0.6 && car.body.position.y < 1.1);
  assert.equal(car.grounded, true);
  physics.step(FIXED_DT, { player: { jumpPressed: true } });
  assert.ok(car.body.velocity.y > 8);
});

test('the rounded ramp supports wall driving and jumping away from the wall', () => {
  const { physics, car } = training();
  car.body.position.set(0, 0.84, 20);
  car.body.quaternion.setFromAxisAngle({ x: 0, y: 1, z: 0 }, -Math.PI / 2);
  let reachedWall = false;
  for (let i = 0; i < 600; i++) {
    physics.step(FIXED_DT, { player: { throttle: 1 } });
    assert.ok(Math.abs(car.body.position.x) < ARENA.width / 2 + 0.2);
    assert.ok(car.body.position.y > 0.2 && car.body.position.y < ARENA.height);
    if (car.grounded && car.body.position.y > 10 && car.normal.x < -0.8) {
      reachedWall = true;
      const previousXSpeed = car.body.velocity.x;
      physics.step(FIXED_DT, { player: { jumpPressed: true } });
      assert.equal(car.grounded, false);
      assert.ok(car.body.velocity.x < previousXSpeed - 7);
      break;
    }
  }
  assert.equal(reachedWall, true, 'the car reaches the vertical wall while attached');
});

test('ball rebounds from pitch and side containment without escaping', () => {
  for (const side of [false, true]) {
    const { physics } = training();
    physics.ball.position.set(side ? 34 : 0, side ? 3 : 8, 0);
    physics.ball.velocity.set(side ? 40 : 0, side ? 0 : -30, 0);
    let rebounded = false;
    run(physics, 1, {}, () => {
      const body = physics.ball;
      assert.ok(body.position.y > ARENA.ballRadius - 0.35);
      assert.ok(body.position.y < ARENA.height - ARENA.ballRadius + 0.3);
      assert.ok(Math.abs(body.position.x) < ARENA.width / 2 - ARENA.ballRadius + 0.3);
      if (side ? body.velocity.x < -5 : body.velocity.y > 5) rebounded = true;
      finite(body);
    });
    assert.equal(rebounded, true);
  }
});

test('the car transfers momentum to the ball in a physical shot', () => {
  const { physics, car } = training();
  car.body.position.set(0, 0.84, 8);
  run(physics, 0.8, { throttle: 1, boost: true });
  assert.ok(physics.ball.position.z < -5);
  assert.ok(physics.ball.velocity.z < -15);
  finite(physics.ball);
});

test('posts and crossbar rebound the ball rather than register a goal', () => {
  for (const [x, y] of [[9.8, 3], [0, 8.8]]) {
    const { physics } = training();
    physics.ball.position.set(x, y, 53);
    physics.ball.velocity.set(0, 0, 30);
    let rebound = false;
    run(physics, 0.7, {}, () => {
      if (physics.ball.velocity.z < -5) rebound = true;
      assert.equal(physics.detectGoal(), null);
      assert.ok(physics.ball.position.z < 56);
    });
    assert.equal(rebound, true);
  }
});

test('goal detection requires the entire ball to cross inside the opening', () => {
  const { physics } = training();
  for (const sign of [-1, 1]) {
    physics.ball.position.set(0, 3, sign * (ARENA.length / 2 + ARENA.ballRadius - 0.01));
    assert.equal(physics.detectGoal(), null);
    physics.ball.position.z += sign * 0.03;
    assert.equal(physics.detectGoal(), sign < 0 ? 'blue' : 'orange');
    physics.ball.position.x = ARENA.goalWidth / 2 - ARENA.ballRadius + 0.2;
    assert.equal(physics.detectGoal(), null, 'ball overlaps a post');
    physics.ball.position.x = 0;
    physics.ball.position.y = ARENA.goalHeight - ARENA.ballRadius + 0.2;
    assert.equal(physics.detectGoal(), null, 'ball overlaps the crossbar');
  }
});

test('a shot passes through the open goal mouth and is scored', () => {
  const { physics } = training();
  physics.ball.position.set(0, 3, -50);
  physics.ball.velocity.set(0, 0, -25);
  let goal = null;
  run(physics, 0.8, {}, () => { goal ||= physics.detectGoal(); });
  assert.equal(goal, 'blue');
});

test('small and large boost pads recharge, deactivate and respawn', () => {
  for (const big of [false, true]) {
    const events = [];
    const physics = new ArenaPhysics((event) => events.push(event));
    physics.createCars('training');
    const car = physics.getPlayer();
    const pad = physics.pads.find((item) => item.big === big);
    car.boost = 0;
    car.body.position.set(pad.x, 0.84, pad.z);
    physics.step(FIXED_DT);
    assert.equal(car.boost, big ? 100 : 12);
    assert.equal(pad.active, false);
    assert.ok(events.some((event) => event.type === 'pad' && event.big === big));
    car.body.position.set(-12, 0.84, 25);
    run(physics, 1);
    assert.equal(pad.active, false);
    run(physics, big ? 9.2 : 3.2);
    assert.equal(pad.active, true);
    car.boost = 0;
    car.body.position.set(pad.x, 0.84, pad.z);
    physics.step(FIXED_DT);
    assert.equal(car.boost, big ? 100 : 12);
    assert.equal(pad.active, false);
  }
});

test('kickoff restores ball, cars and pads after a chaotic play', () => {
  const physics = new ArenaPhysics();
  const car = physics.getPlayer();
  car.body.position.set(20, 8, 12);
  car.body.velocity.set(15, 8, -20);
  car.body.angularVelocity.set(4, 2, 8);
  car.boost = 0;
  car.jumpCount = 2;
  physics.ball.position.set(5, 12, 30);
  physics.ball.velocity.set(10, 5, -40);
  physics.pads[0].active = false;
  physics.pads[0].timer = 8;
  physics.resetKickoff();
  assert.equal(car.body.position.x, 0);
  assert.equal(car.body.position.z, 31);
  assert.equal(car.body.velocity.length(), 0);
  assert.equal(car.body.angularVelocity.length(), 0);
  assert.equal(car.boost, 34);
  assert.equal(car.jumpCount, 0);
  assert.equal(physics.ball.position.x, 0);
  assert.equal(physics.ball.position.z, 0);
  assert.equal(physics.ball.velocity.length(), 0);
  assert.ok(physics.pads.every((pad) => pad.active && pad.timer === 0));
});

test('duel, doubles and free training create the intended team rosters', () => {
  const physics = new ArenaPhysics();
  assert.equal(physics.cars.length, 2);
  physics.createCars('doubles');
  assert.equal(physics.cars.length, 4);
  assert.equal(physics.cars.filter((car) => car.team === 'blue').length, 2);
  assert.equal(physics.cars.filter((car) => car.team === 'orange').length, 2);
  assert.equal(new Set(physics.cars.map((car) => car.id)).size, 4);
  physics.createCars('training');
  assert.deepEqual(physics.cars.map((car) => car.id), ['player']);
});

test('all bot difficulties approach the ball and hard bots use boost', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const physics = new ArenaPhysics();
    const car = physics.cars.find((item) => item.id === 'rival');
    const initialDistance = car.body.position.distanceTo(physics.ball.position);
    const control = botControls(physics, car, difficulty);
    assert.ok(control.throttle > 0);
    assert.ok(Number.isFinite(control.steer));
    assert.equal(control.boost, difficulty !== 'easy');
    for (let i = 0; i < 80; i++) physics.step(FIXED_DT, { rival: botControls(physics, car, difficulty) });
    assert.ok(car.body.position.distanceTo(physics.ball.position) < initialDistance - 2);
    assert.ok(car.body.velocity.length() > 5);
    finite(car.body);
  }
});
