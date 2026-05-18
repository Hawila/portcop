#!/usr/bin/env node

import * as readline from 'readline'
import {
  getPortInfo,
  killProcess,
  findFreePort,
  findFreePorts,
  findByName,
  listAllPorts,
  parsePortRange,
} from '../src/index.js'

// ─── ANSI Colors (zero deps) ──────────────────────────────────────────────────
const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
  ${c.bold(c.cyan('portcop'))} — your cross-platform port detective 🚔

  ${c.bold('Usage:')}
    portcop ${c.yellow('<port>')}                       Check who is using a port
    portcop ${c.yellow('<port>')} --kill                Kill the process without asking
    portcop ${c.yellow('<p1> <p2> <p3>')}               Check multiple ports at once
    portcop free ${c.yellow('<port>')}                  Check if a port is free
    portcop free ${c.yellow('<start>-<end>')}           Find first free port in range
    portcop free ${c.yellow('<port>+')} --count ${c.yellow('<n>')}    Find next N free ports from port
    portcop ls                            List all occupied ports
    portcop -n ${c.yellow('<name>')}                   Find all ports used by process name
    portcop -n ${c.yellow('<name>')} --kill             Kill all matching processes
    portcop --help                        Show this help

  ${c.bold('Examples:')}
    portcop 3000
    portcop 8080 --kill
    portcop 3000 4000 5000
    portcop free 3000
    portcop free 3000-3010
    portcop free 3000+ --count 5
    portcop ls
    portcop -n node
    portcop -n python --kill
