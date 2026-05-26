#!/bin/bash
# Deploy Improved HTML Documentation

DOCS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/html"

echo "📚 Deploying Improved HTML Documentation"
echo "Target: $DOCS_DIR"
echo ""

# Backup originals
echo "💾 Backing up original files..."
mkdir -p "$DOCS_DIR/backup-$(date +%Y%m%d)"
cp "$DOCS_DIR"/*.html "$DOCS_DIR/backup-$(date +%Y%m%d)/" 2>/dev/null

# Deploy improved index.html
echo "🎨 Creating improved index.html..."
cat > "$DOCS_DIR/index.html" << 'INDEX_EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QuantumCloud - AWS for Quantum Computing | cr8OS</title>
   <meta name="description" content="588 logical qubits on-demand. Serverless quantum computing with QUIC/HTTP3 edge delivery. Pay-as-you-go quantum circuits.">
    <style>
        :root {
            --quantum-cyan: #00d4ff;
            --quantum-purple: #7b2cbf;
            --quantum-green: #10b981;
            --dark: #0f172a;
            --darker: #020617;
            --light: #f8fafc;
            --gray: #64748b;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--darker);
            color: var(--light);
            line-height: 1.6;
        }
        nav {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(0, 212, 255, 0.2);
            z-index: 1000;
            padding: 1rem 2rem;
        }
        nav .container {
            max-width: 1400px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .logo {
            font-size: 1.5rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--quantum-cyan), var(--quantum-purple));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        nav ul {
            display: flex;
            list-style: none;
            gap: 2rem;
            align-items: center;
        }
        nav a {
            color: var(--light);
            text-decoration: none;
            opacity: 0.8;
            transition: opacity 0.2s;
        }
        nav a:hover {
            opacity: 1;
            color: var(--quantum-cyan);
        }
        .quic-badge {
            background: rgba(0, 212, 255, 0.1);
            border: 1px solid rgba(0, 212, 255, 0.3);
            padding: 0.375rem 0.75rem;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--quantum-cyan);
            animation: pulse-glow 2s ease-in-out infinite;
        }
        @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 5px rgba(0, 212, 255, 0.3); }
            50% { box-shadow: 0 0 20px rgba(0, 212, 255, 0.6); }
        }
        .hero {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, var(--darker) 0%, #1e293b 100%);
            position: relative;
            overflow: hidden;
            padding-top: 80px;
        }
        .hero::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: 
                radial-gradient(circle at 20% 30%, rgba(0, 212, 255, 0.15) 0%, transparent 50%),
                radial-gradient(circle at 80% 70%, rgba(123, 44, 191, 0.15) 0%, transparent 50%);
        }
        .hero-content {
            text-align: center;
            z-index: 1;
            padding: 2rem;
            max-width: 900px;
        }
        .hero h1 {
            font-size: clamp(2.5rem, 8vw, 4.5rem);
            font-weight: 900;
            margin-bottom: 1.5rem;
            background: linear-gradient(135deg, var(--quantum-cyan), var(--quantum-purple));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .btn {
            display: inline-block;
            padding: 1rem 2rem;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 700;
            transition: all 0.3s;
            font-size: 1.1rem;
            margin: 0.5rem;
        }
        .btn-primary {
            background: linear-gradient(135deg, var(--quantum-cyan, var(--quantum-purple));
            color: white;
        }
        .btn-primary:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 40px rgba(0, 212, 255, 0.4);
        }
        @media (max-width: 768px) {
            nav ul { display: none; }
        }
    </style>
</head>
<body>
    <nav>
        <div class="container">
            <div class="logo">⚛️ QuantumCloud</div>
            <ul>
                <li><a href="getting-started.html">Get Started</a></li>
                <li><a href="api-reference.html">API Docs</a></li>
                <li><a href="pricing.html">Pricing</a></li>
                <li class="quic-badge">⚡ QUIC/HTTP3</li>
            </ul>
        </div>
    </nav>

    <section class="hero">
        <div class="hero-content">
            <h1>AWS for Quantum Computing</h1>
            <p style="font-size: 1.35rem; color: var(--gray); margin-bottom: 2.5rem;">
                588 logical qubits on demand. Serverless quantum circuits with QUIC/HTTP3 edge delivery.
            </p>
            <div>
                <a href="getting-started.html" class="btn btn-primary">Start Free Trial</a>
                <a href="api-reference.html" class="btn btn-primary" style="background: rgba(255,255,255,0.1);">📚 Docs</a>
            </div>
        </div>
    </section>
</body>
</html>
INDEX_EOF

echo "✅ HTML documentation improved!"
echo ""
echo "📁 Files updated:"
echo "  - $DOCS_DIR/index.html"
echo ""
echo "💾 Backups saved to: $DOCS_DIR/backup-$(date +%Y%m%d)/"
echo ""
INDEX_EOF

chmod +x deploy-improved-html.sh
./deploy-improved-html.sh
