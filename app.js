const SAVE_KEY = "python-incremental-save-v2";

const app = document.querySelector("#app");

const defaultSave = {
  version: 3,
  completedLevels: [],
  fragments: 0,
  metaUpgrades: {
    starterX: 0,
    shopDiscount: 0,
    rewardBoost: 0,
  },
  achievements: {},
  main: {
    generator: 1,
    generatorCost: 25,
    currentLineIndex: 0,
    totalFragmentsGenerated: 0,
  },
};

let save = loadSave();
let appState = {
  view: "level-select",
  runtime: null,
  completion: null,
};

const achievementDefinitions = [
  {
    id: "first-clear",
    title: "第一次 break",
    description: "完成任意一個關卡。",
    reward: 10,
    isUnlocked: () => save.completedLevels.length >= 1,
  },
  {
    id: "shopper",
    title: "會逛商店",
    description: "在任意關卡購買 5 次升級。",
    reward: 12,
    isUnlocked: () => getMetric("upgradePurchases") >= 5,
  },
  {
    id: "main-100",
    title: "主線啟動",
    description: "主線程式累積產生 100 fragments。",
    reward: 18,
    isUnlocked: () => save.main.totalFragmentsGenerated >= 100,
  },
  {
    id: "meta-first",
    title: "局外投資",
    description: "購買任意一個局外升級。",
    reward: 15,
    isUnlocked: () => getMetaUpgradeTotal() >= 1,
  },
  {
    id: "three-levels",
    title: "連續破題",
    description: "完成 3 個不同關卡。",
    reward: 25,
    isUnlocked: () => save.completedLevels.length >= 3,
  },
  {
    id: "all-levels",
    title: "第一章完成",
    description: "完成目前所有關卡。",
    reward: 50,
    isUnlocked: () => save.completedLevels.length >= levelDefinitions.length,
  },
];

const metaUpgradeDefinitions = [
  {
    id: "starterX",
    title: "起始 x",
    description: "所有關卡開始時，若有 x，額外增加 1。",
    baseCost: 20,
    getCost: (level) => Math.ceil(20 * Math.pow(1.8, level)),
  },
  {
    id: "shopDiscount",
    title: "商店折扣",
    description: "關卡內所有升級價格降低 10%。",
    baseCost: 30,
    getCost: (level) => Math.ceil(30 * Math.pow(2, level)),
  },
  {
    id: "rewardBoost",
    title: "通關獎勵",
    description: "關卡通關 fragments 獎勵增加 25%。",
    baseCost: 40,
    getCost: (level) => Math.ceil(40 * Math.pow(2.15, level)),
  },
];

