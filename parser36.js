/**
 * DTS Parser & Stringifier
 *
 * Usage:
 *   const dts = parseDTS(source);
 *
 *   // Read properties like a plain object
 *   dts.get('/').model          // => "My Device"
 *   dts.get('/pwm@ff200000').status  // => "okay"
 *
 *   // Write with native JS values — types are inferred automatically
 *   dts.get('/').model    = 'New Name';          // string  → "New Name"
 *   dts.get('/').status   = 'okay';              // string  → "okay"
 *   node['max-frequency'] = 0x8f0d180;           // number  → <0x8f0d180>
 *   node['reg']           = [0x00, 0x10];        // number[]→ <0x00 0x10>
 *   node['compatible']    = ['foo', 'bar'];      // string[]→ "foo", "bar"
 *   node['some-bytes']    = new Uint8Array([..]) // bytes   → [xx xx]
 *
 *   // Navigate children
 *   const child = node.get('endpoint');          // direct child by name/prefix
 *   const deep  = dts.get('/i2c@ff180000/pmic@20/regulators/LDO_REG6');
 *
 *   // Add children
 *   const port = node.add('port@1', {
 *     reg: [0x01],
 *     '#address-cells': [0x01],
 *   });
 *
 *   // Iterate children
 *   for (const child of node.children) { ... }  // yields wrapped nodes
 *
 *   // Search by compatible string
 *   const panel = dts.find('simple-panel-dsi');
 *
 *   // Stringify back to DTS
 *   const output = dts.toString();
 */

// ---------------------------------------------------------------------------
// Internal raw-AST helpers
// ---------------------------------------------------------------------------

/** Infer a typed value object from a plain JS value. */
function inferValue(v) {
  if (v instanceof Uint8Array) {
    return { type: 'bytes', value: Array.from(v).map(b => b.toString(16).padStart(2, '0')) };
  }
  if (typeof v === 'number' || typeof v === 'bigint') {
    return { type: 'cells', value: ['0x' + BigInt(v).toString(16)] };
  }
  if (typeof v === 'string') {
    return { type: 'string', value: v };
  }
  // Pass-through already-typed internal objects
  if (v && typeof v === 'object' && v.type) return v;
  return { type: 'raw', value: String(v) };
}

/** Convert typed value object back to a native JS value. */
function nativeValue(typed) {
  if (typed.type === 'string') return typed.value;
  if (typed.type === 'cells') {
    const nums = typed.value.map(v => Number(v));
    return nums.length === 1 ? nums[0] : nums;
  }
  if (typed.type === 'bytes') return new Uint8Array(typed.value.map(v => parseInt(v, 16)));
  return typed.value; // raw
}

/** Read a property from a raw node, returning a native JS value (or undefined). */
function readProp(rawNode, name) {
  const prop = rawNode.properties.find(p => p.name === name);
  if (!prop) return undefined;
  if (prop.values.length === 0) return true; // boolean flag (no value)
  if (prop.values.length === 1) return nativeValue(prop.values[0]);
  // Multiple values: collapse if all same type
  return prop.values.map(nativeValue);
}

/** Write a property on a raw node, inferring types from native JS values. */
function writeProp(rawNode, name, value) {
  let prop = rawNode.properties.find(p => p.name === name);
  if (!prop) {
    prop = { name, values: [] };
    rawNode.properties.push(prop);
  }

  if (value === true || value === null || value === undefined) {
    prop.values = []; // boolean flag
    return;
  }

  if (Array.isArray(value)) {
    // Homogeneous string array → multiple string values (e.g. compatible)
    if (value.every(v => typeof v === 'string')) {
      prop.values = value.map(v => ({ type: 'string', value: v }));
    } else {
      // Number array (or mixed) → single cells value
      prop.values = [{ type: 'cells', value: value.map(v => '0x' + BigInt(v).toString(16)) }];
    }
    return;
  }

  prop.values = [inferValue(value)];
}

/** Find a direct child of a raw node by exact name or `name@…` prefix. */
function findChild(rawNode, name) {
  return rawNode.children.find(
    c => c.name === name || c.name === name.split('@')[0] || c.name.startsWith(name + '@') || c.name === name
  );
}

