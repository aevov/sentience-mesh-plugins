# Supreme ML LLM Sources

## Pre-Configured Models

The Q3 Quantum ML plugin comes with the following pre-configured models for instant streaming evolution:

### 1. **Phi-2 (Microsoft)**
- **Size**: 2.7B parameters
- **Format**: Safetensors
- **URL**: `https://huggingface.co/microsoft/phi-2/resolve/main/model.safetensors`
- **Use Case**: Excellent reasoning capabilities, great for general-purpose tasks
- **Download Size**: ~5.5 GB

### 2. **TinyLlama Chat**
- **Size**: 1.1B parameters
- **Format**: Safetensors
- **URL**: `https://huggingface.co/TinyLlama/TinyLlama-1.1B-Chat-v1.0/resolve/main/model.safetensors`
- **Use Case**: Lightweight chat model, perfect for testing
- **Download Size**: ~2.2 GB

### 3. **Mistral-7B (Quantized)**
- **Size**: 7B parameters (Q4_K_M quantization)
- **Format**: GGUF
- **URL**: `https://huggingface.co/TheBloke/Mistral-7B-v0.1-GGUF/resolve/main/mistral-7b-v0.1.Q4_K_M.gguf`
- **Use Case**: High-quality responses with efficient quantization
- **Download Size**: ~4.1 GB

### 4. **LLM-HT-MT-Sample (TencentARC)**
- **Size**: Varies
- **Format**: PyTorch
- **URL**: `https://huggingface.co/TencentARC/LLM-HT-MT-Sample/resolve/main/pytorch_model.bin`
- **Use Case**: Multi-task sample model
- **Download Size**: Varies

## Additional Model Sources

### HuggingFace Model Hub
Search for models at: https://huggingface.co/models

**Popular Options:**
- **Llama-2**: `https://huggingface.co/meta-llama/Llama-2-7b-chat-hf/resolve/main/model.safetensors`
- **Falcon-7B**: `https://huggingface.co/tiiuae/falcon-7b/resolve/main/model.safetensors`
- **MPT-7B**: `https://huggingface.co/mosaicml/mpt-7b/resolve/main/model.safetensors`

### Format Support
The plugin supports streaming learning from:
- `.safetensors` (Recommended - HuggingFace standard)
- `.gguf` (GGML/llama.cpp format)
- `.bin` (PyTorch)
- `.pt` (PyTorch)

## Usage Instructions

1. Navigate to **Quantum ML** in your WordPress admin
2. Select a preset model from the dropdown, OR
3. Choose "Custom URL" and paste any HuggingFace model URL
4. Click "Start Streaming Evolution"
5. Monitor the progress as the system:
   - Downloads the model in chunks
   - Learns and downsamples to 27M AevQG weights
   - Shards and stores to Q3 Carriers
   - Verifies integrity via BIDC

## Technical Notes

- All processing happens **client-side** (Layer 1 compute)
- Zero impact on your WordPress server
- Memory-efficient streaming (64MB chunks)
- BIDC ensures synchronization and integrity
- Final model is optimized for the AevQG∞ format

## Troubleshooting

**CORS Issues**: Some model hosts may block direct downloads. Use HuggingFace's CDN links (`.../resolve/main/...`) which support CORS.

**Large Models**: Models over 10GB may take significant time. Start with TinyLlama for testing.

**Browser Limits**: Ensure your browser has sufficient memory (4GB+ recommended for larger models).
