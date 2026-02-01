# Embedding Models

git-ai uses ONNX-compatible embedding models for semantic code search. This document covers model configuration, available options, and setup instructions.

## Overview

The embedding system converts code snippets into vector representations for similarity search. git-ai supports:

- **Semantic Embedding**: Neural network-based code representation (CodeBERT, MiniLM)
- **Structural Embedding**: AST-based structural features (WL kernel hashing)
- **Symbolic Embedding**: Identifier and symbol relationships

## Configuration

### Environment Variable

Set `GIT_AI_EMBEDDING_MODEL` to override the default embedding model:

```bash
export GIT_AI_EMBEDDING_MODEL="$HOME/.cache/git-ai/models/minilm/model.onnx"
```

Add to your shell profile for permanent use:

```bash
# ~/.zshrc or ~/.bashrc
export GIT_AI_EMBEDDING_MODEL="$HOME/.cache/git-ai/models/minilm/model.onnx"
```

### Default Paths

| Model | Default Path |
|-------|-------------|
| CodeBERT | `~/.cache/git-ai/models/codebert/model.onnx` |
| MiniLM | `~/.cache/git-ai/models/minilm/model.onnx` |

The system automatically detects the model type and sets the appropriate embedding dimension:
- CodeBERT: 768 dimensions
- MiniLM-L6: 384 dimensions

## Available Models

### MiniLM-L6 (Recommended)

Lightweight, fast model ideal for local development.

- **Size**: ~86MB
- **Dimensions**: 384
- **Speed**: Fast (<100ms per query)
- **Download**:

```python
from huggingface_hub import hf_hub_download

hf_hub_download(
    repo_id="Xenova/all-MiniLM-L6-v2",
    filename="onnx/model.onnx",
    local_dir="$HOME/.cache/git-ai/models/minilm"
)
```

### CodeBERT

Microsoft CodeBERT for code understanding.

- **Size**: ~500MB
- **Dimensions**: 768
- **Quality**: Higher semantic understanding
- **Download**:

```bash
huggingface-cli download onnx-community/codebert-javascript-ONNX \
  --local-dir "$HOME/.cache/git-ai/models/codebert"
```

## Model Directory Structure

```
~/.cache/git-ai/models/
├── codebert/
│   ├── model.onnx          # ONNX model file
│   └── config.json         # Model configuration
└── minilm/
    ├── model.onnx -> onnx/model.onnx  # Symlink to ONNX model
    ├── onnx/
    │   └── model.onnx
    └── config.json
```

## Fallback Behavior

If no model is found, git-ai automatically falls back to hash-based embedding:

- **Quality**: Good for exact matches
- **Speed**: <1ms
- **Memory**: <1MB
- **Dependencies**: None

No crashes or service interruption when model is unavailable.

## Performance Considerations

| Model | Memory | CPU Inference | GPU Recommended |
|-------|--------|---------------|-----------------|
| MiniLM | ~200MB | Excellent | Optional |
| CodeBERT | ~800MB | Good | Yes |

### Batch Processing

Configure batch size in environment:

```bash
export GIT_AI_EMBEDDING_BATCH_SIZE=8
```

## Troubleshooting

### Model Load Failed

```
{"level":"warn","msg":"semantic_embed_fallback","err":"..."}
```

Causes:
- Model file doesn't exist
- Corrupted model file
- Incompatible ONNX opset version

Solution:
1. Verify model path is correct
2. Check model file is valid ONNX
3. Ensure onnxruntime-node is installed

### Dimension Mismatch

If you see dimension errors, verify the model path matches the expected dimension:
- MiniLM: 384 dimensions
- CodeBERT: 768 dimensions

## Comparison

| Aspect | MiniLM | CodeBERT | Hash Fallback |
|--------|--------|----------|---------------|
| Size | 86MB | 500MB | <1MB |
| Dimensions | 384 | 768 | N/A |
| Speed | <100ms | 100-500ms | <1ms |
| Quality | Good | Excellent | Exact matches |
| Memory | Low | High | Minimal |

## Dependencies

```json
{
  "onnxruntime-node": "^1.19.2"
}
```

Required for embedding functionality. Optional - the system works with hash fallback without it.
