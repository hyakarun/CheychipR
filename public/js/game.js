// --- ゲーム設定 ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// プレイヤー情報
let player = {
  x: 50,
  lane: 1,
  lv: 1,
  hp: 100,
  maxHp: 100,
  exp: 0,
  nextExp: 50,
  sp: 0,
  stats: { str: 5, vit: 5, agi: 5, int: 5, dex: 5, luk: 5 },
  battleStats: {
    atk: 10,
    matk: 0,
    def: 0,
    mdef: 0,
    hit: 0,
    eva: 0,
    cri: 0,
    res: 0,
  },

  attackTimer: 0,
  baseAttackInterval: 60,
  range: 150,
  width: 30,
  height: 30,
  lastLogin: Date.now(),
  currentDungeonId: 1,
  currentWave: 1,
  killsInWave: 0,
  dungeonProgress: {},
};

let enemies = [];
let damageTexts = [];
const lanes = [0.25, 0.5, 0.75];
let spawnTimer = 0;
let masterData = null;
const imageCache = {};
let saveTimer = 0;
let isPaused = false;

// ★変更：デフォルト値（マスタ未設定時用）
const DEFAULT_ENEMIES_PER_WAVE = 5;

// --- 初期化 ---
async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  try {
    const res = await fetch("../data/master_data.json?v=" + Date.now());
    if (res.ok) {
      masterData = await res.json();
      applyConfig();
      initDungeonList();
    }
  } catch (e) {
    console.error(e);
  }

  loadGame();
  syncExpTable();
  calcBattleStats();
  calculateOfflineProgress();

  updateUI();
  requestAnimationFrame(gameLoop);
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

// ヘルパー：現在のダンジョンの設定敵数を取得
function getReqKills(dData) {
  if (!dData) return DEFAULT_ENEMIES_PER_WAVE;
  // boss_flagがあり、かつ最終ウェーブなら「1体（ボスのみ）」
  const maxWave = Number(dData.wave_count || 1);
  const hasBoss = Number(dData.boss_flag || 0) === 1;
  if (hasBoss && player.currentWave === maxWave) {
    return 1;
  }
  // それ以外は設定値（なければデフォルト）
  return Number(dData.enemies_per_wave) || DEFAULT_ENEMIES_PER_WAVE;
}

function initDungeonList() {
  if (!masterData || !masterData.dungeons) return;
  const listEl = document.querySelector(".dungeon-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  const sortedDungeons = masterData.dungeons.sort(
    (a, b) => Number(a.id) - Number(b.id)
  );

  sortedDungeons.forEach((d) => {
    const id = Number(d.id);
    if (!player.dungeonProgress[id]) {
      player.dungeonProgress[id] = { clearCount: 0 };
    }
    const progress = player.dungeonProgress[id];

    let isUnlocked = id === 1;
    if (id > 1) {
      const prevProgress = player.dungeonProgress[id - 1] || { clearCount: 0 };
      const req = d.req_clears ? Number(d.req_clears) : 1;
      if (prevProgress.clearCount >= req) isUnlocked = true;
    }

    if (!isUnlocked) return;

    const currentClears = progress.clearCount;
    let style = "";
    if (player.currentDungeonId == id)
      style = "border: 2px solid #3498db; background:#eaf2f8;";
    const btnText = player.currentDungeonId == id ? "探索中" : "移動";
    const btnDisabled = player.currentDungeonId == id ? "disabled" : "";
    const statusText = `<span style="color:#e67e22">Clear: ${currentClears}</span>`;

    const div = document.createElement("div");
    div.className = "dungeon-item";
    div.style = style;
    div.innerHTML = `
            <div class="dungeon-header">
                <h4>${d.name}</h4>
                <span class="lv-label">Lv.${d.req_lv}</span>
            </div>
            <div class="dungeon-status">
                <div class="status-text">${statusText}</div>
            </div>
            <button onclick="changeDungeon(${id})" ${btnDisabled}>${btnText}</button>
        `;
    listEl.appendChild(div);
  });
}

window.changeDungeon = function (dungeonId) {
  if (player.currentDungeonId == dungeonId) return;
  player.currentDungeonId = dungeonId;
  player.currentWave = 1;
  player.killsInWave = 0;
  enemies = [];
  initDungeonList();
  saveGame();
};

