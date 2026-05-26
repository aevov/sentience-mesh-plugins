"""
CR8OS Quantum Bitcoin Mining Dashboard - Flask Monitor

Lightweight Flask application for LOCAL MONITORING ONLY.
All actual mining happens in the cloud (Cubbit).

This serves the cr8os-alter-dashboard.html and provides
real-time mining status via WebSocket.

Usage:
    python app.py
    
Then open: http://localhost:7472
"""

import os
import json
import time
import threading
import requests
from datetime import datetime
from flask import Flask, render_template, jsonify, send_from_directory, request
from flask_cors import CORS

# Try to import Flask-SocketIO for real-time updates
try:
    from flask_socketio import SocketIO, emit
    HAS_SOCKETIO = True
except ImportError:
    HAS_SOCKETIO = False
    print("[Flask Monitor] flask-socketio not installed, using polling mode")

# ============================================================================
# CONFIGURATION
# ============================================================================

CONFIG = {
    'host': '0.0.0.0',
    'port': 7472,
    'debug': False,
    
    # Cloud mining endpoints (Cubbit)
    'mining_api': {
        'cubbit_edge': 'https://mining.cr8os.io/api/mining',
        'status': '/status',
        'work': '/work',
        'submit': '/submit',
    },
    
    # Dashboard paths
    'dashboard_dir': os.path.dirname(os.path.abspath(__file__)),
    'dashboard_file': 'cr8os-alter-dashboard.html',
    
    # Update intervals (seconds)
    'status_interval': 5,
    'stats_interval': 30,
}

# ============================================================================
# FLASK APP
# ============================================================================

app = Flask(__name__)
CORS(app)

if HAS_SOCKETIO:
    socketio = SocketIO(app, cors_allowed_origins="*")

# Global mining stats
mining_stats = {
    'status': 'initializing',
    'hashrate': '0 H/s',
    'hashes_computed': 0,
    'shares_found': 0,
    'shares_accepted': 0,
    'uptime': 0,
    'start_time': time.time(),
    'last_update': None,
    'cloud_workers': [],
    'perpetual': True,
    'platform': 'cubbit-only',
}

# ============================================================================
# ROUTES
# ============================================================================

@app.route('/')
def index():
    """Serve the main dashboard"""
    dashboard_path = os.path.join(
        os.path.dirname(CONFIG['dashboard_dir']),
        CONFIG['dashboard_file']
    )
    
    # Try multiple possible locations
    possible_paths = [
        dashboard_path,
        os.path.join(CONFIG['dashboard_dir'], '..', CONFIG['dashboard_file']),
        os.path.join(CONFIG['dashboard_dir'], '..', '..', 'extraction engine', CONFIG['dashboard_file']),
        '/home/baba/Desktop/complete quantum/cr8OS-complete-quantum/extraction engine/cr8os-alter-dashboard.html',
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            return send_from_directory(os.path.dirname(path), os.path.basename(path))
    
    # If dashboard not found, serve embedded status page
    return render_embedded_dashboard()


@app.route('/api/status')
def api_status():
    """Get current mining status"""
    update_stats()
    return jsonify(mining_stats)


@app.route('/api/stats')
def api_stats():
    """Get detailed mining statistics"""
    update_stats()
    return jsonify({
        **mining_stats,
        'detailed': {
            'cloud_platform': 'Cubbit S3 + Functions',
            'local_mode': 'monitoring_only',
            'hashing': 'offloaded_to_cloud',
            'workers': {
                'primary': 'cr8stream-worker-apl3-cubbit.js',
                'fallback': 'cr8stream-worker-apl3-fallback.js',
                'edge': 'cubbit-worker.js'
            },
            'optimization': {
                'type': 'APL 3.0 Qudit',
                'dimension': 3,
                'improvement': '+35%'
            }
        }
    })


@app.route('/api/workers')
def api_workers():
    """Get cloud worker status"""
    workers = fetch_cloud_workers()
    return jsonify({
        'count': len(workers),
        'workers': workers,
        'platform': 'cubbit',
        'oracle_dependency': False
    })


@app.route('/api/hashrate')
def api_hashrate():
    """Get current hashrate"""
    update_stats()
    return jsonify({
        'hashrate': mining_stats['hashrate'],
        'hashes': mining_stats['hashes_computed'],
        'source': 'cloud',
        'local': False
    })


@app.route('/api/health')
def api_health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'flask-monitor',
        'purpose': 'local_monitoring_only',
        'cloud_mining': True,
        'local_mining': False,
        'timestamp': datetime.utcnow().isoformat()
    })


