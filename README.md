# Arduino Uno IC Trainer Kit Web Controller

This project controls an Arduino Uno-based IC trainer kit from a local web dashboard using the Web Serial API. No backend is required.

## Pin Map

| UI pin | Arduino Uno pin |
| --- | --- |
| P1 | D2 |
| P2 | D3 |
| P3 | D4 |
| P4 | D5 |
| P5 | D6 |
| P6 | D7 |
| P7 | D8 |
| P8 | D9 |
| CLK | D10 |

Pins D0 and D1 are left free for USB serial communication.

## 7-Segment Probe Inputs

The dashboard also includes a live 7-segment display for reading outputs from your experiment circuit. Connect each circuit output to the matching Arduino input below.

| Display segment | Arduino input |
| --- | --- |
| A | D11 |
| B | D12 |
| C | D13 |
| D | A0 |
| E | A1 |
| F | A2 |
| G | A3 |

These are read as logic inputs only. Do not drive them above 5 V, and always connect the Arduino ground to the trainer-kit/circuit ground.

## Serial Commands

Commands are newline-terminated at `115200` baud.

```text
P1_1      set P1 HIGH
P1_0      set P1 LOW
CLK_ON    start clock on D10
CLK_OFF   stop clock and drive D10 LOW
SPD_500   set clock frequency to 500 Hz
PULSE     emit one manual clock pulse
STATUS    print current pin and clock state
```

Arduino status lines include the display probe bits as `SEG=abcdefg`, where each bit maps to segments A through G.

## Arduino Setup

1. Open `arduino/ic_trainer_kit/ic_trainer_kit.ino` in the Arduino IDE.
2. Select board `Arduino Uno`.
3. Select the correct USB serial port.
4. Upload the sketch.
5. Keep the Arduino connected by USB.

## Web Dashboard Setup

Web Serial requires a secure browser context. `localhost` is allowed, so run a tiny local static server from this folder:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Use Chrome or Edge. Click `Connect`, choose the Arduino serial port, then control the trainer kit.

## Notes for IC Experiments

- Use common ground between the Arduino and trainer kit logic rails.
- Arduino Uno output HIGH is 5 V, suitable for many 5 V TTL/CMOS trainer experiments.
- Connect circuit outputs that you want to observe to the A-G probe inputs, then watch the UI render the individual bits and 7-segment display.
- Add current limiting or buffering when driving LEDs, multiple IC inputs, or unknown trainer-kit loads.
- The clock frequency range is 1 Hz to 1000 Hz. For slow flip-flop demonstrations, start around 1-10 Hz.
