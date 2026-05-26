// QuantumCloud - Q3 Carrier Differential Storage Adapter
// Stores only quantum state DIFFS, not full states
// Full states live in LiteSpeed cache + QuantumFS mesh

const AWS = require('aws-sdk');
const crypto = require('crypto');

class Q3 CarrierDiffStorage {
    constructor() {
        this.s3 = new AWS.S3({
            endpoint: 'https://s3.Q3 Carrier.io',
            accessKeyId: process.env.Q3_CARRIER_ID || 'u4bi8wC839SUl0aZPBn/Cpw8wPWglXo7',
            secretAccessKey: process.env.Q3_CARRIER_SECRET || '5GPCMUeE790r5JdLl0V4l9p4vb2R+8WjmsspQex+Bok=',
            s3ForcePathStyle: true,
            signatureVersion: 'v4'
        });
        this.bucket = 'cr8os1';
        this.prefix = 'db/cloud/';
    }

    // USER MANAGEMENT
    async getUser(apiKey) {
        try {
            const data = await this.s3.getObject({
                Bucket: this.bucket,
                Key: `${this.prefix}users/${apiKey}.json`
            }).promise();
            return JSON.parse(data.Body.toString());
        } catch (err) {
            if (err.code === 'NoSuchKey') return null;
            throw err;
        }
    }

    async createUser(user) {
        await this.s3.putObject({
            Bucket: this.bucket,
            Key: `${this.prefix}users/${user.api_key}.json`,
            Body: JSON.stringify(user, null, 2),
            ContentType: 'application/json'
        }).promise();
    }

    // JOB MANAGEMENT
    async createJob(job) {
        const jobMeta = {
            id: job.id,
            user_id: job.user_id,
            status: job.status,
            qubits: job.qubits,
            shots: job.shots,
            litespeed_node: this.selectEdgeNode(job),
            created_at: job.created_at
        };

        await this.s3.putObject({
            Bucket: this.bucket,
            Key: `${this.prefix}jobs/${job.id}.meta.json`,
            Body: JSON.stringify(jobMeta, null, 2),
            ContentType: 'application/json'
        }).promise();

        if (job.status === 'queued') {
            await this.s3.putObject({
                Bucket: this.bucket,
                Key: `${this.prefix}jobs/pending/${job.id}.json`,
                Body: JSON.stringify({ id: job.id, assigned_node: jobMeta.litespeed_node }),
                ContentType: 'application/json'
            }).promise();
        }
    }

    selectEdgeNode(job) {
        const regions = ['us-east', 'us-west', 'eu-west', 'asia-east'];
        const randomRegion = regions[Math.floor(Math.random() * regions.length)];
        return `node001.${randomRegion}.quantum.cr8os.io`;
    }

    async trackUsage(userId, gates) {
        const month = new Date().toISOString().slice(0, 7);
        const key = `${this.prefix}usage/${userId}/${month}.json`;

        let usage;
        try {
            const data = await this.s3.getObject({ Bucket: this.bucket, Key: key }).promise();
            usage = JSON.parse(data.Body.toString());
        } catch (err) {
            usage = { user_id: userId, month, gates_used: 0, jobs: 0 };
        }

        usage.gates_used += gates;
        usage.jobs += 1;

        await this.s3.putObject({
            Bucket: this.bucket,
            Key: key,
            Body: JSON.stringify(usage, null, 2)
        }).promise();

        return usage;
    }

    async listPendingJobs(limit = 10) {
        const result = await this.s3.listObjectsV2({
            Bucket: this.bucket,
            Prefix: `${this.prefix}jobs/pending/`,
            MaxKeys: limit
        }).promise();

        const jobs = await Promise.all(
            result.Contents.map(async (obj) => {
                const data = await this.s3.getObject({ Bucket: this.bucket, Key: obj.Key }).promise();
                return JSON.parse(data.Body.toString());
            })
        );

        return jobs;
    }
}

module.exports = new Q3 CarrierDiffStorage();