const levelDefinitions = [
  {
    id: "level-1",
    order: 1,
    title: "第一關：無限迴圈",
    summary: "從最小的 while True 開始，學會讓收益成長，最後用 break 離開迴圈。",
    reward: 20,
    variables: { money: 0, x: 1 },
    lines: [
      setLine("money", 0),
      setLine("x", 1),
      whileLine(),
      addLine("money", "x"),
    ],
    upgrades: [
      addVariableUpgrade("boost-x", "強化 x", "立即讓 x 增加 1。", 6, "x", 1, {
        repeatable: true,
        multiplier: 1.5,
      }),
      insertLineUpgrade(
        "self-growth",
        "自我成長",
        "在 money += x 下方加入 x += 0.01。",
        18,
        "money += x",
        growthLine("x", 0.01),
      ),
      addVariableUpgrade("big-boost", "一次大強化", "立即讓 x 增加 5。", 32, "x", 5, {
        maxPurchases: 1,
      }),
      breakUpgrade(45),
    ],
  },
  {
    id: "level-2",
    order: 2,
    title: "第二關：計數器",
    summary: "counter 會慢慢推高 x，先讓計數器跑起來，再結束迴圈。",
    reward: 32,
    variables: { money: 0, x: 1, counter: 0 },
    lines: [
      setLine("money", 0),
      setLine("x", 1),
      setLine("counter", 0),
      whileLine(),
      addLine("money", "x"),
      growthLine("counter", 1),
    ],
    upgrades: [
      insertLineUpgrade(
        "counter-feeds-x",
        "計數器餵給 x",
        "加入 x += counter * 0.02。",
        28,
        "counter += 1",
        formulaLine("x", "counter", 0.02, "x += counter * 0.02"),
      ),
      addVariableUpgrade("counter-kick", "計數器啟動", "立即讓 counter 增加 15。", 45, "counter", 15, {
        repeatable: true,
        multiplier: 1.7,
      }),
      addVariableUpgrade("x-tune", "調整 x", "立即讓 x 增加 3。", 70, "x", 3, {
        maxPurchases: 2,
      }),
      breakUpgrade(170),
    ],
  },
  {
    id: "level-3",
    order: 3,
    title: "第三關：乘數",
    summary: "引入 multiplier，讓 money += x * multiplier 成為主要收益。",
    reward: 45,
    variables: { money: 0, x: 2, multiplier: 1 },
    lines: [
      setLine("money", 0),
      setLine("x", 2),
      setLine("multiplier", 1),
      whileLine(),
      formulaLine("money", "x", "multiplier", "money += x * multiplier"),
    ],
    upgrades: [
      addVariableUpgrade("x-plus", "基礎值", "立即讓 x 增加 2。", 35, "x", 2, {
        repeatable: true,
        multiplier: 1.65,
      }),
      addVariableUpgrade("mult-plus", "倍率強化", "立即讓 multiplier 增加 0.5。", 75, "multiplier", 0.5, {
        repeatable: true,
        multiplier: 1.8,
      }),
      insertLineUpgrade(
        "mult-growth",
        "倍率自增",
        "加入 multiplier += 0.02。",
        160,
        "money += x * multiplier",
        growthLine("multiplier", 0.02),
      ),
      breakUpgrade(300),
    ],
  },
  {
    id: "level-4",
    order: 4,
    title: "第四關：批次收益",
    summary: "batch 讓每次迴圈收益更厚，但購買 break 的門檻也更高。",
    reward: 60,
    variables: { money: 0, x: 3, batch: 1 },
    lines: [
      setLine("money", 0),
      setLine("x", 3),
      setLine("batch", 1),
      whileLine(),
      formulaLine("money", "x", "batch", "money += x * batch"),
    ],
    upgrades: [
      addVariableUpgrade("batch-up", "增加 batch", "立即讓 batch 增加 1。", 80, "batch", 1, {
        repeatable: true,
        multiplier: 1.7,
      }),
      addVariableUpgrade("x-up", "提升 x", "立即讓 x 增加 4。", 95, "x", 4, {
        repeatable: true,
        multiplier: 1.75,
      }),
      insertLineUpgrade(
        "batch-growth",
        "批次膨脹",
        "加入 batch += 0.05。",
        240,
        "money += x * batch",
        growthLine("batch", 0.05),
      ),
      breakUpgrade(520),
    ],
  },
  {
    id: "level-5",
    order: 5,
    title: "第五關：複利",
    summary: "interest 會慢慢推動 money 自我成長，作為第一章的收束。",
    reward: 85,
    variables: { money: 1, x: 4, interest: 0.01 },
    lines: [
      setLine("money", 1),
      setLine("x", 4),
      setLine("interest", 0.01),
      whileLine(),
      formulaLine("money", "money", "interest", "money += money * interest"),
      addLine("money", "x"),
    ],
    upgrades: [
      addVariableUpgrade("interest-up", "利率提高", "立即讓 interest 增加 0.01。", 140, "interest", 0.01, {
        repeatable: true,
        multiplier: 1.85,
      }),
      addVariableUpgrade("x-surge", "固定收益", "立即讓 x 增加 8。", 180, "x", 8, {
        repeatable: true,
        multiplier: 1.8,
      }),
      insertLineUpgrade(
        "interest-growth",
        "利率自增",
        "加入 interest += 0.001。",
        380,
        "money += x",
        growthLine("interest", 0.001),
      ),
      breakUpgrade(900),
    ],
  },
];

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return structuredClone(defaultSave);
    }

    const parsed = JSON.parse(raw);
    const migratedMain = { ...defaultSave.main, ...parsed.main };

    if ((parsed.version || 0) < 3) {
      migratedMain.generator = 1 + (parsed.main?.generators || 0);
      migratedMain.totalFragmentsGenerated = 0;
      migratedMain.currentLineIndex = 0;
      parsed.fragments = (parsed.fragments || 0) + Math.floor((parsed.main?.energy || 0) / 100);
    }

    return {
      ...structuredClone(defaultSave),
      ...parsed,
      version: defaultSave.version,
      metaUpgrades: { ...defaultSave.metaUpgrades, ...parsed.metaUpgrades },
      main: migratedMain,
      achievements: { ...defaultSave.achievements, ...parsed.achievements },
    };
  } catch {
    return structuredClone(defaultSave);
  }
}

