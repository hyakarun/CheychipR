// --- ゲーム設定 ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const API_BASE = "api";

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
  // [修正] バトルステータスの初期値を仕様に合わせて変更（除算・減算DEFなど）
  battleStats: {
    atk: 0,
    matk: 0,
    def_div: 0,
    def_sub: 0,
    mdef_div: 0,
    mdef_sub: 0,
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
let isGameRunning = false;

const DEFAULT_ENEMIES_PER_WAVE = 5;
let fade = {
  active: false,
  state: "none",
  alpha: 0,
  speed: 0.05,
  callback: null,
};

// --- 初期化フロー ---
window.onload = async function () {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // ログイン確認
  try {
    const res = await fetch(API_BASE + "/check_session.php");
    const data = await res.json();
    if (data.status === "logged_in") {
      showGameScreen(data.email);
    }
  } catch (e) {
    console.error("通信エラー", e);
  }
};

window.doLogin = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.innerText = "";
  if (!email || !password) {
    errorEl.innerText = "入力してください";
    return;
  }
  try {
    const res = await fetch(API_BASE + "/login.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.status === "success") showGameScreen(email);
    else errorEl.innerText = data.message;
  } catch (e) {
    errorEl.innerText = "通信エラー";
  }
};

window.doRegister = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.innerText = "";
  if (!email || !password) {
    errorEl.innerText = "入力してください";
    return;
  }
  try {
    const res = await fetch(API_BASE + "/register.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.status === "success") {
      alert("登録しました！ログインします。");
      doLogin();
    } else {
      errorEl.innerText = data.message;
    }
  } catch (e) {
    errorEl.innerText = "通信エラー";
  }
};

window.doLogout = async function () {
  if (!confirm("ログアウトしますか？")) return;
  await fetch(API_BASE + "/logout.php");
  location.reload();
};

window.toggleMode = function () {
  document.getElementById("btn-group-login").classList.toggle("hidden");
  document.getElementById("btn-group-register").classList.toggle("hidden");
  const title = document.getElementById("login-title");
  title.innerText = title.innerText === "ログイン" ? "新規登録" : "ログイン";
  document.getElementById("login-error").innerText = "";
};

function showGameScreen(email) {
  document.getElementById("login-overlay").style.display = "none";
  document.getElementById("game-container").style.display = "flex";
  if (document.getElementById("user-email-display")) {
    document.getElementById("user-email-display").innerText = email;
  }
  startGame();
}

async function startGame() {
  if (isGameRunning) return;
  isGameRunning = true;

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

// --- ゲームロジック ---

function startTransition(onDarkCallback) {
  if (fade.active) return;
  fade.active = true;
  fade.state = "out";
  fade.alpha = 0;
  fade.callback = onDarkCallback;
}

function getReqKills(dData) {
  if (!dData) return DEFAULT_ENEMIES_PER_WAVE;
  const maxWave = Number(dData.wave_count || 1);
  const hasBoss = Number(dData.boss_flag || 0) === 1;
  if (hasBoss && player.currentWave === maxWave) return 1;
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
    if (!player.dungeonProgress[id])
      player.dungeonProgress[id] = {
        clearCount: 0,
        killCount: 0,
        cleared: false,
      };
    const progress = player.dungeonProgress[id];
    if (typeof progress.clearCount === "undefined") progress.clearCount = 0;

    let isUnlocked = id === 1;
    if (id > 1) {
      const prevProgress = player.dungeonProgress[id - 1];
      const prevClearCount = prevProgress ? prevProgress.clearCount || 0 : 0;
      const req = d.req_clears ? Number(d.req_clears) : 1;
      if (prevClearCount >= req) isUnlocked = true;
    }
    if (!isUnlocked) return;

    let style = "";
    if (player.currentDungeonId == id)
      style = "border: 2px solid #3498db; background:#eaf2f8;";
    const btnText = player.currentDungeonId == id ? "探索中" : "移動";
    const btnDisabled = player.currentDungeonId == id ? "disabled" : "";
    const statusText = `<span style="color:#e67e22">Clear: ${progress.clearCount}</span>`;

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
  startTransition(() => {
    player.currentDungeonId = dungeonId;
    player.currentWave = 1;
    player.killsInWave = 0;
    enemies = [];
    damageTexts = [];
    initDungeonList();
    saveGame();
  });
};

window.switchScreen = function (screenName) {
  document
    .querySelectorAll(".screen-content")
    .forEach((el) => (el.style.display = "none"));
  document
    .querySelectorAll(".menu-item")
    .forEach((el) => el.classList.remove("active"));
  const ts = document.getElementById("screen-" + screenName);
  if (ts) ts.style.display = "block";
  const tm = document.getElementById("menu-" + screenName);
  if (tm) tm.classList.add("active");
  if (screenName === "dungeon") initDungeonList();
};

window.resetGame = function () {
  if (
    confirm(
      "本当にデータを削除して最初からやり直しますか？\n（この操作は取り消せません）"
    )
  ) {
    localStorage.removeItem("cc_save_data");
    location.reload();
  }
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
  if (canvas.width === 0) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight * 0.2;
  }
}

