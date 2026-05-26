/**
 * Q3 CLI - Command-line interface for Q3 storage
 * 
 * Compatible with Q3 Storage composer-cli concepts:
 * - Swarm management
 * - Tenant operations
 * - Object operations
 * 
 * Usage:
 *   q3 store <file>           Store a file
 *   q3 retrieve <id>          Retrieve an object
 *   q3 list                   List objects
 *   q3 delete <id>            Delete an object
 *   q3 stats                  Show statistics
 *   q3 wasm upload <file>     Upload WASM image
 *   q3 wasm list              List WASM images
 */

const fs = require('fs');
const path = require('path');
const Q3Storage = require('./q3-storage');

class Q3CLI {
    constructor(options = {}) {
        this.storage = new Q3Storage(options);
    }

    /**
     * Parse and execute command
     */
    async run(args) {
        const command = args[0];
        const subcommand = args[1];
        const remaining = args.slice(2);

        switch (command) {
            case 'store':
                return this.store(subcommand, remaining);

            case 'retrieve':
                return this.retrieve(subcommand);

            case 'list':
                return this.list();

            case 'delete':
                return this.delete(subcommand);

            case 'stats':
                return this.stats();

            case 'wasm':
                return this.wasm(subcommand, remaining);

            case 'help':
            default:
                return this.help();
        }
    }

    /**
     * Store a file
     */
    async store(filePath, options = []) {
        if (!filePath || !fs.existsSync(filePath)) {
            console.error('File not found:', filePath);
            return { success: false };
        }

        const name = path.basename(filePath);
        const data = fs.readFileSync(filePath);

        console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`║                    Q3 Storage Upload                             ║`);
        console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

        const result = await this.storage.store(data, { name });

        console.log(`\nObject ID: ${result.objectId}`);
        console.log(`Shards:    ${result.shardCount}`);
        console.log(`Size:      ${this._formatBytes(result.size)}`);

