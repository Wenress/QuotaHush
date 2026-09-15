# QuotaHush for Visual Studio Code

QuotaHush shows Claude Code, Codex, DeepSeek, and Z.AI usage in the Visual
Studio Code status bar and Activity Bar.

The extension is a lightweight local client. Install
[QuotaHush Companion](https://github.com/Wenress/QuotaHush/releases) on the
same computer before using it. The extension contacts only
`http://127.0.0.1:8765` and contains no telemetry.

Run **QuotaHush: Configure Tracked Providers** from the Command Palette to set
Claude, Codex, DeepSeek, or Z.AI to `auto`, `enabled`, or `disabled`. Disabled
providers are hidden from both the status bar and the Usage view.

Run **QuotaHush: Configure API Credentials** to securely set, replace, or remove
DeepSeek and Z.AI credentials through a masked input. Values are written to the
Companion's local `.var.env` file, not VS Code settings or Settings Sync.

See the [installation guide](https://wenress.github.io/QuotaHush/#install),
[privacy policy](https://wenress.github.io/QuotaHush/privacy.html), and
[support guide](https://github.com/Wenress/QuotaHush/blob/main/SUPPORT.md).
