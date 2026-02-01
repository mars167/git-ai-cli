# Cross-Encoder Reranking & ONNX Runtime

## Overview

git-ai v2.2+ includes an optional **Cross-Encoder Reranking** feature that uses ONNX Runtime for high-quality result re-ranking. This is an optional enhancement that improves search result quality when a model is available.

## Architecture

```
Query → [Vector Search] → [Graph Search] → [DSR Search] → [Cross-Encoder Rerank] → Results
```

The cross-encoder takes query-candidate pairs and scores their relevance, providing higher quality re-ranking than simple score fusion.

## Configuration

### Model Path

The cross-encoder uses a configurable model path. By default, it looks for:
1. `<modelName>` (as absolute or relative path)
2. `<modelName>/model.onnx`
3. `<modelName>/onnx/model.onnx`

The default model name is `non-existent-model.onnx`, which means the system will use hash-based fallback by default.

```typescript
// Reranker configuration
interface RerankerConfig {
  modelName: string;      // Path to ONNX model
  device: 'cpu' | 'gpu';  // Execution device
  batchSize: number;      // Batch processing size
  topK: number;           // Max candidates to re-rank
  scoreWeights: {
    original: number;      // Weight for original retrieval score
    crossEncoder: number;  // Weight for cross-encoder score
  };
}
```

### Default Behavior

When no model is found, the system automatically falls back to **hash-based scoring**:
- Uses `hashEmbedding` to create query-content vectors
- Computes similarity via sigmoid(sum)
- No external dependencies required

This ensures the system works even without ONNX models.

## Installing ONNX Models

To enable cross-encoder reranking, download a compatible model (e.g., MiniLM, CodeBERT) and configure the path:

```bash
# Example: Download a cross-encoder model
mkdir -p models/cross-encoder
cd models/cross-encoder
# Download your ONNX model (e.g., from HuggingFace, ONNX Model Zoo)
# Place model.onnx in this directory
```

## Performance Considerations

### Memory
- ONNX Runtime loads models into memory
- GPU memory required for GPU inference
- CPU inference works on any modern CPU

### Batch Processing
- Configure `batchSize` based on available memory
- Larger batches = better throughput but more memory

### Supported Backends
- **CPU**: All platforms, no additional setup
- **GPU**: CUDA-enabled systems (optional CUDA execution provider)

## API Usage

### CLI (Not yet exposed)

Cross-encoder is currently used internally by the retrieval pipeline.

### Programmatic

```typescript
import { CrossEncoderReranker } from 'git-ai';

const reranker = new CrossEncoderReranker({
  modelName: './models/cross-encoder',
  device: 'cpu',
  batchSize: 32,
  topK: 100,
  scoreWeights: {
    original: 0.3,
    crossEncoder: 0.7,
  },
});

const results = await reranker.rerank('authentication logic', candidates);
```

## Fallback Mechanism

The system handles missing models gracefully:

1. **Model file missing** → Log `cross_encoder_model_missing` and use hash fallback
2. **ONNX load failed** → Log `cross_encoder_fallback` and use hash fallback
3. **Inference error** → Log error and continue with fallback

No crashes or service interruption when model is unavailable.

## Comparison: Hash vs ONNX

| Aspect | Hash Fallback | ONNX Cross-Encoder |
|--------|---------------|-------------------|
| Quality | Good for exact matches | Excellent for semantic matching |
| Speed | <1ms | 10-100ms (depending on model) |
| Dependencies | None | onnxruntime-node |
| Memory | <1MB | 50-500MB (model size) |
| GPU Required | No | Optional |

## Troubleshooting

### Model Load Failed

```
{"level":"warn","msg":"cross_encoder_fallback","err":"..."}
```

Causes:
- Model file doesn't exist
- Corrupted model file
- Incompatible ONNX opset version

Solution:
1. Verify model path is correct
2. Check model file is valid ONNX
3. Ensure onnxruntime-node is installed

### Out of Memory

Reduce `batchSize` in configuration or use CPU backend.

### Slow Inference

- Use smaller models (MiniLM instead of large BERT)
- Enable batching for multiple queries
- Consider GPU for large-scale usage

## Dependencies

```json
{
  "onnxruntime-node": "^1.19.2"
}
```

Required for cross-encoder functionality. Optional - system works without it.
