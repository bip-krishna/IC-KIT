/*
  Arduino Uno IC Trainer Kit Controller

  Logical outputs:
    P1..P8 -> Arduino digital pins 2..9
    CLK    -> Arduino digital pin 10

  Logic probe inputs for the web 7-segment display:
    SEG A..G -> D11, D12, D13, A0, A1, A2, A3

  Serial commands are newline-terminated:
    P1_1, P1_0 ... P8_1, P8_0
    CLK_ON, CLK_OFF
    SPD_500      sets clock frequency to 500 Hz
    PULSE        emits one manual pulse on CLK
    STATUS       prints current state
*/

const byte OUTPUT_COUNT = 8;
const byte OUTPUT_PINS[OUTPUT_COUNT] = {2, 3, 4, 5, 6, 7, 8, 9};
const byte CLOCK_PIN = 10;
const byte SEGMENT_COUNT = 7;
const byte SEGMENT_INPUT_PINS[SEGMENT_COUNT] = {11, 12, 13, A0, A1, A2, A3};

const unsigned long MIN_FREQ_HZ = 1;
const unsigned long MAX_FREQ_HZ = 1000;
const unsigned long PULSE_WIDTH_US = 10000;
const unsigned long INPUT_REPORT_INTERVAL_MS = 100;

bool outputStates[OUTPUT_COUNT] = {false, false, false, false, false, false, false, false};
bool segmentInputStates[SEGMENT_COUNT] = {false, false, false, false, false, false, false};
bool clockEnabled = false;
bool clockLevel = false;
bool pulseActive = false;

unsigned long clockFrequencyHz = 10;
unsigned long halfPeriodUs = 50000;
unsigned long lastClockToggleUs = 0;
unsigned long pulseStartedUs = 0;
unsigned long lastInputReportMs = 0;

String inputLine = "";

void setup() {
  Serial.begin(115200);
  inputLine.reserve(32);

  for (byte i = 0; i < OUTPUT_COUNT; i++) {
    pinMode(OUTPUT_PINS[i], OUTPUT);
    digitalWrite(OUTPUT_PINS[i], LOW);
  }

  pinMode(CLOCK_PIN, OUTPUT);
  digitalWrite(CLOCK_PIN, LOW);

  for (byte i = 0; i < SEGMENT_COUNT; i++) {
    pinMode(SEGMENT_INPUT_PINS[i], INPUT);
    segmentInputStates[i] = digitalRead(SEGMENT_INPUT_PINS[i]) == HIGH;
  }

  updateHalfPeriod();

  Serial.println(F("READY Arduino IC Trainer Kit"));
  printState();
}

void loop() {
  readSerialCommands();
  serviceClock();
  servicePulse();
  sampleSegmentInputs();
}

void readSerialCommands() {
  while (Serial.available() > 0) {
    char incoming = Serial.read();

    if (incoming == '\r') {
      continue;
    }

    if (incoming == '\n') {
      inputLine.trim();
      if (inputLine.length() > 0) {
        handleCommand(inputLine);
      }
      inputLine = "";
      continue;
    }

    if (inputLine.length() < 31) {
      inputLine += incoming;
    } else {
      inputLine = "";
      Serial.println(F("ERR Command too long"));
    }
  }
}

void handleCommand(String command) {
  command.toUpperCase();

  if (command == "CLK_ON") {
    clockEnabled = true;
    pulseActive = false;
    clockLevel = false;
    digitalWrite(CLOCK_PIN, LOW);
    lastClockToggleUs = micros();
    Serial.println(F("OK CLK_ON"));
    printState();
    return;
  }

  if (command == "CLK_OFF") {
    stopClockLow();
    Serial.println(F("OK CLK_OFF"));
    printState();
    return;
  }

  if (command == "PULSE") {
    startManualPulse();
    Serial.println(F("OK PULSE"));
    return;
  }

  if (command == "STATUS") {
    printState();
    return;
  }

  if (command.startsWith("SPD_")) {
    unsigned long requestedFrequency = command.substring(4).toInt();
    setClockFrequency(requestedFrequency);
    Serial.print(F("OK SPD_"));
    Serial.println(clockFrequencyHz);
    printState();
    return;
  }

  if (command.charAt(0) == 'P') {
    handlePinCommand(command);
    return;
  }

  Serial.print(F("ERR Unknown command "));
  Serial.println(command);
}

