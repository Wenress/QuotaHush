# QuotaHush

A lightweight, local usage monitor for **Claude Code**, **OpenAI Codex**, **DeepSeek API**, and **Z.AI**, available from Chromium-based browsers and Visual Studio Code.

> [!NOTE]
> **Acknowledgement:** QuotaHush is inspired by [Robin Ebers' OpenUsage](https://github.com/robinebers/openusage), the original open-source project that made AI subscription usage, limits, and reset times immediately visible. Many thanks to its authors and contributors for the idea and their work.

> [!IMPORTANT]
> QuotaHush is an independent, unofficial project. It is not affiliated with or endorsed by Anthropic, OpenAI, Z.AI, or the project acknowledged above.

[Website](https://wenress.github.io/QuotaHush/) · [Verify downloads](VERIFYING_RELEASES.md) · [Privacy](https://wenress.github.io/QuotaHush/privacy.html) · [Support](SUPPORT.md) · [License](LICENSE)

## Quick start

QuotaHush has two parts: the **Companion**, which runs locally and retrieves
usage data, and one or both client extensions, which display it.

1. Authenticate at least one supported provider:

   ```bash
   claude auth login
   codex login
   ```

   DeepSeek and Z.AI are optional and can be configured later with API keys.

2. Install QuotaHush Companion:

   - **Windows:** download `QuotaHush-Setup-x64-<version>.exe` from the
     [latest release](https://github.com/Wenress/QuotaHush/releases/latest),
     then run the installer;
   - **Linux:** run the one-line installer shown in
     [Install the Companion](#install-the-companion).

3. Check that
   [http://127.0.0.1:8765/health](http://127.0.0.1:8765/health) reports a
   healthy QuotaHush Companion.

4. Install the Chromium or VS Code extension from the same release. Until the
   marketplace versions are available, follow the client instructions below.

5. Open the extension. Enabled providers appear automatically; a provider that
   has not been configured does not prevent the others from working.

## Why QuotaHush?

QuotaHush brings a lightweight AI-usage monitoring experience to Windows and Linux. It provides a quick view of usage windows, consumed percentages, reset times, plans, and available credits without requiring you to open each provider separately.

## Features

- Claude Code and Codex session and weekly usage limits;
- DeepSeek balance plus daily/monthly spend, tokens, and request counts;
- Z.AI Usage Bundle balance, expiration, and consumed-token percentage;
- plan, reset-time, and available-credit information;
- an extension for Chromium-based browsers;
- a VS Code extension with status-bar indicators and a dedicated panel;
- a lightweight local server with no third-party Python runtime dependencies;
- caching and backoff to avoid excessive upstream requests;
- automatic startup through Windows Task Scheduler or Linux `systemd --user`;
- installation with standard Python; `uv` is supported but optional.

## How it works

The repository contains three components:

1. **Local server** — reads the OAuth credentials already created by Claude Code and Codex CLI plus local DeepSeek and Z.AI credentials, queries their usage endpoints, and exposes a local HTTP API at `http://127.0.0.1:8765`.
2. **Browser extension** — queries the local server and displays the results in a popup.
3. **VS Code extension** — uses the same API to update the status bar and the QuotaHush panel once per minute.

The server exposes only two endpoints:

- `GET /health` checks whether the server is running;
- `GET /usage` returns the aggregated provider data.

The server binds exclusively to `127.0.0.1`, so it is not reachable from other devices on the network. Credentials stay on your computer and are never sent to the browser or VS Code extensions. They are used only to contact the original provider. If an access token expires, the server can use the CLI refresh token and safely update the corresponding local credentials file.

Claude, DeepSeek, and Z.AI responses are cached for five minutes. Codex uses a shorter cache. When a provider fails temporarily, QuotaHush may show the latest valid result and label it as cached data.

## Requirements

- Windows 10/11, or Linux with `systemd --user` for automatic startup;
- Claude Code and/or Codex CLI, already installed and authenticated;
- Chrome, Edge, Brave, or another Chromium-based browser for the browser popup;
- VS Code 1.80 or newer for the editor integration.

The standalone Windows companion does not require Python. Linux and source
installations require [Python 3.11 or newer](https://www.python.org/downloads/).
[`uv`](https://docs.astral.sh/uv/getting-started/installation/) is optional.

Node.js is required only for development or when building the VS Code extension package manually.

## Prepare your accounts

Configure at least one provider:

```bash
claude auth login
codex login
```

For DeepSeek and Z.AI, edit the configuration created by the companion:

- Windows: `%LOCALAPPDATA%\QuotaHush\.var.env`;
- Linux: `${XDG_CONFIG_HOME:-~/.config}/quotahush/.var.env`.

For a source checkout, copy the provided environment template in the repository
root. The resulting `.var.env` file is ignored by Git:

Windows PowerShell:

```powershell
Copy-Item .var.env.example .var.env
```

Linux:

```bash
cp .var.env.example .var.env
```

Then add only the credentials for the providers you want to enable. For
DeepSeek, configure the official API key:

```dotenv
DEEPSEEK_API_KEY=your-api-key
```

The API key enables the official balance check. The historical usage shown by
DeepSeek's web dashboard is not exposed to API keys. To also show today's and
this month's spend, token usage, and request count, add the separate platform
session credential:

```dotenv
DEEPSEEK_PLATFORM_TOKEN=your-userToken
```

After signing in at `platform.deepseek.com`, the value is available in browser
Developer Tools under Application → Local Storage → `userToken`. Treat it like
a password. The server sends it only to `platform.deepseek.com`; it is never
included in the local `/usage` response or client logs. These platform usage
endpoints are undocumented and may change without notice; a failure there does
not hide a valid balance result.

For Z.AI Usage Bundles, add the API key to the same `.var.env` file:

```dotenv
ZAI_API_KEY=your-api-key
```

Only active bundles are displayed. Their current token balance and expiration
time come from Z.AI's token-account endpoint. The consumed percentage is derived
from the package's fixed token magnitude and current available balance, and uses
the same green/yellow/red thresholds as the Claude and Codex usage windows.
Coding Plan and credit sections are omitted when the account has no corresponding
data.

By default, the server reads:

- Claude credentials from `~/.claude/.credentials.json`;
- Codex credentials from `~/.codex/auth.json`;
- DeepSeek credentials from the QuotaHush configuration file or the corresponding process environment variables;
- Z.AI credentials from the QuotaHush configuration file or the `ZAI_API_KEY` process environment variable.

The `CLAUDE_CONFIG_DIR` and `CODEX_HOME` environment variables are also supported.

## Install the Companion

Install and start QuotaHush Companion before adding either client.

### Windows — recommended

Download `QuotaHush-Setup-x64-<version>.exe` from the
[latest release](https://github.com/Wenress/QuotaHush/releases/latest) and run
it. The setup installs only for the current user and does not request
administrator privileges or download additional code. It creates the
configuration file, registers the `QuotaHushServer` scheduled task, starts the
Companion, and verifies its local health endpoint. Python is not required.

QuotaHush's Windows binaries are currently unsigned, so Windows may identify
the publisher as unknown. Download them only from the official Releases page
and follow [Verifying releases](VERIFYING_RELEASES.md) to compare the SHA-256
checksum or GitHub build provenance.

The `QuotaHush-Windows-x64-<version>.zip` archive remains available as a
portable and diagnostic option. Extract it to a permanent directory and either
run `quotahush-server.exe` directly or install automatic startup with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

For development directly from a source checkout, the legacy source installer
remains available:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\server\install_task.ps1
```

### Linux

Install the current version for your user account with:

```bash
curl --proto '=https' --tlsv1.2 -fsSL https://raw.githubusercontent.com/Wenress/QuotaHush/main/install.sh | bash
```

The bootstrap downloads the repository into
`${XDG_DATA_HOME:-~/.local/share}/quotahush/app`, creates a Python environment,
and installs the `quotahush-server` user service without requiring root access.
To install a specific release tag, export it before running the installer:

```bash
export QUOTAHUSH_REF=v0.1.2
curl --proto '=https' --tlsv1.2 -fsSL https://raw.githubusercontent.com/Wenress/QuotaHush/main/install.sh | bash
```

Some distributions package the `venv` module separately. If environment creation fails on Debian or Ubuntu, install it first:

```bash
sudo apt install python3-venv
```

### Manual startup without `uv`

No package installation is required because the server has no third-party runtime dependencies.

Windows PowerShell:

```powershell
py -3 -m venv .\server\.venv
.\server\.venv\Scripts\python.exe .\server\run_server.pyw
```

If the `py` launcher is unavailable, replace `py -3` with `python`.

Linux:

```bash
python3 -m venv ./server/.venv
./server/.venv/bin/python ./server/run_server.pyw
```

These commands keep the server in the foreground. Stop it with `Ctrl+C`.

### Optional `uv` workflow

If you prefer `uv`, run:

```bash
cd server
uv sync
uv run quotahush-server
```

### Verify the server

Open `http://127.0.0.1:8765/health` or run:

```bash
curl http://127.0.0.1:8765/health
```

Expected response:

```json
{"status": "ok", "product": "QuotaHush"}
```

## Install the browser extension

Download `quotahush-chromium-<version>.zip` from the
[latest release](https://github.com/Wenress/QuotaHush/releases/latest) and
extract it to a permanent directory. Then:

1. Open the browser's extensions page:
   - Chrome/Brave: `chrome://extensions`;
   - Edge: `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the directory containing the extracted extension files. If you are
   using a source checkout instead, choose its `extension` directory.
5. Pin QuotaHush to the browser toolbar for quick access.

The popup contacts the local server when opened and refreshes once per minute. Firefox is not currently supported.

## Install the VS Code extension

### From a VSIX file

Download `quotahush-vscode-<version>.vsix` from the
[latest release](https://github.com/Wenress/QuotaHush/releases/latest). Then:

1. open the VS Code **Extensions** view;
2. select the `...` menu;
3. choose **Install from VSIX...**;
4. select the downloaded file and reload VS Code when prompted.

Alternatively, use the command line:

```bash
code --install-extension quotahush-vscode-0.1.2.vsix
```

### Build the VSIX from source

First clone the repository (or use **Code → Download ZIP** on GitHub):

```bash
git clone https://github.com/Wenress/QuotaHush.git
cd QuotaHush
```

With Node.js installed, run from the repository root:

```bash
cd vscode-extension
npx --yes @vscode/vsce package --allow-missing-repository --skip-license --readmePath ../README.md
code --install-extension quotahush-local-0.1.2.vsix
```

After VS Code reloads, the status bar shows separate Claude, Codex, DeepSeek, and Z.AI indicators. The QuotaHush Activity Bar icon opens the full view. Run **QuotaHush: Refresh Usage** to force an immediate update.

## Update

1. on Windows, run the latest setup again; on Linux, rerun the one-line
   installer; for a source checkout, pull the latest changes and rerun its
   installation script;
2. select **Reload** for QuotaHush on the browser extensions page;
3. reinstall the new VSIX if you use the VS Code integration.

The installers can be run again safely when upgrading QuotaHush.

## Uninstall

### Windows — setup installer

Open **Settings → Apps → Installed apps**, find **QuotaHush Companion**, and
select **Uninstall**. The configuration file is preserved for future upgrades.

For the ZIP-based installation, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\Programs\QuotaHush\uninstall.ps1"
```

For a source installation, use the corresponding source uninstaller:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\server\uninstall_task.ps1
```

### Linux

```bash
bash "${XDG_DATA_HOME:-$HOME/.local/share}/quotahush/app/server/uninstall_linux.sh"
```

Then remove QuotaHush from the browser extensions page and the VS Code Extensions view. These scripts disable the service but do not delete the repository, Claude credentials, or Codex credentials.

## Troubleshooting

### A client reports that the server is offline

- check `http://127.0.0.1:8765/health`;
- on Windows, inspect the `QuotaHushServer` task in Task Scheduler;
- on Linux, run `systemctl --user status quotahush-server`;
- make sure another application is not already using port `8765`.

### Claude or Codex is not authenticated

Sign in to the affected provider again:

```bash
claude auth login
codex login
```

When using custom configuration directories, ensure `CLAUDE_CONFIG_DIR` or `CODEX_HOME` is also available to the automatically started process.

### Claude data appears delayed

This is expected: Claude responses are cached for five minutes to reduce rate limiting. The clients identify older responses as cached data.

### The native Python installation fails

Check the installed version:

```bash
python --version
```

QuotaHush requires Python 3.11 or newer. On Linux, also make sure the distribution's `python3-venv` package is installed. As an alternative, install `uv` and run the installer again.

### Server logs

Rotating diagnostic logs are stored at:

- Windows: `%LOCALAPPDATA%\QuotaHush\logs\server.log`;
- Linux: `~/.local/state/quotahush/server.log`.

Authentication tokens are redacted from log messages.

## Development

Clone the repository and enter its directory:

```bash
git clone https://github.com/Wenress/QuotaHush.git
cd QuotaHush
```

Regenerate the code shared by both clients and run the JavaScript tests:

```bash
npm run build
npm test
```

Run the Python tests without `uv` from the `server` directory:

```bash
PYTHONPATH=src .venv/bin/python -m unittest discover -s tests -v
```

PowerShell equivalent:

```powershell
$env:PYTHONPATH = "src"
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
Remove-Item Env:PYTHONPATH
```

With `uv`, you can use `PYTHONPATH=src uv run python -m unittest discover -s tests -v` instead.

The CI pipeline also checks Python, JavaScript, Bash, and PowerShell syntax and verifies that generated files and version numbers remain synchronized.

## Notes and limitations

- The Claude and Codex usage endpoints are not stable public APIs and may change without notice.
- The Z.AI token-account endpoint used for Usage Bundles is not part of the documented public API and may change without notice.
- QuotaHush displays the account currently authenticated in each CLI; multiple accounts are not supported.
- This repository does not collect telemetry.
- The unpacked browser extension must be reloaded manually after an update.

## License

This project is available under the [MIT License](LICENSE).
