# Contributing to QuotaHush

Thanks for helping improve QuotaHush. Bug reports, documentation corrections,
and focused pull requests are welcome.

## Before opening an issue

Check the latest release and existing issues first. For support requests,
follow [SUPPORT.md](SUPPORT.md). Never post credentials, `.var.env` contents,
authentication files, or unredacted logs. Report security problems privately
as described in [SECURITY.md](SECURITY.md).

## Development setup

QuotaHush requires Node.js 20 and Python 3.11 or newer. From the repository
root:

```bash
npm install
npm run build
npm test
PYTHONPATH=server/src python -m unittest discover -s server/tests -v
```

Before submitting a pull request, also run:

```bash
npm run check:generated
npm run check:version
bash -n install.sh server/install_linux.sh server/uninstall_linux.sh
```

GitHub Actions repeats the supported checks on every push and pull request.

## Pull requests

- Keep changes focused and explain the user-visible behavior.
- Add or update tests when behavior changes.
- Update the README, website, or privacy policy when installation, network
  access, storage, or credentials change.
- Do not commit generated packages, local configuration, credentials, or logs.
- Do not change release versions in a pull request unless a maintainer asks;
  maintainers synchronize versions and create release tags.
- Preserve the local-only API boundary and redact secrets from diagnostics.

By contributing, you agree that your contribution is licensed under the
project's [MIT License](LICENSE).
