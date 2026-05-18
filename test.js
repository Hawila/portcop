#!/usr/bin/env node

/**
 * portcop test suite — zero dependencies
 * Tests the core logic in src/index.js directly (no CLI subprocess).
 *
 * Run:  node test.js
 */

import { createServer } from 'net'
import {
  getPortInfo,
  findFreePort,
  findFreePorts,
  findByName,
  listAllPorts,
  parsePortRange,
} from './src/index.js'

// ─── Tiny test runner ─────────────────────────────────────────────────────────
const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
}

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ${c.green('✔')} ${name}`)
    passed++
  } catch (err) {
    console.log(`  ${c.red('✘')} ${name}`)
    console.log(`     ${c.dim(err.message)}`)
    failed++
  }
}

async function testAsync(name, fn) {
  try {
    await fn()
    console.log(`  ${c.green('✔')} ${name}`)
    passed++
  } catch (err) {
    console.log(`  ${c.red('✘')} ${name}`)
    console.log(`     ${c.dim(err.message)}`)
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(message || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(port, '127.0.0.1', () => resolve(server))
    server.on('error', reject)
  })
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

// ─── Tests ────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n  ${c.bold(c.cyan('portcop'))} test suite\n`)

  // ── parsePortRange ──
  console.log(`  ${c.bold('parsePortRange')}`)
  test('single port returns start === end', () => {
    const { start, end } = parsePortRange('3000')
    assertEqual(start, 3000)
    assertEqual(end, 3000)
  })
  test('range parses start and end', () => {
    const { start, end } = parsePortRange('3000-3010')
    assertEqual(start, 3000)
    assertEqual(end, 3010)
  })
  test('single-digit port works', () => {
    const { start } = parsePortRange('80')
    assertEqual(start, 80)
  })
  console.log()

  // ── getPortInfo on a free port ──
  console.log(`  ${c.bold('getPortInfo')}`)
  await testAsync('returns null for a port with nothing on it', async () => {
    // Find a port that's actually free
    const freePort = findFreePort(49200, 49300)
    assert(freePort !== null, 'Could not find a free port in range 49200-49300')
    const info = getPortInfo(freePort)
    assert(info === null, `Expected null but got ${JSON.stringify(info)}`)
  })

  await testAsync('detects an occupied port', async () => {
    const freePort = findFreePort(49300, 49400)
    assert(freePort !== null, 'Could not find a free port in range 49300-49400')

    const server = await listenOnPort(freePort)
    try {
      // Give OS a moment to register the port
      await new Promise(r => setTimeout(r, 100))
      const info = getPortInfo(freePort)
      assert(info !== null, `Expected port info but got null for port ${freePort}`)
      assert(typeof info.pid !== 'undefined', 'Expected info.pid to be set')
      assert(typeof info.name === 'string', 'Expected info.name to be a string')
    } finally {
      await closeServer(server)
    }
  })
  console.log()

  // ── findFreePort ──
  console.log(`  ${c.bold('findFreePort')}`)
  test('finds a free port in a wide range', () => {
    const port = findFreePort(49400, 49500)
    assert(port !== null, 'Expected a free port but got null')
    assert(port >= 49400 && port <= 49500, `Port ${port} out of range`)
  })
  await testAsync('returns null when all ports are occupied', async () => {
    // occupy two consecutive ports and test a 1-port range
    const p1 = findFreePort(49500, 49600)
    assert(p1 !== null)
    const server = await listenOnPort(p1)
    try {
      await new Promise(r => setTimeout(r, 100))
      const result = findFreePort(p1, p1) // range of exactly one occupied port
      assertEqual(result, null, `Expected null but got ${result}`)
    } finally {
      await closeServer(server)
    }
  })
  console.log()

  // ── findFreePorts (--count) ──
  console.log(`  ${c.bold('findFreePorts')}`)
  test('returns requested number of free ports', () => {
    const ports = findFreePorts(49600, 3)
    assertEqual(ports.length, 3, `Expected 3 ports, got ${ports.length}`)
    for (let i = 1; i < ports.length; i++) {
      assert(ports[i] > ports[i - 1], 'Ports should be in ascending order')
    }
  })
  test('returns no duplicates', () => {
    const ports = findFreePorts(49700, 5)
    const unique = new Set(ports)
    assertEqual(unique.size, ports.length, 'Duplicate ports found')
  })
  console.log()

  // ── listAllPorts ──
  console.log(`  ${c.bold('listAllPorts')}`)
  await testAsync('includes a port we just opened', async () => {
    const freePort = findFreePort(49800, 49900)
    assert(freePort !== null)
    const server = await listenOnPort(freePort)
    try {
      await new Promise(r => setTimeout(r, 100))
      const all = listAllPorts()
      assert(Array.isArray(all), 'listAllPorts should return an array')
      const found = all.find(p => p.port === freePort)
      assert(found, `Port ${freePort} not found in listAllPorts output`)
    } finally {
      await closeServer(server)
    }
  })
  test('each entry has port, pid, name fields', () => {
    const all = listAllPorts()
    for (const entry of all) {
      assert(typeof entry.port === 'number', `port should be a number, got ${typeof entry.port}`)
      assert(typeof entry.pid !== 'undefined', 'pid should be defined')
      assert(typeof entry.name === 'string', `name should be a string, got ${typeof entry.name}`)
    }
  })
  console.log()

  // ── findByName ──
  console.log(`  ${c.bold('findByName')}`)
  test('returns an array', () => {
    const results = findByName('thisshouldnotexist_xyz_abc')
    assert(Array.isArray(results), 'Expected an array')
    assertEqual(results.length, 0, 'Expected empty array for non-existent process')
  })
  await testAsync('finds current node process by name', async () => {
    const freePort = findFreePort(49900, 49999)
    assert(freePort !== null)
    const server = await listenOnPort(freePort)
    try {
      await new Promise(r => setTimeout(r, 100))
      // The test itself is a node process occupying freePort
      const results = findByName('node')
      assert(Array.isArray(results), 'Expected array')
      // There's at least one node process (this very test runner)
      assert(results.length > 0, 'Expected at least one node process')
    } finally {
      await closeServer(server)
    }
  })
  test('search is case-insensitive', () => {
    const lower = findByName('node')
    const upper = findByName('NODE')
    assertEqual(lower.length, upper.length, 'Case-insensitive search should return same count')
  })
  console.log()

  // ── Summary ──
  const total = passed + failed
  const status = failed === 0
    ? c.green(`All ${total} tests passed ✔`)
    : c.red(`${failed} of ${total} tests failed ✘`)

  console.log(`  ─────────────────────────────────`)
  console.log(`  ${status}\n`)

  if (failed > 0) process.exit(1)
}

run()
