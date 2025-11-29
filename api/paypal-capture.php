<?php
$client_id = getenv("PAYPAL_CLIENT_ID");
$secret = getenv("PAYPAL_SECRET");

$orderID = $_GET['orderID'];

$ch = curl_init("https://api-m.paypal.com/v2/checkout/orders/$orderID/capture");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "Authorization: Basic " . base64_encode("$client_id:$secret")
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$result = curl_exec($ch);
curl_close($ch);

echo $result;
