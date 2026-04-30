# portcop 🚔

> Your cross-platform port detective — find, inspect, and kill processes by port number.

No dependencies. Works on **macOS**, **Linux**, and **Windows**.

---

## Why

Every fullstack developer has googled `lsof -i :3000` at least once a week. `portcop` makes it one clean command that works everywhere — no memorizing OS-specific flags, no piping through grep, no copy-pasting PIDs.

---

## Install

```bash
npm install -g portcop
```

---

## Usage

### Check what's on a port

```bash
portcop 3000
```

```
  Checking port 3000...

  ✘ Port 3000 is occupied

    Process : node
    PID     : 8421
    Command : node server.js

  Kill it? (y/n)
```

---

### Kill immediately without prompt

```bash
portcop 3000 --kill
```

```
  ✔ Killed node (PID 8421)
```

---

### Check if a port is free

```bash
portcop free 3000
```

```
  ✔ Port 3000 is free
```

---

### Find first free port in a range

```bash
portcop free 3000-3010
```

```
  Scanning ports 3000–3010...
  ✔ First free port: 3003
```

---

## How it works

| OS      | Detection              | Kill              |
|---------|------------------------|-------------------|
| macOS   | `lsof -i :PORT`        | `kill -9 PID`     |
| Linux   | `lsof -i :PORT`        | `kill -9 PID`     |
| Windows | `netstat -ano`         | `taskkill /F`     |

All OS differences are abstracted away. The CLI output is identical everywhere.

> **Note:** On some systems, killing processes on privileged ports (< 1024) may require `sudo`.

---

## Options

| Flag | Alias | Description |
|------|-------|-------------|
| `--kill` | `-k` | Kill without confirmation prompt |
| `--help` | `-h` | Show help |

---

## License

MIT
