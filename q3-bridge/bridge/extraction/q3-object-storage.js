// Q3 Quantum Storage Protocol - Object Storage API
// S3-compatible object storage with quantum enhancements
// Uses Q3 Carrier as backend OR local filesystem as fallback

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, CreateBucketCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class Q3ObjectStorage {
    constructor(Q3 CarrierConfig) {
        this.mode = Q3 CarrierConfig.endpoint === 'local' ? 'local' : 's3';
        this.buckets = new Map(); // Track Q3 buckets
        this.metadata = new Map(); // Q3 metadata per object

        if (this.mode === 's3') {
            // S3/Q3 Carrier mode
            this.s3Client = new S3Client({
                endpoint: Q3 CarrierConfig.endpoint,
                region: Q3 CarrierConfig.region,
                credentials: {
                    accessKeyId: Q3 CarrierConfig.accessKeyId,
                    secretAccessKey: Q3 CarrierConfig.secretAccessKey
                },
                forcePathStyle: true
            });
            console.log('✅ Q3 Storage: S3 mode (Q3 Carrier)');
        } else {
            // Local filesystem mode
            this.localStorageDir = path.join(__dirname, '.q3-storage');
            if (!fs.existsSync(this.localStorageDir)) {
                fs.mkdirSync(this.localStorageDir, { recursive: true });
            }
            console.log('✅ Q3 Storage: Local filesystem mode');
        }
    }

    /**
     * Create a Q3 bucket
     */
    async createBucket(name, options = {}) {
        const bucketName = this.sanitizeBucketName(name);

        try {
            if (this.mode === 's3') {
                // S3/Q3 Carrier mode
                await this.s3Client.send(new CreateBucketCommand({
                    Bucket: bucketName
                }));
            } else {
                // Local mode - create directory
                const bucketPath = path.join(this.localStorageDir, bucketName);
                if (!fs.existsSync(bucketPath)) {
                    fs.mkdirSync(bucketPath, { recursive: true });
                }
            }

            const bucket = {
                name: bucketName,
                id: crypto.randomBytes(16).toString('hex'),
                createdAt: Date.now(),
                quantumEnabled: options.quantum || false,
                encryption: options.encryption || 'AES-256',
                replication: options.replication || 'multi-region',
                lifecycle: options.lifecycle || null
            };

            this.buckets.set(bucketName, bucket);
            console.log(`✅ Q3 Bucket created: ${bucketName} (${this.mode} mode)`);

            return bucket;
        } catch (error) {
            console.error(`❌ Failed to create bucket ${bucketName}:`, error.message);
            throw error;
        }
    }

    /**
     * Upload object to Q3 bucket
     */
    async putObject(bucket, key, data, metadata = {}) {
        const q3Metadata = {
            'x-q3-version': '1.0',
            'x-q3-timestamp': Date.now().toString(),
            'x-q3-hash': crypto.createHash('sha256').update(data).digest('hex'),
            'x-q3-size': Buffer.byteLength(data).toString(),
            ...metadata
        };

        try {
            if (this.mode === 's3') {
                // S3/Q3 Carrier mode
                await this.s3Client.send(new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: data,
                    Metadata: q3Metadata
                }));
            } else {
                // Local mode - write to filesystem
                const objectPath = path.join(this.localStorageDir, bucket, key);
                const objectDir = path.dirname(objectPath);
                if (!fs.existsSync(objectDir)) {
                    fs.mkdirSync(objectDir, { recursive: true });
                }
                fs.writeFileSync(objectPath, data);
                // Store metadata separately
                fs.writeFileSync(`${objectPath}.meta.json`, JSON.stringify(q3Metadata));
            }

            // Store Q3 metadata
            this.metadata.set(`${bucket}/${key}`, q3Metadata);

            console.log(`✅ Q3 Object stored: ${bucket}/${key} (${this.mode})`);
            return { success: true, key, metadata: q3Metadata };
        } catch (error) {
            console.error(`❌ Failed to put object ${bucket}/${key}:`, error.message);
            throw error;
        }
    }

    /**
     * Get object from Q3 bucket
     */
    async getObject(bucket, key) {
        try {
            let data, metadata;

            if (this.mode === 's3') {
                // S3/Q3 Carrier mode
                const response = await this.s3Client.send(new GetObjectCommand({
                    Bucket: bucket,
                    Key: key
                }));

                // Read stream to buffer
                const chunks = [];
                for await (const chunk of response.Body) {
                    chunks.push(chunk);
                }
                data = Buffer.concat(chunks);
                metadata = response.Metadata || {};
            } else {
                // Local mode - read from filesystem
                const objectPath = path.join(this.localStorageDir, bucket, key);
                data = fs.readFileSync(objectPath);

                const metaPath = `${objectPath}.meta.json`;
                if (fs.existsSync(metaPath)) {
                    metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                } else {
                    metadata = {};
                }
            }

            const storedMetadata = this.metadata.get(`${bucket}/${key}`) || metadata;

            return {
                data,
                metadata: storedMetadata,
                contentType: 'application/octet-stream',
                size: data.length
            };
        } catch (error) {
            console.error(`❌ Failed to get object ${bucket}/${key}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete object from Q3 bucket
     */
    async deleteObject(bucket, key) {
        try {
            await this.s3Client.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: key
            }));

            this.metadata.delete(`${bucket}/${key}`);
            console.log(`🗑️  Q3 Object deleted: ${bucket}/${key}`);

            return { success: true };
        } catch (error) {
            console.error(`❌ Failed to delete object ${bucket}/${key}:`, error.message);
            throw error;
        }
    }

    /**
     * List objects in bucket
     */
    async listObjects(bucket, prefix = '') {
        try {
            const response = await this.s3Client.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix
            }));

            const objects = (response.Contents || []).map(obj => ({
                key: obj.Key,
                size: obj.Size,
                lastModified: obj.LastModified,
                etag: obj.ETag,
                metadata: this.metadata.get(`${bucket}/${obj.Key}`) || {}
            }));

            return {
                objects,
                count: objects.length,
                bucket
            };
        } catch (error) {
            console.error(`❌ Failed to list objects in ${bucket}:`, error.message);
            throw error;
        }
    }

    /**
     * Get bucket info
     */
    getBucket(name) {
        return this.buckets.get(name);
    }

    /**
     * List all Q3 buckets
     */
    listBuckets() {
        return Array.from(this.buckets.values());
    }

    /**
     * Sanitize bucket name for S3 compatibility
     */
    sanitizeBucketName(name) {
        return name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }

    /**
     * Get Q3 storage statistics
     */
    async getStats() {
        let totalObjects = 0;
        let totalSize = 0;

        for (const bucket of this.buckets.values()) {
            try {
                const { objects } = await this.listObjects(bucket.name);
                totalObjects += objects.length;
                totalSize += objects.reduce((sum, obj) => sum + obj.size, 0);
            } catch (error) {
                // Skip errored buckets
            }
        }

        return {
            buckets: this.buckets.size,
            objects: totalObjects,
            totalSize,
            totalSizeGB: (totalSize / (1024 ** 3)).toFixed(2)
        };
    }
}

// Singleton instance
let q3Instance = null;

function getQ3Storage(Q3 CarrierConfig) {
    if (!q3Instance && Q3 CarrierConfig) {
        q3Instance = new Q3ObjectStorage(Q3 CarrierConfig);
    }
    return q3Instance;
}

module.exports = { Q3ObjectStorage, getQ3Storage };
