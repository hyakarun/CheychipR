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
  // ★追加: 現在のダンジョンIDと攻略状況
  currentDungeonId: 1,
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

// 1ステージのクリアに必要な撃破数
const KILLS_TO_CLEAR = 10;

// --- 初期化 ---
async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  try {
    const res = await fetch("../data/master_data.json?v=" + Date.now());
    if (res.ok) {
      masterData = await res.json();
      applyConfig();
      // ★追加: データ読み込み後にリストを作る
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

// ★★★ ここがダンジョンリストを表示するコードです ★★★
function initDungeonList() {
    if (!masterData || !masterData.dungeons) return;
    
    const listEl = document.querySelector('.dungeon-list');
    if (!listEl) return;
    listEl.innerHTML = ""; 

    // ID順にソート
    const sortedDungeons = masterData.dungeons.sort((a, b) => Number(a.id) - Number(b.id));

    sortedDungeons.forEach(d => {
        const id = Number(d.id);
        
        // 進捗状況の取得
        if (!player.dungeonProgress[id]) {
            player.dungeonProgress[id] = { killCount: 0, cleared: false };
        }
        const progress = player.dungeonProgress[id];
        const prevProgress = player.dungeonProgress[id - 1];

        // ★修正点：表示条件の判定
        // 1. ID=1 は無条件で表示
        // 2. それ以外は「前のダンジョンをクリアしている」場合のみ表示
        // （つまり、挑戦権がないダンジョンは画面に出さない）
        let isVisible = (id === 1);
        if (id > 1) {
            if (prevProgress && prevProgress.cleared) isVisible = true;
        }

        // 非表示なら要素を作らずスキップ
        if (!isVisible) return;

        // クリア済みかどうか
        const isCleared = progress.cleared;
        const currentKills = progress.killCount;
        const percent = Math.min(100, (currentKills / KILLS_TO_CLEAR) * 100);
        
        // クラス設定
        let classes = "dungeon-item";
        if (isCleared) classes += " cleared";
        
        // 枠線（選択中）
        let style = "";
        if (player.currentDungeonId == id) style = "border: 2px solid #3498db; background:#eaf2f8;";

        const btnText = (player.currentDungeonId == id) ? "探索中" : "移動";
        const btnDisabled = (player.currentDungeonId == id) ? "disabled" : "";
        const statusText = isCleared ? "★CLEAR!" : `${currentKills}/${KILLS_TO_CLEAR}`;

        const div = document.createElement('div');
        div.className = classes;
        div.style = style;
        div.innerHTML = `
            <h4>${d.name}</h4>
            <div class="dungeon-info">
                <div>Lv.${d.req_lv}〜</div>
                <div style="color:${isCleared ? '#f39c12':'#7f8c8d'}">${statusText}</div>
            </div>
            <div class="prog-container">
                <div class="prog-fill" style="width: ${percent}%;"></div>
            </div>
            <button onclick="changeDungeon(${id})" ${btnDisabled}>${btnText}</button>
        `;
        listEl.appendChild(div);
    });
}

// ★追加: ダンジョン移動
window.changeDungeon = function (dungeonId) {
  if (player.currentDungeonId == dungeonId) return;
  player.currentDungeonId = dungeonId;
  enemies = []; // 敵を一掃
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

  // ダンジョン画面を開いた時にリストを更新
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
  // ロード後の初期化チェック
  if (!player.currentDungeonId) player.currentDungeonId = 1;
  if (!player.dungeonProgress) player.dungeonProgress = {};
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

      // ★追加: オフライン時のキル数加算
      const dId = player.currentDungeonId;
      if (!player.dungeonProgress[dId])
        player.dungeonProgress[dId] = { killCount: 0, cleared: false };
      player.dungeonProgress[dId].killCount += killCount;
      if (player.dungeonProgress[dId].killCount >= KILLS_TO_CLEAR) {
        player.dungeonProgress[dId].cleared = true;
        player.dungeonProgress[dId].killCount = KILLS_TO_CLEAR;
      }
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
  if (spawnTimer > rate) {
    spawnEnemy();
    spawnTimer = 0;
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

          // ★追加: キルカウント加算処理
          const dId = player.currentDungeonId;
          if (!player.dungeonProgress[dId])
            player.dungeonProgress[dId] = { killCount: 0, cleared: false };

          if (!player.dungeonProgress[dId].cleared) {
            player.dungeonProgress[dId].killCount++;
            if (player.dungeonProgress[dId].killCount >= KILLS_TO_CLEAR) {
              player.dungeonProgress[dId].cleared = true;
              spawnDamageText(
                canvas.width / 2,
                canvas.height / 2,
                "DUNGEON CLEAR!",
                "#f1c40f"
              );
              initDungeonList(); // 解放状況を更新
            } else {
              initDungeonList(); // プログレスバーを更新
            }
          }
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

// ★修正: 現在のダンジョンIDに対応する敵を出す
function spawnEnemy() {
  let laneIdx = Math.floor(Math.random() * 3);

  let currentDungeon = null;
  if (masterData && masterData.dungeons) {
    currentDungeon = masterData.dungeons.find(
      (d) => Number(d.id) === player.currentDungeonId
    );
  }

  let allowedEnemyIds = [];
  if (currentDungeon && currentDungeon.enemy_ids) {
    allowedEnemyIds = String(currentDungeon.enemy_ids)
      .split(",")
      .map((s) => Number(s));
  } else if (masterData && masterData.enemies) {
    allowedEnemyIds = masterData.enemies.map((e) => Number(e.id));
  }

  let targetId = null;
  if (allowedEnemyIds.length > 0) {
    targetId =
      allowedEnemyIds[Math.floor(Math.random() * allowedEnemyIds.length)];
  }

  let enemyData = null;
  if (targetId && masterData && masterData.enemies) {
    enemyData = masterData.enemies.find((e) => Number(e.id) === targetId);
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
    image: enemyData.image || null,
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