function persist() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

function getMetric(id) {
  return save[id] || 0;
}

function addMetric(id, amount = 1) {
  save[id] = getMetric(id) + amount;
}

function getMetaUpgradeTotal() {
  return Object.values(save.metaUpgrades).reduce((total, value) => total + value, 0);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (value >= 1000000) {
    return value.toExponential(2);
  }

  if (value >= 1000) {
    return Math.floor(value).toLocaleString("zh-Hant");
  }

  return Number(value.toFixed(2)).toLocaleString("zh-Hant", {
    maximumFractionDigits: 2,
  });
}

function setLine(variable, value) {
  return {
    id: `${variable}-set-${value}`,
    source: `${variable} = ${value}`,
    run: (runtime) => {
      runtime.variables[variable] = value;
      if (variable === "x") {
        runtime.variables[variable] += save.metaUpgrades.starterX;
      }
    },
  };
}

function whileLine() {
  return {
    id: "while-true",
    source: "while True:",
    loopStart: true,
    run: () => {},
  };
}

function addLine(target, sourceVariable) {
  return {
    id: `${target}-plus-${sourceVariable}`,
    source: `    ${target} += ${sourceVariable}`,
    run: (runtime) => {
      runtime.variables[target] += runtime.variables[sourceVariable];
    },
  };
}

function growthLine(variable, amount) {
  return {
    id: `${variable}-growth-${amount}`,
    source: `    ${variable} += ${amount}`,
    run: (runtime) => {
      runtime.variables[variable] += amount;
    },
  };
}

function formulaLine(target, left, right, source) {
  return {
    id: source,
    source: source.startsWith("    ") ? source : `    ${source}`,
    run: (runtime) => {
      const rightValue = typeof right === "number" ? right : runtime.variables[right];
      runtime.variables[target] += runtime.variables[left] * rightValue;
    },
  };
}

function breakLine() {
  return {
    id: "break",
    source: "    break",
    run: (runtime) => {
      runtime.completed = true;
    },
  };
}

function addVariableUpgrade(id, title, description, baseCost, variable, amount, options = {}) {
  return {
    id,
    title,
    description,
    baseCost,
    repeatable: Boolean(options.repeatable),
    maxPurchases: options.maxPurchases || Infinity,
    multiplier: options.multiplier || 1,
    apply: (runtime) => {
      runtime.variables[variable] += amount;
    },
  };
}

function insertLineUpgrade(id, title, description, baseCost, afterSource, line) {
  return {
    id,
    title,
    description,
    baseCost,
    repeatable: false,
    maxPurchases: 1,
    multiplier: 1,
    apply: (runtime) => {
      runtime.insertedLines.push({ afterSource, line });
    },
  };
}

function breakUpgrade(baseCost) {
  return {
    id: "insert-break",
    title: "加入 break",
    description: "在 while True: 下一行加入 break，執行到該行就完成關卡。",
    baseCost,
    repeatable: false,
    maxPurchases: 1,
    multiplier: 1,
    apply: (runtime) => {
      runtime.insertedLines.push({ afterSource: "while True:", line: breakLine() });
    },
  };
}