// [修正] 仕様書通りのステータス計算式へ更新
function calcBattleStats() {
  const s = player.stats;
  const b = player.battleStats;
  const lv = player.lv;

  // --- 1. HP計算 ---
  // 仕様: 基本100 + (Lv-1)*10 + VIT*5
  const vitVal = s.vit || 0;
  player.maxHp = 100 + (lv - 1) * 10 + vitVal * 5;

  if (player.hp > player.maxHp) player.hp = player.maxHp;
  if (player.hp <= 0) player.hp = player.maxHp;

  // ステータス値の安全な取得
  const strVal = s.str || 0;
  const intVal = s.int || 0;
  const dexVal = s.dex || 0;
  const agiVal = s.agi || 0;
  const lukVal = s.luk || 0;

  // --- ATK (物理攻撃力) ---
  // 仕様: STR/2 + LUK*0.1
  b.atk = Math.floor(strVal / 2 + lukVal * 0.1);

  // --- MATK (魔法攻撃力) ---
  // 仕様: INT/2 + LUK*0.1
  b.matk = Math.floor(intVal / 2 + lukVal * 0.1);

  // --- DEF (物理防御力) ---
  // NN(除算): 装備分（未実装のため0）
  b.def_div = 0;
  // MM(減算): VIT*3
  b.def_sub = Math.floor(vitVal * 3);

  // --- MDEF (魔法防御力) ---
  // NN(除算): 装備分（未実装のため0）
  b.mdef_div = 0;
  // MM(減算): INT*2 + VIT*0.5
  b.mdef_sub = Math.floor(intVal * 2 + vitVal * 0.5);

  // --- HIT (命中力) ---
  // 仕様: DEX*1 + LUK*0.2
  b.hit = Math.floor(dexVal * 1 + lukVal * 0.2);

  // --- EVA (回避力) ---
  // 仕様: AGI*1 + LUK*0.2
  b.eva = Math.floor(agiVal * 1 + lukVal * 0.2);

  // --- RCI (クリティカル頻度) ---
  // 仕様: LUK*1
  b.cri = Math.floor(lukVal * 1);

  // --- RES (状態異常抵抗) ---
  // 仕様: VIT*0.5 + LUK*0.2
  b.res = Math.floor(vitVal * 0.5 + lukVal * 0.2);
}

// [修正] ダメージ計算関数（除算DEFの計算を含む）
function calculateDamage(atk, divDef, subDef) {
  // 1. 除算DEF(NN)による軽減
  // 仕様: 「除算DEFの平方根の平方根」% 減らす（小数点第3位未満切り捨て）
  let reductionPercent = 0;
  if (divDef > 0) {
    let root1 = Math.sqrt(divDef);
    let root2 = Math.sqrt(root1);
    reductionPercent = Math.floor(root2 * 100) / 100;
  }

  // 軽減後のATK
  let reducedAtk = (atk * (100 - reductionPercent)) / 100;

  // 2. 減算DEF(MM)による減算
  let finalDmg = reducedAtk - subDef;

  // 最低ダメージ1保証
  return Math.max(1, Math.floor(finalDmg));
}

function saveGame() {
  player.lastLogin = Date.now();
  localStorage.setItem("cc_save_data", JSON.stringify(player));
}

function loadGame() {
  const saveData = localStorage.getItem("cc_save_data");
  if (saveData) {
    try {
      const loadedPlayer = JSON.parse(saveData);
      player = { ...player, ...loadedPlayer };
    } catch (e) {
      console.error(e);
    }
  }
  if (!player.currentDungeonId) player.currentDungeonId = 1;
  if (!player.dungeonProgress) player.dungeonProgress = {};
  // データ不整合修正
  if (typeof player.battleStats.atk === "undefined") calcBattleStats();
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
    // [注意] ここのagi参照はstats.agiかbattleStats.evaか仕様次第ですが
    // いったん元のロジック維持のため player.stats.agi を使うよう修正推奨
    // ※今回は仕様書範囲外なので元のままにしますが、battleStats.agiは削除したので注意。
    // 安全策として stats.agi を見るように変更しておきます。
    let agiVal = player.stats.agi || 5;
    atkInterval = Math.max(20, player.baseAttackInterval - agiVal * agiRed);

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
    }
  }
  player.lastLogin = now;
}

function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (fade.active) updateFade();
  if (isPaused) return;
  try {
    if (!fade.active || fade.state === "in") {
      update();
    }
    draw();
  } catch (e) {
    console.error(e);
  }
}

