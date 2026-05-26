# Q3 QML Chat: Typebot Deployment Guide

## Overview

Deploy a conversational AI interface for Q3 Compute's QML/QNN capabilities using Typebot.

```
┌─────────────────────────────────────────────────────────────────────┐
│                   ARCHITECTURE                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   User → Typebot → Webhook → Q3 Compute API → QNN/QML Operations    │
│                                                                      │
│   Typebot (app.quantumcloud.one or your-typebot.com)                │
│       ↓ HTTP POST                                                   │
│   WordPress (archive.domain.com)                                    │
│       └── /wp-json/q3-compute/v1/compute                            │
│           └── Q3 Quantum VM → Result                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Install Q3 Compute Plugin

```bash
# On your WordPress site
wp plugin install q3-compute.zip --activate
```

### 2. Create API User

1. Go to **Users > Add New**
2. Create user `qml_bot` with any role
3. Edit user → **Application Passwords**
4. Generate password, copy it
5. Create Base64 auth: `echo -n "qml_bot:xxxx-xxxx" | base64`

### 3. Import Typebot Flow

1. Log into your Typebot instance
2. Create new bot → Import
3. Upload `typebot-qml-chat.json`
4. Update variables:
   - `q3_endpoint` → `https://your-wp-site.com/wp-json/q3-compute/v1`
   - `q3_auth` → `Basic YOUR_BASE64_AUTH`

### 4. Deploy

1. Click **Publish** in Typebot
2. Get embed code or share URL
3. Add to your site

---

## Typebot Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `q3_endpoint` | Q3 Compute API base URL | `https://site.com/wp-json/q3-compute/v1` |
| `q3_auth` | Authorization header | `Basic dXNlcjpwYXNz` |

### Webhook Configuration

Each QML operation uses a webhook block:

```json
{
  "url": "{{q3_endpoint}}/compute",
  "method": "POST",
  "headers": {
    "Authorization": "{{q3_auth}}",
    "Content-Type": "application/json"
  },
  "body": {
    "type": "qnn_classify",
    "params": {
      "features": [0.5, 0.3, 0.7],
      "model_id": "qnn_abc123"
    }
  }
}
```

### Response Mapping

Map webhook responses to display:

```
$.result.predicted_class  → {{compute_result.predicted_class}}
$.result.confidence       → {{compute_result.confidence}}
$.result.model_id         → {{compute_result.model_id}}
```

---

## Chat Flows

### 1. Classification Flow

```
User: "I want to classify data"
Bot:  "Enter feature values (comma-separated)"
User: "0.5, 0.3, 0.7"
Bot:  "Do you have a model ID?"
User: "qnn_abc123"
      ↓ Webhook to /compute (qnn_classify)
Bot:  "Predicted Class: 1 (92% confidence)"
```

### 2. Training Flow

```
User: "I want to train a model"
Bot:  "Enter training data in JSON format"
User: [{"features":[0.1,0.2],"label":0}, ...]
      ↓ Webhook to /compute (qnn_train)
Bot:  "Training complete! Model ID: qnn_xyz789
       Accuracy: 95%"
```

### 3. Regression Flow

```
User: "Predict a value"
Bot:  "Enter feature values"
User: "2.5, 1.8, 3.2"
      ↓ Webhook to /compute (qnn_regression)
Bot:  "Predicted Value: 0.847 ± 0.023"
```

### 4. Kernel Flow

```
User: "Compute quantum kernel"
Bot:  "Enter first data point"
User: "0.5, 0.3"
Bot:  "Enter second data point"
User: "0.6, 0.4"
      ↓ Webhook to /compute (quantum_kernel)
Bot:  "Kernel Value: 0.956 (ZZ feature map)"
```

---

## Advanced: Custom Webhook Script Block

For complex data transformations, use Typebot's Script block:

```javascript
// Parse user input to features array
const input = "{{features_input}}";
const features = input.split(',').map(x => parseFloat(x.trim()));

// Make API call
const response = await fetch("{{q3_endpoint}}/compute", {
  method: "POST",
  headers: {
    "Authorization": "{{q3_auth}}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    type: "qnn_classify",
    params: { features, num_classes: 2 }
  })
});

const data = await response.json();
return {
  predicted_class: data.result.predicted_class,
  confidence: (data.result.confidence * 100).toFixed(1) + "%"
};
```

---

## Security

### CORS Configuration

Add to WordPress `wp-config.php`:

```php
// Allow Typebot domain
header("Access-Control-Allow-Origin: https://your-typebot-domain.com");
header("Access-Control-Allow-Headers: Authorization, Content-Type");
```

Or in `.htaccess`:

```apache
<IfModule mod_headers.c>
  Header set Access-Control-Allow-Origin "https://your-typebot-domain.com"
  Header set Access-Control-Allow-Headers "Authorization, Content-Type"
</IfModule>
```

### Rate Limiting

The Q3 Compute API has built-in limits:
- 100 concurrent jobs
- 1000 qubits max per job
- Authenticated access required

---

## Embedding Options

### Option 1: Bubble Widget

```html
<script src="https://cdn.typebot.io/js/embed.min.js"></script>
<script>
  Typebot.initBubble({
    url: "https://typebot.io/your-qml-chat-bot",
    button: { backgroundColor: "#667eea" },
    theme: { chatWindow: { backgroundColor: "#1a1a2e" } }
  });
</script>
```

### Option 2: Full Page

```html
<div id="typebot-container" style="width:100%;height:600px;"></div>
<script src="https://cdn.typebot.io/js/embed.min.js"></script>
<script>
  Typebot.initContainer("typebot-container", {
    url: "https://typebot.io/your-qml-chat-bot"
  });
</script>
```

### Option 3: Popup

```html
<button onclick="Typebot.open()">Open QML Assistant</button>
<script src="https://cdn.typebot.io/js/embed.min.js"></script>
<script>
  Typebot.initPopup({
    url: "https://typebot.io/your-qml-chat-bot",
    autoShowDelay: 0
  });
</script>
```

---

## Testing

### 1. Test API Directly

```bash
# Check capacity (no auth)
curl https://your-site.com/wp-json/q3-compute/v1/capacity

# Test classification
curl -X POST \
  -H "Authorization: Basic YOUR_AUTH" \
  -H "Content-Type: application/json" \
  -d '{"type":"qnn_classify","params":{"features":[0.5,0.3]}}' \
  https://your-site.com/wp-json/q3-compute/v1/compute
```

### 2. Test in Typebot

1. Use Preview mode
2. Walk through each flow
3. Verify webhook responses appear correctly

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Check Base64 auth encoding |
| CORS error | Add headers to WordPress |
| Empty response | Check webhook URL and body format |
| Features not parsing | Use Script block for complex parsing |

---

## Complete Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     TYPEBOT QML CHAT FLOW                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   [Welcome] ──┬── [🎯 Classify] ── [Input] ── [Webhook] ── [Result]
│               │                                                   │
│               ├── [🎓 Train] ──── [Data] ─── [Webhook] ── [Model] │
│               │                                                   │
│               ├── [🔢 Regress] ── [Input] ── [Webhook] ── [Value] │
│               │                                                   │
│               ├── [🧬 Kernel] ─── [x1,x2] ── [Webhook] ── [K(x,y)]│
│               │                                                   │
│               └── [📊 Status] ─── [Webhook] ── [Capacity]        │
│                                                                   │
│                         ↓                                         │
│                   [Continue?]                                     │
│                    ↓      ↓                                       │
│               [Again]   [Done]                                    │
│                  ↓                                                │
│               [Welcome] ←───────────────────────────────────      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```
