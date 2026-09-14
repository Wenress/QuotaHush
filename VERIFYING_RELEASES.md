# Verifying QuotaHush releases

QuotaHush release binaries are currently not signed with an Authenticode code
signing certificate. Windows may therefore display **Unknown publisher** or a
Microsoft Defender SmartScreen warning. This is a statement about publisher
identity, not proof that a file is safe or unsafe.

Download QuotaHush only from the official
[GitHub Releases](https://github.com/Wenress/QuotaHush/releases) page. The
Windows installer is per-user, does not request administrator privileges, and
does not download or execute additional code from the internet during setup.

## Verify the SHA-256 checksum

Download `SHA256SUMS.txt` from the same release as the artifact. In PowerShell,
calculate the downloaded file's checksum:

```powershell
Get-FileHash .\QuotaHush-Setup-x64-0.1.1.exe -Algorithm SHA256
```

The displayed hash must exactly match the corresponding line in
`SHA256SUMS.txt`. Version numbers in filenames change between releases.

## Verify GitHub build provenance

Tagged release artifacts are built on a GitHub-hosted runner and receive a
signed GitHub artifact attestation. With the GitHub CLI installed, verify an
artifact with:

```powershell
gh attestation verify .\QuotaHush-Setup-x64-<version>.exe --repo Wenress/QuotaHush
```

Successful verification connects the artifact's digest to QuotaHush's public
release workflow and source revision. It does not replace Authenticode and does
not change what Windows displays for the publisher.

## Build transparency

The complete build and packaging workflow is available in
[`.github/workflows/release.yml`](.github/workflows/release.yml). It builds the
standalone Companion, creates the Windows setup and portable archive, packages
both client extensions, calculates release checksums, and records provenance.