function createRuntime(levelId) {
  const level = getLevel(levelId);
  return {
    levelId,
    variables: { ...level.variables },
    currentLineIndex: 0,
    insertedLines: [],
    purchases: {},
    completed: false,
  };
}

function getLevel(levelId) {
  return levelDefinitions.find((level) => level.id === levelId);
}

function getProgram(runtime) {
  const level = getLevel(runtime.levelId);
  const program = [];

  level.lines.forEach((line) => {
    program.push(line);
    runtime.insertedLines
      .filter((inserted) => inserted.afterSource === line.source.trim())
      .forEach((inserted) => program.push(inserted.line));
  });

  return program;
}

function getUpgradeCost(upgrade, runtime) {
  const purchases = runtime.purchases[upgrade.id] || 0;
  const discount = Math.pow(0.9, save.metaUpgrades.shopDiscount);
  return Math.ceil(upgrade.baseCost * Math.pow(upgrade.multiplier, purchases) * discount);
}

function canBuyUpgrade(upgrade, runtime) {
  const purchases = runtime.purchases[upgrade.id] || 0;
  return purchases < upgrade.maxPurchases && runtime.variables.money >= getUpgradeCost(upgrade, runtime);
}

function getUnlockedLevelIds() {
  const completed = new Set(save.completedLevels);
  const firstIncomplete = levelDefinitions.find((level) => !completed.has(level.id));
  return new Set([
    ...save.completedLevels,
    ...(firstIncomplete ? [firstIncomplete.id] : []),
  ]);
}

function startLevel(levelId) {
  appState.view = "level-playing";
  appState.runtime = createRuntime(levelId);
  appState.completion = null;
  render();
}

function showLevelDestination() {
  if (appState.runtime) {
    appState.view = "level-playing";
  } else if (appState.completion) {
    appState.view = "level-complete";
  } else {
    appState.view = "level-select";
  }

  render();
}

function exitLevel() {
  appState.view = "level-select";
  appState.runtime = null;
  appState.completion = null;
  render();
}

function completeLevel(runtime) {
  const level = getLevel(runtime.levelId);
  const wasViewingLevel = appState.view === "level-playing";
  const firstClear = !save.completedLevels.includes(level.id);
  const rewardMultiplier = 1 + save.metaUpgrades.rewardBoost * 0.25;
  const reward = Math.ceil(level.reward * rewardMultiplier);

  if (firstClear) {
    save.completedLevels.push(level.id);
    save.completedLevels.sort((a, b) => getLevel(a).order - getLevel(b).order);
  }

  save.fragments += reward;
  if (wasViewingLevel) {
    appState.view = "level-complete";
  }
  appState.completion = { level, reward, firstClear };
  appState.runtime = null;
  checkAchievements();
  persist();
  render();
}

function advanceLine() {
  const runtime = appState.runtime;
  if (!runtime) {
    return;
  }

  const program = getProgram(runtime);
  const instruction = program[runtime.currentLineIndex];
  instruction.run(runtime);

  if (runtime.completed) {
    completeLevel(runtime);
    return;
  }

  if (runtime.currentLineIndex < program.length - 1) {
    runtime.currentLineIndex += 1;
  } else {
    const loopStartIndex = program.findIndex((line) => line.loopStart);
    runtime.currentLineIndex = loopStartIndex;
  }

  checkAchievements();
  if (appState.view === "level-playing") {
    render();
  }
}

function buyLevelUpgrade(upgradeId) {
  const runtime = appState.runtime;
  const level = getLevel(runtime.levelId);
  const upgrade = level.upgrades.find((item) => item.id === upgradeId);

  if (!canBuyUpgrade(upgrade, runtime)) {
    return;
  }

  const cost = getUpgradeCost(upgrade, runtime);
  runtime.variables.money -= cost;
  runtime.purchases[upgrade.id] = (runtime.purchases[upgrade.id] || 0) + 1;
  upgrade.apply(runtime);
  addMetric("upgradePurchases");
  checkAchievements();
  render();
}

