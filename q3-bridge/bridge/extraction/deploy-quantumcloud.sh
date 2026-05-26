#!/bin/bash

# QuantumCloud CyberPanel Deployment Automation
# Deploys ultra-lean QUIC/HTTP3 edge-native quantum cloud

set -e

echo "🌐 QuantumCloud - CyberPanel Deployment"
echo "========================================"

# Configuration
DOMAIN="cloud.cr8os.com"
CUBBIT_ID="u4bi8wC839SUl0aZPBn/Cpw8wPWglXo7"
CUBBIT_SECRET="5GPCMUeE790r5JdLl0V4l9p4vb2R+8WjmsspQex+Bok="

# 1. Create website via CyberPanel
echo "📦 Creating website: $DOMAIN"
cyberpanel createWebsite \
    --domainName $DOMAIN \
    --owner quantum \
    --package default \
    --ssl 1 \
    --dkim 0 \
    --openBasedir 0

# 2. Deploy application files
echo "📂 Deploying application files..."
cd /home/$DOMAIN/public_html

# Create directory structure
mkdir -p api auth storage cron public

# Copy files (assuming they're in current directory)
cp quantumcloud-api-server.js api/server.js
cp quantumcloud-storage-cubbit-diff-adapter.js storage/cubbit-diff-adapter.js
cp quantumcloud-bidc-worker.js cron/bidc-worker.js

# 3. Install dependencies
echo "📦 Installing Node.js dependencies..."
cat > package.json << 'EOF'
{
  "name": "quantumcloud-api",
  "version": "1.0.0",
  "main": "api/server.js",
  "scripts": {
    "start": "node api/server.js",
    "worker-a": "WORKER_NAME=worker-a node cron/bidc-worker.js",
    "worker-b": "WORKER_NAME=worker-b node cron/bidc-worker.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "aws-sdk": "^2.1400.0",
    "dotenv": "^16.3.1"
  }
}
EOF

npm install

# 4. Create environment configuration
echo "🔐 Creating environment configuration..."
cat > .env << EOF
CUBBIT_ID=$CUBBIT_ID
CUBBIT_SECRET=$CUBBIT_SECRET
CUBBIT_BUCKET=cr8os1
CUBBIT_PREFIX=db/cloud/
PORT=3000
NODE_ENV=production
EOF

# 5. Configure OpenLiteSpeed for QUIC/HTTP3
echo "⚡ Configuring OpenLiteSpeed for QUIC..."
cat > /usr/local/lsws/conf/vhosts/$DOMAIN/vhconf.conf << 'EOF'
docRoot                   /home/cloud.cr8os.com/public_html/public

# QUIC/HTTP3 enabled
quicEnable                1
quicShmDir                /dev/shm/lsquic

# Proxy to Node.js API
context /api/ {
  type                    proxy
  handler                 http://127.0.0.1:3000
  addDefaultCharset       off
}

# Static dashboard
context / {
  location                /home/cloud.cr8os.com/public_html/public
  allowBrowse             1
  indexFiles              index.html
}

# Cache headers for QUIC optimization
rewrite  {
  enable                  1
  autoLoadHtaccess        1
}
EOF

# 6. Set up PM2 for process management
echo "🔄 Setting up PM2 process manager..."
npm install -g pm2

# Start API server
pm2 start api/server.js \
    --name quantumcloud-api \
    --instances 1 \
    --max-memory-restart 100M

# Start bidirectional workers
pm2 start cron/bidc-worker.js \
    --name worker-a \
    -- --WORKER_NAME=worker-a

pm2 start cron/bidc-worker.js \
    --name worker-b \
    -- --WORKER_NAME=worker-b

# Save PM2 configuration
pm2 save
pm2 startup

# 7. Initialize Cubbit bucket structure
echo "☁️ Initializing Cubbit bucket structure..."
cat > init-cubbit.js << 'EOF'
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
    endpoint: 'https://s3.cubbit.io',
    accessKeyId: process.env.CUBBIT_ID,
    secretAccessKey: process.env.CUBBIT_SECRET,
    s3ForcePathStyle: true,
    signatureVersion: 'v4'
});

async function initBucket() {
    const folders = [
        'db/cloud/users/',
        'db/cloud/jobs/',
        'db/cloud/jobs/pending/',
        'db/cloud/diffs/',
        'db/cloud/usage/',
        'db/cloud/workers/',
        'db/cloud/nodes/'
    ];
    
    for (const folder of folders) {
        await s3.putObject({
            Bucket: 'cr8os1',
            Key: folder,
            Body: ''
        }).promise();
        console.log(`✓ Created ${folder}`);
    }
    
    console.log('✅ Cubbit bucket initialized');
}

initBucket().catch(console.error);
EOF

node init-cubbit.js

# 8. Deploy monitoring (Beszel)
echo "📊 Deploying monitoring..."
docker run -d \
    --name beszel \
    --restart unless-stopped \
    -p 8090:8090 \
    -v /opt/beszel-data:/data \
    henrygd/beszel:latest

# 9. Restart OpenLiteSpeed to apply QUIC config
echo "🔄 Restarting OpenLiteSpeed..."
/usr/local/lsws/bin/lswsctrl restart

# 10. Verify deployment
echo ""
echo "✅ Deployment Complete!"
echo "======================="
echo ""
echo "📍 Dashboard: https://$DOMAIN"
echo "🔌 API Endpoint: https://$DOMAIN/api/v1"
echo "📊 Monitoring: http://$(hostname -I | awk '{print $1}'):8090"
echo ""
echo "🔑 System Status:"
pm2 status
echo ""
echo "💾 Resource Usage:"
free -h | grep Mem
echo ""
echo "⚡ QUIC/HTTP3 Status:"
curl -I https://$DOMAIN/health 2>/dev/null | grep -i "alt-svc"
echo ""
echo "🎯 Next Steps:"
echo "1. Access dashboard at https://$DOMAIN"
echo "2. Register your first user"
echo "3. Configure payment webhooks (Stripe/PayPal)"
echo "4. Monitor with Beszel"
echo ""
