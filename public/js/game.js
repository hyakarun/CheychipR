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
  baseAttackInterval: 60, // デフォルト値（ロード後に上書き）
  range: 150,
  width: 30,
  height: 30,
};

// ゲーム内管理変数
let enemies = [];
const lanes = [0.25, 0.5, 0.75];
let spawnTimer = 0;
let masterData = null; // ここにスプレッドシートのデータが入る

// --- 初期化 ---
async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // 1. マスタデータの読み込み
  try {
    const res = await fetch("../data/master_data.json?v=" + Date.now()); // キャッシュ回避
    if (res.ok) {
      masterData = await res.json();
      console.log("Master Data Loaded:", masterData);
      applyConfig(); // 設定を反映
    } else {
      console.error("Master data not found.");
    }
  } catch (e) {
    console.error("Fetch Error:", e);
  }

  // 初回計算
  calcBattleStats();
  updateUI();
  requestAnimationFrame(gameLoop);
}

// 設定値の反映
function applyConfig() {
  if (!masterData || !masterData.config) return;
  const c = masterData.config;

  // シートに 'base_atk_interval' があれば上書き
  if (c.base_atk_interval)
    player.baseAttackInterval = Number(c.base_atk_interval);

  // 必要なら他の初期値もここで設定
}

// データの取得ヘルパー
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

  // Configから係数を取得（シートになければデフォルト 2.0 などを使う）
  const strMult = getConfig("str_to_atk", 2.0);
  const vitMult = getConfig("vit_to_hp", 10);

  // ATK計算（今は単純な比例のまま）
  b.atk = Math.floor((s.str || 5) * strMult + (s.dex || 5) * 0.5);
  b.def = Math.floor((s.vit || 5) * 1.5);
  b.agi = s.agi || 5;
  b.luk = s.luk || 5;

  // HP更新
  let oldMax = player.maxHp;
  // 基礎100 + VIT補正 + レベル補正
  player.maxHp = 100 + (s.vit || 5) * vitMult + (player.lv - 1) * 20;
  if (player.maxHp > oldMax) {
    player.hp += player.maxHp - oldMax;
  }
}

// --- ゲームループ ---
function gameLoop() {
  try {
    update();
    draw();
  } catch (e) {
    console.error(e);
  }
  requestAnimationFrame(gameLoop);
}

// --- 更新処理 ---
function update() {
  // 1. 敵のスポーン
  spawnTimer++;
  // シートのスポーンレートを使う
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
        let dmg = Math.max(1, e.damage); // プレイヤーDEF計算は省略
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
          gainExp(target.exp); // 敵ごとのEXPを獲得
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

// 敵生成ロジック
function spawnEnemy() {
  let laneIdx = Math.floor(Math.random() * 3);

  // マスタデータからランダムに敵を選ぶ
  let enemyData = null;
  if (masterData && masterData.enemies && masterData.enemies.length > 0) {
    const randIdx = Math.floor(Math.random() * masterData.enemies.length);
    enemyData = masterData.enemies[randIdx];
  }

  // データがなければデフォルトのスライム
  if (!enemyData) {
    enemyData = {
      name: "Slime",
      hp: 20,
      atk: 5,
      exp: 10,
      speed: 1.0,
      color: "red",
      width: 30,
    };
  }

  enemies.push({
    x: canvas.width,
    yRatio: lanes[laneIdx],
    // 敵データ + レベル補正などを入れるならここ
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

  // ExpTableを使って次のレベルの経験値を取得
  // 現在のLvに対応する行を探す
  let nextReq = 50; // デフォルト
  let rewardSp = 3; // デフォルト

  if (masterData && masterData.exp_table) {
    // exp_tableから lv が今の lv と一致する行を探す
    const row = masterData.exp_table.find((r) => Number(r.lv) === player.lv);
    if (row) {
      nextReq = Number(row.next_exp);
      rewardSp = Number(row.reward_sp);
    } else {
      // テーブルにない高レベルになったら簡易計算
      nextReq = Math.floor(player.nextExp * 1.2);
    }
  }

  player.nextExp = nextReq;

  if (player.exp >= player.nextExp) {
    player.lv++;
    player.exp -= player.nextExp;

    // レベルアップ時の報酬SP
    // 次のレベルの行を見るか、今のレベルの報酬を見るかは設計次第
    // ここでは「レベルアップしたらそのレベルの設定SPをもらえる」とする
    player.sp += rewardSp;

    calcBattleStats();
    player.hp = player.maxHp;

    // 次のレベルの必要経験値を再取得（レベルが上がったので）
    if (masterData && masterData.exp_table) {
      const nextRow = masterData.exp_table.find(
        (r) => Number(r.lv) === player.lv
      );
      if (nextRow) player.nextExp = Number(nextRow.next_exp);
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
  }
};

// --- 描画処理 ---
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

  // プレイヤー
  ctx.fillStyle = "#3498db";
  ctx.fillRect(player.x, canvas.height * 0.5 - 15, player.width, player.height);

  // 敵
  enemies.forEach((e) => {
    let y = canvas.height * e.yRatio;
    // シートで指定された色を使う
    ctx.fillStyle = e.color;
    // シートで指定されたサイズ(width)を使う
    let w = e.width || 30;
    let h = w; // 正方形とする
    ctx.fillRect(e.x, y - h / 2, w, h);

    let hpPer = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = "black";
    ctx.fillRect(e.x, y + h / 2 + 5, w, 5);
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(e.x, y + h / 2 + 5, w * hpPer, 5);
  });

  // デバッグ表示
  ctx.fillStyle = "black";
  ctx.font = "14px monospace";
  if (masterData) {
    ctx.fillText("Data: Loaded", 10, 20);
  } else {
    ctx.fillText("Data: Loading...", 10, 20);
  }
}

// UI更新
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
  safeText("val-hp", player.hp);
  safeText("val-max-hp", player.maxHp);
  safeWidth("bar-hp", (player.hp / player.maxHp) * 100);
  safeText("val-exp", player.exp);
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
