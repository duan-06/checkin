import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { glados, main } from './main.js'

const response = (body, status = 200) => new Response(JSON.stringify(body), { status })

test('checkin reports real outcomes without hiding failures', async (t) => {
  const log = t.mock.method(console, 'log', () => {})
  const originalFetch = globalThis.fetch
  const originalEnv = { ...process.env }
  t.after(() => {
    globalThis.fetch = originalFetch
    process.env = originalEnv
  })
  process.env.GLADOS = 'session=test-cookie-value'
  delete process.env.NOTIFY
  delete process.env.GITHUB_STEP_SUMMARY

  await t.test('success does not require a notification token', async () => {
    let calls = 0
    globalThis.fetch = async () => ++calls === 1
      ? response({ code: 0, message: 'Checkin! Get 1 Day' })
      : response({ code: 0, data: { leftDays: '12.5' } })
    assert.equal(await main(), 0)
    assert.equal(calls, 2)
  })
  await t.test('expired Cookie makes the job fail before status lookup', async () => {
    let calls = 0
    globalThis.fetch = async () => { calls++; return response({ code: -2, message: '没有权限' }) }
    assert.equal(await main(), 1)
    assert.equal(calls, 1)
  })
  await t.test('a missing Cookie makes the job fail without sending requests', async () => {
    delete process.env.GLADOS
    globalThis.fetch = async () => assert.fail('Must not call an API without a Cookie')
    assert.equal(await main(), 1)
    process.env.GLADOS = 'session=test-cookie-value'
  })
  await t.test('an HTML response makes the job fail', async () => {
    globalThis.fetch = async () => new Response('<html>Login</html>')
    assert.equal(await main(), 1)
  })
  await t.test('HTTP failures make the job fail', async () => {
    globalThis.fetch = async () => response({}, 403)
    assert.equal(await main(), 1)
  })
  await t.test('already checked in succeeds only with a valid status response', async () => {
    let calls = 0
    globalThis.fetch = async () => ++calls === 1
      ? response({ code: 1, message: 'Checkin Repeat! Please Try Tomorrow.' })
      : response({ code: 0, data: { leftDays: '12.5' } })
    assert.match((await glados())[0], /Already Done/)
    calls = 0
    globalThis.fetch = async () => ++calls === 1
      ? response({ code: 1, message: 'Checkin Repeat! Please Try Tomorrow.' })
      : response({ code: 1, message: 'Please login' })
    assert.equal(await main(), 1)
  })
  await t.test('an incomplete status response cannot be reported as success', async () => {
    let calls = 0
    globalThis.fetch = async () => ++calls === 1
      ? response({ code: 0, message: 'OK' })
      : response({ code: 0, data: {} })
    assert.equal(await main(), 1)
  })
  await t.test('credentials are redacted from API messages', async () => {
    globalThis.fetch = async () => response({ code: -2, message: 'Rejected session=test-cookie-value' })
    assert.equal(await main(), 1)
    const output = log.mock.calls.map((call) => call.arguments.join(' ')).join('\n')
    assert.ok(output.includes('[REDACTED]'))
    assert.ok(!output.includes('test-cookie-value'))
  })
  await t.test('the CLI exits nonzero when a Cookie is missing', async () => {
    const env = { ...process.env }
    delete env.GLADOS
    delete env.NOTIFY
    delete env.GITHUB_STEP_SUMMARY
    const result = spawnSync(process.execPath, ['main.js'], { env, encoding: 'utf8', cwd: new URL('.', import.meta.url) })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /Missing GLADOS Secret/)
  })
})
