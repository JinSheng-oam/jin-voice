// mediasoup 配置文件
// JinVoice SFU Server

const isDevelopment = process.env.NODE_ENV !== 'production';
const resolvedListenIp = process.env.MEDIASOUP_LISTEN_IP || (isDevelopment ? '127.0.0.1' : '0.0.0.0');
const resolvedAnnouncedIp = process.env.MEDIASOUP_ANNOUNCED_IP || (isDevelopment ? '127.0.0.1' : undefined);

module.exports = {
    // mediasoup Worker 配置
    worker: {
        rtcMinPort: 40000,
        rtcMaxPort: 40100, // 与 Dockerfile EXPOSE 范围对齐
        logLevel: 'warn',
        logTags: [
            'info',
            'ice',
            'dtls',
            'rtp',
            'srtp',
            'rtcp'
        ]
    },

    // Router 配置（媒体编解码器）
    router: {
        mediaCodecs: [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2
            }
        ]
    },

    // WebRTC Transport 配置
    webRtcTransport: {
        listenIps: [
            {
                ip: resolvedListenIp,
                announcedIp: resolvedAnnouncedIp
            }
        ],
        initialAvailableOutgoingBitrate: 1000000,
        minimumAvailableOutgoingBitrate: 600000,
        maxSctpMessageSize: 262144,
        maxIncomingBitrate: 1500000,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
    }
};
