import pandas as pd
import json
import os
import ssl
import sys

# MacのSSLエラー回避
ssl._create_default_https_context = ssl._create_unverified_context

# === 設定 ===
SPREADSHEET_ID = "1dTxRNuMcz4JCbh2Wp-fWxAZE814wcQOWtXdEeNW6FHE"
SHEETS = {
    "config": "0",
    "exp_table": "6688737",
    "enemies": "1383753713",
    "dungeons": "298836659"
}

OUTPUT_DIR = "public/data"
OUTPUT_FILE = "master_data.json"

# 数値として扱うべき列
NUMERIC_COLS = ["hp", "atk", "exp", "speed", "width", "req_lv", "wave_count", "boss_flag", "boss_id", "req_clears", "enemies_per_wave", "lv", "next_exp", "reward_sp"]

def get_csv_url(sheet_id, gid):
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"

def clean_df(df):
    """データフレームの掃除を行う関数"""
    # 1. 列名の空白削除 (" next_exp " -> "next_exp")
    df.columns = df.columns.str.strip()

    # 2. IDがない行を削除
    if 'id' in df.columns:
        df = df.dropna(subset=['id'])
        df = df[df['id'] != '']

    # 3. 全セルの文字データから前後の空白を削除
    df = df.map(lambda x: x.strip() if isinstance(x, str) else x)

    # 4. 数値列のクリーニング（カンマ削除して数値化）
    for col in df.columns:
        if col in NUMERIC_COLS:
            # 文字列ならカンマを消す
            if df[col].dtype == 'object':
                df[col] = df[col].astype(str).str.replace(',', '', regex=False)
            
            # 数値に変換（失敗したら0やNaNになるが、fillnaで埋める）
            df[col] = pd.to_numeric(df[col], errors='coerce')

    # 5. 空欄埋め
    df = df.fillna("")
    return df

def main():
    print("--- マスタデータの更新 ---")
    if not os.path.exists(OUTPUT_DIR): os.makedirs(OUTPUT_DIR)
    master_data = {}

    try:
        # Config
        print("Downloading GameConfig...")
        df_c = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["config"]))
        df_c = clean_df(df_c)
        master_data["config"] = {r['key']: r['value'] for _, r in df_c.iterrows() if r.get('key')}

        # ExpTable
        print("Downloading ExpTable...")
        df_exp = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["exp_table"]))
        df_exp = clean_df(df_exp)
        master_data["exp_table"] = df_exp.to_dict(orient='records')

        # Enemy
        print("Downloading Enemy...")
        df_enemy = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["enemies"]))
        df_enemy = clean_df(df_enemy)
        master_data["enemies"] = df_enemy.to_dict(orient='records')

        # Dungeon
        print("Downloading Dungeon...")
        df_dungeon = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["dungeons"]))
        df_dungeon = clean_df(df_dungeon)
        master_data["dungeons"] = df_dungeon.to_dict(orient='records')

        # 保存
        with open(os.path.join(OUTPUT_DIR, OUTPUT_FILE), 'w', encoding='utf-8') as f:
            json.dump(master_data, f, indent=4, ensure_ascii=False)
        
        print(f"成功！データを保存しました: {os.path.join(OUTPUT_DIR, OUTPUT_FILE)}")

    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()