function buyMetaUpgrade(upgradeId) {
  const upgrade = metaUpgradeDefinitions.find((item) => item.id === upgradeId);
  const currentLevel = save.metaUpgrades[upgrade.id];
  const cost = upgrade.getCost(currentLevel);

  if (save.fragments < cost) {
    return;
  }

  save.fragments -= cost;
  save.metaUpgrades[upgrade.id] += 1;
  checkAchievements();
  persist();
  render();
}

function getMainProgram() {
  const program = [
    {
      id: "main-loop",
      source: "while True:",
      run: () => {},
    },
    {
      id: "main-gain",
      source: "    fragment += generator",
      run: () => {
        save.fragments += save.main.generator;
        save.main.totalFragmentsGenerated += save.main.generator;
      },
    },
  ];

  return program;
}

function buyMainGenerator() {
  if (save.fragments < save.main.generatorCost) {
    return;
  }

  save.fragments -= save.main.generatorCost;
  save.main.generator += 1;
  save.main.generatorCost = Math.ceil(save.main.generatorCost * 1.6);
  addMetric("upgradePurchases");
  checkAchievements();
  persist();
  render();
}

function tickMainGame() {
  const program = getMainProgram();
  const index = Math.min(save.main.currentLineIndex, program.length - 1);
  program[index].run();
  save.main.currentLineIndex = index < program.length - 1 ? index + 1 : 0;

  checkAchievements();
  persist();

  if (appState.view === "main-game") {
    render();
  }
}

function checkAchievements() {
  let changed = false;
  achievementDefinitions.forEach((achievement) => {
    if (!save.achievements[achievement.id] && achievement.isUnlocked()) {
      save.achievements[achievement.id] = true;
      save.fragments += achievement.reward;
      changed = true;
    }
  });

  if (changed) {
    persist();
  }
}

function resetSave() {
  if (!confirm("確定要清除所有存檔嗎？")) {
    return;
  }

  save = structuredClone(defaultSave);
  appState = { view: "level-select", runtime: null, completion: null };
  persist();
  render();
}

