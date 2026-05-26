<?php
/**
 * QBlob Protocol PHP SDK
 * 
 * Server-side implementation for QBlob content-addressable file protocol.
 * 
 * @package QBlob
 * @version 1.0.0
 */

class QBlob {
    
    const VERSION = '1.0.0';
    const PROTOCOL = 'qblob://';
    const WEB_PROTOCOL = 'web+qblob://';
    const CONTENT_ID_LENGTH = 32;
    
    private $config;
    private $apiKey;
    
    /**
     * Initialize QBlob
     */
    public function __construct($config = []) {
        $this->config = array_merge([
            'orbitals' => [],
            'storage_path' => sys_get_temp_dir() . '/qblob/',
            'cache_enabled' => true,
            'fallback_url' => null
        ], $config);
        
        $this->apiKey = $config['api_key'] ?? $this->generateApiKey();
        
        // Ensure storage directory exists
        if (!file_exists($this->config['storage_path'])) {
            mkdir($this->config['storage_path'], 0755, true);
        }
    }
    
    /**
     * Generate API key
     */
    private function generateApiKey() {
        return 'qblob_' . bin2hex(random_bytes(16));
    }
    
    // =========================================================================
    // CONTENT ID
    // =========================================================================
    
    /**
     * Generate content ID from data
     */
    public function generateContentId($data) {
        // SHA-256 hash
        $hash = hash('sha256', $data, true);
        
        // Version prefix (0x01)
        $versioned = chr(0x01) . $hash;
        
        // Base58 encode
        $encoded = $this->base58Encode($versioned);
        
        // Prefix with 'Qm' and truncate
        return 'Qm' . substr($encoded, 0, self::CONTENT_ID_LENGTH - 2);
    }
    
    /**
     * Generate content ID from file
     */
    public function generateContentIdFromFile($filePath) {
        if (!file_exists($filePath)) {
            throw new Exception('File not found: ' . $filePath);
        }
        
        $hash = hash_file('sha256', $filePath, true);
        $versioned = chr(0x01) . $hash;
        $encoded = $this->base58Encode($versioned);
        
        return 'Qm' . substr($encoded, 0, self::CONTENT_ID_LENGTH - 2);
    }
    
    /**
     * Verify content matches ID
     */
    public function verifyContentId($contentId, $data) {
        $computed = $this->generateContentId($data);
        return hash_equals($computed, $contentId);
    }
    
    // =========================================================================
    // URL OPERATIONS
    // =========================================================================
    
    /**
     * Parse QBlob URL
     */
    public function parse($url) {
        // Remove protocol
        $path = preg_replace('/^(web\+)?qblob:\/\//', '', $url);
        
        // Parse security prefix
        $security = 'public';
        $securityData = null;
        
        if (strpos($path, '@') !== false) {
            list($secPart, $path) = explode('@', $path, 2);
            
            if (strpos($secPart, 'signed:') === 0) {
                $security = 'signed';
                $securityData = substr($secPart, 7);
            } elseif (strpos($secPart, 'encrypted:') === 0) {
                $security = 'encrypted';
                $securityData = substr($secPart, 10);
            } elseif ($secPart === 'private') {
                $security = 'private';
            }
        }
        
        // Parse content ID and filename
        $pathParts = explode('/', $path);
        $contentIdPart = array_shift($pathParts);
        
        // Split content ID from query string
        $queryStart = strpos($contentIdPart, '?');
        if ($queryStart !== false) {
            $contentId = substr($contentIdPart, 0, $queryStart);
            $queryString = substr($contentIdPart, $queryStart + 1);
        } else {
            $contentId = $contentIdPart;
            $queryString = '';
        }
        
        $filename = !empty($pathParts) ? implode('/', $pathParts) : null;
        if ($filename) {
            $qPos = strpos($filename, '?');
            if ($qPos !== false) {
                $queryString = substr($filename, $qPos + 1);
                $filename = substr($filename, 0, $qPos);
            }
        }
        
        // Parse query params
        $params = [];
        if ($queryString) {
            parse_str($queryString, $params);
        }
        
        return [
            'contentId' => $contentId,
            'filename' => $filename,
            'security' => $security,
            'securityData' => $securityData,
            'params' => $params,
            'expires' => isset($params['expires']) ? intval($params['expires']) : null
        ];
    }
    
