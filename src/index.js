import { execSync } from 'child_process'
import { platform } from 'os'
import { readFileSync, readdirSync, readlinkSync } from 'fs'

const OS = platform() // 'win32' | 'darwin' | 'linux'

// ─── Get info for a single port ───────────────────────────────────────────────
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

  return { pid, name, cmd, port }
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

  return { pid, name, cmd: '', port }
}

// ─── List ALL occupied ports ───────────────────────────────────────────────────
export function listAllPorts() {
  try {
    if (OS === 'win32') return listAllPortsWindows()
    else return listAllPortsUnix()
  } catch {
    return []
  }
}

function listAllPortsUnix() {
  const results = []
  const seen = new Set()

  // Strategy 1: lsof
  try {
    const out = execSync(`lsof -i -P -n -sTCP:LISTEN 2>/dev/null`, { encoding: 'utf8' })
    for (const line of out.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 9) continue
      const name = parts[0]
      const pid = parts[1]
      const addr = parts[8]
      const portMatch = addr.match(/:(\d+)$/)
      if (!portMatch) continue
      const port = Number(portMatch[1])
      const key = `${pid}:${port}`
      if (seen.has(key)) continue
      seen.add(key)

      let cmd = ''
      try { cmd = execSync(`ps -p ${pid} -o args=`, { encoding: 'utf8' }).trim() } catch {}

      results.push({ pid, name, cmd, port })
    }
    if (results.length) return results
  } catch {}

  // Strategy 2: ss
  try {
    const out = execSync(`ss -tlnp 2>/dev/null`, { encoding: 'utf8' })
    for (const line of out.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4) continue
      const addrPart = parts[3]
      const portMatch = addrPart.match(/:(\d+)$/)
      if (!portMatch) continue
      const port = Number(portMatch[1])
      const pidMatch = line.match(/pid=(\d+)/)
      if (!pidMatch) continue
      const pid = pidMatch[1]
      const key = `${pid}:${port}`
      if (seen.has(key)) continue
      seen.add(key)

      let name = 'unknown'
      try { name = readFileSync(`/proc/${pid}/comm`, 'utf8').trim() } catch {}
      let cmd = ''
      try { cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim() } catch {}

      results.push({ pid, name, cmd, port })
    }
    if (results.length) return results
  } catch {}

  // Strategy 3: /proc/net/tcp
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    try {
      const lines = readFileSync(file, 'utf8').split('\n').slice(1)
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (!parts[1] || parts[3] !== '0A') continue
        const portHex = parts[1].split(':')[1]
        const port = parseInt(portHex, 16)
        const inode = parts[9]
        const pid = findPidByInode(inode)
        if (!pid) continue
        const key = `${pid}:${port}`
        if (seen.has(key)) continue
        seen.add(key)

        let name = 'unknown'
        try { name = readFileSync(`/proc/${pid}/comm`, 'utf8').trim() } catch {}
        let cmd = ''
        try { cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim() } catch {}

        results.push({ pid, name, cmd, port })
      }
    } catch {}
  }

  return results.sort((a, b) => a.port - b.port)
}

function findPidByInode(inode) {
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

function listAllPortsWindows() {
  const results = []
  const seen = new Set()
  const netstat = execSync(`netstat -ano`, { encoding: 'utf8' })

  // Build PID → name map from tasklist
  const pidNameMap = {}
  try {
    const tasklist = execSync(`tasklist /FO CSV /NH`, { encoding: 'utf8' })
    for (const line of tasklist.split('\n')) {
      const match = line.match(/"([^"]+)","(\d+)"/)
      if (match) pidNameMap[match[2]] = match[1]
    }
  } catch {}

  for (const line of netstat.split('\n')) {
    if (!line.includes('LISTENING')) continue
    const parts = line.trim().split(/\s+/)
    if (parts.length < 4) continue
    const addrPart = parts[1]
    const portMatch = addrPart.match(/:(\d+)$/)
    if (!portMatch) continue
    const port = Number(portMatch[1])
    const pid = parts[parts.length - 1]
    const key = `${pid}:${port}`
    if (seen.has(key)) continue
    seen.add(key)
    const name = pidNameMap[pid] || 'unknown'
    results.push({ pid, name, cmd: '', port })
  }

  return results.sort((a, b) => a.port - b.port)
}

// ─── Find processes by name ────────────────────────────────────────────────────
export function findByName(processName) {
  const all = listAllPorts()
  const lower = processName.toLowerCase()
  return all.filter(p =>
    p.name.toLowerCase().includes(lower) ||
    p.cmd.toLowerCase().includes(lower)
  )
}

// ─── Kill a process ────────────────────────────────────────────────────────────
export function killProcess(pid) {
  if (OS === 'win32') execSync(`taskkill /PID ${pid} /F`)
  else execSync(`kill -9 ${pid}`)
}

// ─── Free port utilities ───────────────────────────────────────────────────────
export function findFreePort(start, end) {
  for (let port = start; port <= end; port++) {
    if (!getPortInfo(port)) return port
  }
  return null
}

export function findFreePorts(start, count) {
  const found = []
  let port = start
  while (found.length < count && port <= 65535) {
    if (!getPortInfo(port)) found.push(port)
    port++
  }
  return found
}

export function parsePortRange(input) {
  if (input.includes('-')) {
    const [start, end] = input.split('-').map(Number)
    return { start, end }
  }
  const port = Number(input)
  return { start: port, end: port }
}