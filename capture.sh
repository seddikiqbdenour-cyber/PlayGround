#!/usr/bin/env bash
# Capture the deployed site at CAPTURE_URL into CAPTURE_DIR.
# Exit 75 when navigation/browser infrastructure is temporarily unavailable;
# exit 1 for script or rendering defects.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

timed() {
  local label="$1"
  shift
  local start end rc
  start="${EPOCHREALTIME//[!0-9]/}"
  if "$@"; then rc=0; else rc=$?; fi
  end="${EPOCHREALTIME//[!0-9]/}"
  printf '[timing] %s: %d ms\n' "$label" "$(((end - start) / 1000))"
  return "$rc"
}

if [[ -z "${CAPTURE_URL:-}" || -z "${CAPTURE_DIR:-}" ]]; then
  echo "Set CAPTURE_URL and CAPTURE_DIR." >&2
  exit 1
fi

case "$CAPTURE_URL" in
  http://*|https://*) ;;
  *) echo "CAPTURE_URL must be an absolute http(s) URL." >&2; exit 1 ;;
esac

CAPTURE_DIR="$(cd "$PROJECT_DIR" && realpath -m "$CAPTURE_DIR")"
if [[ "$CAPTURE_DIR" == "$PROJECT_DIR" || "$CAPTURE_DIR" == "$PROJECT_DIR/"* ]]; then
  echo "CAPTURE_DIR must be outside the project source tree." >&2
  exit 1
fi

timed "prepare capture directory" mkdir -p "$CAPTURE_DIR"

export CAPTURE_URL CAPTURE_DIR

timed "browser capture" node --input-type=module <<'NODE'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const runtime = join(process.env.HOME || '', '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')
const config = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
if (process.platform === 'linux') {
  const display = readFileSync(join(runtime, 'display'), 'utf8').trim()
  if (display) process.env.DISPLAY ||= `:${display}`
}

const url = process.env.CAPTURE_URL
const outputDir = process.env.CAPTURE_DIR
if (!url || !outputDir) throw new Error('Set CAPTURE_URL and CAPTURE_DIR.')

let target
try {
  target = new URL(url)
} catch {
  throw new Error(`Invalid CAPTURE_URL: ${url}`)
}
if (!['http:', 'https:'].includes(target.protocol)) throw new Error('CAPTURE_URL must use http or https.')

mkdirSync(outputDir, { recursive: true })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const transient = (message) => Object.assign(new Error(message), { exitCode: 75 })

async function navigate(page) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    } catch (error) {
      if (attempt === 3) throw transient(`Navigation failed: ${error.message}`)
      console.error(`Navigation attempt ${attempt} failed: ${error.message}`)
      await wait(1500 * attempt)
      continue
    }

    if (response?.ok()) return response

    const status = response?.status() ?? 0
    console.error(`Navigation attempt ${attempt}: HTTP ${status} loading ${url}`)
    const temporary = status === 0 || status === 404 || status === 408 || status === 429 || status >= 500
    if (temporary && attempt < 3) {
      await wait(2000 * attempt)
      continue
    }
    if (temporary) throw transient(`Preview not available (HTTP ${status || 'no response'})`)
    throw new Error(`HTTP ${status} loading ${url}`)
  }
  throw transient(`Could not load ${url}`)
}

let browser
try {
  browser = await chromium.launch({
    ...config.browser.launchOptions,
    headless: false,
    timeout: 30000,
  }).catch((error) => {
    throw transient(`Browser launch failed: ${error.message}`)
  })

  for (const device of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
  ]) {
    const context = await browser.newContext({
      viewport: device.viewport,
      deviceScaleFactor: device.isMobile ? 2 : 1,
      hasTouch: device.isMobile,
      isMobile: device.isMobile,
    }).catch((error) => {
      throw transient(`Could not create ${device.name} browser context: ${error.message}`)
    })

    const page = await context.newPage()
    page.setDefaultTimeout(30000)
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`[${device.name} console] ${message.text()}`)
    })

    await navigate(page)

    await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 30000 })
      .catch(() => { throw new Error(`${device.name}: document never completed loading`) })

    await page.locator('#menu, #hud').first().waitFor({ state: 'visible', timeout: 30000 })
      .catch((error) => { throw new Error(`${device.name}: app shell did not render: ${error.message}`) })

    await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 })
      .catch(() => { throw new Error(`${device.name}: fonts did not finish loading`) })

    const canvas = page.locator('#game')
    await canvas.waitFor({ state: 'visible', timeout: 30000 })
      .catch((error) => { throw new Error(`${device.name}: game canvas did not render: ${error.message}`) })

    const playButton = page.locator('#playBtn')
    if (await playButton.isVisible().catch(() => false)) {
      await playButton.click({ timeout: 10000 })
        .catch((error) => { throw new Error(`${device.name}: could not start game: ${error.message}`) })

      await page.waitForFunction(() => window.__blockcraft?.state?.started === true, null, { timeout: 30000 })
        .catch((error) => { throw new Error(`${device.name}: gameplay did not start: ${error.message}`) })

      await page.waitForFunction(() => {
        const world = window.__blockcraft?.world
        if (!world?.chunks) return false
        for (const chunk of world.chunks.values()) {
          if (chunk.generated && chunk.meshed && chunk.meshes?.length) return true
        }
        return false
      }, null, { timeout: 45000 }).catch((error) => {
        throw new Error(`${device.name}: terrain did not render: ${error.message}`)
      })

      await page.waitForTimeout(2500)
    }

    const screenshotPath = join(outputDir, `final-${device.name}.png`)
    await page.screenshot({ path: screenshotPath, timeout: 30000 }).catch((error) => {
      if (error.name === 'TimeoutError' || !browser.isConnected()) {
        throw transient(`Screenshot failed for ${device.name}: ${error.message}`)
      }
      throw error
    })

    const bytes = statSync(screenshotPath).size
    if (bytes < 10000) throw new Error(`${device.name}: screenshot looks blank (${bytes} bytes)`)

    if (pageErrors.length) throw new Error(`${device.name}: page error: ${pageErrors.join('; ')}`)

    console.log(`Captured ${screenshotPath} (${bytes} bytes)`)
    await context.close()
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = error.exitCode || 1
} finally {
  await browser?.close().catch((error) => {
    console.error(`Browser close failed: ${error.message}`)
    process.exitCode ||= 75
  })
}
NODE
