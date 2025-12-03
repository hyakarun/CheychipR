<?php
// === ロリポップのデータベース接続情報 ===
$host = 'mysql324.phy.lolipop.lan'; // サーバー
$dbname = 'LAA1529361-ccplayer';    // データベース名
$user = 'LAA1529361';               // ユーザー名
$pass = 'nohomeru';                 // ★ここをあなたが決めたパスワードに書き換えてください

try {
    // データベース接続
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $user, $pass);
    // エラーモードを例外に設定
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // セッション開始（ログイン状態の維持に必要）
    if (session_status() == PHP_SESSION_NONE) {
        session_start();
    }
} catch (PDOException $e) {
    // 接続失敗時のエラーメッセージ
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'DB接続エラー: ' . $e->getMessage()]);
    exit;
}
?>