window.switchScreen = function (screenName) {
  document
    .querySelectorAll(".screen-content")
    .forEach((el) => (el.style.display = "none"));
  document
    .querySelectorAll(".menu-item")
    .forEach((el) => el.classList.remove("active"));
  const targetScreen = document.getElementById("screen-" + screenName);
  if (targetScreen) targetScreen.style.display = "block";
  const targetMenu = document.getElementById("menu-" + screenName);
  if (targetMenu) targetMenu.classList.add("active");
  if (screenName === "dungeon") initDungeonList();
};

function getImage(fileName) {
  if (!fileName) return null;
  if (imageCache[fileName]) return imageCache[fileName];
  const img = new Image();
  img.src = "images/" + fileName;
  imageCache[fileName] = img;
  return img;
}

function spawnDamageText(x, y, damage, color) {
  damageTexts.push({
    x: x,
    y: y,
    text: damage,
    color: color,
    life: 60,
    maxLife: 60,
    vy: -1.5,
  });
}

function syncExpTable() {
  if (!masterData || !masterData.exp_table) return;
  const row = masterData.exp_table.find((r) => Number(r.lv) === player.lv);
  if (row) {
    player.nextExp = Number(row.next_exp);
    if (player.exp >= player.nextExp) gainExp(0);
  }
}

function handleVisibilityChange() {
  if (document.hidden) {
    saveGame();
    isPaused = true;
  } else {
    setTimeout(() => {
      calculateOfflineProgress();
      isPaused = false;
    }, 100);
  }
}

function applyConfig() {
  if (!masterData || !masterData.config) return;
  const c = masterData.config;
  if (c.base_atk_interval)
    player.baseAttackInterval = Number(c.base_atk_interval);
}
function getConfig(key, defVal) {
  if (masterData && masterData.config && masterData.config[key] !== undefined)
    return Number(masterData.config[key]);
  return defVal;
}

function resizeCanvas() {
  const combatArea = document.getElementById("combat-area");
  if (combatArea) {
    canvas.width = combatArea.clientWidth;
    canvas.height = combatArea.clientHeight;
  }
}

function calcBattleStats() {
  const s = player.stats;
  const b = player.battleStats;
  const strMult = getConfig("str_to_atk", 2.0);
  const vitMult = getConfig("vit_to_hp", 10);
  b.atk = Math.floor((s.str || 5) * strMult + (s.dex || 5) * 0.5);
  b.def = Math.floor((s.vit || 5) * 1.5);
  b.agi = s.agi || 5;
  b.luk = s.luk || 5;
  let oldMax = player.maxHp;
  player.maxHp = 100 + (s.vit || 5) * vitMult + (player.lv - 1) * 20;
  if (player.hp > player.maxHp) player.hp = player.maxHp;
  if (player.hp <= 0) player.hp = player.maxHp;
}

function saveGame() {
  player.lastLogin = Date.now();
  localStorage.setItem("cc_save_data", JSON.stringify(player));
}

function loadGame() {
  const saveData = localStorage.getItem("cc_save_data");
  if (saveData) {
    try {
      player = { ...player, ...JSON.parse(saveData) };
    } catch (e) {
      console.error(e);
    }
  }
  if (!player.currentDungeonId) player.currentDungeonId = 1;
  if (!player.dungeonProgress) player.dungeonProgress = {};
  if (!player.currentWave) player.currentWave = 1;
  if (!player.killsInWave) player.killsInWave = 0;
}

