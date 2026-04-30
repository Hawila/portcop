#!/usr/bin/env node

import * as readline from 'readline'
import { getPortInfo, killProcess, findFreePort, parsePortRange } from '../src/index.js'

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
    portcop ${c.yellow('<port>')}                 Check who is using a port
    portcop ${c.yellow('<port>')} --kill           Kill the process without asking
    portcop free ${c.yellow('<port>')}             Check if a port is free
    portcop free ${c.yellow('<start>-<end>')}      Find first free port in range
    portcop --help                  Show this help

  ${c.bold('Examples:')}
    portcop 3000
    portcop 8080 --kill
    portcop free 3000
    portcop free 3000-3010
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

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  // ── portcop free <port|range> ──
  if (args[0] === 'free') {
    const input = args[1]
    if (!input) {
      console.error(c.red('  Error: please provide a port or range, e.g. portcop free 3000-3010'))
      process.exit(1)
    }

    const { start, end } = parsePortRange(input)

    if (start === end) {
      // Single port check
      const info = getPortInfo(start)
      if (!info) {
        console.log(`\n  ${c.green('✔')} Port ${c.bold(start)} is ${c.green('free')}\n`)
      } else {
        console.log(`\n  ${c.red('✘')} Port ${c.bold(start)} is ${c.red('occupied')} by ${c.yellow(info.name)} ${c.dim(`(PID ${info.pid})`)}\n`)
      }
    } else {
      // Range check
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

  // ── portcop <port> [--kill] ──
  const port = Number(args[0])
  const forceKill = args.includes('--kill') || args.includes('-k')

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(c.red(`  Error: "${args[0]}" is not a valid port number (1–65535)`))
    process.exit(1)
  }

  console.log(`\n  ${c.dim(`Checking port ${port}...`)}`)
  const info = getPortInfo(port)

  if (!info) {
    console.log(`  ${c.green('✔')} Port ${c.bold(port)} is ${c.green('free — nothing running here')}\n`)
    process.exit(0)
  }

  // Port is occupied
  console.log(`
  ${c.red('✘')} Port ${c.bold(port)} is occupied

    ${c.bold('Process :')} ${c.yellow(info.name)}
    ${c.bold('PID     :')} ${info.pid}${info.cmd ? `\n    ${c.bold('Command :')} ${c.dim(info.cmd.slice(0, 80))}` : ''}
`)

  if (forceKill) {
    killProcess(info.pid)
    console.log(`  ${c.green('✔')} Killed ${c.yellow(info.name)} (PID ${info.pid})\n`)
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
