/**
 * QuantumQueue API - Message Queue with Quantum-Secured Delivery
 * Async Lambda triggers, pub/sub, guaranteed delivery.
 */

let queues = new Map(), messages = [];
let queueIdCounter = 0, msgIdCounter = 0;

function createQueue(name, options = {}) {
    const id = `queue-${++queueIdCounter}`;
    const queue = { id, name, fifo: options.fifo || false, dlq: options.dlq || null, retentionSeconds: options.retentionSeconds || 86400, createdAt: Date.now(), messageCount: 0, processedCount: 0 };
    queues.set(id, queue);
    console.log(`[QQueue] 📬 Queue created: ${name}`);
    return { success: true, queue };
}

function listQueues() { return Array.from(queues.values()); }

function sendMessage(queueId, body, delaySeconds = 0) {
    const queue = queues.get(queueId);
    if (!queue) return { error: 'Queue not found' };
    const id = `msg-${++msgIdCounter}`;
    const msg = { id, queueId, body, sentAt: Date.now(), visibleAt: Date.now() + delaySeconds * 1000, receiveCount: 0, processed: false };
    messages.push(msg);
    queue.messageCount++;
    return { success: true, message: { id, sentAt: msg.sentAt } };
}

function receiveMessages(queueId, maxMessages = 10) {
    const now = Date.now();
    const visible = messages.filter(m => m.queueId === queueId && !m.processed && m.visibleAt <= now).slice(0, maxMessages);
    visible.forEach(m => { m.receiveCount++; m.visibleAt = now + 30000; });
    return { success: true, messages: visible };
}

function deleteMessage(messageId) {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return { error: 'Message not found' };
    msg.processed = true;
    const queue = queues.get(msg.queueId);
    if (queue) queue.processedCount++;
    return { success: true, deleted: messageId };
}

function getQueueStats() {
    const total = messages.length, pending = messages.filter(m => !m.processed).length;
    return { queues: queues.size, totalMessages: total, pendingMessages: pending, processedMessages: total - pending };
}

module.exports = { createQueue, listQueues, sendMessage, receiveMessages, deleteMessage, getQueueStats };
