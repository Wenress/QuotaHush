# QuotaHush Support

Before reporting a problem:

1. check `http://127.0.0.1:8765/health`;
2. confirm that the affected provider CLI is authenticated or its API key is
   present in the QuotaHush configuration file;
3. retry **QuotaHush: Refresh Usage** in VS Code or reopen the browser popup;
4. review the local diagnostic log, making sure not to publish credentials.

Log locations:

- Windows: `%LOCALAPPDATA%\QuotaHush\logs\server.log`;
- Linux: `~/.local/state/quotahush/server.log`.

For bugs and feature requests, open a
[GitHub issue](https://github.com/Wenress/QuotaHush/issues) and include the
operating system, QuotaHush version, affected client, and redacted error text.
Never attach `.var.env`, Claude credentials, Codex authentication files, or
unredacted tokens.
