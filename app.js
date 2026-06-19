const state = {
  money: 0,
  x: 1,
  currentLineIndex: 0,
  hasGrowthLine: false,
  initialized: false,
  boostCost: 10,
  growthCost: 50,
};

const elements = {
  codeLines: document.querySelector("#codeLines"),
  moneyValue: document.querySelector("#moneyValue"),
  xValue: document.querySelector("#xValue"),
  buyBoost: document.querySelector("#buyBoost"),
  buyGrowth: document.querySelector("#buyGrowth"),
  boostCost: document.querySelector("#boostCost"),
  growthCost: document.querySelector("#growthCost"),
  boostStatus: document.querySelector("#boostStatus"),
  growthStatus: document.querySelector("#growthStatus"),
};

function getProgram() {
  const program = [
    {
      source: "money = 0",
      run: () => {
        state.money = 0;
      },
    },
    {
      source: "x = 1",
      run: () => {
        state.x = 1;
      },
    },
    {
      source: "while True:",
      run: () => {},
      loopStart: true,
    },
    {
      source: "    money += x",
      run: () => {
        state.money += state.x;
      },
    },
  ];

  if (state.hasGrowthLine) {
    program.push({
      source: "    x += 0.01",
      run: () => {
        state.x += 0.01;
      },
    });
  }

  return program;
}

function formatNumber(value) {
  if (value >= 1000) {
    return Math.floor(value).toLocaleString("zh-Hant");
  }

  return Number(value.toFixed(2)).toLocaleString("zh-Hant", {
    maximumFractionDigits: 2,
  });
}

function renderCode(program) {
  elements.codeLines.replaceChildren();

  program.forEach((line, index) => {
    const row = document.createElement("span");
    row.className = "code-line";
    if (index === state.currentLineIndex) {
      row.classList.add("active");
    }

    const lineNumber = document.createElement("span");
    lineNumber.className = "line-number";
    lineNumber.textContent = index + 1;

    const source = document.createElement("span");
    source.className = "line-source";
    source.textContent = line.source;

    row.append(lineNumber, source);
    elements.codeLines.append(row);
  });
}

function render() {
  const program = getProgram();

  elements.moneyValue.textContent = formatNumber(state.money);
  elements.xValue.textContent = formatNumber(state.x);
  elements.boostCost.textContent = formatNumber(state.boostCost);
  elements.growthCost.textContent = formatNumber(state.growthCost);

  elements.buyBoost.disabled = state.money < state.boostCost;
  elements.buyGrowth.disabled = state.hasGrowthLine || state.money < state.growthCost;

  elements.boostStatus.textContent = `下次價格 ${formatNumber(state.boostCost)}`;
  elements.growthStatus.textContent = state.hasGrowthLine
    ? "已加入程式碼"
    : "一次性升級";

  elements.buyGrowth.closest(".upgrade").classList.toggle("owned", state.hasGrowthLine);
  renderCode(program);
}

function advanceLine() {
  const program = getProgram();
  const instruction = program[state.currentLineIndex];

  instruction.run();

  if (state.currentLineIndex < program.length - 1) {
    state.currentLineIndex += 1;
  } else {
    const loopStartIndex = program.findIndex((line) => line.loopStart);
    state.currentLineIndex = loopStartIndex;
    state.initialized = true;
  }

  render();
}

function buyBoost() {
  if (state.money < state.boostCost) {
    return;
  }

  state.money -= state.boostCost;
  state.x += 1;
  state.boostCost = Math.ceil(state.boostCost * 1.5);
  render();
}

function buyGrowth() {
  if (state.hasGrowthLine || state.money < state.growthCost) {
    return;
  }

  state.money -= state.growthCost;
  state.hasGrowthLine = true;
  render();
}

elements.buyBoost.addEventListener("click", buyBoost);
elements.buyGrowth.addEventListener("click", buyGrowth);

render();
setInterval(advanceLine, 1000);