    /**
     * Build QBlob URL
     */
    public function build($contentId, $options = []) {
        $webCompatible = $options['web_compatible'] ?? true;
        $url = $webCompatible ? self::WEB_PROTOCOL : self::PROTOCOL;
        
        // Security prefix
        if (!empty($options['signed']) && !empty($options['signature'])) {
            $url .= 'signed:' . $options['signature'] . '@';
        } elseif (!empty($options['encrypted']) && !empty($options['iv'])) {
            $url .= 'encrypted:' . $options['iv'] . '@';
        }
        
        $url .= $contentId;
        
        if (!empty($options['filename'])) {
            $url .= '/' . rawurlencode($options['filename']);
        }
        
        // Query params
        $params = [];
        if (!empty($options['expires'])) {
            $params['expires'] = $options['expires'];
        }
        if (!empty($options['stream'])) {
            $params['stream'] = 'true';
        }
        
        if (!empty($params)) {
            $url .= '?' . http_build_query($params);
        }
        
        return $url;
    }
    
    // =========================================================================
    // UPLOAD
    // =========================================================================
    
    /**
     * Upload data and get QBlob URL
     */
    public function upload($data, $options = []) {
        $filename = $options['filename'] ?? $options['name'] ?? null;
        $mimeType = $options['mime_type'] ?? $options['type'] ?? 'application/octet-stream';
        
        // Encrypt if requested
        if (!empty($options['encrypt']) && !empty($options['password'])) {
            $data = $this->encrypt($data, $options['password']);
        }
        
        // Generate content ID
        $contentId = $this->generateContentId($data);
        
        // Store locally
        if ($this->config['cache_enabled']) {
            $this->storeLocal($contentId, $data, [
                'filename' => $filename,
                'mimeType' => $mimeType,
                'acl' => $options['acl'] ?? 'public',
                'encrypted' => !empty($options['encrypt'])
            ]);
        }
        
        // Upload to orbitals
        if (!empty($this->config['orbitals'])) {
            $this->uploadToOrbitals($contentId, $data, [
                'filename' => $filename,
                'mimeType' => $mimeType
            ]);
        }
        
        return $this->build($contentId, [
            'filename' => $filename,
            'encrypted' => !empty($options['encrypt'])
        ]);
    }
    
    /**
     * Upload from file path
     */
    public function uploadFile($filePath, $options = []) {
        if (!file_exists($filePath)) {
            throw new Exception('File not found: ' . $filePath);
        }
        
        $data = file_get_contents($filePath);
        $options['filename'] = $options['filename'] ?? basename($filePath);
        $options['mime_type'] = $options['mime_type'] ?? mime_content_type($filePath);
        
        return $this->upload($data, $options);
    }
    
    /**
     * Store locally
     */
    private function storeLocal($contentId, $data, $meta = []) {
        $dataPath = $this->config['storage_path'] . 'data/';
        $metaPath = $this->config['storage_path'] . 'meta/';
        
        if (!file_exists($dataPath)) mkdir($dataPath, 0755, true);
        if (!file_exists($metaPath)) mkdir($metaPath, 0755, true);
        
        file_put_contents($dataPath . $contentId, $data);
        file_put_contents($metaPath . $contentId . '.json', json_encode(array_merge($meta, [
            'contentId' => $contentId,
            'size' => strlen($data),
            'cached' => time()
        ])));
    }
    
