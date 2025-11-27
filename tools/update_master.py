import pandas as pd
import json
import os
import ssl

# === 【重要】MacのSSLエラーを回避するおまじない ===
ssl._create_default_https_context = ssl._create_unverified_context
# =================================================

# === 設定：スプレッドシートのIDとGID ===
# いただいたURLから抽出しました
SPREADSHEET_ID = "1dTxRNuMcz4JCbh2Wp-fWxAZE814wcQOWtXdEeNW6FHE"
SHEETS = {
    "config": "0",          # GameConfig
    "exp_table": "6688737", # ExpTable
    "enemies": "1383753713" # Enemy
}

# 保存先
OUTPUT_DIR = "public/data"
OUTPUT_FILE = "master_data.json"

def get_csv_url(sheet_id, gid):
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"

def main():
    print("--- マスタデータの更新を開始します ---")

    # 1. 保存先フォルダの作成
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"フォルダ作成: {OUTPUT_DIR}")

    master_data = {}

    try:
        # 2. GameConfig の読み込み (Key-Value形式に変換)
        print("Downloading GameConfig...")
        url = get_csv_url(SPREADSHEET_ID, SHEETS["config"])
        df_config = pd.read_csv(url)
        # { "base_atk_interval": 60, ... } の形にする
        config_dict = {}
        for _, row in df_config.iterrows():
            # key列とvalue列があると想定
            if pd.notna(row.get('key')) and pd.notna(row.get('value')):
                config_dict[row['key']] = row['value']
        master_data["config"] = config_dict

        # 3. ExpTable の読み込み
        print("Downloading ExpTable...")
        url = get_csv_url(SPREADSHEET_ID, SHEETS["exp_table"])
        df_exp = pd.read_csv(url)
        master_data["exp_table"] = df_exp.to_dict(orient='records')

        # 4. Enemy の読み込み
        print("Downloading Enemy...")
        url = get_csv_url(SPREADSHEET_ID, SHEETS["enemies"])
        df_enemy = pd.read_csv(url)
        master_data["enemies"] = df_enemy.to_dict(orient='records')

        # 5. JSON保存
        output_path = os.path.join(OUTPUT_DIR, OUTPUT_FILE)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(master_data, f, indent=4, ensure_ascii=False)
        
        print(f"成功！データを保存しました: {output_path}")
        print("中身の例(config):", list(master_data["config"].keys())[:3])

    except Exception as e:
        print(f"\n[エラー] データの取得に失敗しました: {e}")
        # 詳細なエラー内容を表示
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()