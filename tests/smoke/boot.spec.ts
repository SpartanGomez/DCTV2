// tests/smoke/boot.spec.ts
// M0 smoke gate: Vite + ws server boot via Playwright's webServer config.
// Expectation: the client logs a hello message carrying the server version.

import { test, expect } from '@playwright/test'

test('client receives hello from server', async ({ page }) => {
  const helloPromise = page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes('hello from server'),
    timeout: 15_000,
  })

  await page.goto('/')

  const msg = await helloPromise
  expect(msg.text()).toContain('hello from server')

  const boot = await page.textContent('#boot')
  expect(boot).toMatch(/connected to server/)
})

test('server /health endpoint returns ok', async ({ request }) => {
  const res = await request.get('http://localhost:8080/health')
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as { status: string; serverVersion: string }
  expect(body.status).toBe('ok')
  expect(body.serverVersion).toMatch(/\d+\.\d+\.\d+/)
})
