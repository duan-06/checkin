import { appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Never include response bodies or credentials in public Actions logs.
const safeMessage = (message) => {
  let text = String(message ?? 'No message').replace(/[\r\n]/g, ' ').slice(0, 500)
  for (const secret of [process.env.GLADOS, process.env.NOTIFY]) {
    if (secret) text = text.replaceAll(secret, '[REDACTED]')
  }
  for (const part of (process.env.GLADOS || '').split(';')) {
    const value = part.slice(part.indexOf('=') + 1).trim()
    if (value.length >= 8) text = text.replaceAll(value, '[REDACTED]')
  }
  return text.replace(/[<>&`]/g, '')
}

const requestJson = async (url, options) => {
  let response
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000), redirect: 'error' })
  } catch (error) {
    throw new Error(`${new URL(url).pathname}: request failed (${safeMessage(error.cause?.code || error.name)})`)
  }
  if (!response.ok) {
    throw new Error(`${new URL(url).pathname}: HTTP ${response.status}${[401, 403].includes(response.status) ? '; check login/Cookie or site access restrictions' : ''}`)
  }
  try {
    return await response.json()
  } catch {
    throw new Error(`${new URL(url).pathname}: response is not JSON; the site may have returned an HTML page`)
  }
}

export const glados = async () => {
  const cookie = process.env.GLADOS?.trim()
  if (!cookie) throw new Error('Missing GLADOS Secret: add your GLaDOS Cookie in repository Actions secrets')

  const headers = {
    cookie,
    referer: 'https://glados.rocks/console/checkin',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  }
  const checkin = await requestJson('https://glados.rocks/api/user/checkin', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'glados.one' }),
  })
  if (!checkin || typeof checkin.code !== 'number') throw new Error('Checkin API returned an unexpected response')
  const message = safeMessage(checkin.message)
  console.log(`Checkin API: code=${checkin.code}; message=${message}`)
  const repeated = checkin.code === 1 && /^Checkin Repeat\b/i.test(String(checkin.message))
  if (checkin.code !== 0 && !repeated) {
    throw new Error(`Checkin rejected: code=${checkin.code}; message=${message}. If login is required, refresh the GLADOS Secret`)
  }

  const status = await requestJson('https://glados.rocks/api/user/status', { headers })
  const rawDays = status?.data?.leftDays
  if (status?.code !== 0) throw new Error(`Status rejected: code=${safeMessage(status?.code)}; message=${safeMessage(status?.message)}. Check the GLADOS Cookie`)
  if (!['string', 'number'].includes(typeof rawDays) || String(rawDays).trim() === '' || !Number.isFinite(Number(rawDays))) {
    throw new Error('Status API did not return valid remaining days')
  }
  return [repeated ? 'Checkin Already Done' : 'Checkin OK', message, `Left Days ${Number(rawDays)}`]
}

const notify = async (contents) => {
  const token = process.env.NOTIFY
  if (!token) return
  const result = await requestJson('https://www.pushplus.plus/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, title: contents[0], content: contents.join('<br>'), template: 'markdown' }),
  })
  if (result?.code !== 200) throw new Error(`PushPlus rejected: code=${safeMessage(result?.code)}`)
}

export const main = async () => {
  let contents
  let exitCode = 0
  try {
    contents = await glados()
  } catch (error) {
    contents = ['Checkin Error', safeMessage(error.message)]
    exitCode = 1
  }
  console.log(contents.join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, contents.map(safeMessage).join('\n\n') + '\n')
    } catch {
      console.error('Could not write Actions summary; see the checkin log above')
    }
  }
  try {
    await notify(contents)
  } catch (error) {
    console.error(`Notification Error: ${safeMessage(error.message)}`)
    exitCode = 1
  }
  return exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
