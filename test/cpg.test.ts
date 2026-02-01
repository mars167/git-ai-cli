import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { buildCFG } from '../dist/src/core/cpg/cfgLayer.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { buildDFG } from '../dist/src/core/cpg/dfgLayer.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { CallGraphBuilder } from '../dist/src/core/cpg/callGraph.js';

test('CFG builder handles branches, loops, and switch', () => {
  const content = `
    function example(x: number, items: number[]) {
      if (x > 0) {
        x = x + 1;
      } else if (x < 0) {
        x = x - 1;
      } else {
        x = 0;
      }

      for (const item of items) {
        if (item === 3) break;
        x += item;
      }

      switch (x) {
        case 1:
          x = 2;
        case 2:
          x = 3;
          break;
        default:
          x = 4;
      }

      return x;
    }
  `;

  const cfg = buildCFG('example.ts', content);
  assert.ok(cfg.nodes.length > 0);
  assert.ok(cfg.edges.length > 0);
  assert.ok(cfg.entryPoint.length > 0);
  assert.ok(cfg.exitPoints.length > 0);
  assert.ok(cfg.edges.some((edge: any) => edge.edgeType === 'TRUE_BRANCH'));
  assert.ok(cfg.edges.some((edge: any) => edge.edgeType === 'FALSE_BRANCH'));
  assert.ok(cfg.edges.some((edge: any) => edge.edgeType === 'FALLTHROUGH'));
});

test('CFG builder captures short-circuit expressions', () => {
  const content = `
    function check(a: boolean, b: boolean, c: boolean) {
      return a && b || c ? a : b;
    }
  `;
  const cfg = buildCFG('short.ts', content);
  assert.ok(cfg.edges.some((edge: any) => edge.edgeType === 'TRUE_BRANCH'));
  assert.ok(cfg.edges.some((edge: any) => edge.edgeType === 'FALSE_BRANCH'));
});

test('DFG builder captures definitions and uses', () => {
  const content = `
    function dataFlow(a: number, b: number) {
      const { x, y: z } = { x: a, y: b };
      let total = x + z;
      total += a;
      const [first, second] = [total, b];
      return first + second;
    }
  `;
  const dfg = buildDFG('dfg.ts', content);
  assert.ok(dfg.nodes.length > 0);
  assert.ok(dfg.edges.length > 0);
  const totalNode = dfg.nodes.find((node: any) => node.varName === 'total');
  assert.ok(totalNode);
  assert.ok(totalNode!.useLines.length >= 1);
});

test('CallGraphBuilder links calls across files and imports', () => {
  const repoRoot = path.join(process.cwd(), 'tmp-cpg');
  const builder = new CallGraphBuilder(repoRoot);
  builder.addFile('src/util.ts', `
    export function helper(value: number) {
      return value * 2;
    }
  `);
  builder.addFile('src/service.ts', `
    import { helper } from './util';
    export function run(input: number) {
      return helper(input);
    }
  `);
  const graph = builder.build();
  const functions = Array.from(graph.functions.values()) as any[];
  const helper = functions.find((fn: any) => fn.name === 'helper');
  const run = functions.find((fn: any) => fn.name === 'run');
  assert.ok(helper && run);
  const callees = builder.getCallees(run!.id);
  assert.ok(callees.includes(helper!.id));
});
