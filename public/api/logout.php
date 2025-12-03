<?php
require 'config.php';
header('Content-Type: application/json');

session_destroy();
echo json_encode(['status' => 'success']);
?>