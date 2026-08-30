/**
 * `structuredClone` is a Node 18+/browser global. Hermes (React Native's JS
 * engine, used by the Expo mobile app) does not define it, and referencing
 * an undeclared global throws a ReferenceError — which is fatal at import
 * time when used at module scope (see website-document.ts). This package is
 * shared between the Next.js web app and the Expo mobile app, so any helper
 * used here must degrade gracefully on Hermes instead of assuming a DOM/Node
 * runtime.
 *
 * Falls back to a JSON round-trip clone, which is sufficient for the plain
 * JSON-shaped data (strings, numbers, arrays, plain objects) cloned in this
 * package.
 */
export function cloneJson<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
