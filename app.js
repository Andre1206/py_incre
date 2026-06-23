const SAVE_KEY = "python-incremental-save-v2";
const TICK_MS = 1000;
const MAX_CATCH_UP_MS = 24 * 60 * 60 * 1000;
const CATCH_UP_BATCH_SIZE = 2000;

const app = document.querySelector("#app");

const defaultSave = {
  version: 5,
  lastTickAt: Date.now(),
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
    programLines: [
      {
        instanceId: "base-income",
        definitionId: "base-income",
        enabled: true,
      },
    ],
  },
};

let save = loadSave();
let catchUpInProgress = false;
let catchUpToken = 0;
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
    id: "self-entangled",
    title: "作繭自縛",
    description: "在商店購買升級結果還不如不買",
    reward: 20,
    isUnlocked: () => getMetric("negativeAxisUpgradePurchases") >= 1,
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

const mainCodeDefinitions = [
  {
    id: "base-income",
    title: "基礎收益",
    description: "依照 generator 取得 fragments。",
    source: "    fragment += generator",
    cost: 0,
    purchasable: false,
    run: () => {
      addMainFragments(save.main.generator);
    },
  },
  {
    id: "generator-growth",
    title: "Generator 自增",
    description: "每次執行有 1% 機率讓 generator 增加 0.1。",
    source: "    generator += 0.1 if random.random() < 0.01 else 0",
    cost: 40,
    purchasable: true,
    run: () => {
      if (Math.random() < 0.01) {
        save.main.generator += 0.1;
      }
    },
  },
  {
    id: "bonus-income",
    title: "額外收益",
    description: "再取得一次 generator 的部分收益。",
    source: "    fragment += generator * 0.5",
    cost: 120,
    purchasable: true,
    run: () => {
      addMainFragments(save.main.generator * 0.5);
    },
  },
  {
    id: "compound-generator",
    title: "遞減 Generator 成長",
    description: "generator 越高，每次執行獲得的增加量越少。",
    source: "    generator += 1 / (generator ** 2)",
    cost: 300,
    purchasable: true,
    run: () => {
      save.main.generator += 1 / Math.pow(save.main.generator, 2);
    },
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
        "加入 multiplier += y。",
        160,
        "money += x * multiplier",
        addLine("multiplier", "y"),
        {
          variables: { y: 0.02 },
          extraLines: [
            { afterSource: "multiplier = 1", line: setLine("y", 0.02) },
          ],
        },
      ),
      addVariableUpgrade("y-plus", "提高 y", "立即讓 y 增加 0.01。", 200, "y", 0.01, {
        repeatable: true,
        multiplier: 1.75,
        requires: "mult-growth",
        lockedText: "先購買倍率自增",
      }),
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
  {
    id: "level-6",
    order: 6,
    title: "第六關：模數循環",
    summary: "觀察 res 在模數 k 中形成循環，調整 k 與 multiplier 累積通關資金。",
    reward: 110,
    variables: { money: 0, res: 1, k: 3, multiplier: 1 },
    lines: [
      setLine("res", 1),
      setLine("k", 3),
      setLine("multiplier", 1),
      whileLine(),
      moduloAssignmentLine("res", 2, "k", "res = (res * 2) % k"),
      formulaLine("money", "res", "multiplier", "money += res * multiplier"),
    ],
    upgrades: [
      addVariableUpgrade("k-plus", "增加 k", "立即讓 k 增加 2。", 30, "k", 2, {
        repeatable: true,
        multiplier: 1.6,
      }),
      addVariableUpgrade(
        "mod-multiplier-plus",
        "提高 multiplier",
        "立即讓 multiplier 增加 0.2。",
        45,
        "multiplier",
        0.2,
        {
          repeatable: true,
          multiplier: 1.65,
        },
      ),
      breakUpgrade(350),
    ],
  },
  {
    id: "level-7",
    order: 7,
    title: "第七關：旋轉軌跡",
    summary: "x 與 y 在平面上持續旋轉，掌握負值時機並提高 multiplier。",
    reward: 140,
    variables: { money: 0, x: 10, y: 0, multiplier: 1 },
    lines: [
      tupleSetLine({ x: 10, y: 0 }, "x, y = 10, 0"),
      setLine("multiplier", 1),
      whileLine(),
      rotationLine("x, y = 0.8 * x - 0.6 * y, 0.6 * x + 0.8 * y"),
      absoluteFormulaLine(
        "money",
        "x",
        "multiplier",
        "money += Math.abs(x) * multiplier",
      ),
    ],
    upgrades: [
      addVariableUpgrade("rotation-x-plus", "增加 x", "立即讓 x 增加 2。", 75, "x", 2, {
        repeatable: true,
        multiplier: 1.65,
        beforeApply: recordNegativeAxisPurchase("x"),
      }),
      addVariableUpgrade("rotation-y-plus", "增加 y", "立即讓 y 增加 2。", 75, "y", 2, {
        repeatable: true,
        multiplier: 1.65,
        beforeApply: recordNegativeAxisPurchase("y"),
      }),
      addVariableUpgrade(
        "rotation-multiplier-plus",
        "提高 multiplier",
        "立即讓 multiplier 增加 0.2。",
        120,
        "multiplier",
        0.2,
        {
          repeatable: true,
          multiplier: 1.7,
        },
      ),
      breakUpgrade(600),
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

    if (!Array.isArray(migratedMain.programLines) || migratedMain.programLines.length === 0) {
      migratedMain.programLines = structuredClone(defaultSave.main.programLines);
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

function tupleSetLine(values, source) {
  return {
    id: source,
    source,
    run: (runtime) => {
      Object.entries(values).forEach(([variable, value]) => {
        runtime.variables[variable] = value;
      });
      if (Object.hasOwn(values, "x")) {
        runtime.variables.x += save.metaUpgrades.starterX;
      }
    },
  };
}

function moduloAssignmentLine(target, factor, moduloVariable, source) {
  return {
    id: source,
    source: source.startsWith("    ") ? source : `    ${source}`,
    run: (runtime) => {
      runtime.variables[target] =
        (runtime.variables[target] * factor) % runtime.variables[moduloVariable];
    },
  };
}

function rotationLine(source) {
  return {
    id: source,
    source: source.startsWith("    ") ? source : `    ${source}`,
    run: (runtime) => {
      const previousX = runtime.variables.x;
      const previousY = runtime.variables.y;
      runtime.variables.x = 0.8 * previousX - 0.6 * previousY;
      runtime.variables.y = 0.6 * previousX + 0.8 * previousY;
    },
  };
}

function absoluteFormulaLine(target, valueVariable, multiplierVariable, source) {
  return {
    id: source,
    source: source.startsWith("    ") ? source : `    ${source}`,
    run: (runtime) => {
      runtime.variables[target] +=
        Math.abs(runtime.variables[valueVariable]) * runtime.variables[multiplierVariable];
    },
  };
}

function recordNegativeAxisPurchase(variable) {
  return (runtime) => {
    if (runtime.variables[variable] < -1) {
      addMetric("negativeAxisUpgradePurchases");
    }
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
    requires: options.requires || null,
    lockedText: options.lockedText || "尚未解鎖",
    beforeApply: options.beforeApply || null,
    apply: (runtime) => {
      runtime.variables[variable] += amount;
    },
  };
}

function insertLineUpgrade(id, title, description, baseCost, afterSource, line, options = {}) {
  return {
    id,
    title,
    description,
    baseCost,
    repeatable: false,
    maxPurchases: 1,
    multiplier: 1,
    apply: (runtime) => {
      Object.assign(runtime.variables, options.variables || {});
      runtime.insertedLines.push({ afterSource, line });
      runtime.insertedLines.push(...(options.extraLines || []));
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
  const requirementMet = !upgrade.requires || (runtime.purchases[upgrade.requires] || 0) > 0;
  return requirementMet && purchases < upgrade.maxPurchases && runtime.variables.money >= getUpgradeCost(upgrade, runtime);
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

function completeLevel(runtime, { deferEffects = false } = {}) {
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
  checkAchievements({ persistAfter: !deferEffects });
  if (!deferEffects) {
    persist();
    render();
  }
}

function advanceLine({ deferEffects = false } = {}) {
  const runtime = appState.runtime;
  if (!runtime) {
    return;
  }

  const program = getProgram(runtime);
  const instruction = program[runtime.currentLineIndex];
  instruction.run(runtime);

  if (runtime.completed) {
    completeLevel(runtime, { deferEffects });
    return;
  }

  if (runtime.currentLineIndex < program.length - 1) {
    runtime.currentLineIndex += 1;
  } else {
    const loopStartIndex = program.findIndex((line) => line.loopStart);
    runtime.currentLineIndex = loopStartIndex;
  }

  if (!deferEffects) {
    checkAchievements();
    if (appState.view === "level-playing") {
      render();
    }
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
  upgrade.beforeApply?.(runtime);
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
  const loopLines = save.main.programLines
    .filter((line) => line.enabled)
    .map((line) => {
      const definition = getMainCodeDefinition(line.definitionId);
      return definition
        ? {
            id: line.instanceId,
            source: definition.source,
            run: definition.run,
          }
        : null;
    })
    .filter(Boolean);

  return [
    {
      id: "main-loop",
      source: "while True:",
      run: () => {},
    },
    ...loopLines,
  ];
}

function getMainCodeDefinition(definitionId) {
  return mainCodeDefinitions.find((definition) => definition.id === definitionId);
}

function addMainFragments(amount) {
  save.fragments += amount;
  save.main.totalFragmentsGenerated += amount;
}

function resetMainProgramPointer() {
  save.main.currentLineIndex = 0;
}

function buyMainCode(definitionId, insertionIndex) {
  const definition = getMainCodeDefinition(definitionId);
  const alreadyOwned = save.main.programLines.some(
    (line) => line.definitionId === definitionId,
  );

  if (!definition?.purchasable || alreadyOwned || save.fragments < definition.cost) {
    return;
  }

  const index = Math.max(
    0,
    Math.min(Number(insertionIndex) || 0, save.main.programLines.length),
  );
  save.fragments -= definition.cost;
  save.main.programLines.splice(index, 0, {
    instanceId: definition.id,
    definitionId: definition.id,
    enabled: true,
  });
  resetMainProgramPointer();
  addMetric("upgradePurchases");
  checkAchievements();
  persist();
  render();
}

function toggleMainCodeLine(instanceId, enabled) {
  const line = save.main.programLines.find((item) => item.instanceId === instanceId);
  if (!line) {
    return;
  }

  line.enabled = enabled;
  resetMainProgramPointer();
  persist();
  render();
}

function moveMainCodeLine(instanceId, direction) {
  const currentIndex = save.main.programLines.findIndex(
    (line) => line.instanceId === instanceId,
  );
  const targetIndex = currentIndex + direction;

  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= save.main.programLines.length
  ) {
    return;
  }

  const [line] = save.main.programLines.splice(currentIndex, 1);
  save.main.programLines.splice(targetIndex, 0, line);
  resetMainProgramPointer();
  persist();
  render();
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

function tickMainGame({ deferEffects = false } = {}) {
  const program = getMainProgram();
  const index = Math.min(save.main.currentLineIndex, program.length - 1);
  program[index].run();
  save.main.currentLineIndex = index < program.length - 1 ? index + 1 : 0;

  if (deferEffects) {
    return;
  }

  checkAchievements();
  persist();
  if (appState.view === "main-game") {
    render();
  }
}

function checkAchievements({ persistAfter = true } = {}) {
  let changed = false;
  achievementDefinitions.forEach((achievement) => {
    if (!save.achievements[achievement.id] && achievement.isUnlocked()) {
      save.achievements[achievement.id] = true;
      save.fragments += achievement.reward;
      changed = true;
    }
  });

  if (changed && persistAfter) {
    persist();
  }
}

function processElapsedTime() {
  if (catchUpInProgress) {
    return;
  }

  const now = Date.now();
  let previousTickAt = Number(save.lastTickAt) || now;
  const rawElapsed = now - previousTickAt;

  if (rawElapsed < 0) {
    save.lastTickAt = now;
    persist();
    return;
  }

  if (rawElapsed > MAX_CATCH_UP_MS) {
    previousTickAt = now - MAX_CATCH_UP_MS;
    save.lastTickAt = previousTickAt;
  }

  let remainingTicks = Math.floor((now - previousTickAt) / TICK_MS);
  if (remainingTicks <= 0) {
    return;
  }

  catchUpInProgress = true;
  const token = ++catchUpToken;

  function runBatch() {
    if (token !== catchUpToken) {
      return;
    }

    const batchSize = Math.min(remainingTicks, CATCH_UP_BATCH_SIZE);
    for (let index = 0; index < batchSize; index += 1) {
      advanceLine({ deferEffects: true });
      tickMainGame({ deferEffects: true });
    }

    remainingTicks -= batchSize;
    save.lastTickAt += batchSize * TICK_MS;
    persist();

    if (remainingTicks > 0) {
      setTimeout(runBatch, 0);
      return;
    }

    catchUpInProgress = false;
    checkAchievements({ persistAfter: false });
    persist();
    if (appState.view === "main-game") {
      updateMainRuntimeView();
    } else {
      render();
    }
  }

  runBatch();
}

function resetSave() {
  if (!confirm("確定要清除所有存檔嗎？")) {
    return;
  }

  save = structuredClone(defaultSave);
  save.lastTickAt = Date.now();
  catchUpToken += 1;
  catchUpInProgress = false;
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
        <span class="resource-pill">fragments <span class="mono" data-role="topbar-fragments">${formatNumber(save.fragments)}</span></span>
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
          ${level.upgrades
            .filter((upgrade) => !upgrade.requires || (runtime.purchases[upgrade.requires] || 0) > 0)
            .map((upgrade) => renderLevelUpgrade(upgrade, runtime))
            .join("")}
        </div>
      </aside>
    </main>
  `;
}

function renderStat(key, value) {
  return `
    <div class="stat">
      <span class="stat-label">${key}</span>
      <strong data-stat-key="${key}">${formatNumber(value)}</strong>
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
  const locked = upgrade.requires && !(runtime.purchases[upgrade.requires] || 0);
  const cost = getUpgradeCost(upgrade, runtime);
  const disabled = locked || owned || runtime.variables.money < cost;

  return `
    <article class="upgrade ${owned ? "owned" : ""}">
      <div>
        <h3>${upgrade.title}</h3>
        <p>${upgrade.description}</p>
        <span class="upgrade-meta">${locked ? upgrade.lockedText : owned ? "已完成" : upgrade.repeatable ? `已購買 ${purchases} 次` : "一次性升級"}</span>
      </div>
      <button data-action="buy-level-upgrade" data-upgrade-id="${upgrade.id}" type="button" ${disabled ? "disabled" : ""}>
        ${locked ? "尚未解鎖" : owned ? "完成" : `購買 ${formatNumber(cost)}`}
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
        <pre class="code-window main-code-window" aria-label="主線執行中的程式碼"><code class="code-lines">${program
          .map((line, index) => renderCodeLine(line, index, save.main.currentLineIndex))
          .join("")}</code></pre>
        <section class="program-editor" aria-label="主線程式行管理">
          <header class="program-editor-header">
            <div>
              <p class="eyebrow">Loop Editor</p>
              <h3>迴圈程式行</h3>
            </div>
            <span class="small-meta">${save.main.programLines.length} 行</span>
          </header>
          <div class="program-line-list">
            ${renderMainProgramEditor()}
          </div>
        </section>
      </section>
      <aside class="shop-panel" aria-label="主線升級商店">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Program Shop</p>
            <h3>程式碼商店</h3>
          </div>
          <button class="secondary-button" data-action="show-levels" type="button">回到選關</button>
        </header>
        <div class="upgrade-list">
          ${mainCodeDefinitions
            .filter((definition) => definition.purchasable)
            .map(renderMainCodeShopItem)
            .join("")}
        </div>
        <header class="panel-header subsection-header">
          <div>
            <p class="eyebrow">Variable Upgrade</p>
            <h3>變數升級</h3>
          </div>
        </header>
        <div class="upgrade-list">
          <article class="upgrade">
            <div>
              <h3>提高 generator</h3>
              <p>立即執行 <code>generator += 1</code>。</p>
              <span class="upgrade-meta">目前 <span data-role="main-generator-current">${formatNumber(save.main.generator)}</span></span>
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

function renderMainProgramEditor() {
  return save.main.programLines
    .map((line, index) => {
      const definition = getMainCodeDefinition(line.definitionId);
      if (!definition) {
        return "";
      }

      return `
        <article class="program-line-item ${line.enabled ? "" : "disabled"}">
          <label class="program-line-toggle">
            <input
              type="checkbox"
              data-action="toggle-main-code"
              data-instance-id="${line.instanceId}"
              ${line.enabled ? "checked" : ""}
            >
            <span>啟用</span>
          </label>
          <code>${definition.source.trim()}</code>
          <div class="line-order-controls">
            <button
              class="icon-button"
              data-action="move-main-code"
              data-instance-id="${line.instanceId}"
              data-direction="-1"
              type="button"
              title="上移"
              aria-label="上移 ${definition.title}"
              ${index === 0 ? "disabled" : ""}
            >↑</button>
            <button
              class="icon-button"
              data-action="move-main-code"
              data-instance-id="${line.instanceId}"
              data-direction="1"
              type="button"
              title="下移"
              aria-label="下移 ${definition.title}"
              ${index === save.main.programLines.length - 1 ? "disabled" : ""}
            >↓</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMainCodeShopItem(definition) {
  const owned = save.main.programLines.some(
    (line) => line.definitionId === definition.id,
  );

  return `
    <article class="upgrade code-shop-item ${owned ? "owned" : ""}" data-code-definition-id="${definition.id}">
      <div>
        <h3>${definition.title}</h3>
        <p>${definition.description}</p>
        <code>${definition.source.trim()}</code>
      </div>
      <div class="code-purchase-controls">
        ${
          owned
            ? '<span class="upgrade-meta">已取得</span>'
            : `
              <label class="insert-position-control">
                <span>插入位置</span>
                <select data-role="main-code-position">
                  ${renderMainInsertionOptions()}
                </select>
              </label>
            `
        }
        <button data-action="buy-main-code" data-definition-id="${definition.id}" type="button" ${owned || save.fragments < definition.cost ? "disabled" : ""}>
          ${owned ? "已購買" : `購買 ${formatNumber(definition.cost)}`}
        </button>
      </div>
    </article>
  `;
}

function renderMainInsertionOptions() {
  const options = ['<option value="0">迴圈第一行</option>'];
  save.main.programLines.forEach((line, index) => {
    const definition = getMainCodeDefinition(line.definitionId);
    if (definition) {
      options.push(
        `<option value="${index + 1}">在 ${definition.source.trim()} 之後</option>`,
      );
    }
  });
  return options.join("");
}

function updateMainRuntimeView() {
  const mainScreen = app.querySelector(".game-shell");
  if (!mainScreen) {
    render();
    return;
  }

  const topbarFragments = app.querySelector('[data-role="topbar-fragments"]');
  if (topbarFragments) {
    topbarFragments.textContent = formatNumber(save.fragments);
  }

  const statValues = {
    fragment: save.fragments,
    generator: save.main.generator,
    total: save.main.totalFragmentsGenerated,
  };
  Object.entries(statValues).forEach(([key, value]) => {
    const element = mainScreen.querySelector(`[data-stat-key="${key}"]`);
    if (element) {
      element.textContent = formatNumber(value);
    }
  });

  const generatorCurrent = mainScreen.querySelector(
    '[data-role="main-generator-current"]',
  );
  if (generatorCurrent) {
    generatorCurrent.textContent = formatNumber(save.main.generator);
  }

  const program = getMainProgram();
  const renderedLines = mainScreen.querySelectorAll(
    ".main-code-window .code-line",
  );
  if (renderedLines.length !== program.length) {
    render();
    return;
  }

  renderedLines.forEach((line, index) => {
    line.classList.toggle("active", index === save.main.currentLineIndex);
  });

  const generatorButton = mainScreen.querySelector(
    'button[data-action="buy-generator"]',
  );
  if (generatorButton) {
    generatorButton.disabled = save.fragments < save.main.generatorCost;
  }

  mainScreen
    .querySelectorAll('button[data-action="buy-main-code"]')
    .forEach((button) => {
      const definition = getMainCodeDefinition(button.dataset.definitionId);
      const owned = save.main.programLines.some(
        (line) => line.definitionId === button.dataset.definitionId,
      );
      button.disabled = !definition || owned || save.fragments < definition.cost;
    });

  mainScreen
    .querySelectorAll('button[data-action="buy-meta-upgrade"]')
    .forEach((button) => {
      const upgrade = metaUpgradeDefinitions.find(
        (item) => item.id === button.dataset.upgradeId,
      );
      if (upgrade) {
        const cost = upgrade.getCost(save.metaUpgrades[upgrade.id]);
        button.disabled = save.fragments < cost;
      }
    });
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

  if (action === "buy-main-code") {
    const shopItem = button.closest("[data-code-definition-id]");
    const positionSelect = shopItem?.querySelector('[data-role="main-code-position"]');
    buyMainCode(button.dataset.definitionId, Number(positionSelect?.value || 0));
  }

  if (action === "move-main-code") {
    moveMainCodeLine(button.dataset.instanceId, Number(button.dataset.direction));
  }

  if (action === "reset-save") {
    resetSave();
  }
});

app.addEventListener("change", (event) => {
  const toggle = event.target.closest('input[data-action="toggle-main-code"]');
  if (!toggle) {
    return;
  }

  toggleMainCodeLine(toggle.dataset.instanceId, toggle.checked);
});

checkAchievements();
persist();
render();
processElapsedTime();
setInterval(processElapsedTime, 250);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    processElapsedTime();
  }
});

window.addEventListener("focus", processElapsedTime);
