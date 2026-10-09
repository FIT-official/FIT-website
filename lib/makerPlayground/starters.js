export const boards = [
  {
    id: 'uno', name: 'Arduino UNO R3', led: 13, button: 2,
    summary: 'ATmega328P • 5 V logic • 14 digital I/O pins • 6 analog inputs',
    wiring: 'Blink uses the built-in LED on D13. For the button lesson, connect a momentary switch between D2 and GND. INPUT_PULLUP means released is HIGH and pressed is LOW.',
    pins: [['D13', 'Built-in LED / digital output'], ['D2', 'Button input in these lessons'], ['D0 / D1', 'Serial RX / TX; avoid extra wiring while using Serial'], ['A0–A5', 'Analog inputs; not modelled in this preview']],
    caution: 'This profile is UNO R3, not UNO R4 or another Arduino board. External LEDs need a series resistor; never connect a motor directly to a GPIO pin.',
    links: [
      ['UNO R3 official board guide', 'https://docs.arduino.cc/hardware/uno-rev3/'],
      ['Official UNO R3 pinout', 'https://content.arduino.cc/assets/Pinout-UNOrev3_latest.pdf'],
      ['Arduino input pull-up lesson', 'https://docs.arduino.cc/built-in-examples/digital/InputPullupSerial/'],
    ],
  },
  {
    id: 'esp32', name: 'ESP32 DevKitC V4 (WROOM)', led: 23, button: 27,
    summary: 'Classic ESP32-WROOM • 3.3 V GPIO • not ESP32-C3 / S3',
    wiring: 'Use an external LED: GPIO23 → 330 Ω series resistor → LED anode; LED cathode → GND. Connect a momentary switch between GPIO27 and GND for the button lesson. No programmable built-in LED is assumed.',
    pins: [['GPIO23', 'External LED output in these lessons'], ['GPIO27', 'Button input with internal pull-up'], ['GPIO34–39', 'Input-only; no internal pull-up / pull-down'], ['GPIO6–11', 'Reserved for flash; avoid'], ['GPIO0 / 2 / 5 / 12 / 15', 'Boot strapping pins; excluded from preview']],
    caution: 'Do not apply 5 V to ESP32 GPIO. Confirm the exact module and pin labels before wiring; GPIO16/17 are reserved on WROVER variants. This preview does not model wireless, ADC, PWM or peripherals.',
    links: [
      ['Espressif DevKitC V4 guide and pinout', 'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html'],
      ['Espressif GPIO API', 'https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html'],
      ['Espressif hardware guidance', 'https://docs.espressif.com/projects/esp-faq/en/latest/hardware-related/hardware-design.html'],
    ],
  },
]

export const lessons = [
  { id: 'blink', name: '01 · Blink an LED', goal: 'Follow the order of instructions and see how delay changes a signal.', challenge: 'Change the first delay to 200 and the second to 800. Predict the HIGH and LOW durations, then preview again.' },
  { id: 'button', name: '02 · Read a button', goal: 'Use an input and an if / else decision to control an output.', challenge: 'Preview once with the button released, then pressed. Change LOW to HIGH in the if condition to reverse the behaviour.' },
  { id: 'counter', name: '03 · Count with Serial', goal: 'Keep a variable between loop passes and inspect text output.', challenge: 'Change count + 1 to count + 2. Try eight loop passes and check the sequence.' },
]

export function starterSketch(boardId, lessonId) {
  const board = boards.find(item => item.id === boardId)
  if (!board || !lessons.some(item => item.id === lessonId)) throw new Error('Unknown playground lesson')
  const title = `// FIT maker playground: ${board.name}\n// Export to Arduino IDE to compile and upload for your exact board.\n`
  if (lessonId === 'counter') return `${title}\nint count = 0; // A global variable survives each loop pass.\n\nvoid setup() {\n  Serial.begin(115200); // Match this speed in your Serial Monitor.\n}\n\nvoid loop() {\n  count = count + 1;\n  Serial.println(count);\n  delay(500); // On hardware this pauses execution; here time is virtual.\n}\n`
  const pins = `\nconst int LED_PIN = ${board.led}; // ${boardId === 'uno' ? 'Built-in UNO R3 LED.' : 'External LED with a series resistor.'}\n`
  if (lessonId === 'blink') return `${title}${pins}\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT); // setup runs once.\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH); // LED on.\n  delay(500);\n  digitalWrite(LED_PIN, LOW); // LED off.\n  delay(500);\n}\n`
  return `${title}${pins}const int BUTTON_PIN = ${board.button}; // Switch connects this pin to GND.\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n  pinMode(BUTTON_PIN, INPUT_PULLUP);\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  int reading = digitalRead(BUTTON_PIN);\n  // With a pull-up, pressing the switch reads LOW.\n  if (reading == LOW) {\n    digitalWrite(LED_PIN, HIGH);\n    Serial.println("Pressed");\n  } else {\n    digitalWrite(LED_PIN, LOW);\n    Serial.println("Released");\n  }\n  delay(100); // A pause, not a complete hardware debounce solution.\n}\n`
}
