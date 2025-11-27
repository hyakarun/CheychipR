
import pandas as pd

# 定数
CSV_URL = "[ここにCSVのURL]"
OUTPUT_JSON_PATH = "master_data.json"

def main():
    """
    CSVデータをURLから読み込み、JSONファイルとして保存する
    """
    try:
        # CSVをURLから読み込む
        df = pd.read_csv(CSV_URL)
        
        # データフレームをJSON形式で保存
        df.to_json(
            OUTPUT_JSON_PATH,
            orient='records',
            force_ascii=False,
            indent=4
        )
        
        print(f"'{OUTPUT_JSON_PATH}' を正常に更新しました。")

    except Exception as e:
        print(f"エラーが発生しました: {e}")

if __name__ == "__main__":
    main()
