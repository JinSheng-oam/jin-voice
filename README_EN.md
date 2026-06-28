# JinVoice

English | [简体中文](README.md)

JinVoice is an open-source real-time voice room application for the web and Windows. It provides SFU-based group voice, public and private rooms, real-time chat, peer-to-peer file transfer, push-to-talk, and customizable themes.

> This project is under active development. Review the security and networking sections before exposing an instance to the internet.

## Features

- Group voice powered by a mediasoup SFU
- Guest access with optional account registration
- Public rooms, password-protected rooms, room rename and deletion
- Public chat, private chat, and message deletion
- P2P file transfer with a 256 MB per-file limit
- Manual mute, voice activation, and customizable push-to-talk
- Microphone boost, light noise reduction, self-monitoring, and input level meter
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

## Security

- Run `npm run verify` before committing
- Run `npm run release` before publishing a release archive
- Replace all example administrator and TURN credentials in production
- Release Docker deployments must configure `TURN_USER`; otherwise the TURN container fails fast
- Restrict `CORS_ORIGIN`
- Use HTTPS and a trusted reverse proxy
- Before automated deployments pull GHCR images, the server must already be logged in to `ghcr.io`, or the package must be public
- The deployment health check endpoint is `/api/health`
- TURN credentials are embedded in the frontend bundle and are not long-term secrets

See [SECURITY.md](SECURITY.md) for vulnerability reporting. Do not disclose credentials or exploitable vulnerabilities in a public issue.

## License

[MIT](LICENSE)
