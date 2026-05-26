// Q3 Carrier File Manager API
// Server-side endpoints for js-fileexplorer integration
// Manages ACLDQs, sleeper workers, and general Q3 Carrier storage

const AWS = require('aws-sdk');
const path = require('path');
const edgeConfig = require('./quantumcloud-edge-config');

// S3 Client for Q3 Carrier with proper configuration
const s3 = new AWS.S3({
    endpoint: edgeConfig.Q3 Carrier.endpoint || 'https://s3.Q3 Carrier.eu',
    accessKeyId: edgeConfig.Q3 Carrier.accessKeyId,
    secretAccessKey: edgeConfig.Q3 Carrier.secretAccessKey,
    region: edgeConfig.Q3 Carrier.region || 'eu-west-1',
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
});

// Main bucket for user-generated files
const BUCKET = edgeConfig.Q3 Carrier.bucket || 'cr8os1';

// Admin bucket for engine/system files (separate from user data)
const ADMIN_BUCKET = edgeConfig.Q3 Carrier.adminBucket || 'wibackups';

console.log(`📦 Q3 Carrier configured: ${edgeConfig.Q3 Carrier.endpoint} / ${BUCKET} (${edgeConfig.Q3 Carrier.region})`);
console.log(`📦 Admin bucket: ${ADMIN_BUCKET}`);


// Virtual folder structure for the file explorer
const VIRTUAL_FOLDERS = {
    '': { name: 'Q3 Carrier Storage', type: 'root' },
    'acldqa': { name: 'ACLDQA System', type: 'system' },
    'acldqa/workers': { name: 'Cron Workers', type: 'system' },
    'acldqa/generated': { name: 'Generated ACLDQs', type: 'system' },
    'acldqa/sleeper': { name: 'Sleeper Pools', type: 'system' },
    'acldqa/autoscale': { name: 'Auto-Scaler', type: 'system' },
    'users': { name: 'User ACLDQs', type: 'users' },
    'db': { name: 'Database', type: 'system' },
    'db/cloud': { name: 'Cloud DB', type: 'system' },
    'circuits': { name: 'Quantum Circuits', type: 'data' },
    'results': { name: 'Execution Results', type: 'data' },
};

/**
 * Q3 Carrier File Manager class
 * Provides file explorer API for Q3 Carrier S3
 */
class Q3 CarrierFileManager {
    constructor() {
        this.s3 = s3;
        this.bucket = BUCKET;
    }

