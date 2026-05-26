# Q3 Edge Worker

Serverless static site hosting for Q3 Quantum Storage via Cloudflare Workers.

## Architecture

```
User → QUIC.cloud → Cloudflare Worker → Q3 Carrier S3
         (CDN)        (Compute)         (Storage)
```

**No origin server needed** - fully serverless!

## Quick Start

### 1. Install Dependencies
```bash
cd q3-edge-worker
npm install
```

### 2. Configure Secrets
```bash
# Set your Q3 Carrier S3 credentials
npx wrangler secret put Q3_CARRIER_ACCESS_KEY
npx wrangler secret put Q3_CARRIER_SECRET_KEY
```

### 3. Sync Sites to S3
```bash
# Sync all Q3 sites to Q3 Carrier (edge-readable format)
npm run sync

# Or sync a specific site
npm run sync -- --site site-abc123
```

### 4. Deploy Worker
```bash
# Development
npm run dev

# Production
npm run deploy
```

### 5. Configure QUIC.cloud
In your QUIC.cloud dashboard, set the origin to point to your Cloudflare Worker:
- **Origin IP**: Get from `wrangler whoami` or Cloudflare dashboard
- **Or use Cloudflare DNS**: Point your domain to Cloudflare nameservers

## File Structure

Sites are stored in Q3 Carrier S3 as:
```
cr8os1/
└── q3/
    ├── routing/
    │   └── {subdomain}.json          # Subdomain → siteId mapping
    └── sites/
        └── {siteId}/
            ├── manifest.json          # Site metadata
            └── files/
                ├── index.html
                ├── style.css
                └── ...
```

## URL Routing

| URL | Resolution |
|-----|------------|
| `mysite.q3.convobuilder.com` | → `q3/routing/mysite.json` → `siteId` |
| `mysite.q3.convobuilder.com/page.html` | → `q3/sites/{siteId}/files/page.html` |
| `mysite.q3.convobuilder.com/` | → `index.html` (auto) |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `Q3_CARRIER_ENDPOINT` | S3 endpoint | No (default: s3.Q3 Carrier.eu) |
| `Q3_CARRIER_BUCKET` | S3 bucket name | No (default: cr8os1) |
| `Q3_CARRIER_REGION` | S3 region | No (default: eu-west-1) |
| `Q3_CARRIER_ACCESS_KEY` | S3 access key | **Yes** (secret) |
| `Q3_CARRIER_SECRET_KEY` | S3 secret key | **Yes** (secret) |

## Caching

| File Type | Cache Duration |
|-----------|---------------|
| Images, fonts, video | 1 year (immutable) |
| CSS, JS | 24 hours |
| HTML | 5 minutes |
| Other | 1 hour |

## Security Headers

HTML responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Access-Control-Allow-Origin: *`

## Development

```bash
# Run locally
npm run dev

# View logs
npm run tail
```

## Production Deployment

1. Configure routes in `wrangler.toml`:
```toml
[[routes]]
pattern = "*.q3.convobuilder.com/*"
zone_name = "convobuilder.com"
```

2. Deploy:
```bash
npm run deploy:production
```

## License

MIT - Cr8OS Quantum Cloud
