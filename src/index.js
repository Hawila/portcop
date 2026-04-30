import { execSync } from 'child_process'
import { platform } from 'os'
import { readFileSync, readdirSync, readlinkSync } from 'fs'

const OS = platform() // 'win32' | 'darwin' | 'linux'

export function getPortInfo(port) {
  try {
    if (OS === 'win32') return getPortInfoWindows(port)
    else return getPortInfoUnix(port)
  } catch {
    return null
  }
}

function getPortInfoUnix(port) {
  let pid = null

  // Strategy 1: lsof (macOS + most Linux)
  if (!pid) {
    try {
      const out = execSync(`lsof -i :${port} -sTCP:LISTEN -t 2>/dev/null`, { encoding: 'utf8' }).trim()
      if (out) pid = out.split('\n')[0].trim()
    } catch { /* not available */ }
  }

  // Strategy 2: ss (modern Linux)
  if (!pid) {
    try {
      const out = execSync(`ss -tlnp sport = :${port} 2>/dev/null`, { encoding: 'utf8' })
      const match = out.match(/pid=(\d+)/)
      if (match) pid = match[1]
    } catch { /* not available */ }
  }

  // Strategy 3: /proc/net/tcp (Linux kernel — no tools needed)
  if (!pid) pid = getPidFromProcNet(port)

  if (!pid) return null

  let name = 'unknown'
  try { name = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' }).trim() }
  catch { try { name = readFileSync(`/proc/${pid}/comm`, 'utf8').trim() } catch {} }

  let cmd = ''
  try { cmd = execSync(`ps -p ${pid} -o args=`, { encoding: 'utf8' }).trim() }
  catch { try { cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim() } catch {} }

  return { pid, name, cmd }
}

function getPidFromProcNet(port) {
  const hexPort = port.toString(16).toUpperCase().padStart(4, '0')
  let inode = null

  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    try {
      const lines = readFileSync(file, 'utf8').split('\n').slice(1)
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (!parts[1]) continue
        const portHex = parts[1].split(':')[1]
        const state = parts[3]
        if (portHex === hexPort && state === '0A') { inode = parts[9]; break }
      }
    } catch {}
    if (inode) break
  }

  if (!inode) return null

  try {
    for (const pid of readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
      try {
        for (const fd of readdirSync(`/proc/${pid}/fd`)) {
          try {
            if (readlinkSync(`/proc/${pid}/fd/${fd}`) === `socket:[${inode}]`) return pid
          } catch {}
        }
      } catch {}
    }
  } catch {}

  return null
}

function getPortInfoWindows(port) {
  const netstat = execSync(`netstat -ano`, { encoding: 'utf8' })
  let pid = null
  for (const line of netstat.split('\n')) {
    if (line.includes(`:${port}`) && line.includes('LISTENING')) {
      const parts = line.trim().split(/\s+/)
      pid = parts[parts.length - 1]
      break
    }
  }
  if (!pid) return null

  let name = 'unknown'
  try {
    const tasklist = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' })
    const match = tasklist.match(/"([^"]+)"/)
    if (match) name = match[1]
  } catch {}

  return { pid, name, cmd: '' }
}

export function killProcess(pid) {
  if (OS === 'win32') execSync(`taskkill /PID ${pid} /F`)
  else execSync(`kill -9 ${pid}`)
}

export function findFreePort(start, end) {
  for (let port = start; port <= end; port++) {
    if (!getPortInfo(port)) return port
  }
  return null
}

export function parsePortRange(input) {
  if (input.includes('-')) {
    const [start, end] = input.split('-').map(Number)
    return { start, end }
  }
  const port = Number(input)
  return { start: port, end: port }
}
