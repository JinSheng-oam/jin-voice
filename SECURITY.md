# Security Policy

## Supported Version

The current `main` branch is the only supported development version.

## Reporting

Do not open a public issue for credentials, authentication bypasses, remote code execution, or user-data exposure. Contact the repository owner privately with:

- affected version or commit
- reproduction steps
- expected impact
- suggested mitigation, if available

## Deployment Requirements

- Never commit `.env` files or SQLite databases.
- Replace all example administrator and TURN credentials.
- Set `CORS_ORIGIN` to the deployed web origin.
- Use HTTPS so the session cookie is `Secure`.
- Restrict `5000` behind a reverse proxy where possible.
- Open only the mediasoup and TURN port ranges documented in `README.md`.
- Back up the SQLite database before applying migrations.

TURN credentials are embedded in the frontend bundle and are therefore not long-term secrets. Use deployment-specific, limited credentials and rotate them. A future production hardening step should replace static TURN credentials with time-limited credentials.
