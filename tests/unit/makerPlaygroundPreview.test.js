import { describe, expect, it } from 'vitest'
import { previewSketch, MAX_SOURCE } from '@/lib/makerPlayground/preview'
import { boards, lessons, starterSketch } from '@/lib/makerPlayground/starters'

const sketch = (loop, setup = '', globals = '') => `${globals}\nvoid setup() {${setup}}\nvoid loop() {${loop}}`
const writes = result => result.events.filter(event => event.kind === 'write')

describe('bounded maker logic preview', () => {
  it.each(boards.flatMap(board => lessons.map(lesson => [board.id, lesson.id])))('%s / %s starter runs', (board, lesson) => {
    const result = previewSketch(starterSketch(board, lesson), { board })
    expect(result.ok).toBe(true)
    expect(result.events.length).toBeGreaterThan(0)
  })
  it('traces edited blink timings from actual source', () => {
    const code = starterSketch('uno', 'blink').replace('delay(500)', 'delay(200)')
    const result = previewSketch(code, { iterations: 2 })
    expect(writes(result).map(event => [event.time, event.pins[13]])).toEqual([[0, 1], [200, 0], [700, 1], [900, 0]])
    expect(result.time).toBe(1400)
  })
  it.each([false, true])('uses input state and follows the selected branch: pressed=%s', pressed => {
    const result = previewSketch(starterSketch('esp32', 'button'), { board: 'esp32', iterations: 2, buttonPressed: pressed })
    expect(writes(result).map(event => event.pins[23])).toEqual([Number(pressed), Number(pressed)])
    expect(result.events.filter(event => event.kind === 'serial').map(event => event.detail)).toEqual([pressed ? 'Pressed' : 'Released', pressed ? 'Pressed' : 'Released'])
  })
  it('keeps globals and resets local loop variables on every pass', () => {
    const result = previewSketch(sketch('int local = 1; count = count + local; Serial.println(count);', 'Serial.begin(9600);', 'int count = 0;'))
    expect(result.events.filter(e => e.kind === 'serial').map(e => e.detail)).toEqual(['1', '2', '3', '4'])
  })
  it('handles arithmetic precedence, comparisons, unary negation and comments', () => {
    const result = previewSketch(sketch('/*comment*/ if (!(2 + 3 < 5)) { Serial.println(-3 + 8); } else { Serial.println(0); }', 'Serial.begin(9600);'))
    expect(result.events.filter(e => e.kind === 'serial').map(e => e.detail)).toEqual(['5', '5', '5', '5'])
  })
  it('honours block scope without replacing a global binding', () => {
    const result = previewSketch(sketch('if (1) { int count = 10; Serial.println(count); } Serial.println(count);', 'Serial.begin(1);', 'int count = 2;'), { iterations: 1 })
    expect(result.events.filter(e => e.kind === 'serial').map(e => e.detail)).toEqual(['10', '2'])
  })
  it('treats apparent HTML and JavaScript in Serial strings as literal text', () => {
    const payload = '<img src=x onerror=alert(1)> // /* */ ${globalThis.secret}'
    const result = previewSketch(sketch(`Serial.println(${JSON.stringify(payload)});`, 'Serial.begin(1);'), { iterations: 1 })
    expect(result.events.at(-1).detail).toBe(payload)
  })
  it('uses Maps for prototype-like variable names', () => {
    const result = previewSketch(sketch('Serial.println(__proto__ + constructor);', 'Serial.begin(1);', 'int __proto__ = 3; int constructor = 4;'), { iterations: 1 })
    expect(result.events.at(-1).detail).toBe('7')
    expect({}.polluted).toBeUndefined()
  })
  it.each([
    'while (1) {}', 'for (;;) {}', 'fetch("https://example.com");', 'eval("1");', 'window.location = 1;',
    'Serial.printf("x");', '#include <WiFi.h>', 'digitalWrite(13, HIGH); garbage', 'if (0) { fetch("x"); }',
    'int x = 1.5;', 'int x = 0x12;', 'int x = 1 / 0;', 'int x = [1];', 'int x = 1; x++;', 'return;',
  ])('rejects unsupported syntax without a partial success: %s', body => {
    const result = previewSketch(sketch(body, 'pinMode(13, OUTPUT);'))
    expect(result.ok).toBe(false)
    expect(result.events).toEqual([])
  })
  it.each([
    ['digitalWrite(13, HIGH);', '', '', /OUTPUT/],
    ['int x = digitalRead(2);', '', '', /INPUT_PULLUP/],
    ['Serial.println(1);', '', '', /Serial.begin/],
    ['count = 2;', '', 'const int count = 1;', /const/],
    ['int x = 1; int x = 2;', '', '', /Duplicate/],
    ['Serial.println(missing);', 'Serial.begin(1);', '', /Unknown/],
    ['digitalWrite(13, 2);', 'pinMode(13, OUTPUT);', '', /HIGH or LOW/],
    ['pinMode(13, 4);', '', '', /pin modes/],
    ['Serial.begin(0);', '', '', /positive/],
    ['delay(-1);', '', '', /delay/],
    ['delay(10001);', '', '', /delay/],
    ['int count = 1000001;', '', '', /whole numbers/],
    ['count = count + 1;', '', 'int count = 1000000;', /whole numbers/],
    ['Serial.println(local);', 'int local = 1; Serial.begin(1);', '', /Unknown/],
  ])('reports runtime limits and configuration errors', (body, setup, globals, error) => {
    expect(previewSketch(sketch(body, setup, globals))).toMatchObject({ ok: false, error: expect.stringMatching(error), events: [] })
  })
  it('enforces total virtual duration', () => expect(previewSketch(sketch('delay(10000);'), { iterations: 8 }).ok).toBe(false))
  it('enforces event cap', () => expect(previewSketch(sketch('Serial.println(1);'.repeat(100), 'Serial.begin(1);')).error).toMatch(/trace limit/))
  it.each(['', 'void setup() {}', 'void setup() {} void setup() {} void loop() {}', 'void other() {}', 'void setup() {'])('rejects incomplete sketches: %s', source => expect(previewSketch(source).ok).toBe(false))
  it.each(['/* never closed', '"never closed', 'const int x = ', '#include', '<script>alert(1)</script>'])('handles truncated or hostile source: %s', source => expect(previewSketch(source).ok).toBe(false))
  it('caps source, token count and nesting before execution', () => {
    expect(previewSketch(' '.repeat(MAX_SOURCE + 1)).ok).toBe(false)
    expect(previewSketch(sketch('delay(0);'.repeat(1000))).error).toMatch(/tokens/)
    expect(previewSketch(sketch(`Serial.println(${'('.repeat(40)}1${')'.repeat(40)});`)).ok).toBe(false)
    expect(previewSketch(sketch('if(1){'.repeat(20) + '}'.repeat(20))).ok).toBe(false)
  })
  it('rejects unsupported ESP32 pins and a non-existent built-in LED assumption', () => {
    for (const pin of [0, 2, 5, 6, 11, 12, 15, 16, 17, 34, 39]) expect(previewSketch(sketch('', `pinMode(${pin}, OUTPUT);`), { board: 'esp32' }).ok).toBe(false)
    expect(previewSketch(sketch('', 'pinMode(LED_BUILTIN, OUTPUT);'), { board: 'esp32' }).ok).toBe(false)
    expect(previewSketch(sketch('', 'pinMode(LED_BUILTIN, OUTPUT);')).ok).toBe(true)
  })
  it.each([{ board: 'fake' }, { iterations: 0 }, { iterations: 9 }, { iterations: 1.5 }, { buttonPressed: 'yes' }])('validates preview options', options => expect(previewSketch(starterSketch('uno', 'blink'), options).ok).toBe(false))
  it('attaches accurate line numbers to errors', () => expect(previewSketch('void setup() {}\nvoid loop() {\n  delay(-1);\n}').line).toBe(3))
  it('does not invent numeric values for platform-specific pin modes', () => {
    expect(previewSketch(sketch('Serial.println(OUTPUT);', 'Serial.begin(1);')).ok).toBe(false)
    expect(previewSketch(sketch('', 'pinMode(13, 1);')).ok).toBe(false)
  })
})
