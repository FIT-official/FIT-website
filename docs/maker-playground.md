# FIT maker coding playground

Route: `/maker-tools/playground`. Standalone public educational tool; maker-tools hub integration is owned separately. No account, API, database, dependency, provider or infrastructure change. A narrow middleware exemption prevents existing accounts with incomplete onboarding being diverted from this public route. Retain repair and other service exemptions when integrating.

## What works

- Labelled plain-text editor with native keyboard navigation, six original annotated starter sketches (blink, pull-up button and Serial counter for two boards).
- Explicit local save, exact `.ino` export, per-board/per-lesson restoration, reset confirmation, unsaved-switch confirmation and browser unload warning. Drafts are shared by users of the same browser, not tied to a FIT account. They are not uploaded or synced. Storage failure leaves the editor usable and advises export. No arbitrary file import.
- Source-driven educational interpreter; step through immutable pin-state snapshots, virtual delays and Serial lines. Input setting applies throughout each run. Editing code or options invalidates prior results. No wall-clock animation or hardware connection.
- Whole-source tokenisation and parsing before interpretation. No eval, Function constructor, script/HTML insertion, dynamic imports, server execution or network calls. String output is React text. Map-backed names avoid prototype mutation. The root uses `ph-no-capture` and `rr-block` to exclude default autocapture and session recording; ordinary site consent/pageview behaviour remains unchanged.
- Bounded 16,000-character source, 2,400 tokens, expression/block depth, 4,096 operations, 256 events, eight loop passes, 60,000 ms virtual duration, 10,000 ms per delay. Runtime errors discard partial results. Whole-number arithmetic is bounded to ±1,000,000, not machine-width C++ arithmetic.

This is **not C++ compilation or board emulation**. No binaries, real timing, CPU registers, PWM, ADC, electrical circuit simulation, libraries, Wi-Fi, Bluetooth, interrupts, hardware serial, flashing, arrays, for/while loops or user-defined functions are provided. A successful preview does not validate a real sketch/circuit. Exported starters have been preview-tested; hardware compilation/upload is a separate Arduino IDE step and is not claimed tested here.

## Official references checked 9 October 2026

References are linked in the UI; no board illustrations or documentation code are redistributed. Starter text is original.

- [Arduino UNO R3](https://docs.arduino.cc/hardware/uno-rev3/) and [official pinout](https://content.arduino.cc/assets/Pinout-UNOrev3_latest.pdf): ATmega328P, digital/analog pins and D13 built-in LED. Profile is R3 only.
- [Arduino pull-up lesson](https://docs.arduino.cc/built-in-examples/digital/InputPullupSerial/): button-to-ground logic.
- [Espressif DevKitC V4 guide](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html): classic WROOM header reference, external LED on GPIO23, flash-pin exclusions and WROVER GPIO16/17 differences. No built-in programmable LED assumption.
- [Espressif GPIO API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html) and [hardware guidance](https://docs.espressif.com/projects/esp-faq/en/latest/hardware-related/hardware-design.html): digital mode/level semantics and GPIO restrictions. ESP32-C3/S3 are different targets.
- [Arduino IDE](https://docs.arduino.cc/software/ide-v2/): the separate compile/upload path.

## Investigated future compiler/emulator options

No packages or services below are integrated, loaded or contacted by this feature.

| Option | Evidence and licence | Suitability / remaining work |
| --- | --- | --- |
| [AVR8js](https://github.com/wokwi/avr8js) | Official repository states MIT and AVR 8-bit architecture | Plausible future UNO CPU emulation. Requires separately compiled firmware and validated peripheral wiring; it is not an Arduino C++ compiler or ESP32 emulator. A compiler, assets, resource limits and licence notices need separate review. |
| [Arduino CLI](https://github.com/arduino/arduino-cli) | Official repository / LICENSE.txt: GPL-3.0 | Real board-package compilation/upload on a host. Not a drop-in browser compiler. Hosting untrusted builds needs a reviewed isolated execution service, toolchain pinning and licensing assessment; outside this release. Users can use Arduino IDE locally. |
| [Espressif QEMU](https://github.com/espressif/qemu) | Official fork COPYING: GPL v2; [Espressif guide](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/tools/qemu.html) describes target support and limitations | Native emulator, not a browser component or guarantee of peripheral/radio coverage. Requires firmware, sandbox/runtime and explicit validation of target peripherals. Not selected for this browser-only release. |

No hosted Wokwi integration or assumption that an open-source component licenses the entire hosted simulator. No paid service, telemetry dependency, grants or executable downloads added by this feature.

## Integration

Base 9886ab0, including the completed repair release; classroom and PrintRequestFlow corrections remain untouched. The standalone d5014c1 checkpoint was preserved separately before reconciliation. Apply the final scoped commit to the single publisher's latest base and resolve only the small middleware hunk if necessary. Do not replace newer middleware wholesale. Shared Navbar/Footer and maker-tools hub are intentionally untouched; the hub owner should link to `/maker-tools/playground`. Run full tests/coverage and production build on the later combined maker-tools tip before publication. No deployment is authorised for this isolated feature task.
