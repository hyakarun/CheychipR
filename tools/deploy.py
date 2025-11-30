import subprocess
import sys

# 設定
LOCAL_DIR = "public/*"  # publicの中身すべて（images, js, css, data）
REMOTE_HOST = "lolipop" # SSH設定で決めた名前
REMOTE_DIR = "~/web/"   # サーバーの公開フォルダ

def deploy():
    print("--- デプロイを開始します ---")
    
    # scp -r でフォルダごと再帰的に転送
    command = f"scp -r {LOCAL_DIR} {REMOTE_HOST}:{REMOTE_DIR}"
    
    print(f"実行コマンド: {command}")
    
    try:
        # シェル経由でコマンドを実行
        subprocess.run(command, shell=True, check=True)
        print("--- 転送が完了しました ---")
        print("ブラウザで確認してください。反映されない場合は Shift+F5 (Macは Cmd+Shift+R) を押してください。")
    except subprocess.CalledProcessError as e:
        print(f"エラーが発生しました: {e}")
        sys.exit(1)

if __name__ == "__main__":
    deploy()