function updateFade() {
  if (fade.state === "out") {
    fade.alpha += fade.speed;
    if (fade.alpha >= 1) {
      fade.alpha = 1;
      if (fade.callback) {
        fade.callback();
        fade.callback = null;
      }
      fade.state = "wait";
      setTimeout(() => {
        fade.state = "in";
      }, 300);
    }
  } else if (fade.state === "in") {
    fade.alpha -= fade.speed;
    if (fade.alpha <= 0) {
      fade.alpha = 0;
      fade.active = false;
      fade.state = "none";
    }
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
  const dData = getDungeonData(player.currentDungeonId);

  // 敵スポーン
  if (dData) {
    const maxWave = Number(dData.wave_count || 1);
    const hasBoss = Number(dData.boss_flag || 0) === 1;
    const reqKills = getReqKills(dData);
    const spawnedCount = player.killsInWave + enemies.length;
    if (hasBoss && player.currentWave === maxWave) {
      if (spawnedCount < 1 && enemies.length === 0) {
        spawnEnemy();
        spawnTimer = 0;
      }
    } else {
      if (spawnedCount < reqKills && spawnTimer > rate) {
        spawnEnemy();
        spawnTimer = 0;
      }
    }
  }

  // 敵の行動
  for (let i = enemies.length - 1; i >= 0; i--) {
    let e = enemies[i];
    let dist = e.x - (player.x + player.width);

    if (dist <= e.range && dist > -100) {
      e.state = "attack";
      e.attackTimer++;
      if (e.attackTimer > e.attackInterval) {
        // [修正] プレイヤーが受けるダメージ計算に防御力を適用
        let dmg = calculateDamage(
          e.damage,
          player.battleStats.def_div,
          player.battleStats.def_sub
        );
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

  // プレイヤー攻撃速度の計算 (AGIによる短縮)
  let agiRed = getConfig("agi_reduction", 0.2);
  let agiVal = player.stats.agi || 5;
  let currentInterval = Math.max(
    20,
    player.baseAttackInterval - agiVal * agiRed
  );
  player.attackTimer++;

  // プレイヤーの攻撃
  if (player.attackTimer > currentInterval) {
    let target = null;
    let minDist = 9999;
    for (let e of enemies) {
      let dist = e.x - player.x;
      if (dist > -100 && dist < player.range + 50 && dist < minDist) {
        target = e;
        minDist = dist;
      }
    }

    if (target) {
      // 敵へのダメージ（敵の防御は現状0として計算）
      let dmg = calculateDamage(player.battleStats.atk, 0, 0);

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
          handleEnemyKill(target);
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

function handleEnemyKill(enemy) {
  if (enemy.isBoss) {
    startTransition(() => {
      dungeonClearLogic();
    });
    return;
  }
  player.killsInWave++;
  const dData = getDungeonData(player.currentDungeonId);
  if (!dData) return;
  const reqKills = getReqKills(dData);
  if (player.killsInWave >= reqKills) {
    player.currentWave++;
    player.killsInWave = 0;
    enemies = [];
    damageTexts = [];
    const maxWave = Number(dData.wave_count || 1);
    const hasBoss = Number(dData.boss_flag || 0) === 1;
    if (!hasBoss && player.currentWave > maxWave) {
      startTransition(() => {
        dungeonClearLogic();
      });
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

function dungeonClearLogic() {
  spawnDamageText(
    canvas.width / 2,
    canvas.height / 2,
    "DUNGEON CLEAR!",
    "#f1c40f"
  );
  const dId = player.currentDungeonId;
  if (!player.dungeonProgress[dId]) {
    player.dungeonProgress[dId] = {
      clearCount: 0,
      killCount: 0,
      cleared: false,
    };
  }
  player.dungeonProgress[dId].clearCount++;
  player.dungeonProgress[dId].cleared = true;
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
      speed: 1.0,
      color: "purple",
      width: 60,
    };
  let laneIdx = 1;
  enemies.push({
    x: canvas.width,
    yRatio: lanes[laneIdx],
    hp: Number(enemyData.hp) * 2 || 100,
    maxHp: Number(enemyData.hp) * 2 || 100,
    damage: Number(enemyData.atk) || 5,
    exp: Number(enemyData.exp) * 5 || 50,
    speed: Number(enemyData.speed) || 1.0,
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
    hp: Number(enemyData.hp) || 10,
    maxHp: Number(enemyData.hp) || 10,
    damage: Number(enemyData.atk) || 1,
    exp: Number(enemyData.exp) || 1,
    speed: Number(enemyData.speed) || 1.0,
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
  const dData = getDungeonData(player.currentDungeonId);
  if (dData) {
    ctx.fillStyle = "black";
    ctx.font = "16px Arial";
    const maxWave = Number(dData.wave_count || 1);
    const reqKills = getReqKills(dData);
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
  if (fade.active) {
    ctx.fillStyle = `rgba(0, 0, 0, ${fade.alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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

  safeText("val-atk", player.battleStats.atk);
  safeText("val-matk", player.battleStats.matk);
  safeText(
    "val-def",
    `${player.battleStats.def_div} + ${player.battleStats.def_sub}`
  );
  safeText(
    "val-mdef",
    `${player.battleStats.mdef_div} + ${player.battleStats.mdef_sub}`
  );
  safeText("val-hit", player.battleStats.hit);
  safeText("val-eva", player.battleStats.eva);
  safeText("val-cri", player.battleStats.cri);
  safeText("val-res", player.battleStats.res);

  const btns = document.querySelectorAll(".btn-plus");
  btns.forEach((btn) => {
    if (player.sp > 0) btn.classList.add("active");
    else btn.classList.remove("active");
  });
}
