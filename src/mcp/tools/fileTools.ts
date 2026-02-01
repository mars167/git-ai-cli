import type { ToolDefinition } from '../types';
import { handleListFiles, handleReadFile } from '../handlers';

export const listFilesDefinition: ToolDefinition = {
  name: 'list_files',
  description: 'List repository files by glob pattern. Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      pattern: { type: 'string', default: '**/*' },
      limit: { type: 'number', default: 500 }
    },
    required: ['path']
  },
  handler: handleListFiles
};

export const readFileDefinition: ToolDefinition = {
  name: 'read_file',
  description: 'Read a repository file with optional line range. Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      file: { type: 'string', description: 'File path relative to repo root' },
      start_line: { type: 'number', default: 1 },
      end_line: { type: 'number', default: 200 }
    },
    required: ['path', 'file']
  },
  handler: handleReadFile
};
