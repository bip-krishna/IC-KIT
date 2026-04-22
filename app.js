const pins = [
  { id: 1, arduinoPin: 2 },
  { id: 2, arduinoPin: 3 },
  { id: 3, arduinoPin: 4 },
  { id: 4, arduinoPin: 5 },
  { id: 5, arduinoPin: 6 },
  { id: 6, arduinoPin: 7 },
  { id: 7, arduinoPin: 8 },
  { id: 8, arduinoPin: 9 },
];

const segmentProbes = [
  { label: "A", arduinoPin: "D11" },
  { label: "B", arduinoPin: "D12" },
  { label: "C", arduinoPin: "D13" },
  { label: "D", arduinoPin: "A0" },
  { label: "E", arduinoPin: "A1" },
  { label: "F", arduinoPin: "A2" },
  { label: "G", arduinoPin: "A3" },
];

const state = {
  port: null,
  writer: null,
  reader: null,
  connected: false,
  clockOn: false,
  pinStates: new Map(pins.map((pin) => [pin.id, false])),
  segmentStates: new Map(segmentProbes.map((probe) => [probe.label, false])),
};

const elements = {
  allLowButton: document.querySelector("#allLowButton"),
  clearLogButton: document.querySelector("#clearLogButton"),
  clockStateBadge: document.querySelector("#clockStateBadge"),
  clockToggleButton: document.querySelector("#clockToggleButton"),
  connectButton: document.querySelector("#connectButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  frequencyOutput: document.querySelector("#frequencyOutput"),
  frequencySlider: document.querySelector("#frequencySlider"),
  logOutput: document.querySelector("#logOutput"),
  pinGrid: document.querySelector("#pinGrid"),
  pulseButton: document.querySelector("#pulseButton"),
  segmentProbeBank: document.querySelector("#segmentProbeBank"),
  serialSupport: document.querySelector("#serialSupport"),
  statusDot: document.querySelector("#statusDot"),
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function renderPins() {
  elements.pinGrid.innerHTML = pins
    .map((pin) => {
      const checked = state.pinStates.get(pin.id) ? "checked" : "";
      const level = state.pinStates.get(pin.id) ? "HIGH" : "LOW";
      const levelClass = state.pinStates.get(pin.id) ? "high" : "";

      return `
        <article class="pin-card">
          <div>
            <span class="pin-name">P${pin.id}</span>
            <span class="pin-meta">Arduino D${pin.arduinoPin}</span>
          </div>
          <span id="pinLed${pin.id}" class="pin-led ${levelClass}" aria-hidden="true"></span>
          <span id="pinState${pin.id}" class="state-pill ${levelClass}">${level}</span>
          <label class="switch" aria-label="Toggle P${pin.id}">
            <input data-pin="${pin.id}" type="checkbox" ${checked} />
            <span class="switch-track"></span>
          </label>
          <div class="socket-row" aria-hidden="true">
            <span class="socket"></span>
            <span class="socket"></span>
          </div>
        </article>
      `;
    })
    .join("");

  elements.pinGrid.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", () => handlePinToggle(input));
  });
  renderControlAvailability();
}

function renderSegmentProbes() {
  elements.segmentProbeBank.innerHTML = segmentProbes
    .map((probe) => {
      const isOn = state.segmentStates.get(probe.label);
      return `
        <article class="probe-card ${isOn ? "on" : ""}" id="probe${probe.label}">
          <span class="probe-label">${probe.label}</span>
          <span class="probe-led" aria-hidden="true"></span>
          <span class="state-pill ${isOn ? "high" : ""}" id="probeState${probe.label}">
            ${isOn ? "1" : "0"}
          </span>
          <span class="probe-pin">${probe.arduinoPin}</span>
        </article>
      `;
    })
    .join("");

  updateSevenSegment();
}

function renderConnection() {
  elements.connectButton.textContent = state.connected ? "Disconnect" : "Connect";
  elements.connectionStatus.textContent = state.connected
    ? "Connected to Arduino"
    : "Disconnected";
  elements.statusDot.classList.toggle("connected", state.connected);
  renderControlAvailability();
}

function renderClock() {
  elements.clockStateBadge.textContent = state.clockOn ? "ON" : "OFF";
  elements.clockStateBadge.classList.toggle("on", state.clockOn);
  elements.clockToggleButton.textContent = state.clockOn ? "Stop Clock" : "Start Clock";
}

function renderFrequency() {
  elements.frequencyOutput.textContent = `${elements.frequencySlider.value} Hz`;
}

function renderControlAvailability() {
  elements.allLowButton.disabled = !state.connected;
  elements.clockToggleButton.disabled = !state.connected;
  elements.pulseButton.disabled = !state.connected;
  elements.pinGrid.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.disabled = !state.connected;
  });
}

function setPinState(pinId, isHigh) {
  state.pinStates.set(pinId, isHigh);
  const pill = document.querySelector(`#pinState${pinId}`);
  const input = document.querySelector(`input[data-pin="${pinId}"]`);

  if (pill) {
    pill.textContent = isHigh ? "HIGH" : "LOW";
    pill.classList.toggle("high", isHigh);
  }

  const led = document.querySelector(`#pinLed${pinId}`);
  led?.classList.toggle("high", isHigh);

  if (input) {
    input.checked = isHigh;
  }
}

