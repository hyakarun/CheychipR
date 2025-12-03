<?php
require 'config.php';
header('Content-Type: application/json');

// POSTデータを受け取る
$data = json_decode(file_get_contents('php://input'), true);
$email = $data['email'] ?? '';
$password = $data['password'] ?? '';

if (!$email || !$password) {
    echo json_encode(['status' => 'error', 'message' => '入力が足りません']);
    exit;
}

try {
    // パスワードを暗号化（ハッシュ化）
    $hash = password_hash($password, PASSWORD_DEFAULT);

    // 登録実行
    $stmt = $pdo->prepare("INSERT INTO users (email, password) VALUES (:email, :pass)");
    $stmt->execute([':email' => $email, ':pass' => $hash]);

    echo json_encode(['status' => 'success', 'message' => '登録完了！']);
} catch (PDOException $e) {
    if ($e->getCode() == 23000) {
        echo json_encode(['status' => 'error', 'message' => 'そのメールアドレスは既に使われています']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'エラー: ' . $e->getMessage()]);
    }
}
?>