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
  // 基礎ステータス
  stats: { str: 5, vit: 5, agi: 5, int: 5, dex: 5, luk: 5 },
  // 戦闘ステータス
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
};

// 敵管理
let enemies = [];
const lanes = [0.25, 0.5, 0.75];
let spawnTimer = 0;
let masterData = null;

// 管理用フラグ
let saveTimer = 0;
let isPaused = false; // 裏に行っている間は止めるためのフラグ

// --- 初期化 ---
async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // 1. マスタデータの読み込み
  try {
    const res = await fetch("../data/master_data.json?v=" + Date.now());
    if (res.ok) {
      masterData = await res.json();
      applyConfig();
    }
  } catch (e) {
    console.error(e);
  }

  // 2. セーブデータのロード
  loadGame();

  // 3. ステータス計算 & オフラインボーナス計算（初回ロード時）
  calcBattleStats();
  calculateOfflineProgress();

  updateUI();
  requestAnimationFrame(gameLoop);

  // ★追加：タブの切り替え監視イベント
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

// タブ切り替え時の処理
function handleVisibilityChange() {
  if (document.hidden) {
    // 裏に行った：セーブしてゲームを一時停止
    console.log("Tab hidden: Pausing game...");
    saveGame();
    isPaused = true;
  } else {
    // 戻ってきた：ボーナス計算して再開
    console.log("Tab visible: Resuming...");
    // 少し待ってから計算（ブラウザの復帰ラグ対策）
    setTimeout(() => {
      calculateOfflineProgress();
      isPaused = false;
    }, 100);
  }
}

// 設定反映
function applyConfig() {
  if (!masterData || !masterData.config) return;
  const c = masterData.config;
  if (c.base_atk_interval)
    player.baseAttackInterval = Number(c.base_atk_interval);
}
function getConfig(key, defVal) {
  if (masterData && masterData.config && masterData.config[key] !== undefined) {
    return Number(masterData.config[key]);
  }
  return defVal;
}

function resizeCanvas() {
  const combatArea = document.getElementById("combat-area");
  if (combatArea) {
    canvas.width = combatArea.clientWidth;
    canvas.height = combatArea.clientHeight;
  }
}

// --- ステータス計算 ---
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

// --- セーブ & ロード機能 ---
function saveGame() {
  player.lastLogin = Date.now();
  const saveData = JSON.stringify(player);
  localStorage.setItem("cc_save_data", saveData);

  // UI演出
  const btn = document.querySelector(".menu-item.active");
  if (btn) {
    let originalText = btn.innerText;
    btn.innerText = "保存中...";
    setTimeout(() => {
      btn.innerText = originalText;
    }, 1000);
  }
}

function loadGame() {
  const saveData = localStorage.getItem("cc_save_data");
  if (saveData) {
    try {
      const loadedPlayer = JSON.parse(saveData);
      player = { ...player, ...loadedPlayer };
    } catch (e) {
      console.error("Save data corrupted", e);
    }
  }
}

// --- オフラインボーナス計算 ---
function calculateOfflineProgress() {
  const now = Date.now();
  const last = player.lastLogin || now;

  // 経過秒数
  const diffSeconds = (now - last) / 1000;

  // 10秒以上裏に行っていたら計算（短すぎるとうるさいので）
  if (diffSeconds > 10) {
    let agiRed = getConfig("agi_reduction", 0.2);
    let atkInterval = Math.max(
      20,
      player.baseAttackInterval - player.battleStats.agi * agiRed
    );
    let attacksPerSec = 60 / atkInterval;

    // 簡易シミュレーション
    let avgEnemyHp = 20 + player.lv * 5;
    let avgEnemyExp = 10 + player.lv * 2;
    let myAtk = Math.max(1, player.battleStats.atk);

    let hitsToKill = Math.ceil(avgEnemyHp / myAtk);
    let secondsPerKill = (hitsToKill / attacksPerSec) * 1.2; // 1.2は索敵時間のバッファ

    let killCount = Math.floor(diffSeconds / secondsPerKill);

    if (killCount > 0) {
      let totalGainedExp = killCount * avgEnemyExp;

      // アラートで見せる
      alert(
        `【放置ボーナス】\n${Math.floor(
          diffSeconds
        )}秒経過しました。\n${killCount} 体を倒して、\n${totalGainedExp} EXP を獲得しました！`
      );

      gainExp(totalGainedExp);
    }
  }

  // 時刻更新
  player.lastLogin = now;
}

// --- ゲームループ ---
function gameLoop() {
  requestAnimationFrame(gameLoop);

  // ★追加：一時停止中は更新も描画もしない
  if (isPaused) return;

  try {
    update();
    draw();
  } catch (e) {
    console.error(e);
  }
}

// --- 更新処理 ---
function update() {
  // オートセーブ
  saveTimer++;
  if (saveTimer > 600) {
    saveGame();
    saveTimer = 0;
  }

  // 1. 敵のスポーン
  spawnTimer++;
  const rate = getConfig("spawn_rate", 100);
  if (spawnTimer > rate) {
    spawnEnemy();
    spawnTimer = 0;
  }

  // 2. 敵の行動
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
        updateUI();
      }
    } else {
      e.state = "move";
      e.x -= e.speed;
    }

    if (e.x < -50) enemies.splice(i, 1);
  }

  // 3. プレイヤーの行動
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

      if (target.hp <= 0) {
        let index = enemies.indexOf(target);
        if (index > -1) {
          enemies.splice(index, 1);
          gainExp(target.exp);
        }
      }
    }
  }

  if (player.hp <= 0) {
    player.hp = player.maxHp;
    enemies = [];
    updateUI();
  }
}

function spawnEnemy() {
  let laneIdx = Math.floor(Math.random() * 3);
  let enemyData = null;
  if (masterData && masterData.enemies && masterData.enemies.length > 0) {
    const randIdx = Math.floor(Math.random() * masterData.enemies.length);
    enemyData = masterData.enemies[randIdx];
  }
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
    range: 40,
    attackTimer: 0,
    attackInterval: 80,
    state: "move",
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
        const nextRow = masterData.exp_table.find(
          (r) => Number(r.lv) === player.lv
        );
        if (nextRow) player.nextExp = Number(nextRow.next_exp);
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
    ctx.fillStyle = e.color;
    let w = e.width || 30;
    ctx.fillRect(e.x, y - w / 2, w, w);

    let hpPer = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = "black";
    ctx.fillRect(e.x, y + w / 2 + 5, w, 5);
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(e.x, y + w / 2 + 5, w * hpPer, 5);
  });
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
