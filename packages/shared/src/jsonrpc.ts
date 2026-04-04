// ── JSON-RPC 2.0 base types ─────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: JsonRpcError
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

// ── Helpers ─────────────────────────────────────────────────────────────────

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'method' in msg && 'id' in msg
}

export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return 'method' in msg && !('id' in msg)
}

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'id' in msg && !('method' in msg)
}

export function makeRequest(id: string | number, method: string, params?: unknown): JsonRpcRequest {
  return { jsonrpc: '2.0', id, method, params }
}

export function makeResponse(id: string | number, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

export function makeErrorResponse(id: string | number, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } }
}

export function makeNotification(method: string, params?: unknown): JsonRpcNotification {
  return { jsonrpc: '2.0', method, params }
}

// ── Standard JSON-RPC error codes ───────────────────────────────────────────

export const PARSE_ERROR = -32700
export const INVALID_REQUEST = -32600
export const METHOD_NOT_FOUND = -32601
export const INVALID_PARAMS = -32602
export const INTERNAL_ERROR = -32603

// ── Application error codes ─────────────────────────────────────────────────

export const NOT_CONNECTED = -32000
export const NAME_TAKEN = -32001
export const INVALID_CHANNEL = -32002
