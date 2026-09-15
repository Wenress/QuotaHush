# QuotaHush Privacy Policy

Last updated: September 15, 2026

QuotaHush is a local companion service with browser and Visual Studio Code
clients. It has no project-operated backend, advertising, analytics, telemetry,
or crash-reporting service.

## Data processed locally

QuotaHush may read credentials that the user has already stored for Claude Code
and Codex CLI. It may also read DeepSeek and Z.AI credentials that the user
places in the QuotaHush configuration file. Credentials are used only to make
requests to the corresponding provider and are never returned by the local API
or displayed by the clients.

The Visual Studio Code client can optionally accept DeepSeek and Z.AI
credentials through a masked input and write them directly to the same local
QuotaHush configuration file. These values are not stored in VS Code settings,
Settings Sync, extension state, telemetry, or logs.

The local clients receive normalized usage information such as plan names,
quota percentages, reset times, credit balances, spend, token counts, and
request counts. QuotaHush does not read prompts or conversation contents.

## Network communication

QuotaHush Companion contacts only the provider endpoints needed for the
features the user enables. The browser and Visual Studio Code extensions
contact the companion through `http://127.0.0.1:8765` on the same computer.
QuotaHush does not transmit credentials or usage information to the project
authors.

Installed Companions also contact GitHub's release API and official GitHub
release download URLs to check for stable updates. Automatic updating can be
disabled with `QUOTAHUSH_AUTO_UPDATE=0` in the QuotaHush configuration file.
Release artifacts are checked against the published SHA-256 file before they
are installed.

## Local storage

Provider responses may be cached locally to reduce upstream requests and to
show the last valid result during temporary failures. Diagnostic logs are
stored locally and redact authentication tokens. Claude Code and Codex CLI
credentials remain in their original files; refreshed CLI credentials may be
written back to those files using conservative atomic updates.

Default QuotaHush locations are:

- Windows configuration and logs: `%LOCALAPPDATA%\QuotaHush`;
- Linux configuration: `${XDG_CONFIG_HOME:-~/.config}/quotahush`;
- Linux cache and state: `~/.cache/quotahush` and
  `~/.local/state/quotahush`.

On Windows, downloaded updates are kept under
`%LOCALAPPDATA%\QuotaHush\updates` and updater activity is written to
`%LOCALAPPDATA%\QuotaHush\logs\updater.log`.

Uninstalling the companion does not delete provider credentials. The user may
remove the QuotaHush directories above to delete its configuration, cache, and
logs.

## Browser permission

The Chromium extension requests access only to
`http://127.0.0.1:8765/*`. This permission is used exclusively to retrieve
usage information from QuotaHush Companion on the same computer.

## Third-party services

Requests made to Claude, OpenAI, DeepSeek, and Z.AI are governed by those
providers' own terms and privacy policies. QuotaHush is independent and is not
affiliated with or endorsed by those providers.

## Contact

Privacy questions and reports can be submitted through the
[QuotaHush issue tracker](https://github.com/Wenress/QuotaHush/issues).