        return { success: true, object: result };
    }

    /**
     * Retrieve an object
     */
    async retrieve(objectId) {
        if (!objectId) {
            console.error('Object ID required');
            return { success: false };
        }

        console.log(`\nRetrieving: ${objectId}`);

        const { object, data } = await this.storage.retrieve(objectId);

        // Save to current directory
        const outputPath = path.join(process.cwd(), object.name);
        fs.writeFileSync(outputPath, data);

        console.log(`\n✅ Retrieved: ${object.name}`);
        console.log(`   Size: ${this._formatBytes(data.length)}`);
        console.log(`   Saved to: ${outputPath}`);

        return { success: true, object, outputPath };
    }

    /**
     * List objects
     */
    async list() {
        const objects = this.storage.list();

        console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`║                    Q3 Objects                                    ║`);
        console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

        if (objects.length === 0) {
            console.log('No objects stored');
        } else {
            console.log(`${'ID'.padEnd(30)} ${'Name'.padEnd(25)} ${'Size'.padStart(10)} Shards`);
            console.log('─'.repeat(75));

            for (const obj of objects) {
                console.log(
                    `${obj.objectId.padEnd(30)} ` +
                    `${obj.name.slice(0, 24).padEnd(25)} ` +
                    `${this._formatBytes(obj.size).padStart(10)} ` +
                    `${obj.shardCount}`
                );
            }
        }

        return { success: true, objects };
    }

    /**
     * Delete an object
     */
    async delete(objectId) {
        if (!objectId) {
            console.error('Object ID required');
            return { success: false };
        }

        const deleted = await this.storage.delete(objectId);

        if (deleted) {
            console.log(`✅ Deleted: ${objectId}`);
        } else {
            console.log(`❌ Not found: ${objectId}`);
        }

        return { success: deleted };
    }

    /**
     * Show statistics
     */
    async stats() {
        const stats = this.storage.getStats();

        console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`║                    Q3 Statistics                                 ║`);
        console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

        console.log(`Objects stored:  ${stats.objectCount}`);
        console.log(`Total bytes:     ${this._formatBytes(stats.bytesStored)}`);
        console.log(`Shards created:  ${stats.shardsCreated}`);
        console.log(`Active uploads:  ${stats.activeUploads}`);
        console.log(`Active downloads:${stats.activeDownloads}`);
        console.log(`Backend:         ${stats.backend}`);
        console.log(`Workers:         ${stats.workerCount}`);

        if (stats.workers.length > 0) {
            console.log(`\nWorker Status:`);
            for (const worker of stats.workers) {
                console.log(`  - ${worker.nodeId}: ${worker.status} (${worker.shardCount} shards)`);
            }
        }

        return { success: true, stats };
    }

    /**
     * WASM image operations
     */
    async wasm(subcommand, args) {
        switch (subcommand) {
            case 'upload':
                return this.wasmUpload(args[0]);

            case 'list':
                return this.wasmList();

            case 'download':
                return this.wasmDownload(args[0]);

            default:
                console.log('WASM commands: upload, list, download');
                return { success: false };
        }
    }

    /**
     * Upload WASM image
     */
    async wasmUpload(filePath) {
        if (!filePath || !fs.existsSync(filePath)) {
            console.error('WASM file not found:', filePath);
            return { success: false };
        }

        const imageName = path.basename(filePath, '.wasm');

        console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`║                    Q3 WASM Upload                                ║`);
        console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

        const result = await this.storage.storeWasmImage(filePath, imageName);

        console.log(`\n✅ WASM Image Uploaded`);
        console.log(`   Object ID: ${result.objectId}`);
        console.log(`   Name:      ${result.name}`);
        console.log(`   Size:      ${this._formatBytes(result.size)}`);
        console.log(`   Shards:    ${result.shardCount}`);

        return { success: true, object: result };
    }

    /**
     * List WASM images
     */
    async wasmList() {
        const images = this.storage.listWasmImages();

        console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`║                    Q3 WASM Images                                ║`);
        console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

        if (images.length === 0) {
            console.log('No WASM images stored');
        } else {
            console.log(`${'Name'.padEnd(30)} ${'Size'.padStart(12)} Shards`);
            console.log('─'.repeat(55));

            for (const img of images) {
                console.log(
                    `${img.name.padEnd(30)} ` +
                    `${this._formatBytes(img.size).padStart(12)} ` +
                    `${img.shardCount}`
                );
            }
        }

        return { success: true, images };
    }

    /**
     * Download WASM image
     */
    async wasmDownload(imageName) {
        if (!imageName) {
            console.error('Image name required');
            return { success: false };
        }

        console.log(`\nDownloading WASM image: ${imageName}`);

        const { object, data } = await this.storage.retrieveWasmImage(imageName);

        const outputPath = path.join(process.cwd(), `${imageName}.wasm`);
        fs.writeFileSync(outputPath, data);

        console.log(`\n✅ Downloaded: ${imageName}`);
        console.log(`   Size: ${this._formatBytes(data.length)}`);
        console.log(`   Saved to: ${outputPath}`);

        return { success: true, object, outputPath };
    }

    /**
     * Show help
     */
    help() {
        console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    Q3 Storage CLI                                ║
╠══════════════════════════════════════════════════════════════════╣
║  q3 store <file>           Store a file                         ║
║  q3 retrieve <id>          Retrieve an object                   ║
║  q3 list                   List all objects                     ║
║  q3 delete <id>            Delete an object                     ║
║  q3 stats                  Show storage statistics              ║
║                                                                  ║
║  WASM Commands:                                                  ║
║  q3 wasm upload <file>     Upload WASM image                    ║
║  q3 wasm list              List WASM images                     ║
║  q3 wasm download <name>   Download WASM image                  ║
║                                                                  ║
║  q3 help                   Show this help                       ║
╚══════════════════════════════════════════════════════════════════╝
`);
        return { success: true };
    }

    _formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// CLI entry point
if (require.main === module) {
    const cli = new Q3CLI();
    cli.run(process.argv.slice(2))
        .then(result => {
            if (!result.success) process.exit(1);
        })
        .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
        });
}

module.exports = Q3CLI;
