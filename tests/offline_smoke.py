#!/usr/bin/env python3
"""Play the standalone HTML over file:// with networking disabled.

Usage: python tests/offline_smoke.py [index.html] [--content-only]
Tests both the requested file and a copy of that file alone in a temporary
directory. Requires Python Playwright and Chromium; no game debug API is used.
If managed Chromium policy blocks file://, --content-only validates the same
HTML bytes using set_content with networking disabled. This explicit fallback
does not claim to validate file:// navigation.
"""

from pathlib import Path
import os
import shutil
import sys
import tempfile
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent.parent
ARGUMENTS = sys.argv[1:]
CONTENT_ONLY = "--content-only" in ARGUMENTS
FILES = [argument for argument in ARGUMENTS if argument != "--content-only"]
HTML = Path(FILES[0]).resolve() if FILES else ROOT / "index.html"
CHROMIUM = os.getenv("CHROMIUM_PATH", "/usr/bin/chromium")
RESULTS = ROOT / "test-results"


def test_file(browser, html, label):
    errors = []
    failures = []
    requests = []
    url = html.as_uri()
    context = browser.new_context(
        viewport={"width": 800, "height": 600}, device_scale_factor=1, offline=True,
    )
    # Count real WebGL draw calls rather than inferring 3D from canvas markup.
    context.add_init_script("""(() => {
        window.__qaWebGLDraws = 0;
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
            const gl = getContext.call(this, kind, ...args);
            if (gl && (kind === 'webgl' || kind === 'webgl2') && !gl.__qaCounted) {
                gl.__qaCounted = true;
                for (const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
                    if (typeof gl[method] !== 'function') continue;
                    const draw = gl[method].bind(gl);
                    gl[method] = (...parameters) => { window.__qaWebGLDraws++; return draw(...parameters); };
                }
            }
            return gl;
        };
    })();""")
    page = context.new_page()
    page.set_default_timeout(45_000)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("requestfailed", lambda request: failures.append(f"{request.failure} {request.url}"))
    page.on("response", lambda response: failures.append(f"{response.status} {response.url}") if response.status >= 400 else None)
    page.on("request", lambda request: requests.append(request.url))

    def wait(expression):
        page.wait_for_function(expression, timeout=45_000, polling="raf")

    def frames(count=6):
        page.evaluate("""count => new Promise(resolve => {
            function next() { if (--count <= 0) resolve(); else requestAnimationFrame(next); }
            requestAnimationFrame(next);
        })""", count)

    def observe_countdown():
        page.evaluate("""() => {
            window.__qaCountdown = [];
            const overlay = document.getElementById('countdown');
            const capture = () => {
                if (!overlay.classList.contains('hidden'))
                    window.__qaCountdown.push(document.getElementById('countdown-text').textContent);
            };
            new MutationObserver(capture).observe(overlay,
                {subtree:true,childList:true,characterData:true,attributes:true});
        }""")

    try:
        if CONTENT_ONLY:
            page.set_content(html.read_text(encoding="utf-8"), wait_until="domcontentloaded", timeout=60_000)
        else:
            page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        page.locator("#menu-view").wait_for(state="visible")
        wait("window.__qaWebGLDraws > 20")
        assert page.evaluate("typeof window.apexDebug") == "undefined"
        assert page.locator("script[src], link[rel=stylesheet]").count() == 0
        assert page.locator('script[type="module"]').count() == 0
        assert page.locator("style").count() > 0
        assert page.locator("script:not([src])").count() > 0
        assert page.locator("#hud").evaluate("el => getComputedStyle(el).display") == "none"
        assert page.locator("#play-button").evaluate("el => getComputedStyle(el).backgroundColor") == "rgb(66, 216, 242)"
        assert page.locator("h1").evaluate("el => parseFloat(getComputedStyle(el).fontSize)") > 35
        assert page.locator("#game-canvas").evaluate("el => getComputedStyle(el).position") == "fixed"
        assert page.locator("#game-canvas").evaluate("el => {const gl=el.getContext('webgl2');return !!gl&&!gl.isContextLost()}")

        page.locator("#menu-controls").click()
        page.locator("#pause-view").wait_for(state="visible")
        page.locator("#quality-select").select_option("low")
        page.locator("#close-pause").click()
        frames(3)  # Finish compiling the shaders before measuring match time.
        page.screenshot(path=str(RESULTS / f"offline-{label}-menu.png"))
        transport = "HTML content injection (file:// not tested)" if CONTENT_ONLY else "file://"
        print(f"PASS {label}: styled menu and real WebGL scene via {transport}, networking disabled", flush=True)

        page.locator("[data-mode=training]").click()
        page.locator("#play-button").click()
        page.locator("#hud").wait_for(state="visible")
        wait("document.getElementById('timer').textContent === 'LIBRE'")
        # A jump from a stationary kickoff changes rigid-body speed vertically.
        wait("Number(document.getElementById('speed').textContent) < 3")
        page.keyboard.press("Space")
        wait("Number(document.getElementById('speed').textContent) > 20")
        page.screenshot(path=str(RESULTS / f"offline-{label}-jump.png"))
        page.keyboard.press("Escape")
        page.locator("#pause-view").wait_for(state="visible")
        page.locator("#restart-button").click()
        page.locator("#pause-view").wait_for(state="hidden")
        wait("Number(document.getElementById('speed').textContent) < 3")
        page.keyboard.down("z")
        wait("Number(document.getElementById('speed').textContent) > 8")
        initial_boost = int(page.locator("#boost").inner_text())
        page.keyboard.down("Shift")
        wait(f"Number(document.getElementById('boost').textContent) < {initial_boost - 5}")
        assert int(page.locator("#speed").inner_text()) > 15
        page.keyboard.up("Shift")
        page.keyboard.up("z")
        page.screenshot(path=str(RESULTS / f"offline-{label}-training.png"))
        print(f"PASS {label}: training jump, restart, real keyboard driving and consuming boost", flush=True)

        page.keyboard.press("c")
        wait("document.getElementById('ballcam-toggle').getAttribute('aria-pressed') === 'true'")
        page.keyboard.press("c")
        wait("document.getElementById('ballcam-toggle').getAttribute('aria-pressed') === 'false'")
        page.keyboard.press("Escape")
        page.locator("#pause-view").wait_for(state="visible")
        boost = page.locator("#boost").inner_text()
        speed = page.locator("#speed").inner_text()
        page.keyboard.down("Shift")
        frames()
        page.keyboard.up("Shift")
        assert page.locator("#boost").inner_text() == boost
        assert page.locator("#speed").inner_text() == speed
        page.locator("#resume-button").click()
        page.locator("#pause-view").wait_for(state="hidden")
        page.keyboard.down("z")
        wait("Number(document.getElementById('speed').textContent) > 25")
        page.keyboard.up("z")
        page.keyboard.press("Escape")
        page.locator("#pause-view").wait_for(state="visible")
        page.locator("#back-menu-button").click()
        page.locator("#menu-view").wait_for(state="visible")
        print(f"PASS {label}: ball camera, paused controls, resume and menu", flush=True)

        page.locator("[data-mode=duel]").click()
        page.locator("[data-difficulty=easy]").click()
        observe_countdown()
        page.locator("#play-button").click()
        wait("window.__qaCountdown.includes('GO !')")
        labels = page.evaluate("window.__qaCountdown")
        assert all(label in labels for label in ("3", "2", "1", "GO !")), labels
        page.keyboard.press("Escape")
        page.locator("#pause-view").wait_for(state="visible")
        page.locator("#restart-button").click()
        # Inspect the reset in one animation frame. Separate browser calls can
        # outlive a short countdown when the software renderer is overloaded.
        wait("document.getElementById('countdown-text').textContent === '3' && !document.getElementById('countdown').classList.contains('hidden') && document.getElementById('score-blue').textContent === '0' && document.getElementById('score-orange').textContent === '0'")
        print(f"PASS {label}: real-time 3/2/1/GO duel countdown and match restart", flush=True)

        assert not errors, f"Browser errors: {errors}"
        assert not failures, f"Resource failures: {failures}"
        assert all(urlparse(request).scheme not in ("http", "https", "ws", "wss") for request in requests), requests
        assert all(request == url or urlparse(request).scheme in ("data", "blob") for request in requests), requests
        print(f"PASS {label}: one autonomous HTML, no network request, external file or browser error", flush=True)
    except Exception:
        print(f"FAIL {label}: browser errors={errors}; resources={failures}; requests={requests}", flush=True)
        try:
            page.screenshot(path=str(RESULTS / f"offline-{label}-failure.png"), timeout=15_000)
        except Exception:
            pass
        raise
    finally:
        context.close()


def main():
    RESULTS.mkdir(exist_ok=True)
    assert HTML.is_file(), f"Standalone HTML missing: {HTML}"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=CHROMIUM, headless=True,
            args=["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
        )
        try:
            test_file(browser, HTML, "checkout")
            with tempfile.TemporaryDirectory(prefix="apex-offline-", dir="/tmp") as directory:
                copied = Path(directory) / "index.html"
                shutil.copyfile(HTML, copied)
                assert list(Path(directory).iterdir()) == [copied]
                test_file(browser, copied, "isolated")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
