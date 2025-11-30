import pandas as pd
import json
import os
import ssl

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

def get_csv_url(sheet_id, gid):
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"

def main():
    print("--- マスタデータの更新を開始します ---")
    if not os.path.exists(OUTPUT_DIR): os.makedirs(OUTPUT_DIR)
    master_data = {}

    try:
        # Config
        print("Downloading GameConfig...")
        df_c = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["config"]))
        master_data["config"] = {r['key']: r['value'] for _, r in df_c.iterrows() if pd.notna(r.get('key'))}

        # ExpTable
        print("Downloading ExpTable...")
        master_data["exp_table"] = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["exp_table"])).to_dict(orient='records')

        # Enemy
        print("Downloading Enemy...")
        master_data["enemies"] = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["enemies"])).to_dict(orient='records')

        # Dungeon (★追加)
        print("Downloading Dungeon...")

        dungeon_url = get_csv_url(SPREADSHEET_ID, SHEETS["dungeons"])
        print(f"URL Check: {dungeon_url}")  # ←ここで犯人がわかります
        
        master_data["dungeons"] = pd.read_csv(get_csv_url(SPREADSHEET_ID, SHEETS["dungeons"])).to_dict(orient='records')

        # 保存
        with open(os.path.join(OUTPUT_DIR, OUTPUT_FILE), 'w', encoding='utf-8') as f:
            json.dump(master_data, f, indent=4, ensure_ascii=False)
        print("成功！")

    except Exception:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()