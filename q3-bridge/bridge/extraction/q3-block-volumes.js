// Q3-Block Volumes Manager
// Manages Podman volumes for persistent storage

const { exec } = require('child_process');
const crypto = require('crypto');

class Q3BlockVolumes {
    constructor() {
        this.volumes = new Map(); // volumeId => {name, size, dropletId, etc}
    }

    /**
     * Create a new block volume
     */
    async createVolume(name, sizeGB = 10, options = {}) {
        const volumeId = crypto.randomBytes(8).toString('hex');
        const volumeName = `q3-${volumeId}`;

        return new Promise((resolve, reject) => {
            // Create Podman volume with size limit
            const command = `podman volume create \
                --opt type=tmpfs \
                --opt device=tmpfs \
                --opt o=size=${sizeGB}G \
                ${volumeName}`;

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Failed to create volume:', stderr);
                    reject(error);
                    return;
                }

                const volume = {
                    id: volumeId,
                    name: volumeName,
                    displayName: name,
                    sizeGB,
                    createdAt: Date.now(),
                    attachedTo: null,
                    type: options.type || 'tmpfs',
                    status: 'available'
                };

                this.volumes.set(volumeId, volume);
                console.log(`✅ Volume created: ${volumeName} (${sizeGB}GB)`);
                resolve(volume);
            });
        });
    }

    /**
     * List all volumes
     */
    listVolumes() {
        return Array.from(this.volumes.values());
    }

    /**
     * Get volume by ID
     */
    getVolume(volumeId) {
        return this.volumes.get(volumeId);
    }

    /**
     * Attach volume to droplet
     */
    async attachVolume(volumeId, dropletId, containerName) {
        const volume = this.volumes.get(volumeId);
        if (!volume) {
            throw new Error('Volume not found');
        }

        if (volume.attachedTo) {
            throw new Error('Volume already attached');
        }

        // In Podman, volumes are attached when container is created
        // For already running containers, we need to stop, recreate with volume
        console.log(`⚠️  Attaching volume to running container requires restart`);
        console.log(`   Volume ${volume.name} → Droplet ${dropletId}`);

        volume.attachedTo = dropletId;
        volume.status = 'attached';
        this.volumes.set(volumeId, volume);

        return { success: true, message: 'Volume attached (container restart required)' };
    }

    /**
     * Detach volume from droplet
     */
    async detachVolume(volumeId) {
        const volume = this.volumes.get(volumeId);
        if (!volume) {
            throw new Error('Volume not found');
        }

        volume.attachedTo = null;
        volume.status = 'available';
        this.volumes.set(volumeId, volume);

        console.log(`✅ Volume ${volume.name} detached`);
        return { success: true };
    }

    /**
     * Delete volume
     */
    async deleteVolume(volumeId) {
        const volume = this.volumes.get(volumeId);
        if (!volume) {
            throw new Error('Volume not found');
        }

        if (volume.attachedTo) {
            throw new Error('Cannot delete attached volume');
        }

        return new Promise((resolve, reject) => {
            exec(`podman volume rm ${volume.name}`, (error, stdout, stderr) => {
                if (error) {
                    console.error('Failed to delete volume:', stderr);
                    reject(error);
                    return;
                }

                this.volumes.delete(volumeId);
                console.log(`🗑️  Volume deleted: ${volume.name}`);
                resolve({ success: true });
            });
        });
    }

    /**
     * Get volume statistics
     */
    getStats() {
        const volumes = Array.from(this.volumes.values());
        return {
            total: volumes.length,
            attached: volumes.filter(v => v.attachedTo).length,
            available: volumes.filter(v => !v.attachedTo).length,
            totalSizeGB: volumes.reduce((sum, v) => sum + v.sizeGB, 0)
        };
    }
}

// Singleton instance
let volumesInstance = null;

function getVolumeManager() {
    if (!volumesInstance) {
        volumesInstance = new Q3BlockVolumes();
    }
    return volumesInstance;
}

module.exports = { Q3BlockVolumes, getVolumeManager };
