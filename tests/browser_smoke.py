#!/usr/bin/env python3
"""Browser integration checks for the Vite development server.

Run after ``npm run dev -- --host 127.0.0.1``:
    python tests/browser_smoke.py [http://127.0.0.1:5173]

Requires the Python Playwright package and Chromium. The development-only
inspection API seeds match scenarios; keyboard movement and scoring then use
the application's own animation loop and physics, without mocked updates.
"""

from pathlib import Path
import json
import os
import sys

from playwright.sync_api import sync_playwright


URL = sys.argv[1] if len(sys.argv) > 1 else os.getenv("GAME_TEST_URL", "http://127.0.0.1:5173")
CHROMIUM = os.getenv("CHROMIUM_PATH", "/usr/bin/chromium")
RESULTS = Path(__file__).resolve().parent.parent / "test-results"
DEBUG = "window.apexDebug"


def main():
    RESULTS.mkdir(exist_ok=True)
    errors = []
    bad_responses = []
    failed_requests = []
    checks = []

    def checked(name, detail=None):
        checks.append(name)
        print(f"PASS {name}" + (f": {json.dumps(detail, ensure_ascii=False)}" if detail is not None else ""), flush=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=CHROMIUM,
            headless=True,
            args=["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
        )
        context = browser.new_context(viewport={"width": 800, "height": 600}, device_scale_factor=1)
        page = context.new_page()
        page.set_default_timeout(45_000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.on("response", lambda response: bad_responses.append({"url": response.url, "status": response.status}) if response.status >= 400 else None)
        page.on("requestfailed", lambda request: failed_requests.append({"url": request.url, "failure": request.failure}))

        def wait(expression):
            page.wait_for_function(expression, timeout=45_000, polling="raf")

        def state():
            return page.evaluate(f"{DEBUG}.getState()")

        def player():
            return page.evaluate(f"""() => {{
                const c = {DEBUG}.physics.getPlayer();
                const p = c.body.position;
                return {{ x:p.x, y:p.y, z:p.z, speed:c.speed, boost:c.boost,
                  grounded:c.grounded, jumps:c.jumpCount, time:{DEBUG}.physics.time,
                  angularSpeed:c.body.angularVelocity.length() }};
            }}""")

        def frames(count=6):
            page.evaluate("""count => new Promise(resolve => {
                function next() { if (--count <= 0) resolve(); else requestAnimationFrame(next); }
                requestAnimationFrame(next);
            })""", count)

        def ready():
            wait(f"!!{DEBUG}")
            page.evaluate(f"{DEBUG}.scene.setQuality('low')")
            wait("!document.getElementById('menu-view').classList.contains('hidden')")
            # Changing shadow settings compiles new shaders. Warm those renders
            # before timing matches, particularly on CPU-backed SwiftShader.
            frames(3)

        def phase(value):
            wait(f"{DEBUG}.match.phase === {json.dumps(value)}")

        def key_alias(event_type):
            # French AZERTY: browser reports the letter Z at physical KeyW.
            page.evaluate("""type => window.dispatchEvent(new KeyboardEvent(type,
                {key:'z', code:'KeyW', bubbles:true, cancelable:true}))""", event_type)

        def teleport_ball(z):
            page.evaluate(f"""z => {{ const p={DEBUG}.physics; p.ball.position.set(0,2,z);
                p.ball.velocity.setZero(); p.ball.angularVelocity.setZero();
                p.ball.aabbNeedsUpdate=true; p.ball.wakeUp(); p.world.broadphase.dirty=true; }}""", z)

        try:
            page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
            ready()
            assert page.title().startswith("APEX DRIVE")
            assert page.locator("[data-mode]").count() == 3
            assert page.locator("[data-difficulty]").count() == 3
            for difficulty in ("easy", "hard", "normal"):
                page.locator(f'[data-difficulty="{difficulty}"]').click()
                assert page.locator(f'[data-difficulty="{difficulty}"]').get_attribute("aria-pressed") == "true"
            page.screenshot(path=str(RESULTS / "menu.png"))
            checked("3D menu, three modes and three difficulties")

            page.locator("#menu-controls").click()
            page.locator("#pause-view").wait_for(state="visible")
            assert page.locator(".binding-button").count() == 11
            assert page.locator(".binding-button").first.inner_text() == "Z"
            page.locator("#quality-select").select_option("low")
            assert page.evaluate(f"{DEBUG}.scene.quality") == "low"
            page.locator("#close-pause").click()
            page.locator("[data-mode=training]").click()
            assert page.locator("#difficulty-row").evaluate("el => getComputedStyle(el).visibility") == "hidden"
            assert "SANS LIMITE" in page.locator("#match-details").inner_text()
            page.locator("#play-button").click()
            phase("playing")
            wait("document.getElementById('timer').textContent === 'LIBRE'")
            assert page.evaluate(f"{DEBUG}.physics.cars.length") == 1
            checked("unlimited training, control list and visual quality settings")

            before = player()
            key_alias("keydown")
            wait(f"{DEBUG}.physics.getPlayer().body.position.z < {before['z'] - 0.8}")
            driven = player()
            assert driven["speed"] > 5
            assert page.evaluate(f"{DEBUG}.input.keys.has('KeyZ')")
            key_alias("keyup")
            checked("AZERTY letter Z at physical KeyW drives forward", {"distance": round(before["z"] - driven["z"], 2), "speed": round(driven["speed"], 2)})

            boost_before = player()["boost"]
            page.keyboard.down("z")
            page.keyboard.down("Shift")
            wait(f"{DEBUG}.physics.getPlayer().boost < {boost_before - 5}")
            boosted = player()
            assert page.evaluate(f"{DEBUG}.physics.getPlayer().boosting")
            assert boosted["speed"] > driven["speed"]
            page.keyboard.up("Shift")
            page.keyboard.up("z")
            checked("held boost consumes charge and accelerates", {"boost": round(boosted["boost"], 2), "speed": round(boosted["speed"], 2)})

            page.evaluate(f"{DEBUG}.physics.resetKickoff()")
            wait(f"{DEBUG}.physics.getPlayer().grounded")
            page.keyboard.press("Space")
            wait(f"{DEBUG}.physics.getPlayer().jumpCount === 1 && {DEBUG}.physics.getPlayer().body.position.y > 1.3")
            wait(f"{DEBUG}.physics.time - {DEBUG}.physics.getPlayer().firstJump > 0.15")
            page.keyboard.down("z")
            page.keyboard.press("Space")
            wait(f"{DEBUG}.physics.getPlayer().jumpCount === 2 && {DEBUG}.physics.getPlayer().body.angularVelocity.length() > 6")
            flipped = player()
            assert flipped["y"] > 1.3
            page.keyboard.up("z")
            checked("jump and directional second-jump flip", {"height": round(flipped["y"], 2), "rotation": round(flipped["angularSpeed"], 2)})

            was_ball_cam = state()["ballCam"]
            page.keyboard.press("c")
            wait(f"{DEBUG}.getState().ballCam === {str(not was_ball_cam).lower()}")
            wait("document.getElementById('ballcam-toggle').getAttribute('aria-pressed') === 'true'")
            page.keyboard.press("c")
            wait(f"{DEBUG}.getState().ballCam === {str(was_ball_cam).lower()}")
            checked("keyboard toggles ball camera and HUD indicator")

            page.keyboard.press("Escape")
            phase("paused")
            page.locator("#pause-view").wait_for(state="visible")
            paused = player()
            frames()
            assert player()["time"] == paused["time"], "Paused training advanced physics"
            page.locator(".binding-button").first.click()
            page.keyboard.press("w")
            assert page.locator(".binding-button").first.inner_text() == "W"
            assert page.evaluate(f"{DEBUG}.input.bindings.forward") == "KeyW"
            assert page.evaluate("JSON.parse(localStorage.getItem('apex-drive-bindings')).forward") == "KeyW"
            page.evaluate(f"{DEBUG}.physics.resetKickoff()")
            page.locator("#resume-button").click()
            phase("playing")
            before = player()
            page.keyboard.down("w")
            wait(f"{DEBUG}.physics.getPlayer().body.position.z < {before['z'] - 0.8}")
            page.keyboard.up("w")
            page.screenshot(path=str(RESULTS / "training.png"))
            checked("pause freezes physics, UI rebinding enables W driving")

            page.reload(wait_until="domcontentloaded")
            ready()
            assert page.evaluate(f"{DEBUG}.input.bindings.forward") == "KeyW"
            assert page.locator('[data-binding="forward"]').first.inner_text() == "W"
            page.locator("[data-difficulty=easy]").click()
            # Record every rendered label so a short GO does not disappear
            # between separate synchronous browser round-trips.
            page.evaluate("""() => {
                window.__qaCountdown = [];
                const text = document.getElementById('countdown-text');
                const capture = () => {
                    if (!document.getElementById('countdown').classList.contains('hidden'))
                        window.__qaCountdown.push(text.textContent);
                };
                new MutationObserver(capture).observe(document.getElementById('countdown'),
                    {subtree:true, childList:true, characterData:true, attributes:true});
            }""")
            page.locator("#play-button").click()
            phase("countdown")
            assert page.evaluate(f"{DEBUG}.match.mode") == "duel"
            assert page.evaluate(f"{DEBUG}.physics.cars.length") == 2
            # Observe the real three-second countdown rather than adding time
            # manually on top of the application's wall-clock updates.
            phase("playing")
            wait("window.__qaCountdown.includes('GO !')")
            assert all(label in page.evaluate("window.__qaCountdown") for label in ("3", "2", "1", "GO !"))
            assert 295 < state()["remaining"] <= 300
            rival_start = page.evaluate(f"{DEBUG}.physics.cars.find(c => c.id === 'rival').body.position.z")
            wait(f"{DEBUG}.physics.cars.find(c => c.id === 'rival').body.position.z > {rival_start + 0.7}")
            checked("binding survives reload; duel countdown and active opponent")

            page.keyboard.press("Escape")
            phase("paused")
            paused_time = state()["remaining"]
            physics_time = player()["time"]
            frames(8)
            assert state()["remaining"] == paused_time, "Paused match clock advanced"
            assert player()["time"] == physics_time, "Paused match physics advanced"
            page.keyboard.press("Escape")
            phase("playing")
            wait(f"{DEBUG}.match.remaining < {paused_time - 0.05}")
            before = player()
            page.keyboard.down("w")
            wait(f"{DEBUG}.physics.getPlayer().body.position.z < {before['z'] - 0.5}")
            page.keyboard.up("w")
            checked("pause freezes clock; Escape resumes; saved W binding drives after reload")

            teleport_ball(-56.5)
            frames(2)
            assert state()["scores"] == {"blue": 0, "orange": 0}, "Goal counted before whole ball crossed line"
            teleport_ball(-58)
            phase("goal")
            wait("document.getElementById('score-blue').textContent === '1'")
            page.locator("#goal-overlay").wait_for(state="visible")
            assert state()["scores"] == {"blue": 1, "orange": 0}
            page.screenshot(path=str(RESULTS / "goal.png"))
            page.evaluate(f"{DEBUG}.match.update(3.3)")
            phase("countdown")
            assert page.evaluate(f"Math.abs({DEBUG}.physics.ball.position.z)") < 0.01
            assert abs(player()["z"] - 31) < 0.1
            page.evaluate(f"{DEBUG}.match.update(3.1)")
            phase("playing")
            checked("whole-ball goal detection, scoreboard, goal overlay and centre kickoff")

            page.evaluate(f"""() => {{ const m={DEBUG}.match; m.scores={{blue:1,orange:1}};
                m.remaining=0.001; m.update(0.01); }}""")
            phase("countdown")
            assert page.evaluate(f"{DEBUG}.match.overtime")
            wait("!document.getElementById('overtime-label').classList.contains('hidden')")
            page.evaluate(f"{DEBUG}.match.update(3.1)")
            phase("playing")
            teleport_ball(-58)
            phase("goal")
            page.evaluate(f"{DEBUG}.match.update(3.3)")
            phase("finished")
            page.locator("#finished-view").wait_for(state="visible")
            assert page.locator("#finish-title").inner_text() == "VICTOIRE."
            assert page.locator("#finish-blue").inner_text() == "2"
            assert page.locator("#finish-orange").inner_text() == "1"
            checked("tied regulation enters overtime and golden goal displays victory")

            page.locator("#finish-restart").click()
            phase("countdown")
            assert state()["scores"] == {"blue": 0, "orange": 0}
            assert state()["remaining"] == 300
            assert not page.evaluate(f"{DEBUG}.match.overtime")
            page.keyboard.press("Escape")
            phase("paused")
            page.locator("#back-menu-button").click()
            phase("menu")
            page.locator("[data-mode=doubles]").click()
            page.locator("[data-difficulty=hard]").click()
            page.locator("#play-button").click()
            phase("countdown")
            roster = page.evaluate(f"{DEBUG}.physics.cars.map(c => ({{id:c.id,team:c.team}}))")
            assert len(roster) == 4
            assert [c["team"] for c in roster].count("blue") == 2
            assert [c["team"] for c in roster].count("orange") == 2
            assert page.evaluate(f"{DEBUG}.match.difficulty") == "hard"
            page.evaluate(f"{DEBUG}.match.update(3.1)")
            phase("playing")
            wait("document.getElementById('hud-mode').textContent === 'ÉQUIPE · 2V2'")
            frames(3)
            page.screenshot(path=str(RESULTS / "doubles.png"))
            page.evaluate(f"""() => {{ const m={DEBUG}.match; m.scores={{blue:0,orange:1}};
                m.remaining=0.001; m.update(0.01); }}""")
            phase("finished")
            wait("document.getElementById('finish-title').textContent === 'DÉFAITE.'")
            page.locator("#finish-menu").click()
            phase("menu")
            checked("restart resets match, 2v2 has four cars and defeat returns to menu", roster)

            assert not errors, f"Browser errors: {errors}"
            assert not bad_responses, f"HTTP failures: {bad_responses}"
            assert not failed_requests, f"Request failures: {failed_requests}"
            checked("no JavaScript console errors, uncaught exceptions or failed resource requests")
            print(f"Completed {len(checks)} browser integration checks. Screenshots: {RESULTS}", flush=True)
        except Exception:
            try:
                print("FAIL state:", json.dumps(state(), ensure_ascii=False), flush=True)
                print("FAIL player:", json.dumps(player(), ensure_ascii=False), flush=True)
                print("FAIL browser errors:", json.dumps(errors, ensure_ascii=False), flush=True)
                page.screenshot(path=str(RESULTS / "failure.png"), timeout=15_000)
            except Exception as diagnostic_error:
                print(f"Failure diagnostics unavailable: {diagnostic_error}", flush=True)
            raise
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
