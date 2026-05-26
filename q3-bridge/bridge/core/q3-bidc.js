/**
 * Q3 Bidirectional Channels (bidc)
 * 
 * Persistent bidirectional streaming channels between Q3 nodes.
 * Unlike HTTP request/response, bidc maintains open connections
 * for continuous data flow.
 * 
 * Benefits:
 * - Single connection for all shards (not N connections)
 * - Wire-speed throughput
 * - Built-in backpressure handling
 * - Works seamlessly with AevIP
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

// Channel states
const ChannelState = {
    CLOSED: 'closed',
    OPENING: 'opening',
    OPEN: 'open',
    CLOSING: 'closing'
};

// Message types
const BidcMessageType = {
    HANDSHAKE: 0x01,
    HANDSHAKE_ACK: 0x02,
    SHARD_DATA: 0x10,
    SHARD_ACK: 0x11,
    SHARD_REQUEST: 0x12,
    STREAM_START: 0x20,
    STREAM_CHUNK: 0x21,
    STREAM_END: 0x22,
    HEARTBEAT: 0x30,
    CLOSE: 0xFF
};

class BidcChannel extends EventEmitter {
    constructor(options = {}) {
        super();

        this.channelId = options.channelId || crypto.randomBytes(8).toString('hex');
        this.peerId = options.peerId || null;
        this.state = ChannelState.CLOSED;

        this.config = {
            heartbeatInterval: options.heartbeatInterval || 30000,
            chunkSize: options.chunkSize || 64 * 1024, // 64KB chunks
            maxQueueSize: options.maxQueueSize || 100,
            timeout: options.timeout || 30000
        };

        // Message queues
        this.sendQueue = [];
        this.receiveBuffer = new Map();
        this.pendingAcks = new Map();

        // Statistics
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            bytesSent: 0,
            bytesReceived: 0,
            shardsSent: 0,
            shardsReceived: 0
        };

        // Heartbeat timer
        this.heartbeatTimer = null;

        // Underlying transport (WebSocket, AevIP, etc.)
        this.transport = options.transport || null;
    }

    /**
     * Open the channel
     */
    async open(transport) {
        if (this.state !== ChannelState.CLOSED) {
            throw new Error(`Cannot open channel in state: ${this.state}`);
        }

        this.transport = transport;
        this.state = ChannelState.OPENING;

        // Send handshake
        await this._send({
            type: BidcMessageType.HANDSHAKE,
            channelId: this.channelId,
            timestamp: Date.now()
        });

        // Wait for handshake ack
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.state = ChannelState.CLOSED;
                reject(new Error('Handshake timeout'));
            }, this.config.timeout);

            this.once('handshake_ack', () => {
                clearTimeout(timeout);
                this.state = ChannelState.OPEN;
                this._startHeartbeat();
                console.log(`[bidc] Channel ${this.channelId} opened`);
                resolve(this);
            });
        });
    }

    /**
     * Accept an incoming channel
     */
    accept(handshake, transport) {
        this.transport = transport;
        this.peerId = handshake.channelId;
        this.state = ChannelState.OPEN;

        // Send handshake ack
        this._send({
            type: BidcMessageType.HANDSHAKE_ACK,
            channelId: this.channelId,
            peerChannelId: this.peerId,
            timestamp: Date.now()
        });

        this._startHeartbeat();
        console.log(`[bidc] Accepted channel from ${this.peerId}`);
    }

    /**
     * Send a shard over the channel
     */
    async sendShard(shard) {
        if (this.state !== ChannelState.OPEN) {
            throw new Error(`Channel not open: ${this.state}`);
        }

        const message = {
            type: BidcMessageType.SHARD_DATA,
            shardId: shard.shardId,
            objectId: shard.objectId,
            index: shard.index,
            hash: shard.hash,
            data: shard.data.toString('base64'),
            timestamp: Date.now()
        };

        await this._sendWithAck(message);

        this.stats.shardsSent++;
        this.stats.bytesSent += shard.data.length;

        this.emit('shardSent', { shardId: shard.shardId });
    }

    /**
     * Request a shard from the peer
     */
    async requestShard(shardId) {
        if (this.state !== ChannelState.OPEN) {
            throw new Error(`Channel not open: ${this.state}`);
        }

        const requestId = crypto.randomBytes(4).toString('hex');

        await this._send({
            type: BidcMessageType.SHARD_REQUEST,
            requestId,
            shardId,
            timestamp: Date.now()
        });

        // Wait for shard data
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Shard request timeout: ${shardId}`));
            }, this.config.timeout);

            const handler = (data) => {
                if (data.shardId === shardId) {
                    clearTimeout(timeout);
                    this.removeListener('shardReceived', handler);
                    resolve(data);
                }
            };

            this.on('shardReceived', handler);
        });
    }

    /**
     * Stream multiple shards
     */
    async *streamShards(shardIds) {
        for (const shardId of shardIds) {
            const shard = await this.requestShard(shardId);
            yield shard;
        }
    }

    /**
     * Start a streaming upload
     */
    async startStream(streamId, metadata = {}) {
        await this._send({
            type: BidcMessageType.STREAM_START,
            streamId,
            metadata,
            timestamp: Date.now()
        });

        return {
            streamId,
            sendChunk: async (chunk, isLast = false) => {
                await this._send({
                    type: isLast ? BidcMessageType.STREAM_END : BidcMessageType.STREAM_CHUNK,
                    streamId,
                    data: chunk.toString('base64'),
                    timestamp: Date.now()
                });
                this.stats.bytesSent += chunk.length;
            }
        };
    }

    /**
     * Handle incoming message
     */
    handleMessage(message) {
        switch (message.type) {
            case BidcMessageType.HANDSHAKE:
                this.accept(message, this.transport);
                break;

            case BidcMessageType.HANDSHAKE_ACK:
                this.emit('handshake_ack', message);
                break;

            case BidcMessageType.SHARD_DATA:
                this._handleShardData(message);
                break;

            case BidcMessageType.SHARD_ACK:
                this._handleShardAck(message);
                break;

            case BidcMessageType.SHARD_REQUEST:
                this.emit('shardRequest', message);
                break;

            case BidcMessageType.STREAM_START:
                this.emit('streamStart', message);
                break;

            case BidcMessageType.STREAM_CHUNK:
            case BidcMessageType.STREAM_END:
                this.emit('streamChunk', message);
                break;

            case BidcMessageType.HEARTBEAT:
                this._handleHeartbeat(message);
                break;

            case BidcMessageType.CLOSE:
                this.close();
                break;
        }

        this.stats.messagesReceived++;
    }

    /**
     * Handle shard data
     */
    _handleShardData(message) {
        const shardData = {
            shardId: message.shardId,
            objectId: message.objectId,
            index: message.index,
            hash: message.hash,
            data: Buffer.from(message.data, 'base64')
        };

        // Send ack
        this._send({
            type: BidcMessageType.SHARD_ACK,
            shardId: message.shardId,
            timestamp: Date.now()
        });

        this.stats.shardsReceived++;
        this.stats.bytesReceived += shardData.data.length;

        this.emit('shardReceived', shardData);
    }

    /**
     * Handle shard ack
     */
    _handleShardAck(message) {
        const pending = this.pendingAcks.get(message.shardId);
        if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve();
            this.pendingAcks.delete(message.shardId);
        }
    }

    /**
     * Handle heartbeat
     */
    _handleHeartbeat(message) {
        // Respond with heartbeat
        this._send({
            type: BidcMessageType.HEARTBEAT,
            timestamp: Date.now()
        });
    }

    /**
     * Send with acknowledgement
     */
    async _sendWithAck(message) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingAcks.delete(message.shardId);
                reject(new Error(`Ack timeout: ${message.shardId}`));
            }, this.config.timeout);

            this.pendingAcks.set(message.shardId, { resolve, reject, timeout });
            this._send(message);
        });
    }

    /**
     * Send a message
     */
    async _send(message) {
        if (!this.transport) {
            throw new Error('No transport available');
        }

        const data = JSON.stringify(message);

        if (this.transport.send) {
            this.transport.send(data);
        } else if (this.transport.write) {
            this.transport.write(data);
        } else {
            throw new Error('Transport has no send method');
        }

        this.stats.messagesSent++;
    }

    /**
     * Start heartbeat timer
     */
    _startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (this.state === ChannelState.OPEN) {
                this._send({
                    type: BidcMessageType.HEARTBEAT,
                    timestamp: Date.now()
                });
            }
        }, this.config.heartbeatInterval);
    }

    /**
     * Close the channel
     */
    close() {
        if (this.state === ChannelState.CLOSED) return;

        this.state = ChannelState.CLOSING;

        // Send close message
        this._send({
            type: BidcMessageType.CLOSE,
            timestamp: Date.now()
        }).catch(() => { });

        // Cleanup
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        // Clear pending acks
        for (const [, pending] of this.pendingAcks) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Channel closed'));
        }
        this.pendingAcks.clear();

        this.state = ChannelState.CLOSED;
        this.emit('closed');

        console.log(`[bidc] Channel ${this.channelId} closed`);
    }

    /**
     * Get channel statistics
     */
    getStats() {
        return {
            ...this.stats,
            state: this.state,
            channelId: this.channelId,
            peerId: this.peerId
        };
    }
}

/**
 * BidcManager - Manages multiple bidc channels
 */
class BidcManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.channels = new Map();
        this.config = {
            maxChannels: options.maxChannels || 100
        };

        this.stats = {
            channelsCreated: 0,
            channelsClosed: 0,
            totalBytesSent: 0,
            totalBytesReceived: 0
        };
    }

    /**
     * Create a new channel
     */
    createChannel(options = {}) {
        if (this.channels.size >= this.config.maxChannels) {
            throw new Error('Max channels reached');
        }

        const channel = new BidcChannel(options);
        this.channels.set(channel.channelId, channel);

        channel.on('closed', () => {
            this.channels.delete(channel.channelId);
            this.stats.channelsClosed++;
        });

        this.stats.channelsCreated++;
        return channel;
    }

    /**
     * Get a channel by ID
     */
    getChannel(channelId) {
        return this.channels.get(channelId);
    }

    /**
     * Close all channels
     */
    closeAll() {
        for (const channel of this.channels.values()) {
            channel.close();
        }
    }

    /**
     * Get manager statistics
     */
    getStats() {
        let activeChannels = 0;
        let totalBytesSent = 0;
        let totalBytesReceived = 0;

        for (const channel of this.channels.values()) {
            if (channel.state === ChannelState.OPEN) activeChannels++;
            const stats = channel.getStats();
            totalBytesSent += stats.bytesSent;
            totalBytesReceived += stats.bytesReceived;
        }

        return {
            ...this.stats,
            activeChannels,
            totalBytesSent,
            totalBytesReceived
        };
    }
}

module.exports = {
    BidcChannel,
    BidcManager,
    ChannelState,
    BidcMessageType
};
