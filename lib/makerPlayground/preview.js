// A deliberately small interpreter, not a C++ compiler or CPU emulator.
// Source is tokenised and interpreted as data. Never evaluate it as JavaScript.
export const MAX_SOURCE = 16000
const MAX_TOKENS = 2400
const MAX_EVENTS = 256
const CONSTANTS = new Map([['HIGH', 1], ['LOW', 0]])
const CALLS = new Map([['pinMode', 2], ['digitalWrite', 2], ['delay', 1], ['Serial.begin', 1], ['Serial.println', 1]])
const RESERVED = new Set([...CONSTANTS.keys(), ...CALLS.keys(), 'OUTPUT', 'INPUT_PULLUP', 'digitalRead', 'int', 'const', 'void', 'setup', 'loop', 'if', 'else', 'Serial', 'LED_BUILTIN'])

class PreviewError extends Error {
  constructor(message, line = 1) { super(message); this.line = line }
}

function tokensFor(source) {
  if (typeof source !== 'string' || source.length > MAX_SOURCE) throw new PreviewError('Keep the sketch at or below 16,000 characters.')
  const tokens = []
  let position = 0, line = 1
  const pattern = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\r\n]|\\["\\nrt])*"|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|==|!=|<=|>=|[{}();,.=+<>!\-]/y
  while (position < source.length) {
    pattern.lastIndex = position
    const match = pattern.exec(source)
    if (!match) throw new PreviewError('Unsupported symbol or unfinished comment/string. Open Preview language for supported syntax.', line)
    const value = match[0], startLine = line
    line += (value.match(/\n/g) || []).length
    position = pattern.lastIndex
    if (/^\s|^\/\//.test(value) || value.startsWith('/*')) continue
    tokens.push({ value, line: startLine })
    if (tokens.length > MAX_TOKENS) throw new PreviewError('This sketch has too many tokens for the bounded preview.', line)
  }
  tokens.push({ value: '<end>', line })
  return tokens
}

function parse(source) {
  const tokens = tokensFor(source)
  let index = 0
  const peek = () => tokens[index]
  const take = () => tokens[index++]
  const is = value => peek().value === value
  const expect = value => {
    if (!is(value)) throw new PreviewError(`Expected ${value}; found ${peek().value}.`, peek().line)
    return take()
  }
  const name = () => {
    const token = take()
    if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(token.value) || RESERVED.has(token.value)) throw new PreviewError('Choose a variable name that is not a preview keyword.', token.line)
    return token.value
  }
  function expression(depth = 0, minimum = 0) {
    if (depth > 16) throw new PreviewError('Expression nesting is limited to 16 levels.', peek().line)
    const token = take()
    let left
    if (token.value === '(') { left = expression(depth + 1); expect(')') }
    else if (token.value === '-' || token.value === '!') left = { kind: 'unary', op: token.value, value: expression(depth + 1, 4), line: token.line }
    else if (/^[0-9]+$/.test(token.value)) left = { kind: 'number', value: Number(token.value), line: token.line }
    else if (token.value === 'digitalRead') { expect('('); left = { kind: 'read', pin: expression(depth + 1), line: token.line }; expect(')') }
    else if (['OUTPUT', 'INPUT_PULLUP'].includes(token.value)) throw new PreviewError('Use pin modes only as the second argument of pinMode; their platform-specific numeric values are not modelled.', token.line)
    else if (/^[A-Za-z_][A-Za-z_0-9]*$/.test(token.value)) left = { kind: 'name', name: token.value, line: token.line }
    else throw new PreviewError('Expected a whole number, variable or digitalRead(pin).', token.line)
    const levels = { '==': 1, '!=': 1, '<': 2, '>': 2, '<=': 2, '>=': 2, '+': 3, '-': 3 }
    let operators = 0
    while (Object.hasOwn(levels, peek().value) && levels[peek().value] > minimum) {
      if (++operators > 24) throw new PreviewError('Use shorter expressions (at most 24 operators).', peek().line)
      const op = take().value
      left = { kind: 'binary', op, left, right: expression(depth + 1, levels[op]), line: token.line }
    }
    return left
  }
  function declaration() {
    const line = peek().line, constant = is('const')
    if (constant) take()
    expect('int')
    const variable = name(); expect('=')
    const value = expression(); expect(';')
    return { kind: 'declare', name: variable, value, constant, line }
  }
  function block(depth = 0) {
    if (depth > 12) throw new PreviewError('Blocks are limited to 12 nested levels.', peek().line)
    expect('{')
    const statements = []
    while (!is('}')) {
      const token = peek()
      if (is('<end>')) throw new PreviewError('Close this block with }.', token.line)
      if (is('const') || is('int')) { statements.push(declaration()); continue }
      if (is('if')) {
        take(); expect('('); const condition = expression(); expect(')')
        const yes = block(depth + 1), no = is('else') ? (take(), block(depth + 1)) : []
        statements.push({ kind: 'if', condition, yes, no, line: token.line }); continue
      }
      let operation = take().value
      if (operation === 'Serial') { expect('.'); operation += '.' + take().value }
      if (is('=') && /^[A-Za-z_][A-Za-z_0-9]*$/.test(operation) && !RESERVED.has(operation)) {
        take(); const value = expression(); expect(';')
        statements.push({ kind: 'assign', name: operation, value, line: token.line }); continue
      }
      if (!CALLS.has(operation)) throw new PreviewError(`Unsupported statement: ${operation}. Preview accepts only the documented subset.`, token.line)
      expect('(')
      const args = []
      for (let n = 0; n < CALLS.get(operation); n++) {
        if (n) expect(',')
        if (operation === 'pinMode' && n === 1) {
          const mode = take()
          if (!['OUTPUT', 'INPUT_PULLUP'].includes(mode.value)) throw new PreviewError('Preview pin modes are the names OUTPUT and INPUT_PULLUP.', mode.line)
          args.push({ kind: 'mode', value: mode.value === 'OUTPUT' ? 2 : 3, line: mode.line })
        }
        else if (operation === 'Serial.println' && peek().value.startsWith('"')) args.push({ kind: 'string', value: JSON.parse(take().value), line: token.line })
        else args.push(expression())
      }
      expect(')'); expect(';')
      statements.push({ kind: 'call', operation, args, line: token.line })
    }
    expect('}')
    return statements
  }
  const globals = [], functions = new Map()
  while (!is('<end>')) {
    if (is('const') || is('int')) { globals.push(declaration()); continue }
    expect('void')
    const fn = take()
    if (!['setup', 'loop'].includes(fn.value) || functions.has(fn.value)) throw new PreviewError('Provide exactly one void setup() and one void loop().', fn.line)
    expect('('); expect(')'); functions.set(fn.value, block())
  }
  if (functions.size !== 2) throw new PreviewError('Provide both void setup() and void loop().')
  return { globals, setup: functions.get('setup'), loop: functions.get('loop') }
}

