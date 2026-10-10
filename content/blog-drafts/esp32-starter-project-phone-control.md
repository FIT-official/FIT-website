---
title: "ESP32 Starter Project: Control a Light and a Servo Lock from Your Phone"
slug: "esp32-starter-project-phone-control"
excerpt: "Build an ESP32 web server that controls an LED and a servo lock from your phone, tested in the Wokwi simulator on a 30-pin ESP32 DevKit."
tags: ["ESP32","Wokwi","Arduino IDE","electronics","servo","maker project","STEM"]
coverImage: "/blog-drafts/esp32-starter-project-phone-control.jpg"
date: "2026-10-10"
author: "Fix It Today"
status: "draft"
adminNote: "NOT ChatGPT-drafted, for vetting"
---

# ESP32 Starter Project: Control a Light and a Servo Lock from Your Phone

The ESP32 is a small board with Wi-Fi built in, which makes it a great step up from "blink an LED". In this project, the ESP32 runs a tiny **web server**. Open its page on a phone and you get buttons to switch a light on and off, lock and unlock a box with a servo, and see a live status panel.

No cloud account or app is needed, and you can try it in a free online simulator first.

## What you will build

The phone page has three parts:

- **Light** — ON and OFF buttons for an LED.
- **Box** — LOCK and UNLOCK buttons for a servo latch. Unlocking needs a PIN.
- **Status** — light, lock, button reading and uptime.

Two project ideas use exactly the same code:

- **A phone "curfew" box.** The servo latches a box; a PIN unlocks it.
- **A smart plant bot.** Swap the LED for a relay module that switches a low-voltage pump or grow light, and swap the button for a soil-moisture sensor on an analog pin (for example GPIO 34).

## Parts and wiring

| Part | ESP32 pin |
|---|---|
| LED (long leg) through a 220 Ω resistor | GPIO 26 → resistor → LED → GND |
| SG90 servo signal (orange/yellow) | GPIO 18 |
| SG90 servo + (red) | **5V / VIN** (not 3V3) |
| SG90 servo − (brown) | GND |
| Push button | GPIO 4 and GND (no resistor needed; the code uses INPUT_PULLUP) |

You also need a breadboard and jumper wires.

