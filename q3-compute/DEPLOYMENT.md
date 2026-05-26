# Q3 Compute - Deployment Guide

## Quick Start

### 1. Upload Plugin
```bash
# Upload to WordPress
wp plugin install /path/to/q3-compute.zip --activate

# OR manually:
# Upload q3-compute.zip via Plugins > Add New > Upload
```

### 2. Verify Installation
- Go to **WP Admin > Q3 Compute**
- Should see dashboard with 500,000 qubits capacity
- Click "Run Random Circuit" to test

### 3. Configure Authentication
For API access, create an Application Password:
1. Go to **Users > Your Profile**
2. Scroll to **Application Passwords**
3. Create new password for "Q3 Compute API"
4. Save the generated password

---

## API Reference

### Base URL
```
https://your-site.com/wp-json/q3-compute/v1
```

### Authentication
Use HTTP Basic Auth with WordPress username and Application Password:
```bash
curl -u "username:application_password" https://site.com/wp-json/q3-compute/v1/compute
```

---

### Endpoints

#### GET /capacity (Public)
Get system capacity and status.
```bash
curl https://site.com/wp-json/q3-compute/v1/capacity
```
Response:
```json
{
  "success": true,
  "capacity": {
    "total_qubits": 500000,
    "available_qubits": 500000,
    "gw_equivalent": "0.5 GW",
    "gate_ops_per_sec": 10000000
  },
  "status": "online"
}
```

#### GET /operations (Public)
List available quantum operations.
```bash
curl https://site.com/wp-json/q3-compute/v1/operations
```

#### POST /compute (Auth Required)
Execute synchronous computation (for small jobs <1s).
```bash
curl -X POST \
  -u "user:app_password" \
  -H "Content-Type: application/json" \
  -d '{"type":"random_circuit","params":{"num_qubits":10,"depth":20,"shots":1000}}' \
  https://site.com/wp-json/q3-compute/v1/compute
```

#### POST /submit (Auth Required)
Submit async job (for large jobs).
```bash
curl -X POST \
  -u "user:app_password" \
  -H "Content-Type: application/json" \
  -d '{"type":"vqe_chemistry","params":{"molecule":"H2O"}}' \
  https://site.com/wp-json/q3-compute/v1/submit
```
Response:
```json
{
  "success": true,
  "job_id": "qc_abc123",
  "status": "queued",
  "qubits_allocated": 14,
  "status_url": "https://site.com/wp-json/q3-compute/v1/status/qc_abc123"
}
```

#### GET /status/{job_id} (Auth Required)
Check job status.
```bash
curl -u "user:app_password" https://site.com/wp-json/q3-compute/v1/status/qc_abc123
```

#### GET /result/{job_id} (Auth Required)
Get job result (returns 202 if still processing).
```bash
curl -u "user:app_password" https://site.com/wp-json/q3-compute/v1/result/qc_abc123
```

---

## Available Operations

| Operation | Type ID | Qubits | Description |
|-----------|---------|--------|-------------|
| SHA256d Hash | `sha256d` | 32 | Bitcoin double-hash |
| Grover Search | `grover_search` | 20-50 | Pattern matching |
| QAOA Optimize | `qaoa_optimize` | 10-30 | Combinatorial optimization |
| Random Circuit | `random_circuit` | 10-100 | Quantum random numbers |
| VQE Chemistry | `vqe_chemistry` | 8-20 | Molecular simulation |

---

## JavaScript SDK Usage

### Include SDK
```html
<script src="https://your-site.com/wp-content/plugins/q3-compute/assets/js/q3-compute-client.js"></script>
```

### Initialize
```javascript
const q3 = new Q3ComputeClient({
  endpoint: 'https://your-site.com/wp-json/q3-compute/v1',
  username: 'api_user',
  password: 'app_password'
});
```

### Quick Examples
```javascript
// Get capacity
const capacity = await q3.getCapacity();
console.log(capacity.capacity.total_qubits); // 500000

// Generate quantum random numbers
const random = await q3.randomCircuit(50, 20, 1000);
console.log(random.result.entropy_bits); // 50000

// Run Grover search
const search = await q3.groverSearch(1000000, '0xABCD');
console.log(search.result.speedup); // 1000x

// VQE chemistry (async)
const chemistry = await q3.vqeChemistry('H2O');
console.log(chemistry.result.ground_state_energy); // -76.438 Hartree
```

---

## Typebot Integration

1. Import `typebot-q3-compute-flow.json` into your Typebot
2. Set variable `Q3_COMPUTE_URL` to your endpoint
3. Configure webhook authentication

---

## Troubleshooting

### "Critical error on this website"
- Check PHP error log: `wp-content/debug.log`
- Enable WP_DEBUG in wp-config.php

### API returns 401 Unauthorized
- Verify Application Password is correct
- Check username spelling
- Ensure user has appropriate capabilities

### Jobs stuck in "queued"
- Check WP Cron is running: `wp cron event list`
- Run manually: `wp cron event run q3_compute_process_job`
