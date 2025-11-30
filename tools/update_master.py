import pandas as pd
import json
import os
import ssl
import sys

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

# 数値として扱う列
NUMERIC_COLS = {
    "enemies": ["hp", "atk", "exp", "speed", "width"],
    # ★追加：enemies_per_wave を追加
    "dungeons": ["req_lv", "wave_count", "boss_flag", "boss_id", "req_clears", "enemies_per_wave"], 
    "exp_table": ["lv", "next_exp", "reward_sp"]
}

def get_csv_url(sheet_id, gid):
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"

def validate_and_clean_df(name, df):
    print(f"[{name}] 検証中...")
    if 'id' in df.columns:
        df = df.dropna(subset=['id'])
        df = df[df['id'] != '']
    
    if name in NUMERIC_COLS:
        for col in NUMERIC_COLS[name]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
    
    return df.fillna("")

def main():
    print("--- マスタデータの更新 ---")
    if not os.path.exists(OUTPUT_DIR): os.makedirs(OUTPUT_DIR)
    master_data = {}

    try:
        # Config
        df_c = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["config"]))
        master_data["config"] = {r['key']: r['value'] for _, r in df_c.fillna("").iterrows() if r.get('key')}

        # ExpTable
        df_exp = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["exp_table"]))
        master_data["exp_table"] = validate_and_clean_df("exp_table", df_exp).to_dict(orient='records')

        # Enemy
        df_enemy = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["enemies"]))
        master_data["enemies"] = validate_and_clean_df("enemies", df_enemy).to_dict(orient='records')

        # Dungeon
        df_dungeon = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["dungeons"]))
        master_data["dungeons"] = validate_and_clean_df("dungeons", df_dungeon).to_dict(orient='records')

        with open(os.path.join(OUTPUT_DIR, OUTPUT_FILE), 'w', encoding='utf-8') as f:
            json.dump(master_data, f, indent=4, ensure_ascii=False)
        print("成功！")

    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()