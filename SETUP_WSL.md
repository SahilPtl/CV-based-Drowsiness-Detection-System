# Windows + Ubuntu WSL setup

## 1. Open Ubuntu and find the real project

Launch **Ubuntu-22.04** from the Windows Start menu. The tested installation already has nvm and Linux Node 22.12.0. In Ubuntu:

```bash
source ~/.nvm/nvm.sh
cd '/mnt/c/Users/sahil/OneDrive/Documents/ChatGPT/IPCV drowsiness detection system'
nvm use
node --version
npm --version
command -v node
command -v npm
```

The tested outputs were `v22.12.0`, `11.1.0`, and paths under `/home/sahil/.nvm/versions/node/v22.12.0/bin/`. If npm resolves to `/mnt/c/Program Files/npm`, nvm is not loaded: run `source ~/.nvm/nvm.sh` again. Avoid Windows npm inside Ubuntu.

Windows `C:\Users\...` becomes Ubuntu `/mnt/c/Users/...`. Quotes are necessary because this project's folder name has spaces. No project copy in `~/projects/` was created by this implementation.

## 2. If Linux Node/nvm is missing

The official [Node download guide](https://nodejs.org/en/download) documents nvm installation. The selected project's `.nvmrc` preserves the exact tested version. For a current fresh toolchain, Node 24 LTS is compatible with the package engines; the actual checked build used Node 22.12.0. Follow the official page for the current nvm installer version; the version checked during implementation was v0.40.7:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh | bash
source ~/.nvm/nvm.sh
cd '/mnt/c/Users/sahil/OneDrive/Documents/ChatGPT/IPCV drowsiness detection system'
nvm install
nvm use
node --version
npm --version
```

`nvm install` without a version reads `.nvmrc`. To intentionally use the current LTS instead, use `nvm install 24` and `nvm use 24`; retest the commands in TESTING.md. Do not install Node through Ubuntu's potentially older default apt package for this application.

## 3. Exact primary startup sequence

In Ubuntu, from the actual workspace:

```bash
source ~/.nvm/nvm.sh
cd '/mnt/c/Users/sahil/OneDrive/Documents/ChatGPT/IPCV drowsiness detection system'
nvm use
npm ci
npm run setup:assets
code .
npm run dev
```

`code .` requires Windows VS Code with Microsoft's WSL extension. The lower-left VS Code status should show WSL: Ubuntu-22.04. Run npm from its Ubuntu terminal. VS Code integration instructions are included, but launching VS Code was not part of automated verification.

In **Windows Chrome or Edge**, visit **http://localhost:5173/**. Vite binds to `0.0.0.0` so Windows can reach the WSL server; `0.0.0.0` is a bind address, not the browser address.

1. Click **Start session** and allow camera access for localhost. The browser accesses the Windows webcam; USB passthrough into WSL is unnecessary.
2. Click **Test Alarm**. Check Windows output volume and the browser tab's mute state.
3. Select the intended camera. Device names may appear only after permission.
4. Click **Calibrate**, read the positioning guide, then **Begin calibration**. Keep eyes naturally open until successful.
5. After the demonstration, click **Stop session**, export JSON if wanted, and press **Ctrl+C** in Ubuntu to stop Vite.

For subsequent runs, `source ~/.nvm/nvm.sh`, `cd ...`, `nvm use`, and `npm run dev` are enough. Installation and asset setup are needed after a fresh checkout or dependency change. If dependencies/assets already exist, runtime can be offline.

## Optional Linux-filesystem copy

Direct use of `/mnt/c` was tested. Linux filesystem projects often install faster and avoid OneDrive synchronization overhead. To make a new copy explicitly (choose an unused destination):

```bash
mkdir -p ~/projects
mkdir ~/projects/drowsiness-detection
cd '/mnt/c/Users/sahil/OneDrive/Documents/ChatGPT/IPCV drowsiness detection system'
tar --exclude='./node_modules' --exclude='./dist' --exclude='./.git' -cf - . | tar -xf - -C ~/projects/drowsiness-detection
cd ~/projects/drowsiness-detection
source ~/.nvm/nvm.sh
nvm use
npm ci
npm run setup:assets
code .
npm run dev
```

If `mkdir ~/projects/drowsiness-detection` says it exists, inspect that folder or choose another name before copying; do not overwrite unrelated work. Never share `node_modules` between Windows and Linux. This copy procedure is documented, not claimed as executed.

## Production/offline rehearsal

```bash
npm run build
npm run preview
```

Open **http://localhost:4173/**. Keep localhost reachable while blocking external connections, and use a fresh browser profile/context with an empty cache. The automated browser test does this with routing and a real local model, but uses blank synthetic camera video. A fresh physical-camera rehearsal remains necessary.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `node` missing / Windows npm appears | Load `~/.nvm/nvm.sh`, `nvm use`, check both executable paths |
| Unsupported Node engine | Use Linux Node 22.12+ or Node 24 LTS; do not use the inspected Windows Node 20.16 |
| Port 5173 already in use | Stop the old Vite terminal with Ctrl+C, then restart; strictPort prevents silent URL changes |
| Windows localhost unreachable | Confirm Ubuntu server is running, try `curl http://localhost:5173/` inside Ubuntu; restart WSL if localhost forwarding is stale |
| Permission denied | Use the site's camera permission control in the address bar, allow it, then click Start; no automatic reprompt loop |
| No/busy camera | Enable/connect webcam and close Teams/Zoom/other camera apps; select the correct device |
| Model initialization error / 404 | Stop, run `npm run setup:assets`, rebuild for preview, reload and click Start |
| Audio blocked or silent | Click Test Alarm, increase volume, unmute tab/output, check speaker device |
| No face / eyes unclear | Face forward, even front lighting, one person, remove occlusion; check glare on glasses |
| Large gaps or stale tracking | Close heavy applications; read measured latency/update rate; CPU fallback may be slower |
| Tab was hidden | Return to it; camera stays on while hidden but inference/alarm pause and fresh acquisition is required |
| Another student takes over | Stop/Start for a fresh session, or recalibrate for the new person; avoid inheriting someone else's thresholds |

The application has no backend to start. Do not open `index.html` directly with `file://`; module loading and camera security require localhost/HTTPS.