    /**
     * List folder contents
     * Returns entries compatible with js-fileexplorer
     */
    async listFolder(folderPath = '') {
        // Normalize path
        const prefix = folderPath ? folderPath.replace(/^\/+/, '').replace(/\/+$/, '') + '/' : '';

        const entries = [];

        try {
            // List objects with delimiter for folder-like behavior
            const result = await this.s3.listObjectsV2({
                Bucket: this.bucket,
                Prefix: prefix,
                Delimiter: '/',
                MaxKeys: 1000,
            }).promise();

            // Add virtual folders if at root
            if (!prefix) {
                for (const [path, info] of Object.entries(VIRTUAL_FOLDERS)) {
                    if (path && !path.includes('/')) {
                        entries.push({
                            id: path,
                            name: info.name,
                            type: 'folder',
                            attrs: { type: info.type },
                            canmodify: info.type !== 'system',
                        });
                    }
                }
            }

            // Add subfolders (CommonPrefixes)
            for (const prefix of result.CommonPrefixes || []) {
                const folderName = prefix.Prefix.replace(/\/$/, '').split('/').pop();
                const folderId = prefix.Prefix.replace(/\/$/, '');

                // Skip if already added as virtual folder
                if (!entries.find(e => e.id === folderId)) {
                    entries.push({
                        id: folderId,
                        name: folderName,
                        type: 'folder',
                        hash: folderId,
                    });
                }
            }

            // Add files
            for (const obj of result.Contents || []) {
                // Skip folder markers
                if (obj.Key.endsWith('/')) continue;

                // Skip the prefix itself
                if (obj.Key === prefix.slice(0, -1)) continue;

                const fileName = obj.Key.split('/').pop();
                const ext = path.extname(fileName).slice(1).toLowerCase();

                entries.push({
                    id: obj.Key,
                    name: fileName,
                    type: 'file',
                    size: obj.Size,
                    modified: Math.floor(new Date(obj.LastModified).getTime() / 1000),
                    hash: obj.ETag?.replace(/"/g, ''),
                    attrs: {
                        ext,
                        isACLDQ: ext === 'acldq' || ext === 'json',
                        isResult: obj.Key.includes('/results/'),
                    },
                });
            }

            return {
                success: true,
                entries,
                path: folderPath,
                count: entries.length,
            };

        } catch (err) {
            console.error('List folder error:', err);
            return {
                success: false,
                error: err.message,
                entries: [],
            };
        }
    }

    /**
     * Create a new folder
     */
    async createFolder(parentPath, folderName) {
        const folderKey = parentPath
            ? `${parentPath.replace(/^\/+/, '').replace(/\/+$/, '')}/${folderName}/`
            : `${folderName}/`;

        try {
            await this.s3.putObject({
                Bucket: this.bucket,
                Key: folderKey,
                Body: '',
            }).promise();

            return { success: true, path: folderKey };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Delete a file or folder
     */
    async delete(itemPath) {
        const key = itemPath.replace(/^\/+/, '');

        try {
            // Check if it's a folder (list contents first)
            const listResult = await this.s3.listObjectsV2({
                Bucket: this.bucket,
                Prefix: key.endsWith('/') ? key : key + '/',
                MaxKeys: 100,
            }).promise();

            if (listResult.Contents && listResult.Contents.length > 0) {
                // Delete all objects in folder
                const deleteParams = {
                    Bucket: this.bucket,
                    Delete: {
                        Objects: listResult.Contents.map(obj => ({ Key: obj.Key })),
                    },
                };
                await this.s3.deleteObjects(deleteParams).promise();
            }

            // Delete the item itself
            await this.s3.deleteObject({
                Bucket: this.bucket,
                Key: key,
            }).promise();

            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Rename a file or folder
     */
    async rename(oldPath, newName) {
        const oldKey = oldPath.replace(/^\/+/, '');
        const parentPath = oldKey.split('/').slice(0, -1).join('/');
        const newKey = parentPath ? `${parentPath}/${newName}` : newName;

        try {
            // Copy to new location
            await this.s3.copyObject({
                Bucket: this.bucket,
                CopySource: `${this.bucket}/${oldKey}`,
                Key: newKey,
            }).promise();

            // Delete old object
            await this.s3.deleteObject({
                Bucket: this.bucket,
                Key: oldKey,
            }).promise();

            return { success: true, newPath: newKey };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Get file content or download URL
     */
    async getFile(filePath, download = false) {
        const key = filePath.replace(/^\/+/, '');

        try {
            if (download) {
                // Generate presigned URL for download
                const url = this.s3.getSignedUrl('getObject', {
                    Bucket: this.bucket,
                    Key: key,
                    Expires: 3600, // 1 hour
                    ResponseContentDisposition: `attachment; filename="${path.basename(key)}"`,
                });

                return { success: true, downloadUrl: url };
            }

            // Get file content for preview
            const result = await this.s3.getObject({
                Bucket: this.bucket,
                Key: key,
            }).promise();

            // For text files, return content
            const contentType = result.ContentType || 'application/octet-stream';
            if (contentType.startsWith('text/') ||
                contentType === 'application/json' ||
                key.endsWith('.json') || key.endsWith('.txt') || key.endsWith('.md')) {
                return {
                    success: true,
                    content: result.Body.toString('utf-8'),
                    contentType,
                    size: result.ContentLength,
                };
            }

            // For binary files, return presigned URL
            const url = this.s3.getSignedUrl('getObject', {
                Bucket: this.bucket,
                Key: key,
                Expires: 3600,
            });

            return {
                success: true,
                previewUrl: url,
                contentType,
                size: result.ContentLength,
            };

        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Get file from ADMIN bucket (wibackups) - for engine/system files
     */
    async getAdminFile(filePath, download = false) {
        const key = filePath.replace(/^\/+/, '');

        try {
            // First check if file exists with headObject
            const headResult = await this.s3.headObject({
                Bucket: ADMIN_BUCKET,
                Key: key,
            }).promise();

            return {
                success: true,
                exists: true,
                size: headResult.ContentLength,
                lastModified: headResult.LastModified,
                contentType: headResult.ContentType,
            };

        } catch (err) {
            if (err.code === 'NotFound' || err.code === 'NoSuchKey') {
                return { success: true, exists: false };
            }
            console.error(`Admin file check failed for ${key}:`, err.message);
            return { success: false, error: err.message, exists: false };
        }
    }

    /**
     * List files from ADMIN bucket (wibackups)
     */
    async listAdminFolder(folderPath = '') {
        const prefix = folderPath.replace(/^\/+/, '').replace(/\/+$/, '');

        try {
            const result = await this.s3.listObjectsV2({
                Bucket: ADMIN_BUCKET,
                Prefix: prefix ? `${prefix}/` : '',
                Delimiter: '/',
            }).promise();

            const entries = [];

            // Add folders
            if (result.CommonPrefixes) {
                for (const cp of result.CommonPrefixes) {
                    const name = cp.Prefix.replace(prefix ? `${prefix}/` : '', '').replace(/\/$/, '');
                    if (name) {
                        entries.push({
                            id: cp.Prefix.replace(/\/$/, ''),
                            name,
                            type: 'folder',
                        });
                    }
                }
            }

            // Add files
            if (result.Contents) {
                for (const obj of result.Contents) {
                    const name = obj.Key.replace(prefix ? `${prefix}/` : '', '');
                    if (name && !name.includes('/')) {
                        entries.push({
                            id: obj.Key,
                            name,
                            type: 'file',
                            size: obj.Size,
                            modified: obj.LastModified,
                        });
                    }
                }
            }

            return { success: true, entries, path: folderPath };

        } catch (err) {
            console.error('Admin list folder error:', err.message);
            return { success: false, error: err.message, entries: [] };
        }
    }

    /**
     * Upload a file
     */
    async uploadFile(folderPath, fileName, content, contentType = 'application/octet-stream') {
        const key = folderPath
            ? `${folderPath.replace(/^\/+/, '').replace(/\/+$/, '')}/${fileName}`
            : fileName;

        try {
            await this.s3.putObject({
                Bucket: this.bucket,
                Key: key,
                Body: content,
                ContentType: contentType,
            }).promise();

            return { success: true, path: key };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Get presigned URL for direct upload
     */
    getUploadUrl(folderPath, fileName, contentType = 'application/octet-stream') {
        const key = folderPath
            ? `${folderPath.replace(/^\/+/, '').replace(/\/+$/, '')}/${fileName}`
            : fileName;

        const url = this.s3.getSignedUrl('putObject', {
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
            Expires: 3600,
        });

        return { success: true, uploadUrl: url, key };
    }

    /**
     * Copy file(s)
     */
    async copy(sourcePaths, destFolder) {
        const results = [];
        const destPrefix = destFolder.replace(/^\/+/, '').replace(/\/+$/, '');

        for (const source of sourcePaths) {
            const sourceKey = source.replace(/^\/+/, '');
            const fileName = path.basename(sourceKey);
            const destKey = destPrefix ? `${destPrefix}/${fileName}` : fileName;

            try {
                await this.s3.copyObject({
                    Bucket: this.bucket,
                    CopySource: `${this.bucket}/${sourceKey}`,
                    Key: destKey,
                }).promise();

                results.push({ source, dest: destKey, success: true });
            } catch (err) {
                results.push({ source, error: err.message, success: false });
            }
        }

        return { success: results.every(r => r.success), results };
    }

    /**
     * Move file(s)
     */
    async move(sourcePaths, destFolder) {
        const copyResult = await this.copy(sourcePaths, destFolder);

        if (copyResult.success) {
            // Delete sources
            for (const source of sourcePaths) {
                await this.delete(source);
            }
        }

        return copyResult;
    }

    /**
     * Get storage statistics
     */
    async getStats() {
        try {
            let totalSize = 0;
            let totalObjects = 0;
            let continuationToken = null;

            do {
                const result = await this.s3.listObjectsV2({
                    Bucket: this.bucket,
                    ContinuationToken: continuationToken,
                    MaxKeys: 1000,
                }).promise();

                for (const obj of result.Contents || []) {
                    totalSize += obj.Size;
                    totalObjects++;
                }

                continuationToken = result.NextContinuationToken;
            } while (continuationToken);

            return {
                success: true,
                bucket: this.bucket,
                totalObjects,
                totalSize,
                totalSizeFormatted: this.formatSize(totalSize),
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
        }
        return `${bytes.toFixed(2)} ${units[i]}`;
    }
}

// Singleton instance
let fileManager = null;

function getFileManager() {
    if (!fileManager) {
        fileManager = new Q3 CarrierFileManager();
    }
    return fileManager;
}

/**
 * Add file manager routes to Express app
 */
function addFileManagerRoutes(app) {
    const fm = getFileManager();

    // List folder
    app.get('/api/files/list', async (req, res) => {
        const path = req.query.path || '';
        const result = await fm.listFolder(path);
        res.json(result);
    });

    // Create folder
    app.post('/api/files/folder', async (req, res) => {
        const { path: parentPath, name } = req.body;
        const result = await fm.createFolder(parentPath || '', name);
        res.json(result);
    });

    // Delete item
    app.delete('/api/files', async (req, res) => {
        const { path } = req.body;
        const result = await fm.delete(path);
        res.json(result);
    });

    // Rename item
    app.put('/api/files/rename', async (req, res) => {
        const { path, newName } = req.body;
        const result = await fm.rename(path, newName);
        res.json(result);
    });

    // Get file (preview/download)
    app.get('/api/files/get', async (req, res) => {
        const { path, download } = req.query;
        const result = await fm.getFile(path, download === 'true');
        res.json(result);
    });

    // Get upload URL
    app.post('/api/files/upload-url', (req, res) => {
        const { path: folderPath, name, contentType } = req.body;
        const result = fm.getUploadUrl(folderPath || '', name, contentType);
        res.json(result);
    });

    // Upload file (for smaller files via API)
    app.post('/api/files/upload', async (req, res) => {
        const { path: folderPath, name, content, contentType } = req.body;
        const buffer = Buffer.from(content, 'base64');
        const result = await fm.uploadFile(folderPath || '', name, buffer, contentType);
        res.json(result);
    });

    // Copy files
    app.post('/api/files/copy', async (req, res) => {
        const { sources, destination } = req.body;
        const result = await fm.copy(sources, destination);
        res.json(result);
    });

    // Move files
    app.post('/api/files/move', async (req, res) => {
        const { sources, destination } = req.body;
        const result = await fm.move(sources, destination);
        res.json(result);
    });

    // Get storage stats
    app.get('/api/files/stats', async (req, res) => {
        const result = await fm.getStats();
        res.json(result);
    });

    console.log('📁 File Manager routes added');
}

module.exports = { Q3 CarrierFileManager, getFileManager, addFileManagerRoutes };