**Tested on:** this sketch was built and tested in the Wokwi simulator on a standard ESP32 DevKit (WROOM, 30-pin). It has not been tested on an ESP32 C3 SuperMini or other boards, which may need different pins, so use a 30-pin DevKit for this project. We list the [ESP32-Wroom/DevKit, 30pin](https://www.fixitoday.com/products/esp32-wroomdevkit-30pin) (price on request).

No extra libraries are needed. `WiFi.h`, `WebServer.h` and `ESPmDNS.h` come with the ESP32 board package, and the servo is driven with the ESP32's built-in PWM (`ledcAttach` / `ledcWrite`), so there is no Servo library to install.

The full `sketch.ino` and `diagram.json` are printed at the end of this post, so you can copy and paste them.

## Part A: Simulate it free in Wokwi

1. Sign in at wokwi.com with a free account so you can save your work.
2. Start a new ESP32 project.
3. Open `sketch.ino`, delete the contents and paste in the full sketch from the end of this post. Check the line `#define NET_MODE 0` — mode 0 is for Wokwi.
4. Open the `diagram.json` tab, delete the contents and paste in the `diagram.json` from the end of this post. You should see the ESP32, a green LED, a resistor, a servo and a blue button.
5. Press the green **Play** button. The Serial Monitor should show the LED off, the box locked, then "Connected! Open http://10.10.0.2" and "Web server started".

### The free-plan limitation

The simulated ESP32 can join Wokwi's free virtual Wi-Fi (called Wokwi-GUEST) and start the web server. However, **on the free plan your browser cannot open the simulated ESP32's web page**. That needs Wokwi's Private IoT Gateway, which is only on paid plans. It is normal that 10.10.0.2 does not open.

So on free Wokwi, test with **Serial Monitor commands** instead. Click the input box at the bottom of the Serial Monitor, type a command and press Enter:

| Command | What happens |
|---|---|
| `on` / `off` | The LED lights or goes out |
| `lock` | The servo turns to 90° (latched) |
| `unlock 1234` | The servo turns to 0° (open). A wrong PIN prints "Wrong PIN"; after three wrong tries you wait 30 seconds |
| `status` | Prints the current state as JSON |

## Part B: Run it on a real ESP32

Our testing was done in Wokwi on a 30-pin ESP32 DevKit, so check each step on your own board.

### Set up the Arduino IDE (once)

1. Install Arduino IDE 2.
2. In **File → Preferences → Additional boards manager URLs**, add Espressif's ESP32 board URL.
3. In **Boards Manager**, search for "esp32" and install **esp32 by Espressif Systems** (version 3.x).
4. Use a **data** USB cable. If no port appears, install the CP210x or CH340 driver.

### Choose how the phone connects

Edit one line in the sketch:

- **`NET_MODE 1` — Access Point (best for demos and classrooms).** The ESP32 creates its own Wi-Fi network; join it and open **http://192.168.4.1**.
- **`NET_MODE 2` — Home Wi-Fi.** Enter your network name and password. The ESP32 only supports **2.4 GHz** Wi-Fi. Open the `.local` address or the IP shown in the Serial Monitor.


### Upload and test

1. Select **ESP32 Dev Module** and the right port.
2. Click Upload. If it sticks at "Connecting…", hold the **BOOT** button until uploading starts.
3. Open the Serial Monitor at **115200 baud** and press **EN/RST** to see the address.
4. In Access Point mode, join the ESP32's network; if the phone warns there is no internet, stay connected.

## Troubleshooting

- **Gibberish in the Serial Monitor:** set the baud rate to 115200.
- **Servo jitters or the ESP32 resets:** power the servo from 5V, or use a separate 5V supply with the ground shared with the ESP32.

## Safety and good habits

- The PIN is a **simple demo lock, not real security**. The page uses plain http, so anyone on the same Wi-Fi could see the traffic.
- Always build in a **manual override**, so a phone is never stuck if the battery dies.
- **Mains wiring is for adults only.** Students should use low-voltage (5–12 V) pumps and lights through the relay.

## The full sketch (sketch.ino)

Copy this block into `sketch.ino`. Change `UNLOCK_PIN` and `AP_PASSWORD` before real use.

```cpp
/*
  ==========================================================================
   ESP32 Phone Control Demo  (FIT maker-kit: CurfewDock / Smart Plant Bot)
  ==========================================================================
   What it does:
     The ESP32 becomes a tiny WEB SERVER. Open its web page on a phone and you get:
       - LED  ON / OFF buttons            (Plant Bot: swap the LED for the pump relay / grow light)
       - LOCK / UNLOCK buttons for a servo (CurfewDock: the latch). UNLOCK needs a PIN.
       - A live status box: LED, lock, push-button reading, uptime.
     No cloud account, no app to install - just a web browser.

   Wiring (same as diagram.json):
     LED      : GPIO 26 -> 220 ohm resistor -> LED -> GND
     Servo    : signal GPIO 18, V+ to 5V (VIN), GND to GND
     Button   : GPIO 4 -> button -> GND   (INPUT_PULLUP: pressed = LOW)

   Libraries: NONE extra. WiFi.h, WebServer.h and ESPmDNS.h come with the ESP32 board package.
   The servo is driven directly with the ESP32's PWM (LEDC) so no Servo library is needed.

   ALSO WORKS WITHOUT A BROWSER: type these in the Serial Monitor (useful on free Wokwi):
       on   off   lock   unlock 1234   status
  ==========================================================================
*/

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>

// ---------------------------------------------------------------------------
// 1) CHOOSE HOW THE ESP32 CONNECTS  (change ONE number, then upload again)
// ---------------------------------------------------------------------------
//   0 = WOKWI      : joins the simulator's free "Wokwi-GUEST" Wi-Fi (use this in Wokwi)
//   1 = ACCESS PT  : REAL BOARD makes its own Wi-Fi "CurfewDock-Setup".
//                    Phone joins it, then open  http://192.168.4.1   (no router needed!)
//   2 = HOME WI-FI : REAL BOARD joins your home Wi-Fi. Open http://curfewdock.local
//                    (or the IP printed in the Serial Monitor)
#define NET_MODE 0

// Settings for mode 1 (Access Point). Password must be at least 8 characters.
const char* AP_NAME     = "CurfewDock-Setup";
const char* AP_PASSWORD = "curfew1234";

// Settings for mode 2 (home Wi-Fi). Put your own network here (2.4 GHz only!).
const char* HOME_SSID     = "YourHomeWiFi";
const char* HOME_PASSWORD = "YourPassword";
const char* MDNS_NAME     = "curfewdock";      // -> http://curfewdock.local

// The PIN a parent must type to UNLOCK. CHANGE THIS on a real device!
const char* UNLOCK_PIN = "1234";

// ---------------------------------------------------------------------------
// 2) PINS
// ---------------------------------------------------------------------------
const int LED_PIN    = 26;
const int SERVO_PIN  = 18;
const int BUTTON_PIN = 4;

const int LOCKED_ANGLE   = 90;   // servo angle when latched (tune on real hardware)
const int UNLOCKED_ANGLE = 0;    // servo angle when open

// ---------------------------------------------------------------------------
// 3) STATE (what the ESP32 remembers)
// ---------------------------------------------------------------------------
WebServer server(80);            // web server on port 80 (normal http)
bool ledOn   = false;
bool locked  = true;
int  wrongTries = 0;             // wrong-PIN counter
unsigned long lockoutUntil = 0;  // after 3 wrong PINs, wait 30 s

// ---------------------------------------------------------------------------
// 4) SERVO WITHOUT A LIBRARY
//    A hobby servo wants a pulse every 20 ms (50 Hz). 500 us = 0 deg, 2500 us = 180 deg.
//    We use 16-bit PWM, so 20 ms = 65535 "ticks".
// ---------------------------------------------------------------------------
void servoBegin() {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(SERVO_PIN, 50, 16);           // ESP32 board package 3.x (Wokwi uses this)
#else
  ledcSetup(0, 50, 16);                    // older 2.x board package
  ledcAttachPin(SERVO_PIN, 0);
#endif
}

void servoWrite(int angle) {
  int us   = map(angle, 0, 180, 500, 2500);   // angle -> pulse width (microseconds)
  int duty = (long)us * 65535 / 20000;        // pulse width -> PWM ticks
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(SERVO_PIN, duty);
#else
  ledcWrite(0, duty);
#endif
}

// ---------------------------------------------------------------------------
// 5) ACTIONS (used by BOTH the web page and the Serial Monitor)
// ---------------------------------------------------------------------------
void setLed(bool on) {
  ledOn = on;
  digitalWrite(LED_PIN, on ? HIGH : LOW);
  Serial.println(on ? "LED ON" : "LED OFF");
}

void lockBox() {
  locked = true;
  servoWrite(LOCKED_ANGLE);
  Serial.println("LOCKED");
}

// Returns a message. Only unlocks when the PIN is right.
String tryUnlock(String pin) {
  if (millis() < lockoutUntil) return "Too many wrong PINs. Wait 30 s.";
  if (pin != UNLOCK_PIN) {
    wrongTries++;
    Serial.println("Wrong PIN!");
    if (wrongTries >= 3) { lockoutUntil = millis() + 30000; wrongTries = 0; }
    return "Wrong PIN";
  }
  wrongTries = 0;
  locked = false;
  servoWrite(UNLOCKED_ANGLE);
  Serial.println("UNLOCKED");
  return "Unlocked";
}

// Status as JSON text, e.g. {"led":true,"locked":false,"button":"PRESSED","uptime":42}
String statusJson() {
  bool pressed = (digitalRead(BUTTON_PIN) == LOW);
  String s = "{\"led\":";  s += ledOn  ? "true" : "false";
  s += ",\"locked\":";     s += locked ? "true" : "false";
  s += ",\"button\":\"";   s += pressed ? "PRESSED" : "released";
  s += "\",\"uptime\":";   s += millis() / 1000;
  s += "}";
  return s;
}

// ---------------------------------------------------------------------------
// 6) THE WEB PAGE (HTML + a little JavaScript). Stored in flash memory.
//    The page calls small "addresses" on the ESP32:
//      /led?state=on   /led?state=off   /lock   /unlock (POST pin=...)   /status
// ---------------------------------------------------------------------------
const char PAGE[] PROGMEM = R"HTML(
<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CurfewDock</title>
<style>
 body{font-family:sans-serif;text-align:center;background:#f4f6fb;margin:0;padding:16px}
 .card{background:#fff;border-radius:14px;padding:14px;margin:12px auto;max-width:360px;box-shadow:0 2px 8px #0002}
 button{font-size:20px;padding:12px 20px;margin:6px;border:0;border-radius:10px;color:#fff;width:42%}
 .on{background:#2a9d4b}.off{background:#555}.lock{background:#c0392b}.unlock{background:#2471a3}
 input{font-size:20px;width:120px;text-align:center;padding:8px}
 #msg{color:#c0392b;min-height:1.2em}
</style></head><body>
<h2>CurfewDock</h2>
<div class="card"><b>Light</b><br>
 <button class="on"  onclick="go('/led?state=on')">ON</button>
 <button class="off" onclick="go('/led?state=off')">OFF</button></div>
<div class="card"><b>Phone box</b><br>
 <button class="lock" onclick="go('/lock')">LOCK</button><br>
 <input id="pin" type="password" inputmode="numeric" placeholder="PIN">
 <button class="unlock" onclick="unlock()">UNLOCK</button>
 <div id="msg"></div></div>
<div class="card"><b>Status</b><div id="st">loading...</div></div>
<script>
function show(t){document.getElementById('msg').textContent=t;refresh();}
function go(url){fetch(url).then(r=>r.text()).then(show);}
function unlock(){
  fetch('/unlock',{method:'POST',body:new URLSearchParams({pin:document.getElementById('pin').value})})
   .then(r=>r.text()).then(show);
}
function refresh(){
  fetch('/status').then(r=>r.json()).then(s=>{
    document.getElementById('st').innerHTML=
      'Light: <b>'+(s.led?'ON':'OFF')+'</b><br>Box: <b>'+(s.locked?'LOCKED':'OPEN')+
      '</b><br>Button: <b>'+s.button+'</b><br>Uptime: <b>'+s.uptime+' s</b>';
  });
}
refresh(); setInterval(refresh,2000);   // update every 2 seconds
</script></body></html>
)HTML";

// ---------------------------------------------------------------------------
// 7) WEB "ROUTES": which function runs for which address
// ---------------------------------------------------------------------------
void setupRoutes() {
  server.on("/", []() { server.send_P(200, "text/html", PAGE); });

  server.on("/led", []() {
    setLed(server.arg("state") == "on");
    server.send(200, "text/plain", ledOn ? "Light ON" : "Light OFF");
  });

  server.on("/lock", []() {
    lockBox();
    server.send(200, "text/plain", "Locked");
  });

  server.on("/unlock", HTTP_POST, []() {
    String result = tryUnlock(server.arg("pin"));
    server.send(result == "Unlocked" ? 200 : 403, "text/plain", result);
  });

  server.on("/status", []() { server.send(200, "application/json", statusJson()); });

  server.onNotFound([]() { server.send(404, "text/plain", "Not found"); });
}

// ---------------------------------------------------------------------------
// 8) CONNECT TO WI-FI (depends on NET_MODE above)
// ---------------------------------------------------------------------------
void startNetwork() {
#if NET_MODE == 1
  WiFi.softAP(AP_NAME, AP_PASSWORD);              // ESP32 becomes the Wi-Fi hotspot
  Serial.print("Wi-Fi made! Join \""); Serial.print(AP_NAME);
  Serial.print("\" then open http://"); Serial.println(WiFi.softAPIP());   // 192.168.4.1
#else
  #if NET_MODE == 0
    WiFi.begin("Wokwi-GUEST", "", 6);             // Wokwi's free sim Wi-Fi (channel 6 = faster)
  #else
    WiFi.begin(HOME_SSID, HOME_PASSWORD);
  #endif
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(200); Serial.print("."); }
  Serial.print("\nConnected! Open http://"); Serial.println(WiFi.localIP());
  #if NET_MODE == 2
    if (MDNS.begin(MDNS_NAME)) {                  // nickname on the home network
      Serial.print("or http://"); Serial.print(MDNS_NAME); Serial.println(".local");
    }
  #endif
#endif
}

// ---------------------------------------------------------------------------
// 9) SERIAL MONITOR COMMANDS (handy when the browser can't reach the simulator)
// ---------------------------------------------------------------------------
void handleSerial() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if      (cmd == "on")              setLed(true);
  else if (cmd == "off")             setLed(false);
  else if (cmd == "lock")            lockBox();
  else if (cmd.startsWith("unlock")) {          // "unlock 1234" -> PIN is the part after "unlock"
    String pin = cmd.substring(6);
    pin.trim();
    Serial.println(tryUnlock(pin));
  }
  else if (cmd == "status")          Serial.println(statusJson());
  else if (cmd.length())             Serial.println("Try: on | off | lock | unlock 1234 | status");
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  servoBegin();
  setLed(false);
  lockBox();                 // start locked (safe default)

  startNetwork();
  setupRoutes();
  server.begin();
  Serial.println("Web server started. Serial commands: on | off | lock | unlock 1234 | status");
}

void loop() {
  server.handleClient();     // answer any phone/browser requests
  handleSerial();            // answer any Serial Monitor commands
  delay(2);                  // tiny pause keeps things smooth
}
```

## The Wokwi circuit (diagram.json)

Copy this into the `diagram.json` tab in Wokwi. It uses Wokwi's ESP32 DevKit V1 part (a 30-pin WROOM DevKit).

```json
{
  "version": 1,
  "author": "Fix It Today",
  "editor": "wokwi",
  "parts": [
    { "type": "wokwi-esp32-devkit-v1", "id": "esp", "top": 0, "left": 0, "attrs": {} },
    { "type": "wokwi-led", "id": "led1", "top": -90, "left": 190, "attrs": { "color": "green", "label": "Light" } },
    { "type": "wokwi-resistor", "id": "r1", "top": -20, "left": 170, "rotate": 90, "attrs": { "value": "220" } },
    { "type": "wokwi-servo", "id": "servo1", "top": 150, "left": 200, "attrs": { "hornColor": "#c0392b" } },
    { "type": "wokwi-pushbutton", "id": "btn1", "top": 30, "left": -150, "attrs": { "color": "blue", "label": "Sensor", "key": "b", "bounce": "0" } }
  ],
  "connections": [
    [ "esp:TX0", "$serialMonitor:RX", "", [] ],
    [ "esp:RX0", "$serialMonitor:TX", "", [] ],

    [ "esp:D26", "r1:1", "green", [] ],
    [ "r1:2", "led1:A", "green", [] ],
    [ "led1:C", "esp:GND.1", "black", [] ],

    [ "servo1:PWM", "esp:D18", "orange", [] ],
    [ "servo1:V+", "esp:VIN", "red", [] ],
    [ "servo1:GND", "esp:GND.1", "black", [] ],

    [ "btn1:1.r", "esp:D4", "blue", [] ],
    [ "btn1:2.r", "esp:GND.2", "black", [] ]
  ],
  "dependencies": {}
}
```

## Next steps

For more sensors, see our [37-in-1 Sensor Kit](https://www.fixitoday.com/products/37-in-1-sensor-kit) (SGD 24.90). For workshops built around projects like this, see our [school programmes](https://www.fixitoday.com/school-programmes); for custom builds, see [custom electronics](https://www.fixitoday.com/electronics-prototyping).

Status: DRAFT — not published