export function previewSketch(source, { board = 'uno', iterations = 4, buttonPressed = false } = {}) {
  try {
    if (!['uno', 'esp32'].includes(board) || !Number.isInteger(iterations) || iterations < 1 || iterations > 8 || typeof buttonPressed !== 'boolean') throw new PreviewError('Choose a supported board and 1–8 loop passes.')
    const program = parse(source), scopes = [new Map()], modes = new Map(), pins = new Map(), events = []
    const validPins = board === 'uno' ? new Set(Array.from({ length: 14 }, (_, n) => n)) : new Set([4, 13, 14, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33])
    let time = 0, steps = 0, serialReady = false
    function tick(line) { if (++steps > 4096) throw new PreviewError('Preview operation limit reached. Simplify the sketch.', line) }
    function numeric(value, line) {
      if (!Number.isInteger(value) || Math.abs(value) > 1000000) throw new PreviewError('Preview whole numbers must stay between -1,000,000 and 1,000,000.', line)
      return value
    }
    function binding(name, line) {
      for (let n = scopes.length - 1; n >= 0; n--) if (scopes[n].has(name)) return scopes[n].get(name)
      throw new PreviewError(`Unknown variable: ${name}.`, line)
    }
    function pinNumber(value, line) {
      if (!validPins.has(value)) throw new PreviewError(board === 'uno' ? 'This preview supports UNO R3 digital pins 0–13 only.' : 'Use a supported general-purpose ESP32 pin, such as 23 or 27. Flash, boot and input-only pins are excluded from this preview.', line)
      return value
    }
    function event(kind, detail, line) {
      if (events.length >= MAX_EVENTS) throw new PreviewError('Preview trace limit reached (256 events). Reduce loop passes or output.', line)
      events.push({ kind, detail, line, time, pins: Object.fromEntries(pins) })
    }
    function value(node, depth = 0) {
      tick(node.line)
      if (depth > 32) throw new PreviewError('Expression is too complex for preview.', node.line)
      if (node.kind === 'string') return node.value
      if (node.kind === 'mode') return node.value
      if (node.kind === 'number') return numeric(node.value, node.line)
      if (node.kind === 'name') {
        if (CONSTANTS.has(node.name)) return CONSTANTS.get(node.name)
        if (node.name === 'LED_BUILTIN' && board === 'uno') return 13
        return binding(node.name, node.line).value
      }
      if (node.kind === 'read') {
        const pin = pinNumber(value(node.pin, depth + 1), node.line)
        if (modes.get(pin) !== 3) throw new PreviewError('digitalRead needs pinMode(pin, INPUT_PULLUP) in this preview.', node.line)
        const result = buttonPressed ? 0 : 1
        event('read', `Pin ${pin} reads ${result ? 'HIGH' : 'LOW'} (${buttonPressed ? 'pressed' : 'released'})`, node.line)
        return result
      }
      if (node.kind === 'unary') { const operand = value(node.value, depth + 1); return node.op === '!' ? Number(!operand) : numeric(-operand, node.line) }
      const left = value(node.left, depth + 1), right = value(node.right, depth + 1)
      switch (node.op) {
        case '+': return numeric(left + right, node.line)
        case '-': return numeric(left - right, node.line)
        case '==': return Number(left === right)
        case '!=': return Number(left !== right)
        case '<': return Number(left < right)
        case '>': return Number(left > right)
        case '<=': return Number(left <= right)
        case '>=': return Number(left >= right)
        default: throw new PreviewError('Unsupported operator.', node.line)
      }
    }
    function run(statements, nested = true) {
      if (nested) scopes.push(new Map())
      for (const statement of statements) {
        const { line } = statement; tick(line)
        if (statement.kind === 'declare') {
          const scope = scopes[scopes.length - 1]
          if (scope.has(statement.name)) throw new PreviewError(`Duplicate variable: ${statement.name}.`, line)
          scope.set(statement.name, { value: value(statement.value), constant: statement.constant }); continue
        }
        if (statement.kind === 'assign') {
          const target = binding(statement.name, line)
          if (target.constant) throw new PreviewError(`Cannot change const variable ${statement.name}.`, line)
          target.value = value(statement.value); continue
        }
        if (statement.kind === 'if') { run(value(statement.condition) ? statement.yes : statement.no); continue }
        const args = statement.args.map(argument => value(argument))
        const first = args[0]
        switch (statement.operation) {
          case 'pinMode': {
            const pin = pinNumber(first, line)
            if (![2, 3].includes(args[1])) throw new PreviewError('Preview pin modes are OUTPUT and INPUT_PULLUP.', line)
            modes.set(pin, args[1]); pins.delete(pin)
            event('mode', `Pin ${pin}: ${args[1] === 2 ? 'OUTPUT' : 'INPUT_PULLUP'}`, line); break
          }
          case 'digitalWrite': {
            const pin = pinNumber(first, line)
            if (modes.get(pin) !== 2) throw new PreviewError('digitalWrite needs pinMode(pin, OUTPUT) first.', line)
            if (![0, 1].includes(args[1])) throw new PreviewError('Use HIGH or LOW for digitalWrite.', line)
            pins.set(pin, args[1]); event('write', `Pin ${pin} → ${args[1] ? 'HIGH' : 'LOW'}`, line); break
          }
          case 'delay':
            if (first < 0 || first > 10000 || time + first > 60000) throw new PreviewError('Each delay must be 0–10,000 ms; the whole preview is limited to 60,000 ms.', line)
            time += first; event('delay', `Waited ${first} ms (virtual time)`, line); break
          case 'Serial.begin':
            if (first < 1) throw new PreviewError('Serial speed must be positive.', line)
            serialReady = true; event('serial-start', `Serial ${first} baud (text preview)`, line); break
          case 'Serial.println':
            if (!serialReady) throw new PreviewError('Call Serial.begin before Serial.println.', line)
            event('serial', String(first), line); break
        }
      }
      if (nested) scopes.pop()
    }
    run(program.globals, false); run(program.setup)
    for (let n = 0; n < iterations; n++) run(program.loop)
    return { ok: true, events, time, iterations, steps }
  } catch (error) {
    if (!(error instanceof PreviewError)) throw error
    return { ok: false, error: error.message, line: error.line, events: [] }
  }
}