function calculateOfflineProgress() {
  const now = Date.now();
  const last = player.lastLogin || now;
  const diffSeconds = (now - last) / 1000;
  if (diffSeconds > 10) {
    let agiRed = getConfig("agi_reduction", 0.2);
    let atkInterval = Math.max(
      20,
      player.baseAttackInterval - player.battleStats.agi * agiRed
    );
    let attacksPerSec = 60 / atkInterval;
    let avgEnemyHp = 20 + player.lv * 5;
    let avgEnemyExp = 10 + player.lv * 2;
    let myAtk = Math.max(1, player.battleStats.atk);
    let hitsToKill = Math.ceil(avgEnemyHp / myAtk);
    let secondsPerKill = (hitsToKill / attacksPerSec) * 1.2;
    let killCount = Math.floor(diffSeconds / secondsPerKill);
    if (killCount > 0) {
      let totalGainedExp = killCount * avgEnemyExp;
      console.log(
        `Offline: ${diffSeconds}s, ${killCount} kills, ${totalGainedExp} exp`
      );
      gainExp(totalGainedExp);

      // オフライン時のクリア回数計算（簡易版）
      // 本当は「10体倒したら1ウェーブ進む」などの計算が必要だが、複雑になるため
      // ここでは「キル数だけ加算して、ゲーム再開時に判定する」形にする
      // または、オフラインではクリア回数は増えない仕様にするのが安全。
      // ※今回は「増えない」仕様にしておく（トラブル防止）
    }
  }
  player.lastLogin = now;
}

function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (isPaused) return;
  try {
    update();
    draw();
  } catch (e) {
    console.error(e);
  }
}

