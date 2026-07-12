# JinVoice

English | [简体中文](README.md)

JinVoice is an open-source real-time voice room application for the web and Windows. It provides SFU-based group voice, public and private rooms, real-time chat, peer-to-peer file transfer, push-to-talk, and customizable themes.

> This project is under active development. Review the security and networking sections before exposing an instance to the internet.

## Features

- Group voice powered by a mediasoup SFU
- Guest access with optional account registration
- Public rooms, password-protected rooms, invite links, recent rooms, room rename, and deletion
- Host controls for room locking, mute requests, and member removal
- Public chat, private chat, and message deletion
- P2P file transfer with a 64 MB per-file limit to control browser memory usage
- Manual mute, voice activation, and customizable push-to-talk
- Browser noise suppression, RNNoise AI suppression, raw input, microphone boost, self-monitoring, and input level metering
- Per-member output volume from 0% to 500%
- Input device, output device, and audio output controls
- Light/dark themes, custom backgrounds, blur, and panel opacity
- Administrator accounts, member management, and site appearance management
- Windows Electron client with global push-to-talk for other applications and games

Group voice always uses the SFU. P2P connections are only used for file transfer.

## Technology

- Frontend: React 19, Vite, Zustand, Socket.IO Client
- Backend: Express 5, Socket.IO, Prisma 5, SQLite
- Real-time media: mediasoup / mediasoup-client
- File transfer: simple-peer
- Desktop: Electron

## Diagnostics and Releases

- Health check: `GET /api/health` returns the running version, commit, build time, database status, mediasoup listen settings, and uptime.
- Run `window.__jinvoiceDebug.getState()` in the browser console to inspect room join, reconnection, SFU, audio track, voice gate, and desktop state.
- Audio settings provide standard, AI, and raw input modes; diagnostics show the effective mode, browser constraints, and fallback reason, and can export a redacted JSON report.
- `npm run release` writes `release_info.json` and `.release_version` into the release bundle.
- After a successful `update_app.sh` run, `.jinvoice_version` records the current release and `.jinvoice_previous_version` keeps the previous successful release.

## Security

- Run `npm run verify` before committing
- Run `npm run release` before publishing a release archive
- Replace all example administrator and TURN credentials in production
- Release Docker deployments must configure `TURN_USER`; otherwise the TURN container fails fast
- Restrict `CORS_ORIGIN`
- Use HTTPS and a trusted reverse proxy
- Before automated deployments pull GHCR images, the server must already be logged in to `ghcr.io`, or the package must be public
- The deployment health check endpoint is `/api/health`
- TURN credentials are served to browsers at runtime through `/api/client-config` and are not passed as Docker build arguments

See [SECURITY.md](SECURITY.md) for vulnerability reporting. Do not disclose credentials or exploitable vulnerabilities in a public issue.

## License

[MIT](LICENSE)
