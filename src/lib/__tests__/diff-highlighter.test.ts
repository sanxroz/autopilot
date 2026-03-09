/**
 * Tests for the processAST function from diff-highlighter.ts
 *
 * We import processAST indirectly by testing the module's exports.
 * Since processAST is used as a method on the DiffHighlighter object,
 * we test it by calling it directly with mock HAST Root nodes.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { Root } from 'hast';

// Mock shiki to avoid loading the full highlighter in tests
vi.mock('shiki', () => ({
  createHighlighter: vi.fn(async () => ({
    codeToHast: vi.fn(),
    getLoadedLanguages: vi.fn(() => ['typescript', 'javascript']),
  })),
}));

// We need to extract processAST. Since it's exported via the DiffHighlighter
// object created by createDiffHighlighter, we'll import and call it.
// However, processAST is also used as a standalone function internally.
// Let's import the module and get it from the created highlighter.

describe('diff-highlighter', () => {
  // We'll test processAST by importing it through createDiffHighlighter
  let processAST: (ast: Root) => { syntaxFileObject: Record<number, any>; syntaxFileLineNumber: number };

  beforeAll(async () => {
    const mod = await import('../diff-highlighter');
    const highlighter = await mod.createDiffHighlighter();
    processAST = highlighter.processAST;
  });

  describe('processAST', () => {
    it('handles empty AST', () => {
      const ast: Root = { type: 'root', children: [] };
      const result = processAST(ast);
      expect(result.syntaxFileLineNumber).toBe(1);
      expect(Object.keys(result.syntaxFileObject)).toHaveLength(0);
    });

    it('processes a single-line text node', () => {
      const ast: Root = {
        type: 'root',
        children: [
          { type: 'text', value: 'hello world' } as any,
        ],
      };
      const result = processAST(ast);
      expect(result.syntaxFileLineNumber).toBe(1);
      expect(result.syntaxFileObject[1]).toBeDefined();
      expect(result.syntaxFileObject[1].value).toBe('hello world');
      expect(result.syntaxFileObject[1].lineNumber).toBe(1);
      expect(result.syntaxFileObject[1].nodeList).toHaveLength(1);
    });

    it('processes multi-line text node (splits by newline)', () => {
      const ast: Root = {
        type: 'root',
        children: [
          { type: 'text', value: 'line1\nline2\nline3' } as any,
        ],
      };
      const result = processAST(ast);
      expect(result.syntaxFileLineNumber).toBe(3);
      expect(result.syntaxFileObject[1].value).toBe('line1\n');
      expect(result.syntaxFileObject[2].value).toBe('line2\n');
      expect(result.syntaxFileObject[3].value).toBe('line3');
    });

    it('processes nested element with children', () => {
      const ast: Root = {
        type: 'root',
        children: [
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['keyword'] },
            children: [
              { type: 'text', value: 'const' } as any,
            ],
          } as any,
        ],
      };
      const result = processAST(ast);
      expect(result.syntaxFileLineNumber).toBe(1);
      expect(result.syntaxFileObject[1]).toBeDefined();
      expect(result.syntaxFileObject[1].value).toBe('const');
      // The node should have a wrapper (the span element)
      expect(result.syntaxFileObject[1].nodeList[0].wrapper).toBeDefined();
    });

    it('processes multiple text nodes on the same line', () => {
      const ast: Root = {
        type: 'root',
        children: [
          { type: 'text', value: 'hello ' } as any,
          { type: 'text', value: 'world' } as any,
        ],
      };
      const result = processAST(ast);
      expect(result.syntaxFileLineNumber).toBe(1);
      expect(result.syntaxFileObject[1].value).toBe('hello world');
      expect(result.syntaxFileObject[1].nodeList).toHaveLength(2);
    });

    it('tracks startIndex and endIndex correctly', () => {
      const ast: Root = {
        type: 'root',
        children: [
          { type: 'text', value: 'ab' } as any,
          { type: 'text', value: 'cd' } as any,
        ],
      };
      const result = processAST(ast);
      const nodes = result.syntaxFileObject[1].nodeList;
      expect(nodes[0].node.startIndex).toBe(0);
      expect(nodes[0].node.endIndex).toBe(1);
      expect(nodes[1].node.startIndex).toBe(2);
      expect(nodes[1].node.endIndex).toBe(3);
    });

    it('handles nested elements across multiple lines', () => {
      const ast: Root = {
        type: 'root',
        children: [
          {
            type: 'element',
            tagName: 'span',
            children: [
              { type: 'text', value: 'line1\nline2' } as any,
            ],
          } as any,
        ],
      };
      const result = processAST(ast);
      expect(result.syntaxFileLineNumber).toBe(2);
      expect(result.syntaxFileObject[1].value).toBe('line1\n');
      expect(result.syntaxFileObject[2].value).toBe('line2');
    });
  });

  describe('hasRegisteredCurrentLang', () => {
    it('returns true for loaded languages', async () => {
      const mod = await import('../diff-highlighter');
      const highlighter = await mod.createDiffHighlighter();
      expect(highlighter.hasRegisteredCurrentLang('typescript')).toBe(true);
      expect(highlighter.hasRegisteredCurrentLang('javascript')).toBe(true);
    });

    it('returns false for unloaded languages', async () => {
      const mod = await import('../diff-highlighter');
      const highlighter = await mod.createDiffHighlighter();
      expect(highlighter.hasRegisteredCurrentLang('cobol')).toBe(false);
    });
  });

  describe('DiffHighlighter properties', () => {
    it('has correct name and type', async () => {
      const mod = await import('../diff-highlighter');
      const highlighter = await mod.createDiffHighlighter();
      expect(highlighter.name).toBe('shiki-custom');
      expect(highlighter.type).toBe('class');
    });

    it('setMaxLineToIgnoreSyntax updates the value', async () => {
      const mod = await import('../diff-highlighter');
      const highlighter = await mod.createDiffHighlighter();
      highlighter.setMaxLineToIgnoreSyntax(500);
      expect(highlighter.maxLineToIgnoreSyntax).toBe(500);
    });

    it('setIgnoreSyntaxHighlightList updates the list', async () => {
      const mod = await import('../diff-highlighter');
      const highlighter = await mod.createDiffHighlighter();
      highlighter.setIgnoreSyntaxHighlightList(['package-lock.json', /\.min\.js$/]);
      expect(highlighter.ignoreSyntaxHighlightList).toHaveLength(2);
    });
  });
});