# ============================================================================
# CLOUD WORKER COMMUNICATION
# ============================================================================

def fetch_cloud_workers():
    """Fetch status from cloud mining workers"""
    workers = []
    
    try:
        # Try to reach Cubbit edge worker
        response = requests.get(
            f"{CONFIG['mining_api']['cubbit_edge']}{CONFIG['mining_api']['status']}",
            timeout=5
        )
        if response.ok:
            workers.append({
                'id': 'cubbit-edge',
                'type': 'cubbit-functions',
                'status': 'running',
                'data': response.json()
            })
    except Exception as e:
        workers.append({
            'id': 'cubbit-edge',
            'type': 'cubbit-functions',
            'status': 'unreachable',
            'error': str(e)
        })
    
    return workers


def update_stats():
    """Update mining stats from cloud workers"""
    global mining_stats
    
    mining_stats['uptime'] = int(time.time() - mining_stats['start_time'])
    mining_stats['last_update'] = datetime.utcnow().isoformat()
    
    # Fetch from cloud workers
    workers = fetch_cloud_workers()
    mining_stats['cloud_workers'] = workers
    
    # Aggregate stats from workers
    total_hashrate = 0
    total_hashes = 0
    total_shares = 0
    
    for worker in workers:
        if worker['status'] == 'running' and 'data' in worker:
            data = worker['data']
            if 'stats' in data:
                stats = data['stats']
                # Parse hashrate string
                if 'hashrate' in stats:
                    hr = stats['hashrate']
                    if 'MH/s' in hr:
                        total_hashrate += float(hr.replace(' MH/s', '')) * 1e6
                    elif 'KH/s' in hr:
                        total_hashrate += float(hr.replace(' KH/s', '')) * 1e3
                    elif 'H/s' in hr:
                        total_hashrate += float(hr.replace(' H/s', ''))
                
                if 'hashesComputed' in stats:
                    total_hashes += int(stats['hashesComputed'])
                if 'sharesFound' in stats:
                    total_shares += stats['sharesFound']
    
    # Format hashrate
    if total_hashrate >= 1e12:
        mining_stats['hashrate'] = f"{total_hashrate/1e12:.2f} TH/s"
    elif total_hashrate >= 1e9:
        mining_stats['hashrate'] = f"{total_hashrate/1e9:.2f} GH/s"
    elif total_hashrate >= 1e6:
        mining_stats['hashrate'] = f"{total_hashrate/1e6:.2f} MH/s"
    elif total_hashrate >= 1e3:
        mining_stats['hashrate'] = f"{total_hashrate/1e3:.2f} KH/s"
    else:
        mining_stats['hashrate'] = f"{total_hashrate:.2f} H/s"
    
    mining_stats['hashes_computed'] = total_hashes
    mining_stats['shares_found'] = total_shares
    mining_stats['status'] = 'mining' if workers else 'waiting_for_workers'


# ============================================================================
# WEBSOCKET (if available)
# ============================================================================

if HAS_SOCKETIO:
    @socketio.on('connect')
    def handle_connect():
        print('[Flask Monitor] Client connected')
        emit('status', mining_stats)
    
    @socketio.on('request_status')
    def handle_request_status():
        update_stats()
        emit('status', mining_stats)
    
    def background_updates():
        """Send periodic updates to connected clients"""
        while True:
            time.sleep(CONFIG['status_interval'])
            update_stats()
            socketio.emit('status', mining_stats)
    
    # Start background thread
    update_thread = threading.Thread(target=background_updates, daemon=True)


# ============================================================================
# EMBEDDED DASHBOARD
# ============================================================================

