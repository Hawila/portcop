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

### Check multiple ports at once

```bash
portcop 3000 4000 5000
```

```
  ✘ Port 3000 → node  PID 8421  node server.js
  ✔ Port 4000 is free
  ✘ Port 5000 → python  PID 9103  python app.py

  Kill all 2 occupied? (y/n)
```

---

### List all occupied ports

```bash
portcop ls
```

```
  Scanning all occupied ports...

  3000  node            PID 8421    node server.js
  5173  node            PID 9103    node vite.js
  8080  python          PID 9210    python manage.py runserver

  3 ports occupied
```

---

### Find processes by name

```bash
portcop -n node
```

```
  Searching for processes matching "node"...

  Found 3 processes matching "node"

  ✘ Port 3000  node  PID 8421
     node server.js
  ✘ Port 5173  node  PID 9103
     node vite.js
  ✘ Port 8080  node  PID 9210
     node webpack.js

  Kill all 3?  y / n / ports (e.g. 3000,5173,8080)
```

At the prompt you can:
- `y` — kill all matching processes
- `n` — cancel, no action taken
- `3000` — kill a single port only
- `3000,5173` — kill specific ports, leave the rest running

---

### Kill all processes by name (no prompt)

```bash
portcop -n node --kill
```

```
  ✔ Killed node (PID 8421)
  ✔ Killed node (PID 9103)
  ✔ Killed node (PID 9210)
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

### Find next N free ports

```bash
portcop free 3000+ --count 5
```

```
  Finding 5 free ports from 3000...
  ✔ 3000
  ✔ 3001
  ✔ 3003
  ✔ 3005
  ✔ 3006
```

---

## How it works

**macOS:** uses `lsof`

**Linux:** tries 3 strategies in order, using the first one that works:
1. `lsof` — available on most distros
2. `ss` — modern replacement for netstat, used when lsof isn't installed
3. `/proc/net/tcp` — pure Linux kernel file, no tools needed at all. Works in Docker containers, CI runners, and minimal environments where nothing is installed

**Windows:** chains `netstat -ano` → `tasklist` (no single command gives port + process name together)

| OS            | Kill              |
|---------------|-------------------|
| macOS / Linux | `kill -9 PID`     |
| Windows       | `taskkill /PID /F`|

All OS differences are abstracted away. The CLI output is identical everywhere.

> **Note:** On some systems, killing processes on privileged ports (< 1024) may require `sudo`.

---

## Options

| Flag        | Alias | Description                          |
|-------------|-------|--------------------------------------|
| `--kill`    | `-k`  | Kill without confirmation prompt     |
| `--name`    | `-n`  | Search by process name               |
| `--count N` |       | Number of free ports to find         |
| `--help`    | `-h`  | Show help                            |

---

## Commands

| Command                          | Description                              |
|----------------------------------|------------------------------------------|
| `portcop <port>`                 | Check who is using a port                |
| `portcop <port> --kill`          | Kill the process without asking          |
| `portcop <p1> <p2> <p3>`        | Check multiple ports at once             |
| `portcop ls`                     | List all occupied ports                  |
| `portcop -n <name>`              | Find all ports used by a process name    |
| `portcop -n <name> --kill`       | Kill all processes matching a name       |
| `portcop free <port>`            | Check if a port is free                  |
| `portcop free <start>-<end>`     | Find first free port in range            |
| `portcop free <port>+ --count N` | Find next N free ports starting from port|

## License

MIT