import subprocess
import sys
import os
import shutil

# === 設定 ===

# 1. Googleドライブの画像フォルダ（元の場所）
# ※「!」の前の「\」は不要なので削除しています
DRIVE_IMAGE_DIR = "/Users/mukulogi/マイドライブ/TSUKURO!/cheychip/Design/monster"

# 2. ゲームの画像フォルダ（コピー先）
LOCAL_IMAGE_DIR = "public/images"

# 3. Lolipop設定
LOCAL_DIR = "public/*"
REMOTE_HOST = "lolipop"
REMOTE_DIR = "~/web/"

def sync_images_from_drive():
    """Googleドライブから画像をコピーしてくる関数"""
    print("--- Googleドライブから画像を同期します ---")
    print(f"参照元: {DRIVE_IMAGE_DIR}")

    # ドライブのフォルダがあるか確認
    if not os.path.exists(DRIVE_IMAGE_DIR):
        print("【警告】Googleドライブのフォルダが見つかりません！パスが間違っているか、ドライブが起動していません。")
        print("画像の同期をスキップして、デプロイのみ行います。")
        return

    # コピー先のフォルダがなければ作る
    if not os.path.exists(LOCAL_IMAGE_DIR):
        os.makedirs(LOCAL_IMAGE_DIR)

    # ファイルをコピー
    count = 0
    copied_files = []
    
    try:
        files = os.listdir(DRIVE_IMAGE_DIR)
        for f in files:
            # 画像ファイルっぽいものだけコピー（.DS_Storeなどは無視）
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.svg', '.gif')):
                src = os.path.join(DRIVE_IMAGE_DIR, f)
                dst = os.path.join(LOCAL_IMAGE_DIR, f)
                
                # 単純に上書きコピー
                shutil.copy2(src, dst)
                copied_files.append(f)
                count += 1
        
        print(f"成功: {count} 個の画像をコピーしました。")
        # print(f"コピーしたファイル: {copied_files}") # 詳細が見たい場合はコメント解除

    except Exception as e:
        print(f"【エラー】画像のコピー中に問題が発生しました: {e}")
        sys.exit(1)

def deploy():
    """サーバーへアップロードする関数"""
    print("\n--- サーバーへのデプロイを開始します ---")
    
    command = f"scp -r {LOCAL_DIR} {REMOTE_HOST}:{REMOTE_DIR}"
    print(f"実行コマンド: {command}")
    
    try:
        subprocess.run(command, shell=True, check=True)
        print("--- 転送が完了しました ---")
        print("ブラウザで確認してください。")
    except subprocess.CalledProcessError as e:
        print(f"エラーが発生しました: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # 1. まずドライブから画像を引っこ抜く
    sync_images_from_drive()
    
    # 2. その後、サーバーへ送る
    deploy()