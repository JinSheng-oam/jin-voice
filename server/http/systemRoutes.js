const express = require('express');
const { getRuntimeVersionInfo } = require('../runtimeInfo');

const PUBLIC_STUN_SERVERS = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
    'stun:stun3.l.google.com:19302'
];

const parseTurnUser = (value = '') => {
    const rawValue = String(value || '').trim();
    if (!rawValue.includes(':')) return null;
    const separatorIndex = rawValue.indexOf(':');
    const username = rawValue.slice(0, separatorIndex).trim();
    const credential = rawValue.slice(separatorIndex + 1).trim();
    return username && credential ? { username, credential } : null;
};

const getPublicIceConfig = (req, env = process.env) => {
    const iceServers = PUBLIC_STUN_SERVERS.map((urls) => ({ urls }));
    const turnCredentials = parseTurnUser(env.TURN_USER);
    const turnHost = String(env.TURN_HOST || env.MEDIASOUP_ANNOUNCED_IP || req.hostname || '').trim();
    if (turnCredentials && turnHost) {
        iceServers.push({
            urls: [`turn:${turnHost}:3478`, `turn:${turnHost}:3478?transport=tcp`],
            username: turnCredentials.username,
            credential: turnCredentials.credential
        });
    }
    return { iceServers, iceCandidatePoolSize: 10 };
};

const createSystemRouter = ({ prisma, mediasoupManager, mediasoupConfig }) => {
    const router = express.Router();
    router.get('/client-config', (req, res) => res.json({ connection: getPublicIceConfig(req) }));
    router.get('/health', async (req, res) => {
        const versionInfo = getRuntimeVersionInfo();
        const mediasoupHealth = mediasoupManager.getHealthState();
        const database = { status: 'ok' };
        try {
            await prisma.$queryRaw`SELECT 1`;
        } catch (error) {
            database.status = 'error';
            database.message = error.message;
        }
        const health = {
            status: database.status === 'ok' && mediasoupHealth.status === 'ok' ? 'ok' : 'degraded',
            version: versionInfo.version,
            gitCommit: versionInfo.gitCommit,
            gitBranch: versionInfo.gitBranch,
            builtAt: versionInfo.builtAt,
            uptime: process.uptime(),
            database,
            mediasoup: {
                ...mediasoupHealth,
                listenIp: mediasoupConfig.webRtcTransport.listenIps[0]?.ip || null,
                announcedIp: mediasoupConfig.webRtcTransport.listenIps[0]?.announcedIp || null,
                rtcMinPort: mediasoupConfig.worker.rtcMinPort,
                rtcMaxPort: mediasoupConfig.worker.rtcMaxPort,
                udpEnabled: Boolean(mediasoupConfig.webRtcTransport.enableUdp),
                tcpEnabled: Boolean(mediasoupConfig.webRtcTransport.enableTcp),
                preferUdp: Boolean(mediasoupConfig.webRtcTransport.preferUdp)
            }
        };
        return res.status(health.status === 'ok' ? 200 : 503).json(health);
    });
    return router;
};

module.exports = { PUBLIC_STUN_SERVERS, createSystemRouter, getPublicIceConfig, parseTurnUser };
