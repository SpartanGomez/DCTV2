// tests/smoke/boot.spec.ts
// M1 smoke gate: two independent browser contexts both connect, the server
// pairs them, both clients log matchStart with 2 units, and both render the canvas.

import { test, expect } from '@playwright/test'

test('server /health endpoint returns ok', async ({ request }) => {
  const res = await request.get('http://localhost:8080/health')
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as { status: string; serverVersion: string }
  expect(body.status).toBe('ok')
  expect(body.serverVersion).toMatch(/\d+\.\d+\.\d+/)
})

test('two clients get paired into a match with two units', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  try {
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()

    const matchA = pageA.waitForEvent('console', {
      predicate: (m) => m.text().includes('matchStart'),
      timeout: 15_000,
    })
    const matchB = pageB.waitForEvent('console', {
      predicate: (m) => m.text().includes('matchStart'),
      timeout: 15_000,
    })

    await pageA.goto('/')
    await pageB.goto('/')

    const [msgA, msgB] = await Promise.all([matchA, matchB])
    expect(msgA.text()).toMatch(/units=2/)
    expect(msgB.text()).toMatch(/units=2/)

    await expect(pageA.locator('canvas')).toBeVisible()
    await expect(pageB.locator('canvas')).toBeVisible()
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})