    /**
     * Upload to orbitals
     */
    private function uploadToOrbitals($contentId, $data, $meta = []) {
        foreach ($this->config['orbitals'] as $orbital) {
            try {
                $ch = curl_init("https://{$orbital}/qblob/upload");
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_POST => true,
                    CURLOPT_POSTFIELDS => [
                        'contentId' => $contentId,
                        'data' => base64_encode($data),
                        'meta' => json_encode($meta)
                    ],
                    CURLOPT_HTTPHEADER => [
                        'X-QBlob-Key: ' . $this->apiKey
                    ],
                    CURLOPT_TIMEOUT => 30
                ]);
                curl_exec($ch);
                curl_close($ch);
            } catch (Exception $e) {
                // Continue to next orbital
            }
        }
    }
    
    // =========================================================================
    // DOWNLOAD
    // =========================================================================
    
    /**
     * Download from QBlob URL
     */
    public function download($url, $options = []) {
        $parsed = $this->parse($url);
        
        // Verify signed URL if applicable
        if ($parsed['security'] === 'signed') {
            $verified = $this->verifySignature($url);
            if (!$verified['valid']) {
                throw new Exception('Signature verification failed: ' . $verified['reason']);
            }
        }
        
        // Resolve content
        $result = $this->resolve($parsed['contentId']);
        
        if (!$result['data']) {
            throw new Exception('Content not found');
        }
        
        // Decrypt if encrypted
        if ($parsed['security'] === 'encrypted' && !empty($options['password'])) {
            $result['data'] = $this->decrypt($result['data'], $options['password']);
        }
        
        return $result['data'];
    }
    
    /**
     * Resolve content from any source
     */
    public function resolve($contentId) {
        // 1. Check local storage
        $localPath = $this->config['storage_path'] . 'data/' . $contentId;
        if (file_exists($localPath)) {
            return [
                'source' => 'cache',
                'data' => file_get_contents($localPath)
            ];
        }
        
        // 2. Fetch from orbitals
        foreach ($this->config['orbitals'] as $orbital) {
            try {
                $ch = curl_init("https://{$orbital}/qblob/{$contentId}");
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HTTPHEADER => [
                        'X-QBlob-Key: ' . $this->apiKey
                    ],
                    CURLOPT_TIMEOUT => 30
                ]);
                $data = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                
                if ($httpCode === 200 && $data) {
                    // Verify content hash
                    if ($this->verifyContentId($contentId, $data)) {
                        // Cache locally
                        $this->storeLocal($contentId, $data);
                        return [
                            'source' => 'orbital',
                            'data' => $data
                        ];
                    }
                }
            } catch (Exception $e) {
                continue;
            }
        }
        
        // 3. Try fallback URL
        if (!empty($this->config['fallback_url'])) {
            try {
                $data = file_get_contents($this->config['fallback_url'] . '/' . $contentId);
                if ($data !== false) {
                    $this->storeLocal($contentId, $data);
                    return [
                        'source' => 'fallback',
                        'data' => $data
                    ];
                }
            } catch (Exception $e) {}
        }
        
        return [
            'source' => null,
            'data' => null
        ];
    }
    
    // =========================================================================
    // EXISTENCE CHECK
    // =========================================================================
    
    /**
     * Check if content exists
     */
    public function exists($url) {
        $parsed = $this->parse($url);
        
        $status = [
            'exists' => false,
            'sources' => [],
            'confidence' => 0
        ];
        
        // Check local
        $localPath = $this->config['storage_path'] . 'data/' . $parsed['contentId'];
        if (file_exists($localPath)) {
            $status['exists'] = true;
            $status['sources'][] = 'cache';
            $status['confidence'] += 0.3;
        }
        
        // Check orbitals
        foreach ($this->config['orbitals'] as $orbital) {
            try {
                $ch = curl_init("https://{$orbital}/qblob/{$parsed['contentId']}/exists");
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_NOBODY => true,
                    CURLOPT_HTTPHEADER => [
                        'X-QBlob-Key: ' . $this->apiKey
                    ],
                    CURLOPT_TIMEOUT => 5
                ]);
                curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                
                if ($httpCode === 200) {
                    $status['exists'] = true;
                    $status['sources'][] = $orbital;
                    $status['confidence'] += 0.2;
                }
            } catch (Exception $e) {
                continue;
            }
        }
        
        $status['confidence'] = min(1, $status['confidence']);
        
        return $status;
    }
    
    // =========================================================================
    // SIGNING
    // =========================================================================
    
    /**
     * Create signed URL
     */
    public function sign($url, $options = []) {
        $parsed = $this->parse($url);
        
        // Parse expires
        $expires = $options['expires'] ?? time() + 3600;
        if (is_string($expires) && preg_match('/^(\d+)(h|d|m|s)?$/', $expires, $matches)) {
            $value = intval($matches[1]);
            $unit = $matches[2] ?? 'h';
            $multipliers = ['s' => 1, 'm' => 60, 'h' => 3600, 'd' => 86400];
            $expires = time() + $value * $multipliers[$unit];
        }
        
        // Create signature
        $payload = $parsed['contentId'] . ':' . $expires;
        $signature = substr(
            $this->base58Encode(hash_hmac('sha256', $payload, $this->apiKey, true)),
            0, 16
        );
        
        return [
            'signature' => $signature,
            'expires' => $expires,
            'url' => $this->build($parsed['contentId'], [
                'signed' => true,
                'signature' => $signature,
                'expires' => $expires,
                'filename' => $parsed['filename']
            ])
        ];
    }
    
    /**
     * Verify signed URL
     */
    public function verifySignature($url) {
        $parsed = $this->parse($url);
        
        if ($parsed['security'] !== 'signed') {
            return ['valid' => false, 'reason' => 'NOT_SIGNED'];
        }
        
        if ($parsed['expires'] && time() > $parsed['expires']) {
            return ['valid' => false, 'reason' => 'EXPIRED'];
        }
        
        $expected = $this->sign($this->build($parsed['contentId']), [
            'expires' => $parsed['expires']
        ]);
        
        $valid = hash_equals($expected['signature'], $parsed['securityData']);
        
        return [
            'valid' => $valid,
            'reason' => $valid ? null : 'INVALID_SIGNATURE'
        ];
    }
    
    // =========================================================================
    // ENCRYPTION
    // =========================================================================
    
    /**
     * Encrypt data
     */
    public function encrypt($data, $password) {
        $salt = random_bytes(16);
        $iv = random_bytes(12);
        
        // Derive key
        $key = hash_pbkdf2('sha256', $password, $salt, 100000, 32, true);
        
        // Encrypt
        $encrypted = openssl_encrypt($data, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        
        // Combine: salt + iv + tag + ciphertext
        return $salt . $iv . $tag . $encrypted;
    }
    
    /**
     * Decrypt data
     */
    public function decrypt($encryptedData, $password) {
        $salt = substr($encryptedData, 0, 16);
        $iv = substr($encryptedData, 16, 12);
        $tag = substr($encryptedData, 28, 16);
        $ciphertext = substr($encryptedData, 44);
        
        // Derive key
        $key = hash_pbkdf2('sha256', $password, $salt, 100000, 32, true);
        
        // Decrypt
        $decrypted = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        
        if ($decrypted === false) {
            throw new Exception('Decryption failed');
        }
        
        return $decrypted;
    }
    
    // =========================================================================
    // HTTP CONVERSION
    // =========================================================================
    
    /**
     * Convert QBlob URL to HTTP URL
     */
    public function toHttpUrl($url) {
        $parsed = $this->parse($url);
        
        if (!empty($this->config['fallback_url'])) {
            $httpUrl = $this->config['fallback_url'] . '/' . $parsed['contentId'];
            if ($parsed['filename']) {
                $httpUrl .= '/' . rawurlencode($parsed['filename']);
            }
            return $httpUrl;
        }
        
        if (!empty($this->config['orbitals'])) {
            $httpUrl = 'https://' . $this->config['orbitals'][0] . '/qblob/' . $parsed['contentId'];
            if ($parsed['filename']) {
                $httpUrl .= '/' . rawurlencode($parsed['filename']);
            }
            return $httpUrl;
        }
        
        throw new Exception('No HTTP fallback configured');
    }
    
    // =========================================================================
    // CACHE MANAGEMENT
    // =========================================================================
    
    /**
     * List cached items
     */
    public function listCached() {
        $metaPath = $this->config['storage_path'] . 'meta/';
        $items = [];
        
        if (file_exists($metaPath)) {
            foreach (glob($metaPath . '*.json') as $file) {
                $items[] = json_decode(file_get_contents($file), true);
            }
        }
        
        return $items;
    }
    
    /**
     * Delete from cache
     */
    public function delete($url) {
        $parsed = $this->parse($url);
        
        $dataPath = $this->config['storage_path'] . 'data/' . $parsed['contentId'];
        $metaPath = $this->config['storage_path'] . 'meta/' . $parsed['contentId'] . '.json';
        
        if (file_exists($dataPath)) unlink($dataPath);
        if (file_exists($metaPath)) unlink($metaPath);
        
        return true;
    }
    
    /**
     * Clear cache
     */
    public function clearCache() {
        $dataPath = $this->config['storage_path'] . 'data/';
        $metaPath = $this->config['storage_path'] . 'meta/';
        
        array_map('unlink', glob($dataPath . '*'));
        array_map('unlink', glob($metaPath . '*'));
        
        return true;
    }
    
    /**
     * Get cache size
     */
    public function getCacheSize() {
        $dataPath = $this->config['storage_path'] . 'data/';
        $size = 0;
        
        if (file_exists($dataPath)) {
            foreach (glob($dataPath . '*') as $file) {
                $size += filesize($file);
            }
        }
        
        return $size;
    }
    
    // =========================================================================
    // UTILITIES
    // =========================================================================
    
    /**
     * Base58 encode
     */
    private function base58Encode($data) {
        $alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        $base = strlen($alphabet);
        
        $bytes = array_values(unpack('C*', $data));
        $digits = [0];
        
        foreach ($bytes as $byte) {
            $carry = $byte;
            for ($i = 0; $i < count($digits); $i++) {
                $carry += $digits[$i] << 8;
                $digits[$i] = $carry % $base;
                $carry = intdiv($carry, $base);
            }
            while ($carry) {
                $digits[] = $carry % $base;
                $carry = intdiv($carry, $base);
            }
        }
        
        $result = '';
        for ($i = count($digits) - 1; $i >= 0; $i--) {
            $result .= $alphabet[$digits[$i]];
        }
        
        // Add leading '1's for leading zero bytes
        foreach ($bytes as $byte) {
            if ($byte === 0) $result = '1' . $result;
            else break;
        }
        
        return $result;
    }
}