/** Recursively search for a node whose `compatible` property includes `comp`. */
function findByCompatible(nodes, comp) {
  for (const n of nodes) {
    const val = readProp(n, 'compatible');
    const matches = Array.isArray(val) ? val.includes(comp) : val === comp;
    if (matches) return n;
    const found = findByCompatible(n.children, comp);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Proxy wrapper
// ---------------------------------------------------------------------------

/** Internal symbol to access the underlying raw AST node from a wrapped proxy. */
const RAW = Symbol('raw');

/**
 * Reserved keys that are NOT treated as DTS property access.
 * Node name/label are exposed as $name/$label to avoid colliding with
 * the very common DTS property named "label".
 */
const RESERVED = new Set([
  'get', 'add', 'find', 'remove', 'children', '$name', '$label',
  'toString', 'toJSON', 'valueOf', Symbol.toPrimitive, Symbol.iterator,
  RAW,
]);

function wrapNode(raw, rootAst) {
  if (!raw) return null;

  const handler = {
    get(_, key) {
      // Internal raw access
      if (key === RAW) return raw;

      // ── Special methods ──────────────────────────────────────────────────

      /** node.$name / node.$label — use $ prefix to avoid colliding with DTS properties */
      if (key === '$name')  return raw.name;
      if (key === '$label') return raw.label;

      /** node.children — iterable of wrapped nodes */
      if (key === 'children') {
        return raw.children.map(c => wrapNode(c, rootAst));
      }

      /**
       * node.get(path)
       * Accepts an absolute path (/foo/bar) or a relative child name.
       * Returns a wrapped node or null.
       */
      if (key === 'get') {
        return (path) => {
          if (typeof path !== 'string') return null;

          // Absolute path — walk from root body
          if (path.startsWith('/')) {
            if (path === '/') {
              const r = rootAst.body.find(n => n.name === '/');
              return r ? wrapNode(r, rootAst) : null;
            }
            const parts = path.split('/').filter(Boolean);
            let cur = rootAst.body.find(n => n.name === '/');
            if (!cur) return null;
            for (const part of parts) {
              cur = cur.children.find(
                c => c.name === part || c.name.startsWith(part + '@')
              );
              if (!cur) return null;
            }
            return wrapNode(cur, rootAst);
          }

          // Relative — direct child lookup
          const child = findChild(raw, path);
          return child ? wrapNode(child, rootAst) : null;
        };
      }

      /**
       * node.add(name, props?)
       * Creates a new child node and returns it wrapped.
       * props is a plain JS object: { 'reg': [0x01], 'status': 'okay', ... }
       */
      if (key === 'add') {
        return (name, props = {}) => {
          const child = {
            type: 'node',
            name,
            label: null,
            properties: [],
            children: [],
          };
          for (const [k, v] of Object.entries(props)) {
            writeProp(child, k, v);
          }
          raw.children.push(child);
          return wrapNode(child, rootAst);
        };
      }

      /**
       * node.remove(name)
       * Removes a direct child by name (or name@… prefix).
       */
      if (key === 'remove') {
        return (name) => {
          const idx = raw.children.findIndex(
            c => c.name === name || c.name.startsWith(name + '@')
          );
          if (idx !== -1) raw.children.splice(idx, 1);
        };
      }

      /**
       * dts.find(compatible)
       * Searches the whole tree for a node by compatible string.
       */
      if (key === 'find') {
        return (comp) => {
          const found = findByCompatible(rootAst.body, comp);
          return found ? wrapNode(found, rootAst) : null;
        };
      }

      /**
       * dts.toString()
       * Stringify back to DTS source.
       */
      if (key === 'toString') {
        return () => stringifyAST(rootAst);
      }

      if (key === 'toJSON' || key === 'valueOf') return () => raw;
      if (key === Symbol.toPrimitive) return () => raw.name;
      if (key === Symbol.iterator) return undefined;

      // ── Property read ────────────────────────────────────────────────────
      return readProp(raw, key);
    },

    set(_, key, value) {
      if (RESERVED.has(key)) throw new Error(`"${String(key)}" is reserved.`);
      writeProp(raw, key, value);
      return true;
    },
  };

  return new Proxy({}, handler);
}

// ---------------------------------------------------------------------------
// Tokenizer & Parser (internal)
// ---------------------------------------------------------------------------

function tokenize(input) {
  const tokens = [];
  const regex =
    /\/\*[\s\S]*?\*\/|\/\/.*/g.source + // comments (skipped)
    '|(\/dts-v1\/|[\\w,@\\/\\.#&-]+|"[^"]*"|<[^>]*>|\\[[^\\]]*\\]|[{};=,])';
  const re = new RegExp(
    /\/\*[\s\S]*?\*\/|\/\/.*|(\/dts-v1\/|[\w,@\/\.#&-]+|"[^"]*"|<[^>]*>|\[[^\]]*\]|[{};=,])/g
  );
  let m;
  while ((m = re.exec(input)) !== null) {
    if (m[1]) tokens.push(m[1]);
  }
  return tokens;
}

function buildAST(tokens) {
  let pos = 0;
  const ast = { version: null, body: [] };

  const peek    = ()  => tokens[pos];
  const consume = ()  => tokens[pos++];
  const eat     = (t) => { if (peek() === t) pos++; };

  function parseNodeOrDirective() {
    let name = consume();
    let label = null;

    if (peek() === ':') {
      label = name;
      consume(); // skip :
      name = consume();
    }

    if (peek() === '{') return parseNode(name, label);
    return { type: 'unknown', value: name };
  }

  function parseNode(name, label) {
    const node = { type: 'node', name, label, properties: [], children: [] };
    consume(); // skip {

    while (pos < tokens.length && peek() !== '}') {
      const next = tokens[pos + 1];
      if (next === ':' || next === '{') {
        node.children.push(parseNodeOrDirective());
      } else {
        node.properties.push(parseProperty());
      }
    }

    consume(); // skip }
    eat(';');
    return node;
  }

  function parseProperty() {
    const name = consume();
    const prop = { name, values: [] };

    if (peek() === '=') {
      consume(); // skip =
      while (pos < tokens.length && peek() !== ';') {
        const val = consume();
        if (val === ',') continue;
        if (val.startsWith('"')) {
          prop.values.push({ type: 'string', value: val.slice(1, -1) });
        } else if (val.startsWith('<')) {
          prop.values.push({ type: 'cells', value: val.slice(1, -1).trim().split(/\s+/).filter(Boolean) });
        } else if (val.startsWith('[')) {
          prop.values.push({ type: 'bytes', value: val.slice(1, -1).trim().split(/\s+/).filter(Boolean) });
        } else {
          prop.values.push({ type: 'raw', value: val });
        }
      }
    }

    eat(';');
    return prop;
  }

  while (pos < tokens.length) {
    const t = peek();
    if (t === '/dts-v1/') {
      ast.version = 1;
      consume();
      eat(';');
    } else {
      ast.body.push(parseNodeOrDirective());
    }
  }

  return ast;
}

// ---------------------------------------------------------------------------
// Stringifier (internal)
// ---------------------------------------------------------------------------

function stringifyAST(ast) {
  let out = ast.version === 1 ? '/dts-v1/;\n\n' : '';

  function stringifyNode(node, depth) {
    const indent = '\t'.repeat(depth);
    let s = indent;
    if (node.label) s += `${node.label}: `;
    s += `${node.name} {\n`;

    for (const prop of node.properties) {
      s += '\t'.repeat(depth + 1) + prop.name;
      if (prop.values.length > 0) {
        s += ' = ' + prop.values.map(v => {
          if (v.type === 'string') return `"${v.value}"`;
          if (v.type === 'cells')  return `<${v.value.join(' ')}>`;
          if (v.type === 'bytes')  return `[${v.value.join(' ')}]`;
          return v.value;
        }).join(', ');
      }
      s += ';\n';
    }

    for (const child of node.children) s += stringifyNode(child, depth + 1);
    s += `${indent}};\n`;
    return s;
  }

  for (const item of ast.body) out += stringifyNode(item, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a DTS source string and return a Proxy-wrapped document object.
 *
 * @param {string} source - Raw DTS file content.
 * @returns {Proxy} Wrapped DTS document.
 *
 * @example
 * const dts = parseDTS(source);
 *
 * // Read
 * console.log(dts.get('/').model);
 *
 * // Write
 * dts.get('/').model = 'My Device';
 * dts.get('/pwm@ff200000').status = 'okay';
 *
 * // Add child
 * const port = dts.get('/dsi@ff450000/ports').add('port@1', { reg: [0x01] });
 * port.add('endpoint', { 'remote-endpoint': [0x155] });
 *
 * // Find by compatible
 * const panel = dts.find('simple-panel-dsi');
 *
 * // Stringify
 * const output = dts.toString();
 */
export function parseDTS(source) {
  const ast = buildAST(tokenize(source));
  // Wrap from a virtual root that holds the full AST for path navigation and stringify
  return wrapNode({ name: '__root__', label: null, properties: [], children: ast.body }, ast);
}
