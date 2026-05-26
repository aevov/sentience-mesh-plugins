<?php
/**
 * Q3 Download Handler for urweb.xyz
 * 
 * Serves files from Q3 distributed storage.
 * This script should be placed at: urweb.xyz/q3/index.php
 * 
 * .htaccess rewrite rule:
 * RewriteEngine On
 * RewriteRule ^q3/(.*)$ /q3/index.php?path=$1 [L,QSA]
 * 
 * @package Q3CDN
 */

// CORS headers for CDN
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
header('Access-Control-Allow-Headers: Range, Accept-Encoding');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Get the path
$path = $_GET['path'] ?? '';

// If path is in URL (e.g., /q3/file_id/filename)
if (empty($path) && isset($_SERVER['REQUEST_URI'])) {
    $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $path = preg_replace('#^/q3/?#', '', $uri);
}

if (empty($path)) {
    http_response_code(400);
    die('Missing file path');
}

// Parse file ID and optional filename
$parts = explode('/', trim($path, '/'));
$file_id = $parts[0] ?? '';
$filename = $parts[1] ?? null;

if (empty($file_id)) {
    http_response_code(400);
    die('Missing file ID');
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTION 1: Fetch from WordPress API (if files stored in WP)
// ═══════════════════════════════════════════════════════════════════════════

// Configure your WordPress site URL
$wp_api_url = 'https://your-wordpress-site.com/wp-json/qcs/v1/download/' . $file_id;

// Try to fetch file info from WordPress
$ch = curl_init($wp_api_url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HTTPHEADER => [
        'Accept: application/octet-stream',
    ]
]);

$response = curl_exec($ch);
$info = curl_getinfo($ch);
$header_size = $info['header_size'];
$headers = substr($response, 0, $header_size);
$body = substr($response, $header_size);
curl_close($ch);

if ($info['http_code'] === 200 && !empty($body)) {
    // Get content type from headers
    if (preg_match('/Content-Type:\s*(.+)/i', $headers, $matches)) {
        header('Content-Type: ' . trim($matches[1]));
    } else {
        header('Content-Type: application/octet-stream');
    }
    
    // Get filename
    if (preg_match('/Content-Disposition:.*filename=["\']*([^"\';\n]+)/i', $headers, $matches)) {
        $filename = trim($matches[1]);
    }
    
    if ($filename) {
        header('Content-Disposition: inline; filename="' . $filename . '"');
    }
    
    // Cache headers
    header('Cache-Control: public, max-age=31536000, immutable');
    header('ETag: "' . md5($file_id) . '"');
    
    echo $body;
    exit;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTION 2: Direct file storage lookup (if files stored locally)
// ═══════════════════════════════════════════════════════════════════════════

// Storage directory (adjust for your server)
$storage_base = '/var/www/urweb.xyz/storage/q3/';

// Security: sanitize file ID
$file_id = preg_replace('/[^a-zA-Z0-9_.-]/', '', $file_id);

// Look for file with this ID
$meta_file = $storage_base . 'meta/' . $file_id . '.json';
$data_file = $storage_base . 'data/' . $file_id;

if (file_exists($meta_file) && file_exists($data_file)) {
    $meta = json_decode(file_get_contents($meta_file), true);
    
    $mime = $meta['mime_type'] ?? 'application/octet-stream';
    $original_name = $meta['original_name'] ?? $filename ?? $file_id;
    $size = filesize($data_file);
    
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . $size);
    header('Content-Disposition: inline; filename="' . basename($original_name) . '"');
    header('Cache-Control: public, max-age=31536000, immutable');
    header('ETag: "' . md5_file($data_file) . '"');
    header('Accept-Ranges: bytes');
    
    // Support range requests for video/audio
    if (isset($_SERVER['HTTP_RANGE'])) {
        $range = $_SERVER['HTTP_RANGE'];
        preg_match('/bytes=(\d+)-(\d*)/', $range, $matches);
        
        $start = intval($matches[1]);
        $end = empty($matches[2]) ? $size - 1 : intval($matches[2]);
        $length = $end - $start + 1;
        
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
        header("Content-Length: $length");
        
        $fp = fopen($data_file, 'rb');
        fseek($fp, $start);
        echo fread($fp, $length);
        fclose($fp);
    } else {
        readfile($data_file);
    }
    
    exit;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTION 3: Redirect to actual storage (S3, Q3 Storage, etc.)
// ═══════════════════════════════════════════════════════════════════════════

// If using external storage, redirect there
// $storage_url = 'https://your-bucket.s3.amazonaws.com/' . $file_id;
// header('Location: ' . $storage_url, true, 302);
// exit;

// ═══════════════════════════════════════════════════════════════════════════
// File not found
// ═══════════════════════════════════════════════════════════════════════════

http_response_code(404);
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html>
<head>
    <title>File Not Found - Q3 CDN</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #1e1e2e, #2d2d44);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
        }
        .container {
            text-align: center;
            padding: 40px;
        }
        h1 { font-size: 72px; margin: 0; opacity: 0.8; }
        h2 { margin: 20px 0; font-weight: 400; }
        p { color: rgba(255,255,255,0.6); }
        code {
            background: rgba(255,255,255,0.1);
            padding: 4px 12px;
            border-radius: 6px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>404</h1>
        <h2>File Not Found</h2>
        <p>The requested file could not be located in Q3 storage.</p>
        <p><code><?php echo htmlspecialchars($file_id); ?></code></p>
    </div>
</body>
</html>