`)
}

// ─── Prompt helper ────────────────────────────────────────────────────────────
function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

// ─── Display a single port result ─────────────────────────────────────────────
function printPortInfo(port, info) {
  if (!info) {
    console.log(`  ${c.green('✔')} Port ${c.bold(port)} is ${c.green('free')}`)
    return
  }
  console.log(`  ${c.red('✘')} Port ${c.bold(port)} → ${c.yellow(info.name)} ${c.dim(`PID ${info.pid}`)}${info.cmd ? `  ${c.dim(info.cmd.slice(0, 60))}` : ''}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  // ── portcop ls ──
  if (args[0] === 'ls') {
    console.log(`\n  ${c.dim('Scanning all occupied ports...')}\n`)
    const all = listAllPorts()
    if (all.length === 0) {
      console.log(`  ${c.green('✔')} No occupied ports found\n`)
      process.exit(0)
    }

    // Group by process name for cleaner output
    const maxPort = String(Math.max(...all.map(p => p.port))).length
    for (const { port, name, pid, cmd } of all) {
      const portStr = String(port).padStart(maxPort)
      console.log(`  ${c.cyan(portStr)}  ${c.yellow(name.padEnd(16))} ${c.dim(`PID ${String(pid).padEnd(6)}`)}  ${c.dim((cmd || '').slice(0, 50))}`)
    }
    console.log(`\n  ${c.dim(`${all.length} port${all.length !== 1 ? 's' : ''} occupied`)}\n`)
    process.exit(0)
  }

  // ── portcop -n <name> [--kill] ──
  if (args[0] === '-n' || args[0] === '--name') {
    const name = args[1]
    if (!name) {
      console.error(c.red('  Error: please provide a process name, e.g. portcop -n node'))
      process.exit(1)
    }

    const forceKill = args.includes('--kill') || args.includes('-k')

    console.log(`\n  ${c.dim(`Searching for processes matching "${name}"...`)}\n`)
    const matches = findByName(name)

    if (matches.length === 0) {
      console.log(`  ${c.green('✔')} No processes matching ${c.yellow(`"${name}"`)} found\n`)
      process.exit(0)
    }

    console.log(`  Found ${c.bold(matches.length)} process${matches.length !== 1 ? 'es' : ''} matching ${c.yellow(`"${name}"`)}\n`)
    for (const { port, name: pname, pid, cmd } of matches) {
      console.log(`  ${c.red('✘')} Port ${c.bold(port)}  ${c.yellow(pname)}  ${c.dim(`PID ${pid}`)}${cmd ? `\n     ${c.dim(cmd.slice(0, 70))}` : ''}`)
    }
    console.log()

    if (forceKill) {
      const killed = []
      for (const { pid, name: pname } of matches) {
        try {
          killProcess(pid)
          killed.push({ pid, name: pname })
        } catch {
          console.error(c.red(`  Error: could not kill PID ${pid}. Try running with sudo.`))
        }
      }
      for (const { pid, name: pname } of killed) {
        console.log(`  ${c.green('✔')} Killed ${c.yellow(pname)} (PID ${pid})`)
      }
      console.log()
      process.exit(0)
    }

    // Smart prompt: y = kill all, n = cancel, or enter specific port(s)
    const portList = matches.map(m => m.port).join(',')
    const answer = await ask(
      `  ${c.bold(`Kill all ${matches.length}?`)} ${c.dim(`y / n / ports (e.g. ${portList})`)}  `
    )

    if (answer === 'n' || answer === 'no' || answer === '') {
      console.log(`\n  ${c.dim('No action taken.')}`)
    } else if (answer === 'y' || answer === 'yes') {
      // Kill all
      for (const { pid, name: pname, port } of matches) {
        try {
          killProcess(pid)
          console.log(`  ${c.green('✔')} Killed ${c.yellow(pname)} on port ${port} (PID ${pid})`)
        } catch {
          console.error(c.red(`  Error: could not kill PID ${pid}. Try running with sudo.`))
        }
      }
    } else {
      // Parse comma-separated port numbers
      const requestedPorts = answer.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0)

      if (requestedPorts.length === 0) {
        console.log(`\n  ${c.red('Error: invalid input. Enter y, n, or port numbers like 3000,5173')}`)
        process.exit(1)
      }

      // Find unrecognised ports and warn
      const validPorts = matches.map(m => m.port)
      const unknown = requestedPorts.filter(p => !validPorts.includes(p))
      if (unknown.length) {
        console.log(`\n  ${c.yellow('⚠')}  Ports not in results: ${unknown.join(', ')} — skipping`)
      }

      // Kill only the requested ones
      let killedAny = false
      for (const port of requestedPorts) {
        const match = matches.find(m => m.port === port)
        if (!match) continue
        try {
          killProcess(match.pid)
          console.log(`  ${c.green('✔')} Killed ${c.yellow(match.name)} on port ${port} (PID ${match.pid})`)
          killedAny = true
        } catch {
          console.error(c.red(`  Error: could not kill PID ${match.pid}. Try running with sudo.`))
        }
      }
      if (!killedAny && unknown.length === requestedPorts.length) {
        console.log(`  ${c.dim('No action taken.')}`)
      }
    }
    console.log()
    process.exit(0)
  }

  // ── portcop free <port|range> [--count N] ──
  if (args[0] === 'free') {
    const input = args[1]
    if (!input) {
      console.error(c.red('  Error: please provide a port or range, e.g. portcop free 3000-3010'))
      process.exit(1)
    }

    // portcop free 3000+ --count 5
    if (input.endsWith('+')) {
      const start = Number(input.slice(0, -1))
      const countIdx = args.indexOf('--count')
      const count = countIdx !== -1 ? Number(args[countIdx + 1]) : 1

      if (isNaN(start) || start < 1 || start > 65535) {
        console.error(c.red(`  Error: "${input}" is not a valid port`))
        process.exit(1)
      }
      if (isNaN(count) || count < 1) {
        console.error(c.red(`  Error: --count must be a positive number`))
        process.exit(1)
      }

      console.log(`\n  ${c.dim(`Finding ${count} free port${count !== 1 ? 's' : ''} from ${start}...`)}`)
      const ports = findFreePorts(start, count)
      if (ports.length < count) {
        console.log(`  ${c.yellow('⚠')} Only found ${ports.length} free port${ports.length !== 1 ? 's' : ''} before port 65535`)
      }
      for (const p of ports) {
        console.log(`  ${c.green('✔')} ${c.bold(c.green(p))}`)
      }
      console.log()
      process.exit(0)
    }

    const { start, end } = parsePortRange(input)

    if (start === end) {
      const info = getPortInfo(start)
      if (!info) {
        console.log(`\n  ${c.green('✔')} Port ${c.bold(start)} is ${c.green('free')}\n`)
      } else {
        console.log(`\n  ${c.red('✘')} Port ${c.bold(start)} is ${c.red('occupied')} by ${c.yellow(info.name)} ${c.dim(`(PID ${info.pid})`)}\n`)
      }
    } else {
      console.log(`\n  ${c.dim(`Scanning ports ${start}–${end}...`)}`)
      const free = findFreePort(start, end)
      if (free) {
        console.log(`  ${c.green('✔')} First free port: ${c.bold(c.green(free))}\n`)
      } else {
        console.log(`  ${c.red('✘')} All ports ${start}–${end} are occupied\n`)
      }
    }
    process.exit(0)
  }

  // ── portcop <port> [port2 port3 ...] [--kill] ──
  const forceKill = args.includes('--kill') || args.includes('-k')
  const portArgs = args.filter(a => !a.startsWith('-') && !isNaN(Number(a)))

  if (portArgs.length === 0) {
    console.error(c.red(`  Error: unknown command "${args[0]}". Run portcop --help for usage.`))
    process.exit(1)
  }

  // Validate all ports first
  const ports = []
  for (const raw of portArgs) {
    const port = Number(raw)
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(c.red(`  Error: "${raw}" is not a valid port number (1–65535)`))
      process.exit(1)
    }
    ports.push(port)
  }

  // Multiple ports
  if (ports.length > 1) {
    console.log()
    const occupied = []
    for (const port of ports) {
      const info = getPortInfo(port)
      printPortInfo(port, info)
      if (info) occupied.push({ port, info })
    }
    console.log()

    if (occupied.length === 0) process.exit(0)

    if (forceKill) {
      for (const { port, info } of occupied) {
        try {
          killProcess(info.pid)
          console.log(`  ${c.green('✔')} Killed ${c.yellow(info.name)} on port ${port} (PID ${info.pid})`)
        } catch {
          console.error(c.red(`  Error: could not kill PID ${info.pid}. Try running with sudo.`))
        }
      }
      console.log()
      process.exit(0)
    }

    const answer = await ask(`  ${c.bold(`Kill all ${occupied.length} occupied?`)} ${c.dim('(y/n)')} `)
    if (answer === 'y' || answer === 'yes') {
      for (const { port, info } of occupied) {
        try {
          killProcess(info.pid)
          console.log(`  ${c.green('✔')} Killed ${c.yellow(info.name)} on port ${port} (PID ${info.pid})`)
        } catch {
          console.error(c.red(`  Error: could not kill PID ${info.pid}. Try running with sudo.`))
        }
      }
    } else {
      console.log(`  ${c.dim('No action taken.')}`)
    }
    console.log()
    process.exit(0)
  }

  // Single port
  const port = ports[0]
  console.log(`\n  ${c.dim(`Checking port ${port}...`)}`)
  const info = getPortInfo(port)

  if (!info) {
    console.log(`  ${c.green('✔')} Port ${c.bold(port)} is ${c.green('free — nothing running here')}\n`)
    process.exit(0)
  }

  console.log(`
  ${c.red('✘')} Port ${c.bold(port)} is occupied

    ${c.bold('Process :')} ${c.yellow(info.name)}
    ${c.bold('PID     :')} ${info.pid}${info.cmd ? `\n    ${c.bold('Command :')} ${c.dim(info.cmd.slice(0, 80))}` : ''}
`)

  if (forceKill) {
    try {
      killProcess(info.pid)
      console.log(`  ${c.green('✔')} Killed ${c.yellow(info.name)} (PID ${info.pid})\n`)
    } catch {
      console.error(c.red(`\n  Error: could not kill PID ${info.pid}. Try running with sudo.\n`))
      process.exit(1)
    }
    process.exit(0)
  }

  const answer = await ask(`  ${c.bold('Kill it?')} ${c.dim('(y/n)')} `)
  if (answer === 'y' || answer === 'yes') {
    try {
      killProcess(info.pid)
      console.log(`\n  ${c.green('✔')} Killed ${c.yellow(info.name)} (PID ${info.pid})\n`)
    } catch {
      console.error(c.red(`\n  Error: could not kill PID ${info.pid}. Try running with sudo.\n`))
      process.exit(1)
    }
  } else {
    console.log(`\n  ${c.dim('No action taken.')}\n`)
  }
}

main()