void handlePinCommand(const String &command) {
  int separatorIndex = command.indexOf('_');

  if (separatorIndex < 2 || separatorIndex == command.length() - 1) {
    Serial.println(F("ERR Bad pin command"));
    return;
  }

  int logicalPin = command.substring(1, separatorIndex).toInt();
  int requestedState = command.substring(separatorIndex + 1).toInt();

  if (logicalPin < 1 || logicalPin > OUTPUT_COUNT || (requestedState != 0 && requestedState != 1)) {
    Serial.println(F("ERR Bad pin value"));
    return;
  }

  byte index = logicalPin - 1;
  outputStates[index] = requestedState == 1;
  digitalWrite(OUTPUT_PINS[index], outputStates[index] ? HIGH : LOW);

  Serial.print(F("OK P"));
  Serial.print(logicalPin);
  Serial.print(F("_"));
  Serial.println(requestedState);
  printState();
}

void setClockFrequency(unsigned long requestedFrequency) {
  clockFrequencyHz = constrain(requestedFrequency, MIN_FREQ_HZ, MAX_FREQ_HZ);
  updateHalfPeriod();
}

void updateHalfPeriod() {
  halfPeriodUs = 500000UL / clockFrequencyHz;
}

void serviceClock() {
  if (!clockEnabled || pulseActive) {
    return;
  }

  unsigned long nowUs = micros();

  if (nowUs - lastClockToggleUs >= halfPeriodUs) {
    clockLevel = !clockLevel;
    digitalWrite(CLOCK_PIN, clockLevel ? HIGH : LOW);
    lastClockToggleUs = nowUs;
  }
}

void startManualPulse() {
  clockEnabled = false;
  pulseActive = true;
  clockLevel = true;
  pulseStartedUs = micros();
  digitalWrite(CLOCK_PIN, HIGH);
}

void servicePulse() {
  if (!pulseActive) {
    return;
  }

  if (micros() - pulseStartedUs >= PULSE_WIDTH_US) {
    pulseActive = false;
    clockLevel = false;
    digitalWrite(CLOCK_PIN, LOW);
    printState();
  }
}

void sampleSegmentInputs() {
  unsigned long nowMs = millis();

  if (nowMs - lastInputReportMs < INPUT_REPORT_INTERVAL_MS) {
    return;
  }

  lastInputReportMs = nowMs;
  bool changed = false;

  for (byte i = 0; i < SEGMENT_COUNT; i++) {
    bool currentState = digitalRead(SEGMENT_INPUT_PINS[i]) == HIGH;
    if (currentState != segmentInputStates[i]) {
      segmentInputStates[i] = currentState;
      changed = true;
    }
  }

  if (changed) {
    printState();
  }
}

void stopClockLow() {
  clockEnabled = false;
  pulseActive = false;
  clockLevel = false;
  digitalWrite(CLOCK_PIN, LOW);
}

void printState() {
  Serial.print(F("STATE "));
  for (byte i = 0; i < OUTPUT_COUNT; i++) {
    Serial.print(F("P"));
    Serial.print(i + 1);
    Serial.print(F("="));
    Serial.print(outputStates[i] ? 1 : 0);
    Serial.print(F(" "));
  }
  Serial.print(F("CLK="));
  Serial.print(clockEnabled ? 1 : 0);
  Serial.print(F(" FREQ="));
  Serial.print(clockFrequencyHz);
  Serial.print(F(" SEG="));
  for (byte i = 0; i < SEGMENT_COUNT; i++) {
    Serial.print(segmentInputStates[i] ? 1 : 0);
  }
  Serial.println();
}
