# Graphite Scientific

An offline scientific calculator for Windows with natural math display. Built with Electron and plain JavaScript.

## Download

[**Download the latest release**](https://github.com/theaibot2011/Scientific-calculator/releases/latest)

Older versions are on the [Releases page](https://github.com/theaibot2011/Scientific-calculator/releases).

## Install

1. Download `Graphite-Scientific-Setup-<version>.exe` from the latest release
2. Double-click it and follow the installer
3. Open Graphite Scientific from your Start menu or desktop

## Verify your download

Every release includes a SHA-256 hash and a VirusTotal scan in its release notes. To check your file, run this in PowerShell:

    Get-FileHash .\Graphite-Scientific-Setup-<version>.exe -Algorithm SHA256

If the hash matches the one in the release notes, the file is unmodified.

## Windows SmartScreen warning

The app isn't code-signed yet, so Windows may say "Windows protected your PC". Click **More info**, then **Run anyway**.

## Build from source

    npm ci
    npm test
    npm run dist

The installer and portable exe appear in `dist/`.

## Requirements

- Windows 10 or 11

## License

MIT. See [LICENSE.txt](LICENSE.txt). Third-party notices are in [NOTICE.md](NOTICE.md).
