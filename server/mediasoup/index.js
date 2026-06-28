// mediasoup Worker 管理器
// 负责创建 Worker 和管理 Room 实例

const mediasoup = require('mediasoup');
const config = require('./config');
const Room = require('./Room');

class MediasoupManager {
    constructor() {
        this.workers = [];
        this.nextWorkerIdx = 0;
        this.rooms = new Map(); // Map<roomId, Room>
    }

    // 初始化 Worker（应在服务器启动时调用）
    async init(numWorkers = 1) {
        console.log(`[Mediasoup] Creating ${numWorkers} worker(s)...`);

        for (let i = 0; i < numWorkers; i++) {
            const worker = await mediasoup.createWorker({
                logLevel: config.worker.logLevel,
                logTags: config.worker.logTags,
                rtcMinPort: config.worker.rtcMinPort,
                rtcMaxPort: config.worker.rtcMaxPort
            });

            worker.on('died', (error) => {
                console.error(`[Mediasoup] Worker died:`, error);
                // 可以在这里实现自动重启逻辑
            });

            this.workers.push(worker);
            console.log(`[Mediasoup] Worker ${i + 1} created, pid: ${worker.pid}`);
        }

        console.log(`[Mediasoup] ${this.workers.length} worker(s) ready`);
    }

    // 获取下一个可用的 Worker（简单轮询）
    getNextWorker() {
        const worker = this.workers[this.nextWorkerIdx];
        this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
        return worker;
    }

    // 获取或创建房间
    async getOrCreateRoom(roomId) {
        if (this.rooms.has(roomId)) {
            return this.rooms.get(roomId);
        }

        // 创建新房间
        const worker = this.getNextWorker();
        const router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
        const room = new Room(roomId, router);
        this.rooms.set(roomId, room);

        console.log(`[Mediasoup] Room ${roomId} created`);
        return room;
    }

    // 获取已存在的房间
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    // 删除空房间
    removeRoomIfEmpty(roomId) {
        const room = this.rooms.get(roomId);
        if (room && room.peerCount === 0) {
            room.close();
            this.rooms.delete(roomId);
            console.log(`[Mediasoup] Empty room ${roomId} removed`);
            return true;
        }
        return false;
    }

    removeRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }

        room.close();
        this.rooms.delete(roomId);
        console.log(`[Mediasoup] Room ${roomId} removed`);
        return true;
    }

    // 关闭所有
    async close() {
        for (const room of this.rooms.values()) {
            room.close();
        }
        this.rooms.clear();

        for (const worker of this.workers) {
            worker.close();
        }
        this.workers = [];
        console.log('[Mediasoup] All workers closed');
    }
}

// 单例模式
const manager = new MediasoupManager();

module.exports = manager;
