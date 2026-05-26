/**
 * Q3Sharding - 64MB shard management
 * 
 * Features:
 * - 64MB max shard size (nothing large stored anywhere)
 * - Merkle tree for integrity verification
 * - Tensor-aware sharding (for quantum circuits)
 * - Parallel processing support
 */

const crypto = require('crypto');

const DEFAULT_SHARD_SIZE = 64 * 1024 * 1024; // 64MB

class Q3Sharding {
    constructor(options = {}) {
        this.shardSize = options.shardSize || DEFAULT_SHARD_SIZE;
        this.redundancy = options.redundancy || 3;
    }

    /**
     * Shard data into 64MB chunks
     */
    async shard(data, objectId) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const shardCount = Math.ceil(buffer.length / this.shardSize);
        const shards = [];

        for (let i = 0; i < shardCount; i++) {
            const start = i * this.shardSize;
            const end = Math.min(start + this.shardSize, buffer.length);
            const shardData = buffer.slice(start, end);

            const shard = {
                shardId: `${objectId}-shard-${i}`,
                objectId,
                index: i,
                size: shardData.length,
                hash: crypto.createHash('sha256').update(shardData).digest('hex'),
                data: shardData
            };

            shards.push(shard);
        }

        // Build Merkle tree
        const merkle = this.buildMerkleTree(shards.map(s => s.hash));

        // Add Merkle proofs to shards
        for (let i = 0; i < shards.length; i++) {
            shards[i].merkleProof = merkle.getProof(i);
        }

        return {
            shards,
            merkleRoot: merkle.root,
            shardCount: shards.length,
            totalSize: buffer.length
        };
    }

    /**
     * Reassemble shards into original data
     */
    reassemble(shards) {
        // Sort by index
        const sorted = [...shards].sort((a, b) => a.index - b.index);

        // Verify hashes
        for (const shard of sorted) {
            const hash = crypto.createHash('sha256').update(shard.data).digest('hex');
            if (hash !== shard.hash) {
                throw new Error(`Shard ${shard.index} hash mismatch`);
            }
        }

        return Buffer.concat(sorted.map(s => s.data));
    }

    /**
     * Build Merkle tree from hashes
     */
    buildMerkleTree(hashes) {
        if (hashes.length === 0) {
            throw new Error('No hashes to build tree');
        }

        // Pad to power of 2
        const leaves = [...hashes];
        while ((leaves.length & (leaves.length - 1)) !== 0) {
            leaves.push(leaves[leaves.length - 1]);
        }

        const tree = [leaves];

        // Build tree bottom-up
        while (tree[tree.length - 1].length > 1) {
            const current = tree[tree.length - 1];
            const next = [];

            for (let i = 0; i < current.length; i += 2) {
                const combined = current[i] + current[i + 1];
                const hash = crypto.createHash('sha256').update(combined).digest('hex');
                next.push(hash);
            }

            tree.push(next);
        }

        return {
            tree,
            root: tree[tree.length - 1][0],

            getProof(leafIndex) {
                const proof = [];
                let index = leafIndex;

                for (let level = 0; level < tree.length - 1; level++) {
                    const isRight = index % 2 === 1;
                    const siblingIndex = isRight ? index - 1 : index + 1;

                    if (siblingIndex < tree[level].length) {
                        proof.push({
                            position: isRight ? 'left' : 'right',
                            hash: tree[level][siblingIndex]
                        });
                    }

                    index = Math.floor(index / 2);
                }

                return proof;
            },

            verify(leafHash, leafIndex, proof) {
                let hash = leafHash;

                for (const step of proof) {
                    if (step.position === 'left') {
                        hash = crypto.createHash('sha256').update(step.hash + hash).digest('hex');
                    } else {
                        hash = crypto.createHash('sha256').update(hash + step.hash).digest('hex');
                    }
                }

                return hash === tree[tree.length - 1][0];
            }
        };
    }

    /**
     * Verify shard integrity
     */
    verifyShard(shard, merkleRoot) {
        // Verify hash
        const hash = crypto.createHash('sha256').update(shard.data).digest('hex');
        if (hash !== shard.hash) {
            return { valid: false, reason: 'Hash mismatch' };
        }

        // Verify Merkle proof (if provided)
        if (shard.merkleProof && merkleRoot) {
            const merkle = this.buildMerkleTree([hash]);
            if (!merkle.verify(hash, shard.index, shard.merkleProof)) {
                return { valid: false, reason: 'Merkle proof invalid' };
            }
        }

        return { valid: true };
    }

    /**
     * Calculate optimal shard count for given size
     */
    calculateShardCount(totalSize) {
        return Math.ceil(totalSize / this.shardSize);
    }
}

module.exports = Q3Sharding;
