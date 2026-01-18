/**
 * Custom Diff View Highlighter Integration
 * 
 * Creates a DiffHighlighter using shiki for syntax highlighting in diff views
 */

import * as shiki from "shiki"
import type { Root } from "hast"

// Languages to load for syntax highlighting
const SUPPORTED_LANGUAGES: shiki.BundledLanguage[] = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "html",
  "css",
  "json",
  "python",
  "go",
  "rust",
  "bash",
  "markdown",
  "yaml",
  "toml",
  "sql",
  "ruby",
  "java",
  "c",
  "cpp",
  "scss",
  "xml",
]

// Type for syntax line
type SyntaxNode = {
  type: string
  value: string
  lineNumber: number
  startIndex: number
  endIndex: number
  properties?: {
    className?: string[]
    [key: string]: unknown
  }
  children?: SyntaxNode[]
}

type SyntaxLine = {
  value: string
  lineNumber: number
  valueLength: number
  nodeList: {
    node: SyntaxNode
    wrapper?: SyntaxNode
  }[]
}

// DiffHighlighter type matching @git-diff-view/react expectations
export type DiffHighlighter = {
  name: string
  type: "class" | "style" | string
  maxLineToIgnoreSyntax: number
  setMaxLineToIgnoreSyntax: (v: number) => void
  ignoreSyntaxHighlightList: (string | RegExp)[]
  setIgnoreSyntaxHighlightList: (v: (string | RegExp)[]) => void
  getAST: (raw: string, fileName?: string, lang?: string, theme?: "light" | "dark") => Root | undefined
  processAST: (ast: Root) => {
    syntaxFileObject: Record<number, SyntaxLine>
    syntaxFileLineNumber: number
  }
  hasRegisteredCurrentLang: (lang: string) => boolean
  getHighlighterEngine: () => shiki.Highlighter | null
}

/**
 * Process AST into syntax lines for diff view
 */
function processAST(ast: Root): { syntaxFileObject: Record<number, SyntaxLine>; syntaxFileLineNumber: number } {
  let lineNumber = 1
  const syntaxObj: Record<number, SyntaxLine> = {}
  
  const loopAST = (nodes: SyntaxNode[], wrapper?: SyntaxNode) => {
    nodes.forEach((node) => {
      if (node.type === "text") {
        if (node.value.indexOf("\n") === -1) {
          const valueLength = node.value.length
          if (!syntaxObj[lineNumber]) {
            node.startIndex = 0
            node.endIndex = valueLength - 1
            syntaxObj[lineNumber] = {
              value: node.value,
              lineNumber,
              valueLength,
              nodeList: [{ node, wrapper }],
            }
          } else {
            node.startIndex = syntaxObj[lineNumber].valueLength
            node.endIndex = node.startIndex + valueLength - 1
            syntaxObj[lineNumber].value += node.value
            syntaxObj[lineNumber].valueLength += valueLength
            syntaxObj[lineNumber].nodeList.push({ node, wrapper })
          }
          node.lineNumber = lineNumber
          return
        }
        const lines = node.value.split("\n")
        node.children = node.children || []
        for (let i = 0; i < lines.length; i++) {
          const _value = i === lines.length - 1 ? lines[i] : lines[i] + "\n"
          const _lineNumber = i === 0 ? lineNumber : ++lineNumber
          const _valueLength = _value.length
          const _node: SyntaxNode = {
            type: "text",
            value: _value,
            startIndex: Infinity,
            endIndex: Infinity,
            lineNumber: _lineNumber,
          }
          if (!syntaxObj[_lineNumber]) {
            _node.startIndex = 0
            _node.endIndex = _valueLength - 1
            syntaxObj[_lineNumber] = {
              value: _value,
              lineNumber: _lineNumber,
              valueLength: _valueLength,
              nodeList: [{ node: _node, wrapper }],
            }
          } else {
            _node.startIndex = syntaxObj[_lineNumber].valueLength
            _node.endIndex = _node.startIndex + _valueLength - 1
            syntaxObj[_lineNumber].value += _value
            syntaxObj[_lineNumber].valueLength += _valueLength
            syntaxObj[_lineNumber].nodeList.push({ node: _node, wrapper })
          }
          node.children.push(_node)
        }
        node.lineNumber = lineNumber
        return
      }
      if (node.children) {
        loopAST(node.children, node)
        node.lineNumber = lineNumber
      }
    })
  }
  
  loopAST(ast.children as SyntaxNode[])
  return { syntaxFileObject: syntaxObj, syntaxFileLineNumber: lineNumber }
}

// Cached highlighter instance
let cachedHighlighter: shiki.Highlighter | null = null

// Configuration
let maxLineToIgnoreSyntax = 100000
const ignoreSyntaxHighlightList: (string | RegExp)[] = []

/**
 * Create a custom DiffHighlighter using shiki
 */
export async function createDiffHighlighter(): Promise<DiffHighlighter> {
  // Create shiki highlighter
  const highlighter = await shiki.createHighlighter({
    themes: ["github-dark", "github-light"],
    langs: SUPPORTED_LANGUAGES,
  })
  
  cachedHighlighter = highlighter
  
  const diffHighlighter: DiffHighlighter = {
    name: "shiki-custom",
    type: "class",
    
    get maxLineToIgnoreSyntax() {
      return maxLineToIgnoreSyntax
    },
    
    setMaxLineToIgnoreSyntax(v: number) {
      maxLineToIgnoreSyntax = v
    },
    
    get ignoreSyntaxHighlightList() {
      return ignoreSyntaxHighlightList
    },
    
    setIgnoreSyntaxHighlightList(v: (string | RegExp)[]) {
      ignoreSyntaxHighlightList.length = 0
      ignoreSyntaxHighlightList.push(...v)
    },
    
    getAST(raw: string, fileName?: string, lang?: string, theme?: "light" | "dark"): Root | undefined {
      // Check if file should be ignored
      if (fileName && ignoreSyntaxHighlightList.some((item) => 
        item instanceof RegExp ? item.test(fileName) : fileName === item
      )) {
        return undefined
      }
      
      try {
        const shikiTheme = theme === "light" ? "github-light" : "github-dark"
        
        return highlighter.codeToHast(raw, {
          lang: lang || "plaintext",
          themes: {
            dark: shikiTheme,
            light: shikiTheme,
          },
          cssVariablePrefix: "--diff-view-",
          defaultColor: false,
          mergeWhitespaces: false,
        })
      } catch (e) {
        console.error("Diff highlighter error:", e)
        return undefined
      }
    },
    
    processAST,
    
    hasRegisteredCurrentLang(lang: string): boolean {
      return highlighter.getLoadedLanguages().includes(lang)
    },
    
    getHighlighterEngine(): shiki.Highlighter | null {
      return cachedHighlighter
    },
  }
  
  return diffHighlighter
}

// Cached promise
let highlighterPromise: Promise<DiffHighlighter> | null = null

/**
 * Get or create the diff highlighter
 */
export async function getDiffHighlighter(): Promise<DiffHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createDiffHighlighter()
  }
  return highlighterPromise
}

/**
 * Preload the diff highlighter on app start
 */
export function preloadDiffHighlighter(): void {
  getDiffHighlighter().catch((err) => {
    console.warn("[preloadDiffHighlighter] Failed to preload:", err)
  })
}
