const { EventEmitter } = require('events');
const mediasoup = require('mediasoup');
const config = require('./config');
const Room = require('./Room');

class MediasoupManager extends EventEmitter {
    constructor() {
        super();
        this.workers = [];
        this.nextWorkerIdx = 0;
        this.rooms = new Map();
        this.roomCreationPromises = new Map();
        this.targetWorkerCount = 0;
        this.recovering = false;
        this.closing = false;
        this.lastWorkerError = null;
        this.recoveryTimer = null;
    }

    async init(numWorkers = 1) {
        this.targetWorkerCount = Math.max(1, numWorkers);
        this.closing = false;

        while (this.workers.length < this.targetWorkerCount) {
            this.workers.push(await this._createWorker());
        }
        this.lastWorkerError = null;
    }

    async _createWorker() {
        const worker = await mediasoup.createWorker({
            logLevel: config.worker.logLevel,
            logTags: config.worker.logTags,
            rtcMinPort: config.worker.rtcMinPort,
            rtcMaxPort: config.worker.rtcMaxPort
        });

        worker.on('died', (error) => {
            if (!this.closing) {
                void this._handleWorkerDied(worker, error);
            }
        });

        return worker;
    }

    async _handleWorkerDied(worker, error) {
        this.workers = this.workers.filter((candidate) => candidate !== worker && !candidate.closed);
        this.lastWorkerError = error?.message || 'mediasoup worker exited unexpectedly';
        this._closeAllRooms();
        this.emit('recovering', this.getHealthState());
        await this._recoverWorkers();
    }

    async _recoverWorkers() {
        if (this.recovering || this.closing) return;
        this.recovering = true;

        try {
            while (this.workers.length < this.targetWorkerCount) {
                this.workers.push(await this._createWorker());
            }
            this.lastWorkerError = null;
            this.emit('recovered', this.getHealthState());
        } catch (error) {
            this.lastWorkerError = error?.message || 'Failed to restart mediasoup worker';
            this._scheduleRecovery();
        } finally {
            this.recovering = false;
        }
    }

    _scheduleRecovery() {
        if (this.recoveryTimer || this.closing) return;
        this.recoveryTimer = setTimeout(() => {
            this.recoveryTimer = null;
            void this._recoverWorkers();
        }, 5000);
        this.recoveryTimer.unref?.();
    }

    getNextWorker() {
        const availableWorkers = this.workers.filter((worker) => !worker.closed);
        if (availableWorkers.length === 0) {
            throw new Error('mediasoup worker is not available');
        }

        const worker = availableWorkers[this.nextWorkerIdx % availableWorkers.length];
        this.nextWorkerIdx = (this.nextWorkerIdx + 1) % availableWorkers.length;
        return worker;
    }

    async getOrCreateRoom(roomId) {
        if (this.rooms.has(roomId)) {
            return this.rooms.get(roomId);
        }

        if (this.roomCreationPromises.has(roomId)) {
            return this.roomCreationPromises.get(roomId);
        }

        const creationPromise = (async () => {
            const worker = this.getNextWorker();
            const router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });

            if (this.closing || worker.closed) {
                router.close();
                throw new Error('mediasoup worker became unavailable while creating room');
            }

            if (this.rooms.has(roomId)) {
                router.close();
                return this.rooms.get(roomId);
            }

            const room = new Room(roomId, router);
            this.rooms.set(roomId, room);
            return room;
        })();

        this.roomCreationPromises.set(roomId, creationPromise);
        try {
            return await creationPromise;
        } finally {
            if (this.roomCreationPromises.get(roomId) === creationPromise) {
                this.roomCreationPromises.delete(roomId);
            }
        }
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    removeRoomIfEmpty(roomId) {
        const room = this.rooms.get(roomId);
        if (room && room.peerCount === 0) {
            room.close();
            this.rooms.delete(roomId);
            return true;
        }
        return false;
    }

    removeRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return false;

        room.close();
        this.rooms.delete(roomId);
        return true;
    }

    getHealthState() {
        const activeWorkerCount = this.workers.filter((worker) => !worker.closed).length;
        return {
            status: !this.closing && !this.recovering && activeWorkerCount >= this.targetWorkerCount
                ? 'ok'
                : 'degraded',
            workerCount: activeWorkerCount,
            targetWorkerCount: this.targetWorkerCount,
            recovering: this.recovering,
            roomCount: this.rooms.size,
            lastError: this.lastWorkerError
        };
    }

    _closeAllRooms() {
        for (const room of this.rooms.values()) {
            try {
                room.close();
            } catch {
                /* worker death may already have closed the router */
            }
        }
        this.rooms.clear();
        this.roomCreationPromises.clear();
    }

    async close() {
        this.closing = true;
        if (this.recoveryTimer) {
            clearTimeout(this.recoveryTimer);
            this.recoveryTimer = null;
        }

        this._closeAllRooms();
        for (const worker of this.workers) {
            if (!worker.closed) {
                worker.close();
            }
        }
        this.workers = [];
    }
}

module.exports = new MediasoupManager();
