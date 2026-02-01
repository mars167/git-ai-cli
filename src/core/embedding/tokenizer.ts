import fs from 'fs-extra';
import path from 'path';

interface TokenizerConfig {
  maxLength?: number;
}

export interface TokenizerEncodeResult {
  input_ids: bigint[];
  attention_mask: bigint[];
}

export interface Tokenizer {
  encode(text: string, options?: TokenizerConfig): TokenizerEncodeResult;
}

class BasicTokenizer implements Tokenizer {
  private vocab: Map<string, number>;
  private unkId: number;
  private clsId: number;
  private sepId: number;

  constructor(vocab: Map<string, number>, unkId: number, clsId: number, sepId: number) {
    this.vocab = vocab;
    this.unkId = unkId;
    this.clsId = clsId;
    this.sepId = sepId;
  }

  encode(text: string, options: TokenizerConfig = {}): TokenizerEncodeResult {
    const maxLength = Math.max(2, Math.min(512, options.maxLength ?? 512));
    const tokens = tokenize(text);
    const ids: bigint[] = [BigInt(this.clsId)];
    for (const tok of tokens) {
      if (ids.length >= maxLength - 1) break;
      const id = this.vocab.get(tok) ?? this.unkId;
      ids.push(BigInt(id));
    }
    ids.push(BigInt(this.sepId));
    const attention = ids.map(() => 1n);
    return { input_ids: ids, attention_mask: attention };
  }
}

function tokenize(text: string): string[] {
  const raw = String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const tok of raw) {
    if (tok.length <= 8) {
      out.push(tok);
    } else {
      out.push(tok.slice(0, 4));
      out.push(tok.slice(4, 8));
      out.push(tok.slice(8));
    }
  }
  return out;
}

async function loadVocab(vocabPath: string): Promise<Map<string, number>> {
  const vocab = new Map<string, number>();
  if (!await fs.pathExists(vocabPath)) return vocab;
  const content = await fs.readFile(vocabPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    vocab.set(lines[i]!.trim(), i);
  }
  return vocab;
}

export async function loadTokenizer(modelName: string): Promise<Tokenizer> {
  const vocabCandidates = [
    path.join(modelName, 'vocab.txt'),
    path.join(modelName, 'tokenizer', 'vocab.txt'),
    path.join(modelName, 'tokenizer', 'vocab.json'),
  ];
  let vocab = new Map<string, number>();
  for (const candidate of vocabCandidates) {
    if (candidate.endsWith('vocab.json')) {
      if (!await fs.pathExists(candidate)) continue;
      const json = await fs.readJSON(candidate).catch(() => null);
      if (json && typeof json === 'object') {
        vocab = new Map<string, number>();
        for (const [key, value] of Object.entries(json)) {
          if (typeof value === 'number') vocab.set(key, value);
        }
      }
    } else {
      vocab = await loadVocab(candidate);
    }
    if (vocab.size > 0) break;
  }
  const unkId = vocab.get('[UNK]') ?? 100;
  const clsId = vocab.get('[CLS]') ?? 101;
  const sepId = vocab.get('[SEP]') ?? 102;
  return new BasicTokenizer(vocab, unkId, clsId, sepId);
}