function update() {
  saveTimer++;
  if (saveTimer > 600) {
    saveGame();
    saveTimer = 0;
  }
  spawnTimer++;
  const rate = getConfig("spawn_rate", 100);

  // 敵スポーン判定
  // ボス戦（最終ウェーブ＆ボスあり＆敵0）なら即スポーン
  const dData = getDungeonData(player.currentDungeonId);
  if (dData) {
    const maxWave = Number(dData.wave_count || 1);
    const hasBoss = Number(dData.boss_flag || 0) === 1;
    if (hasBoss && player.currentWave === maxWave && enemies.length === 0) {
      spawnEnemy();
      spawnTimer = 0;
    } else if (enemies.length === 0 && spawnTimer > rate) {
      spawnEnemy();
      spawnTimer = 0;
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    let e = enemies[i];
    let dist = e.x - (player.x + player.width);
    if (dist <= e.range && dist > -50) {
      e.state = "attack";
      e.attackTimer++;
      if (e.attackTimer > e.attackInterval) {
        let dmg = Math.max(1, e.damage);
        player.hp -= dmg;
        e.attackTimer = 0;
        let py = canvas.height * 0.5;
        spawnDamageText(player.x, py - 20, dmg, "#e74c3c");
        updateUI();
      }
    } else {
      e.state = "move";
      e.x -= e.speed;
    }
    if (e.x < -50) enemies.splice(i, 1);
  }

  let agiRed = getConfig("agi_reduction", 0.2);
  let currentInterval = Math.max(
    20,
    player.baseAttackInterval - player.battleStats.agi * agiRed
  );
  player.attackTimer++;
  if (player.attackTimer > currentInterval) {
    let target = null;
    let minDist = 9999;
    for (let e of enemies) {
      let dist = e.x - player.x;
      if (dist > -20 && dist < player.range && dist < minDist) {
        target = e;
        minDist = dist;
      }
    }
    if (target) {
      let dmg = player.battleStats.atk || 5;
      target.hp -= dmg;
      player.attackTimer = 0;
      player.x += 10;
      setTimeout(() => {
        player.x -= 10;
      }, 100);
      let ey = canvas.height * target.yRatio;
      spawnDamageText(target.x, ey - 20, dmg, "#ffffff");
      if (target.hp <= 0) {
        let index = enemies.indexOf(target);
        if (index > -1) {
          enemies.splice(index, 1);
          gainExp(target.exp);
          handleEnemyKill(target); // ★撃破処理呼び出し
        }
      }
    }
  }
  for (let i = damageTexts.length - 1; i >= 0; i--) {
    let dt = damageTexts[i];
    dt.y += dt.vy;
    dt.life--;
    if (dt.life <= 0) damageTexts.splice(i, 1);
  }
  if (player.hp <= 0) {
    player.hp = player.maxHp;
    enemies = [];
    updateUI();
  }
}

// ★敵撃破時のロジック（ウェーブ・クリア判定）
function handleEnemyKill(enemy) {
  if (enemy.isBoss) {
    dungeonClear();
    return;
  }

  player.killsInWave++;

  const dData = getDungeonData(player.currentDungeonId);
  if (!dData) return;

  // ★修正：マスタデータの enemies_per_wave を使う
  const reqKills = getReqKills(dData);

  if (player.killsInWave >= reqKills) {
    player.currentWave++;
    player.killsInWave = 0;

    const maxWave = Number(dData.wave_count || 1);
    const hasBoss = Number(dData.boss_flag || 0) === 1;

    if (!hasBoss && player.currentWave > maxWave) {
      dungeonClear();
    } else {
      spawnDamageText(
        canvas.width / 2,
        canvas.height / 2,
        "NEXT WAVE!",
        "#3498db"
      );
    }
  }
}

function dungeonClear() {
  spawnDamageText(
    canvas.width / 2,
    canvas.height / 2,
    "DUNGEON CLEAR!",
    "#f1c40f"
  );
  const dId = player.currentDungeonId;
  if (!player.dungeonProgress[dId])
    player.dungeonProgress[dId] = { clearCount: 0 };
  player.dungeonProgress[dId].clearCount++;
  player.currentWave = 1;
  player.killsInWave = 0;
  enemies = [];
  saveGame();
  initDungeonList();
}

function getDungeonData(id) {
  if (masterData && masterData.dungeons)
    return masterData.dungeons.find((d) => Number(d.id) === id);
  return null;
}

function spawnEnemy() {
  const dData = getDungeonData(player.currentDungeonId);
  if (!dData) return;

  const maxWave = Number(dData.wave_count || 1);
  const hasBoss = Number(dData.boss_flag || 0) === 1;

  if (hasBoss && player.currentWave === maxWave) {
    spawnBoss(dData);
  } else {
    spawnNormalEnemy(dData);
  }
}

function spawnBoss(dData) {
  if (enemies.length > 0) return;
  const bossId = Number(dData.boss_id);
  let enemyData = null;
  if (masterData && masterData.enemies)
    enemyData = masterData.enemies.find((e) => Number(e.id) === bossId);
  if (!enemyData)
    enemyData = {
      name: "Boss",
      hp: 100,
      atk: 20,
      exp: 50,
      speed: 0.5,
      color: "purple",
      width: 60,
    };

  let laneIdx = 1;
  enemies.push({
    x: canvas.width,
    yRatio: lanes[laneIdx],
    hp: Number(enemyData.hp) * 2,
    maxHp: Number(enemyData.hp) * 2,
    damage: Number(enemyData.atk),
    exp: Number(enemyData.exp) * 5,
    speed: Number(enemyData.speed) * 0.8,
    color: enemyData.color || "purple",
    width: (Number(enemyData.width) || 30) * 1.5,
    image: enemyData.image || null,
    range: 40,
    attackTimer: 0,
    attackInterval: 100,
    state: "move",
    isBoss: true,
  });
  spawnDamageText(
    canvas.width / 2,
    canvas.height / 2,
    "BOSS BATTLE!!",
    "#e74c3c"
  );
}

function spawnNormalEnemy(dData) {
  let laneIdx = Math.floor(Math.random() * 3);
  let allowedEnemyIds = [];
  if (dData.enemy_ids)
    allowedEnemyIds = String(dData.enemy_ids)
      .split(",")
      .map((s) => Number(s));
  else if (masterData && masterData.enemies)
    allowedEnemyIds = masterData.enemies.map((e) => Number(e.id));

  let targetId =
    allowedEnemyIds[Math.floor(Math.random() * allowedEnemyIds.length)];
  let enemyData = masterData.enemies.find((e) => Number(e.id) === targetId);
  if (!enemyData)
    enemyData = {
      name: "Slime",
      hp: 20,
      atk: 5,
      exp: 10,
      speed: 1.0,
      color: "red",
      width: 30,
    };

  enemies.push({
    x: canvas.width,
    yRatio: lanes[laneIdx],
    hp: Number(enemyData.hp),
    maxHp: Number(enemyData.hp),
    damage: Number(enemyData.atk),
    exp: Number(enemyData.exp),
    speed: Number(enemyData.speed),
    color: enemyData.color || "red",
    width: Number(enemyData.width) || 30,
    image: enemyData.image || null,
    range: 40,
    attackTimer: 0,
    attackInterval: 80,
    state: "move",
    isBoss: false,
  });
}

function gainExp(amount) {
  player.exp += amount;
  while (player.exp >= player.nextExp) {
    let nextReq = 50;
    let rewardSp = 3;
    if (masterData && masterData.exp_table) {
      const row = masterData.exp_table.find((r) => Number(r.lv) === player.lv);
      if (row) {
        nextReq = Number(row.next_exp);
        rewardSp = Number(row.reward_sp);
      } else {
        nextReq = Math.floor(player.nextExp * 1.2);
      }
    }
    player.nextExp = nextReq;
    if (player.exp >= player.nextExp) {
      player.lv++;
      player.exp -= player.nextExp;
      player.sp += rewardSp;
      calcBattleStats();
      player.hp = player.maxHp;
      if (masterData && masterData.exp_table) {
        const nr = masterData.exp_table.find((r) => Number(r.lv) === player.lv);
        if (nr) player.nextExp = Number(nr.next_exp);
      }
      initDungeonList();
    } else {
      break;
    }
  }
  updateUI();
}

window.addStat = function (statName) {
  if (player.sp > 0) {
    player.stats[statName]++;
    player.sp--;
    calcBattleStats();
    updateUI();
    saveGame();
  }
};

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#ccc";
  ctx.beginPath();
  lanes.forEach((y) => {
    let h = canvas.height * y;
    ctx.moveTo(0, h);
    ctx.lineTo(canvas.width, h);
  });
  ctx.stroke();

  ctx.fillStyle = "#3498db";
  ctx.fillRect(player.x, canvas.height * 0.5 - 15, player.width, player.height);

  enemies.forEach((e) => {
    let y = canvas.height * e.yRatio;
    let w = e.width || 30;
    let h = w;
    let img = getImage(e.image);
    if (img && img.complete && img.naturalHeight !== 0)
      ctx.drawImage(img, e.x, y - h / 2, w, h);
    else {
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x, y - h / 2, w, h);
    }
    let hpPer = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = "black";
    ctx.fillRect(e.x, y + h / 2 + 5, w, 5);
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(e.x, y + h / 2 + 5, w * hpPer, 5);
    if (e.isBoss) {
      ctx.fillStyle = "red";
      ctx.font = "bold 14px Arial";
      ctx.fillText("BOSS", e.x - 5, y - h / 2 - 5);
    }
  });

  damageTexts.forEach((dt) => {
    ctx.globalAlpha = Math.max(0, dt.life / dt.maxLife);
    ctx.fillStyle = dt.color;
    ctx.font = "bold 20px Arial";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "black";
    ctx.strokeText(dt.text, dt.x, dt.y);
    ctx.fillText(dt.text, dt.x, dt.y);
    ctx.globalAlpha = 1.0;
  });

  // ★追加：ウェーブ情報の表示
  const dData = getDungeonData(player.currentDungeonId);
  if (dData) {
    ctx.fillStyle = "black";
    ctx.font = "16px Arial";
    const maxWave = dData.wave_count || 1;
    const reqKills = getReqKills(dData);
    // ボス戦中は「BOSS」と表示、それ以外は「残り敵数」
    let progressText = `Next: ${Math.max(0, reqKills - player.killsInWave)}`;
    if (Number(dData.boss_flag) === 1 && player.currentWave === maxWave) {
      progressText = "BOSS";
    }
    ctx.fillText(
      `Wave: ${player.currentWave}/${maxWave} (${progressText})`,
      10,
      30
    );
  }
}

function safeText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}
function safeWidth(id, percent) {
  const el = document.getElementById(id);
  if (el) el.style.width = percent + "%";
}

function updateUI() {
  safeText("val-lv", player.lv);
  safeText("val-hp", Math.floor(player.hp));
  safeText("val-max-hp", player.maxHp);
  safeWidth("bar-hp", (player.hp / player.maxHp) * 100);
  safeText("val-exp", Math.floor(player.exp));
  safeText("val-next-exp", player.nextExp);
  safeWidth("bar-exp", (player.exp / player.nextExp) * 100);
  safeText("val-sp", player.sp);
  for (let key in player.stats) safeText(`val-${key}`, player.stats[key]);
  for (let key in player.battleStats)
    safeText(`val-${key}`, player.battleStats[key]);
  const btns = document.querySelectorAll(".btn-plus");
  btns.forEach((btn) => {
    if (player.sp > 0) btn.classList.add("active");
    else btn.classList.remove("active");
  });
}

init();
