<?php
require 'config.php';
header('Content-Type: application/json');

$data = json_decode(file_get_contents('php://input'), true);
$email = $data['email'] ?? '';
$password = $data['password'] ?? '';

if (!$email || !$password) {
    echo json_encode(['status' => 'error', 'message' => '入力が足りません']);
    exit;
}

// ユーザー検索
$stmt = $pdo->prepare("SELECT * FROM users WHERE email = :email");
$stmt->execute([':email' => $email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

// パスワード照合
if ($user && password_verify($password, $user['password'])) {
    // セッションに保存（ログイン状態にする）
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['email'] = $user['email'];
    echo json_encode(['status' => 'success', 'message' => 'ログイン成功']);
} else {
    echo json_encode(['status' => 'error', 'message' => 'メールアドレスかパスワードが間違っています']);
}
?>