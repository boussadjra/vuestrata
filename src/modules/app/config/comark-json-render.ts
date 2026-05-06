import type { ComarkPlugin } from 'comark'
import type { ComarkElement, ComarkNode, ComarkTree } from 'comark/ast'
import { textContent, visit } from 'comark/ast'

type JsonRenderProps = Record<string, unknown>

interface JsonRenderElementSpec {
  type?: unknown
  props?: unknown
  children?: unknown
}

interface JsonRenderTreeSpec {
  root?: unknown
  elements?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isElement(node: ComarkNode): node is ComarkElement {
  return Array.isArray(node) && typeof node[0] === 'string' && isRecord(node[1])
}

function isJsonRenderNode(node: ComarkNode): node is ComarkElement {
  if (!isElement(node) || node[0] !== 'pre') return false
  return node[1].language === 'json-render'
}

function sanitizeProps(props: unknown): JsonRenderProps {
  if (!isRecord(props)) return {}

  const result: JsonRenderProps = {}
  for (const [key, value] of Object.entries(props)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    result[key] = value
  }
  return result
}

function resolveElement(
  spec: unknown,
  elements: Record<string, unknown>,
  seen: Set<string>,
): ComarkNode | undefined {
  if (typeof spec === 'string') {
    const referenced = elements[spec]
    if (!referenced) return spec
    if (seen.has(spec)) return undefined

    const nextSeen = new Set(seen)
    nextSeen.add(spec)
    return resolveElement(referenced, elements, nextSeen)
  }

  if (typeof spec === 'number' || typeof spec === 'boolean') return String(spec)
  if (!isRecord(spec)) return undefined

  const element = spec as JsonRenderElementSpec
  const type = typeof element.type === 'string' ? element.type : ''
  if (!type) return undefined

  const props = sanitizeProps(element.props)
  if (type === 'Text') {
    const content = props.content
    if (typeof content === 'string') return content
    if (typeof content === 'number' || typeof content === 'boolean') return String(content)
    return ''
  }

  const children = Array.isArray(element.children) ? element.children : []
  const childNodes = children.flatMap((child) => {
    const node = resolveElement(child, elements, seen)
    return node === undefined ? [] : [node]
  })

  return [type, props, ...childNodes]
}

function jsonRenderToNode(spec: unknown): ComarkNode | undefined {
  if (!isRecord(spec)) return undefined

  const tree = spec as JsonRenderTreeSpec
  if (typeof tree.root === 'string' && isRecord(tree.elements)) {
    return resolveElement(tree.root, tree.elements, new Set())
  }

  return resolveElement(spec, {}, new Set())
}

function replaceJsonRenderNodes(tree: ComarkTree): void {
  visit(tree, isJsonRenderNode, (node) => {
    try {
      return jsonRenderToNode(JSON.parse(textContent(node)))
    } catch {
      return undefined
    }
  })
}

export default function jsonRender(): ComarkPlugin {
  return {
    name: 'json-render',
    post(state) {
      replaceJsonRenderNodes(state.tree)
    },
  }
}
