#!/usr/bin/env python3
"""Smoke-test the built static game at a GitHub Pages-style subpath.

Usage: python tests/pages_smoke.py http://127.0.0.1:4173/rocket-league/
Requires Python Playwright and Chromium. No development inspection API is used.
"""

from pathlib import Path
import os
import sys
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


URL = sys.argv[1] if len(sys.argv) > 1 else os.getenv("GAME_PAGES_TEST_URL", "http://127.0.0.1:4173/rocket-league/")
CHROMIUM = os.getenv("CHROMIUM_PATH", "/usr/bin/chromium")
RESULTS = Path(__file__).resolve().parent.parent / "test-results"


def main():
    RESULTS.mkdir(exist_ok=True)
    errors = []
    failed_resources = []
    requests = []
    destination = urlparse(URL)
    prefix = destination.path if destination.path.endswith("/") else destination.path + "/"

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
        page.on("response", lambda response: failed_resources.append(f"{response.status} {response.url}") if response.status >= 400 else None)
        page.on("requestfailed", lambda request: failed_resources.append(f"{request.failure} {request.url}"))
        page.on("request", lambda request: requests.append(request.url))

        def wait(expression):
            page.wait_for_function(expression, timeout=45_000, polling="raf")

        def frames(count=6):
            page.evaluate("""count => new Promise(resolve => {
                function next() { if (--count <= 0) resolve(); else requestAnimationFrame(next); }
                requestAnimationFrame(next);
            })""", count)

        try:
            response = page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
            assert response and response.status == 200
            page.locator("#menu-view").wait_for(state="visible")
            wait("document.querySelector('canvas').width > 0")
            assert page.evaluate("typeof window.apexDebug") == "undefined", "Production exposes development API"
            assert page.locator("script[src], link[rel=stylesheet]").count() == 0, "Standalone page needs external JS/CSS"
            assert page.locator('script[type="module"]').count() == 0, "Standalone bundle must be a classic script"
            assert page.locator("style").count() > 0, "Standalone CSS is missing"
            assert page.locator("script:not([src])").count() > 0, "Standalone JavaScript is missing"
            assert page.locator("#play-button").evaluate("el => getComputedStyle(el).backgroundColor") != "rgba(0, 0, 0, 0)"

            page.locator("#menu-controls").click()
            page.locator("#pause-view").wait_for(state="visible")
            page.locator("#quality-select").select_option("low")
            page.locator("#close-pause").click()
            frames(3)
            page.locator("[data-mode=training]").click()
            page.locator("#play-button").click()
            page.locator("#hud").wait_for(state="visible")
            wait("document.getElementById('timer').textContent === 'LIBRE'")
            page.keyboard.down("z")
            wait("Number(document.getElementById('speed').textContent) > 8")
            initial_boost = int(page.locator("#boost").inner_text())
            page.keyboard.down("Shift")
            wait(f"Number(document.getElementById('boost').textContent) < {initial_boost - 5}")
            assert int(page.locator("#speed").inner_text()) > 15
            page.keyboard.up("Shift")
            page.keyboard.up("z")
            page.screenshot(path=str(RESULTS / "pages-training.png"))
            print("PASS production training drives and boost consumes charge", flush=True)

            page.keyboard.press("c")
            wait("document.getElementById('ballcam-toggle').getAttribute('aria-pressed') === 'true'")
            page.keyboard.press("c")
            wait("document.getElementById('ballcam-toggle').getAttribute('aria-pressed') === 'false'")
            page.keyboard.press("Escape")
            page.locator("#pause-view").wait_for(state="visible")
            paused_boost = page.locator("#boost").inner_text()
            paused_speed = page.locator("#speed").inner_text()
            page.keyboard.down("Shift")
            frames()
            page.keyboard.up("Shift")
            assert page.locator("#boost").inner_text() == paused_boost
            assert page.locator("#speed").inner_text() == paused_speed
            page.locator("#resume-button").click()
            page.locator("#pause-view").wait_for(state="hidden")
            page.keyboard.down("z")
            wait("Number(document.getElementById('speed').textContent) > 25")
            page.keyboard.up("z")
            page.keyboard.press("Escape")
            page.locator("#pause-view").wait_for(state="visible")
            page.locator("#back-menu-button").click()
            page.locator("#menu-view").wait_for(state="visible")
            print("PASS production ball camera, pause/resume and return to menu", flush=True)

            for resource in requests:
                parsed = urlparse(resource)
                if parsed.scheme not in ("http", "https"):
                    continue
                assert parsed.netloc == destination.netloc, f"External runtime dependency: {resource}"
                assert parsed.path.startswith(prefix), f"Resource escaped Pages subpath: {resource}"
                assert resource == page.url, f"Standalone game requested another file: {resource}"
            assert not errors, f"Browser errors: {errors}"
            assert not failed_resources, f"Resource failures: {failed_resources}"
            print(f"PASS autonomous HTML under {prefix}; inline CSS/classic JS, no development API or other network resource", flush=True)
        except Exception:
            print("FAIL browser errors:", errors, flush=True)
            print("FAIL resources:", failed_resources, flush=True)
            try:
                page.screenshot(path=str(RESULTS / "pages-failure.png"), timeout=15_000)
            except Exception:
                pass
            raise
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
