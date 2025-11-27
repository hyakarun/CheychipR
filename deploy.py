

import subprocess
import sys

def run_command(command):
    """
    コマンドを実行し、エラーがあればスクリプトを停止する
    """
    print(f"実行中: {' '.join(command)}")
    result = subprocess.run(command, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"エラーが発生しました: {result.stderr}", file=sys.stderr)
        sys.exit(1)
        
    print(result.stdout)
    return result

def main():
    """
    index.html を Lolipop サーバーへ転送する
    """
    print("--- index.html を Lolipop サーバーへ転送します ---")
    run_command(["scp", "index.html", "lolipop:~/web/"])
    print("--- 転送が完了しました ---")

    print("\nデプロイが正常に完了しました。")

if __name__ == "__main__":
    main()
