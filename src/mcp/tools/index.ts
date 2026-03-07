import type { ToolDefinition } from '../types';
import {
  checkIndexDefinition,
  rebuildIndexDefinition,
} from './repoTools';
import { readFileDefinition } from './fileTools';
import { repoMapDefinition } from './searchTools';
import {
  findExtensionPointsDefinition,
  findImpactDefinition,
  findTestsDefinition,
  implementationContextDefinition,
  lexicalSearchDefinition,
  reviewContextForDiffDefinition,
} from './taskTools';

export const allTools: ToolDefinition[] = [
  checkIndexDefinition,
  rebuildIndexDefinition,
  readFileDefinition,
  repoMapDefinition,
  lexicalSearchDefinition,
  implementationContextDefinition,
  findTestsDefinition,
  findImpactDefinition,
  findExtensionPointsDefinition,
  reviewContextForDiffDefinition,
];

export * from './repoTools';
export * from './fileTools';
export * from './searchTools';
export * from './taskTools';