def render_embedded_dashboard():
    """Render embedded status dashboard if main dashboard not found"""
    return '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CR8OS Mining Monitor</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0d0d1f 100%);
            color: #fff;
            min-height: 100vh;
            padding: 40px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 30px;
            background: linear-gradient(90deg, #00ffff, #ff00ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .status-card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 24px;
        }
        .status-card h3 {
            color: rgba(255,255,255,0.6);
            font-size: 0.9rem;
            margin-bottom: 8px;
        }
        .status-card .value {
            font-size: 1.8rem;
            font-weight: 700;
            color: #00ffff;
        }
        .indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 8px;
            animation: pulse 2s infinite;
        }
        .indicator.running { background: #00ff88; }
        .indicator.waiting { background: #ffff00; }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .cloud-badge {
            display: inline-block;
            background: linear-gradient(135deg, #00d9ff, #a855f7);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.85rem;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚡ CR8OS Mining Monitor</h1>
        <div class="cloud-badge">☁️ Cloud Mining via Cubbit - Local Monitoring Only</div>
        
        <div class="status-grid">
            <div class="status-card">
                <h3>STATUS</h3>
                <div class="value">
                    <span class="indicator running" id="indicator"></span>
                    <span id="status">Loading...</span>
                </div>
            </div>
            <div class="status-card">
                <h3>HASHRATE</h3>
                <div class="value" id="hashrate">0 H/s</div>
            </div>
            <div class="status-card">
                <h3>HASHES COMPUTED</h3>
                <div class="value" id="hashes">0</div>
            </div>
            <div class="status-card">
                <h3>SHARES FOUND</h3>
                <div class="value" id="shares">0</div>
            </div>
            <div class="status-card">
                <h3>UPTIME</h3>
                <div class="value" id="uptime">0s</div>
            </div>
            <div class="status-card">
                <h3>CLOUD WORKERS</h3>
                <div class="value" id="workers">0</div>
            </div>
        </div>
        
        <p style="color: rgba(255,255,255,0.5); text-align: center;">
            All mining is offloaded to Cubbit cloud. This is a monitoring interface only.
        </p>
    </div>
    
    <script>
        function formatUptime(seconds) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            return `${h}h ${m}m ${s}s`;
        }
        
        function updateStats() {
            fetch('/api/status')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('status').textContent = data.status || 'unknown';
                    document.getElementById('hashrate').textContent = data.hashrate || '0 H/s';
                    document.getElementById('hashes').textContent = data.hashes_computed?.toLocaleString() || '0';
                    document.getElementById('shares').textContent = data.shares_found || '0';
                    document.getElementById('uptime').textContent = formatUptime(data.uptime || 0);
                    document.getElementById('workers').textContent = data.cloud_workers?.length || '0';
                    
                    const indicator = document.getElementById('indicator');
                    indicator.className = 'indicator ' + (data.status === 'mining' ? 'running' : 'waiting');
                })
                .catch(err => {
                    document.getElementById('status').textContent = 'Error';
                });
        }
        
        // Update every 5 seconds
        updateStats();
        setInterval(updateStats, 5000);
    </script>
</body>
</html>
'''


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    print(f"""
╔══════════════════════════════════════════════════════════════════╗
║                  CR8OS Mining Monitor                            ║
║                  ═══════════════════                             ║
║                                                                  ║
║  Mode: LOCAL MONITORING ONLY                                     ║
║  Mining: OFFLOADED TO CUBBIT CLOUD                               ║
║                                                                  ║
║  Dashboard: http://localhost:{CONFIG['port']}                          ║
║  API:       http://localhost:{CONFIG['port']}/api/status               ║
║                                                                  ║
║  Workers:                                                        ║
║    • cr8stream-worker-apl3-cubbit.js (Primary)                   ║
║    • cr8stream-worker-apl3-fallback.js (Fallback)                ║
║    • cubbit-worker.js (Edge)                                     ║
║                                                                  ║
║  NO Oracle Dependency | 100% Cubbit                              ║
╚══════════════════════════════════════════════════════════════════╝
    """)
    
    if HAS_SOCKETIO:
        update_thread.start()
        socketio.run(app, host=CONFIG['host'], port=CONFIG['port'], debug=CONFIG['debug'])
    else:
        app.run(host=CONFIG['host'], port=CONFIG['port'], debug=CONFIG['debug'])