function setSegmentState(label, isOn) {
  state.segmentStates.set(label, isOn);
  document.querySelector(`#probe${label}`)?.classList.toggle("on", isOn);

  const probeState = document.querySelector(`#probeState${label}`);
  if (probeState) {
    probeState.textContent = isOn ? "1" : "0";
    probeState.classList.toggle("high", isOn);
  }

  updateSevenSegment();
}

function updateSevenSegment() {
  segmentProbes.forEach((probe) => {
    const segment = document.querySelector(`[data-seg="${probe.label}"]`);
    segment?.classList.toggle("on", state.segmentStates.get(probe.label));
  });
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    appendLog("Web Serial is not supported in this browser.");
    return;
  }

  try {
    state.port = await navigator.serial.requestPort();
    await state.port.open({ baudRate: 115200 });
    state.writer = state.port.writable.getWriter();
    state.connected = true;
    renderConnection();
    appendLog("Connected. Sending initial state...");
    readLoop();
    await sendCommand(`SPD_${elements.frequencySlider.value}`);
    await sendCommand("STATUS");
  } catch (error) {
    appendLog(`Connection failed: ${error.message}`);
  }
}

async function disconnectSerial() {
  try {
    if (state.reader) {
      await state.reader.cancel();
      state.reader.releaseLock();
      state.reader = null;
    }

    if (state.writer) {
      state.writer.releaseLock();
      state.writer = null;
    }

    if (state.port) {
      await state.port.close();
      state.port = null;
    }
  } catch (error) {
    appendLog(`Disconnect warning: ${error.message}`);
  } finally {
    state.connected = false;
    renderConnection();
    appendLog("Disconnected.");
  }
}

async function readLoop() {
  while (state.port?.readable && state.connected) {
    state.reader = state.port.readable.getReader();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await state.reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach((line) => handleSerialLine(line.trim()));
      }
    } catch (error) {
      if (state.connected) {
        appendLog(`Read error: ${error.message}`);
      }
    } finally {
      state.reader?.releaseLock();
      state.reader = null;
    }
  }
}

function handleSerialLine(line) {
  if (!line) {
    return;
  }

  appendLog(`< ${line}`);

  if (line.startsWith("STATE ")) {
    const parts = line.replace("STATE ", "").split(" ");
    parts.forEach((part) => {
      const [key, value] = part.split("=");
      if (key?.startsWith("P")) {
        setPinState(Number(key.slice(1)), value === "1");
      }
      if (key === "CLK") {
        state.clockOn = value === "1";
        renderClock();
      }
      if (key === "FREQ") {
        elements.frequencySlider.value = value;
        renderFrequency();
      }
      if (key === "SEG") {
        value.split("").forEach((bit, index) => {
          const probe = segmentProbes[index];
          if (probe) {
            setSegmentState(probe.label, bit === "1");
          }
        });
      }
    });
  }
}

async function sendCommand(command) {
  if (!state.connected || !state.writer) {
    appendLog(`Not connected: ${command}`);
    return;
  }

  await state.writer.write(encoder.encode(`${command}\n`));
  appendLog(`> ${command}`);
}

async function handlePinToggle(input) {
  const pinId = Number(input.dataset.pin);
  const isHigh = input.checked;
  setPinState(pinId, isHigh);
  await sendCommand(`P${pinId}_${isHigh ? "1" : "0"}`);
}

async function setAllPinsLow() {
  for (const pin of pins) {
    setPinState(pin.id, false);
    await sendCommand(`P${pin.id}_0`);
  }
}

async function toggleClock() {
  state.clockOn = !state.clockOn;
  renderClock();
  await sendCommand(state.clockOn ? "CLK_ON" : "CLK_OFF");
}

function appendLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  elements.logOutput.textContent += `[${timestamp}] ${message}\n`;
  elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
}

function bindEvents() {
  elements.connectButton.addEventListener("click", async () => {
    if (state.connected) {
      await disconnectSerial();
    } else {
      await connectSerial();
    }
  });

  elements.clockToggleButton.addEventListener("click", toggleClock);
  elements.pulseButton.addEventListener("click", () => sendCommand("PULSE"));
  elements.allLowButton.addEventListener("click", setAllPinsLow);
  elements.clearLogButton.addEventListener("click", () => {
    elements.logOutput.textContent = "";
  });

  elements.frequencySlider.addEventListener("input", () => {
    renderFrequency();
  });

  elements.frequencySlider.addEventListener("change", () => {
    sendCommand(`SPD_${elements.frequencySlider.value}`);
  });
}

function init() {
  elements.serialSupport.textContent =
    "serial" in navigator
      ? "Web Serial ready. Use Chrome or Edge on localhost."
      : "Web Serial unavailable. Use Chrome or Edge on localhost.";
  renderPins();
  renderSegmentProbes();
  renderConnection();
  renderClock();
  renderFrequency();
  bindEvents();
}

init();