function render() {
  app.innerHTML = `
    <div class="app-frame">
      ${renderTopbar()}
      ${renderScreen()}
    </div>
  `;
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <p class="eyebrow">Python Incremental</p>
        <h1>程式碼驅動的放置遊戲</h1>
      </div>
      <div class="top-actions">
        <span class="resource-pill">fragments <span class="mono">${formatNumber(save.fragments)}</span></span>
        <button class="secondary-button" data-action="show-levels" type="button">選關</button>
        <button class="secondary-button" data-action="show-main" type="button">主線</button>
        <button class="danger-button" data-action="reset-save" type="button">重置</button>
      </div>
    </header>
  `;
}

function renderScreen() {
  if (appState.view === "level-playing") {
    return renderLevelScreen();
  }

  if (appState.view === "level-complete") {
    return renderCompletionScreen();
  }

  if (appState.view === "main-game") {
    return renderMainScreen();
  }

  return renderLevelSelectScreen();
}

function renderLevelSelectScreen() {
  const unlocked = getUnlockedLevelIds();
  return `
    <main class="screen">
      <section class="section-header">
        <div>
          <p class="eyebrow">Level Select</p>
          <h2>選擇關卡</h2>
          <p>可以重玩已破關的關卡，也可以挑戰目前最小的未破關關卡。</p>
        </div>
      </section>
      <div class="card-grid">
        ${levelDefinitions
          .map((level) => renderLevelCard(level, unlocked.has(level.id)))
          .join("")}
      </div>
      <section class="section-header" style="margin-top: 30px;">
        <div>
          <p class="eyebrow">Achievements</p>
          <h2>成就</h2>
        </div>
      </section>
      <div class="achievement-grid">
        ${achievementDefinitions.map(renderAchievement).join("")}
      </div>
    </main>
  `;
}

function renderLevelCard(level, unlocked) {
  const completed = save.completedLevels.includes(level.id);
  return `
    <article class="level-card ${unlocked ? "" : "locked"}">
      <div>
        <p class="eyebrow">Level ${level.order}</p>
        <h3>${level.title}</h3>
        <p>${level.summary}</p>
        <div class="badge-row">
          <span class="badge ${completed ? "complete" : ""}">${completed ? "已破關" : "未破關"}</span>
          <span class="badge reward">獎勵 ${level.reward} fragments</span>
        </div>
      </div>
      <button class="${unlocked ? "primary-button" : "secondary-button"}" data-action="start-level" data-level-id="${level.id}" type="button" ${unlocked ? "" : "disabled"}>
        ${completed ? "重玩" : unlocked ? "開始" : "鎖定"}
      </button>
    </article>
  `;
}

function renderLevelScreen() {
  const runtime = appState.runtime;
  const level = getLevel(runtime.levelId);
  const program = getProgram(runtime);

  return `
    <main class="game-shell">
      <section class="ide-panel" aria-label="Python IDE">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Python IDE</p>
            <h2>${level.title}</h2>
          </div>
          <div class="runtime-status" aria-live="polite">
            <span class="status-dot"></span>
            每秒執行一行
          </div>
        </header>
        <div class="stats">
          ${Object.entries(runtime.variables)
            .map(([key, value]) => renderStat(key, value))
            .join("")}
        </div>
        <pre class="code-window" aria-label="正在執行的程式碼"><code class="code-lines">${program
          .map((line, index) => renderCodeLine(line, index, runtime.currentLineIndex))
          .join("")}</code></pre>
      </section>
      <aside class="shop-panel" aria-label="升級商店">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Shop</p>
            <h3>升級商店</h3>
          </div>
          <button class="danger-button" data-action="exit-level" type="button">退出關卡</button>
        </header>
        <div class="upgrade-list">
          ${level.upgrades.map((upgrade) => renderLevelUpgrade(upgrade, runtime)).join("")}
        </div>
      </aside>
    </main>
  `;
}

function renderStat(key, value) {
  return `
    <div class="stat">
      <span class="stat-label">${key}</span>
      <strong>${formatNumber(value)}</strong>
    </div>
  `;
}

function renderCodeLine(line, index, activeIndex) {
  const activeClass = index === activeIndex ? " active" : "";
  return `<span class="code-line${activeClass}"><span class="line-number">${index + 1}</span><span class="line-source">${line.source}</span></span>`;
}

function renderLevelUpgrade(upgrade, runtime) {
  const purchases = runtime.purchases[upgrade.id] || 0;
  const owned = purchases >= upgrade.maxPurchases;
  const cost = getUpgradeCost(upgrade, runtime);
  const disabled = owned || runtime.variables.money < cost;

  return `
    <article class="upgrade ${owned ? "owned" : ""}">
      <div>
        <h3>${upgrade.title}</h3>
        <p>${upgrade.description}</p>
        <span class="upgrade-meta">${owned ? "已完成" : upgrade.repeatable ? `已購買 ${purchases} 次` : "一次性升級"}</span>
      </div>
      <button data-action="buy-level-upgrade" data-upgrade-id="${upgrade.id}" type="button" ${disabled ? "disabled" : ""}>
        ${owned ? "完成" : `購買 ${formatNumber(cost)}`}
      </button>
    </article>
  `;
}

function renderCompletionScreen() {
  const completion = appState.completion;
  return `
    <main class="screen">
      <section class="completion-panel">
        <p class="eyebrow">Level Complete</p>
        <h2>${completion.level.title}</h2>
        <p>${completion.firstClear ? "首次破關，新的關卡已解鎖。" : "重玩完成，再次取得通關獎勵。"}</p>
        <div class="badge-row">
          <span class="badge reward">取得 ${formatNumber(completion.reward)} fragments</span>
        </div>
        <div class="button-row" style="margin-top: 20px;">
          <button class="primary-button" data-action="exit-level" type="button">回到選關</button>
          <button class="secondary-button" data-action="show-main" type="button">前往主線</button>
        </div>
      </section>
    </main>
  `;
}

function renderMainScreen() {
  const program = getMainProgram();

  return `
    <main class="game-shell">
      <section class="ide-panel" aria-label="主線 Python IDE">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Main Incremental</p>
            <h2>主線程式</h2>
          </div>
          <div class="runtime-status" aria-live="polite">
            <span class="status-dot"></span>
            每秒執行一行
          </div>
        </header>
        <div class="stats">
          ${renderStat("fragment", save.fragments)}
          ${renderStat("generator", save.main.generator)}
          ${renderStat("total", save.main.totalFragmentsGenerated)}
        </div>
        <pre class="code-window" aria-label="主線執行中的程式碼"><code class="code-lines">${program
          .map((line, index) => renderCodeLine(line, index, save.main.currentLineIndex))
          .join("")}</code></pre>
      </section>
      <aside class="shop-panel" aria-label="主線升級商店">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Program Shop</p>
            <h3>主線升級</h3>
          </div>
          <button class="secondary-button" data-action="show-levels" type="button">回到選關</button>
        </header>
        <div class="upgrade-list">
          <article class="upgrade">
            <div>
              <h3>提高 generator</h3>
              <p>立即執行 <code>generator += 1</code>。</p>
              <span class="upgrade-meta">目前 ${formatNumber(save.main.generator)}</span>
            </div>
            <button data-action="buy-generator" type="button" ${save.fragments < save.main.generatorCost ? "disabled" : ""}>
              購買 ${formatNumber(save.main.generatorCost)}
            </button>
          </article>
        </div>
        <header class="panel-header subsection-header">
          <div>
            <p class="eyebrow">Meta Progression</p>
            <h3>局外成長</h3>
          </div>
        </header>
        <div class="upgrade-list">
          ${metaUpgradeDefinitions.map(renderMetaUpgrade).join("")}
        </div>
      </aside>
    </main>
  `;
}

function renderMetaUpgrade(upgrade) {
  const level = save.metaUpgrades[upgrade.id];
  const cost = upgrade.getCost(level);

  return `
    <article class="upgrade">
      <div>
        <h3>${upgrade.title}</h3>
        <p>${upgrade.description}</p>
        <span class="upgrade-meta">等級 ${level}</span>
      </div>
      <button data-action="buy-meta-upgrade" data-upgrade-id="${upgrade.id}" type="button" ${save.fragments < cost ? "disabled" : ""}>
        升級 ${formatNumber(cost)}
      </button>
    </article>
  `;
}

function renderAchievement(achievement) {
  const unlocked = Boolean(save.achievements[achievement.id]);
  return `
    <article class="achievement ${unlocked ? "unlocked" : ""}">
      <h3>${achievement.title}</h3>
      <p>${achievement.description}</p>
      <div class="badge-row">
        <span class="badge ${unlocked ? "complete" : ""}">${unlocked ? "已完成" : "未完成"}</span>
        <span class="badge reward">+${achievement.reward} fragments</span>
      </div>
    </article>
  `;
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;

  if (action === "show-levels") {
    showLevelDestination();
  }

  if (action === "show-main") {
    appState.view = "main-game";
    render();
  }

  if (action === "exit-level") {
    exitLevel();
  }

  if (action === "start-level") {
    startLevel(button.dataset.levelId);
  }

  if (action === "buy-level-upgrade") {
    buyLevelUpgrade(button.dataset.upgradeId);
  }

  if (action === "buy-meta-upgrade") {
    buyMetaUpgrade(button.dataset.upgradeId);
  }

  if (action === "buy-generator") {
    buyMainGenerator();
  }

  if (action === "reset-save") {
    resetSave();
  }
});

checkAchievements();
persist();
render();
setInterval(() => {
  advanceLine();
  tickMainGame();
}, 1000);
