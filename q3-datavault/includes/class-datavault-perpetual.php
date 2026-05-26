<?php
/**
 * DataVault Perpetual Stream Integration
 * 
 * Bridges DataVault with Q3 Perpetual Stream for verified CDN storage.
 * Uses Merkle tree verification for correct reconstruction.
 * Supports full and incremental snapshots.
 * 
 * @package Q3_DataVault
 */

if (!defined('ABSPATH')) exit;

class Q3_DataVault_Perpetual {
    
    private $core;
    private $anchors = [
        ['id' => 'archive11', 'url' => 'https://archive11.web5-q.com', 'api' => 'https://archive11.web5-q.com/?rest_route=/q3-perpetual/v6'],
        ['id' => 'archive10', 'url' => 'https://archive10.web5-q.com', 'api' => 'https://archive10.web5-q.com/?rest_route=/q3-perpetual/v6'],
        ['id' => 'archive8', 'url' => 'https://archive8.web5-q.com', 'api' => 'https://archive8.web5-q.com/?rest_route=/q3-perpetual/v6']
    ];
    
    private $shard_size = 1048576; // 1MB shards
    private $carrier_capacity = 700000; // ~700KB per carrier image
    
    public function __construct($core) {
        $this->core = $core;
    }
    
    /**
     * Create snapshot of DataVault manifest to Q3 Perpetual Stream
     * 
     * @param string $manifest_id DataVault manifest ID
     * @param string $mode 'full' or 'incremental'
     * @param string $base_stream_id Previous stream for incremental
     * @return array Result with stream_id, merkle_root
     */
    public function create_snapshot($manifest_id, $mode = 'full', $base_stream_id = null) {
        // Get all chunks from DataVault
        $chunk_manager = new Q3_DataVault_Chunk($this->core);
        $chunks = $chunk_manager->get_manifest_chunks($manifest_id);
        
        if (empty($chunks)) {
            return ['success' => false, 'error' => 'No chunks found for manifest'];
        }
        
        // Sort by index
        usort($chunks, fn($a, $b) => $a['index'] - $b['index']);
        
        // Serialize chunks with metadata
        $snapshot_data = $this->serialize_snapshot($manifest_id, $chunks, $mode, $base_stream_id);
        
        // Compress
        $compressed = gzencode($snapshot_data, 9);
        
        // Create stream ID
        $stream_id = 'dv_' . substr(md5($manifest_id . time()), 0, 12);
        
        // Split into shards and upload with Merkle verification
        $result = $this->upload_to_perpetual($stream_id, $compressed, [
            'type' => 'datavault_snapshot',
            'manifest_id' => $manifest_id,
            'mode' => $mode,
            'base_stream_id' => $base_stream_id,
            'chunk_count' => count($chunks),
            'original_size' => strlen($snapshot_data),
            'compressed_size' => strlen($compressed)
        ]);
        
        if ($result['success']) {
            // Save snapshot reference
            $this->save_snapshot_reference($manifest_id, $result);
        }
        
        return $result;
    }
    
    /**
     * Restore DataVault manifest from Q3 Perpetual Stream
     * 
     * @param string $stream_id Q3 stream to restore from
     * @return array Result with manifest_id, chunks
     */
    public function restore_snapshot($stream_id) {
        // Download with Merkle verification
        $result = $this->download_from_perpetual($stream_id);
        
        if (!$result['success']) {
            return $result;
        }
        
        // Decompress
        $snapshot_data = gzdecode($result['data']);
        
        if ($snapshot_data === false) {
            return ['success' => false, 'error' => 'Decompression failed'];
        }
        
        // Deserialize
        $snapshot = $this->deserialize_snapshot($snapshot_data);
        
        if (!$snapshot) {
            return ['success' => false, 'error' => 'Invalid snapshot format'];
        }
        
        // Restore chunks to DataVault
        $chunk_manager = new Q3_DataVault_Chunk($this->core);
        $restored = 0;
        
        foreach ($snapshot['chunks'] as $chunk) {
            $store_result = $chunk_manager->store(
                $snapshot['manifest_id'],
                $chunk['index'],
                base64_decode($chunk['data']),
                $chunk['cdn_url'] ?? ''
            );
            
            if ($store_result['success']) {
                $restored++;
            }
        }
        
        return [
            'success' => true,
            'manifest_id' => $snapshot['manifest_id'],
            'chunks_restored' => $restored,
            'total_chunks' => count($snapshot['chunks']),
            'mode' => $snapshot['mode'],
            'merkle_verified' => $result['merkle_verified']
        ];
    }
    
    /**
     * Upload data to Q3 Perpetual Stream with Merkle verification
     */
    private function upload_to_perpetual($stream_id, $data, $metadata = []) {
        $chunks = str_split($data, $this->shard_size);
        $shard_urls = [];
        $shard_hashes = [];
        
        foreach ($chunks as $i => $chunk) {
            $hash = hash('sha256', $chunk);
            $shard_hashes[] = $hash;
            
            // Round-robin anchor selection
            $anchor = $this->anchors[$i % count($this->anchors)];
            
            $response = wp_remote_post($anchor['api'] . '/upload', [
                'timeout' => 120,
                'body' => [
                    'stream_id' => $stream_id,
                    'filename' => "shard_{$i}.bin",
                    'data' => base64_encode($chunk)
                ]
            ]);
            
            if (is_wp_error($response)) {
                return ['success' => false, 'error' => "Shard $i upload failed: " . $response->get_error_message()];
            }
            
            $result = json_decode(wp_remote_retrieve_body($response), true);
            
            if (!$result || !$result['success']) {
                return ['success' => false, 'error' => "Shard $i upload failed"];
            }
            
            $shard_urls[] = str_replace('http://', 'https://', $result['url']);
        }
        
        // Compute Merkle root
        $merkle_root = $this->compute_merkle_root($shard_hashes);
        
        // Create and upload manifest
        $manifest = array_merge([
            'stream_id' => $stream_id,
            'size' => strlen($data),
            'chunks' => count($chunks),
            'chunk_size' => $this->shard_size,
            'merkle_root' => $merkle_root,
            'shard_hashes' => $shard_hashes,
            'shard_urls' => $shard_urls,
            'created_at' => time()
        ], $metadata);
        
        // Upload manifest to first anchor
        wp_remote_post($this->anchors[0]['api'] . '/upload', [
            'timeout' => 30,
            'body' => [
                'stream_id' => $stream_id,
                'filename' => 'manifest.json',
                'data' => base64_encode(json_encode($manifest, JSON_PRETTY_PRINT))
            ]
        ]);
        
        return [
            'success' => true,
            'stream_id' => $stream_id,
            'merkle_root' => $merkle_root,
            'shards' => count($chunks),
            'size' => strlen($data)
        ];
    }
    
    /**
     * Download from Q3 Perpetual Stream with Merkle verification
     */
    private function download_from_perpetual($stream_id) {
        // Fetch manifest from any anchor
        $manifest = null;
        
        foreach ($this->anchors as $anchor) {
            $url = $anchor['url'] . '/wp-content/uploads/perpetual/' . $stream_id . '/manifest.json';
            $response = wp_remote_get($url, ['timeout' => 30, 'sslverify' => false]);
            
            if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
                $manifest = json_decode(wp_remote_retrieve_body($response), true);
                if ($manifest) break;
            }
        }
        
        if (!$manifest) {
            return ['success' => false, 'error' => 'Manifest not found'];
        }
        
        // Download and verify shards
        $data = '';
        $verified_hashes = [];
        
        foreach ($manifest['shard_urls'] as $i => $url) {
            $response = wp_remote_get($url, ['timeout' => 60, 'sslverify' => false]);
            
            if (is_wp_error($response)) {
                // Try other anchors
                $shard = $this->find_shard_in_ring($stream_id, $i);
            } else {
                $shard = wp_remote_retrieve_body($response);
            }
            
            if (!$shard) {
                return ['success' => false, 'error' => "Shard $i not found"];
            }
            
            // Verify hash
            $hash = hash('sha256', $shard);
            if ($hash !== $manifest['shard_hashes'][$i]) {
                return ['success' => false, 'error' => "Shard $i hash mismatch"];
            }
            
            $verified_hashes[] = $hash;
            $data .= $shard;
        }
        
        // Verify Merkle root
        $computed_root = $this->compute_merkle_root($verified_hashes);
        
        if ($computed_root !== $manifest['merkle_root']) {
            return ['success' => false, 'error' => 'Merkle root mismatch'];
        }
        
        return [
            'success' => true,
            'data' => $data,
            'merkle_verified' => true,
            'manifest' => $manifest
        ];
    }
    
    /**
     * Search all anchors for a shard
     */
    private function find_shard_in_ring($stream_id, $index) {
        foreach ($this->anchors as $anchor) {
            $url = $anchor['url'] . '/wp-content/uploads/perpetual/' . $stream_id . '/shard_' . $index . '.bin';
            $response = wp_remote_get($url, ['timeout' => 30, 'sslverify' => false]);
            
            if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
                return wp_remote_retrieve_body($response);
            }
        }
        return null;
    }
    
    /**
     * Compute Merkle root from hashes
     */
    private function compute_merkle_root($hashes) {
        if (empty($hashes)) return '';
        if (count($hashes) === 1) return $hashes[0];
        
        $level = $hashes;
        while (count($level) > 1) {
            $next_level = [];
            for ($i = 0; $i < count($level); $i += 2) {
                $left = $level[$i];
                $right = $level[$i + 1] ?? $left;
                $next_level[] = hash('sha256', $left . $right);
            }
            $level = $next_level;
        }
        
        return $level[0];
    }
    
    /**
     * Serialize snapshot data
     */
    private function serialize_snapshot($manifest_id, $chunks, $mode, $base_stream_id) {
        $data = [
            'version' => '1.0',
            'manifest_id' => $manifest_id,
            'mode' => $mode,
            'base_stream_id' => $base_stream_id,
            'created_at' => time(),
            'chunks' => []
        ];
        
        foreach ($chunks as $chunk) {
            $data['chunks'][] = [
                'index' => $chunk['index'],
                'data' => $chunk['data'], // Already base64
                'hash' => $chunk['hash'] ?? hash('sha256', base64_decode($chunk['data'])),
                'cdn_url' => $chunk['cdn_url'] ?? ''
            ];
        }
        
        return json_encode($data, JSON_UNESCAPED_SLASHES);
    }
    
    /**
     * Deserialize snapshot data
     */
    private function deserialize_snapshot($data) {
        $snapshot = json_decode($data, true);
        
        if (!$snapshot || !isset($snapshot['chunks'])) {
            return null;
        }
        
        return $snapshot;
    }
    
    /**
     * Save snapshot reference in database
     */
    private function save_snapshot_reference($manifest_id, $result) {
        $snapshots = get_option('q3_datavault_snapshots', []);
        
        $snapshots[$manifest_id][] = [
            'stream_id' => $result['stream_id'],
            'merkle_root' => $result['merkle_root'],
            'shards' => $result['shards'],
            'created_at' => time()
        ];
        
        update_option('q3_datavault_snapshots', $snapshots);
    }
    
    /**
     * Get snapshot history for a manifest
     */
    public function get_snapshots($manifest_id) {
        $snapshots = get_option('q3_datavault_snapshots', []);
        return $snapshots[$manifest_id] ?? [];
    }
    
    /**
     * Encode shard into carrier image for Q3 storage
     * 
     * @param string $data Raw shard data
     * @return string PNG image data with embedded shard
     */
    public function encode_to_carrier($data) {
        // Compress first
        $compressed = gzencode($data, 9);
        
        if (strlen($compressed) > $this->carrier_capacity) {
            return null; // Too large for single carrier
        }
        
        // Create carrier image (1024x1024 = ~3MB capacity with 2 bits/channel)
        $width = 1024;
        $height = 1024;
        $image = imagecreatetruecolor($width, $height);
        
        // Fill with noise pattern
        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                $r = rand(20, 235);
                $g = rand(20, 235);
                $b = rand(20, 235);
                imagesetpixel($image, $x, $y, imagecolorallocate($image, $r, $g, $b));
            }
        }
        
        // Embed data using LSB
        $this->embed_lsb($image, $compressed);
        
        // Output as PNG
        ob_start();
        imagepng($image, null, 0);
        $png = ob_get_clean();
        imagedestroy($image);
        
        return $png;
    }
    
    /**
     * Decode shard from carrier image
     * 
     * @param string $png Raw PNG image data
     * @return string Extracted shard data
     */
    public function decode_from_carrier($png) {
        $image = imagecreatefromstring($png);
        
        if (!$image) {
            return null;
        }
        
        // Extract data using LSB
        $compressed = $this->extract_lsb($image);
        imagedestroy($image);
        
        if (!$compressed) {
            return null;
        }
        
        // Decompress
        return gzdecode($compressed);
    }
    
    /**
     * Embed data into image using LSB steganography
     */
    private function embed_lsb($image, $data) {
        $width = imagesx($image);
        $height = imagesy($image);
        
        // Prepend length header
        $full_data = pack('N', strlen($data)) . $data;
        
        $bit_index = 0;
        $total_bits = strlen($full_data) * 8;
        
        for ($y = 0; $y < $height && $bit_index < $total_bits; $y++) {
            for ($x = 0; $x < $width && $bit_index < $total_bits; $x++) {
                $rgb = imagecolorat($image, $x, $y);
                $r = ($rgb >> 16) & 0xFF;
                $g = ($rgb >> 8) & 0xFF;
                $b = $rgb & 0xFF;
                
                // Embed 2 bits per channel
                if ($bit_index < $total_bits) {
                    $byte_idx = intval($bit_index / 8);
                    $bit_pos = 7 - ($bit_index % 8);
                    $bit = (ord($full_data[$byte_idx]) >> $bit_pos) & 1;
                    $r = ($r & 0xFE) | $bit;
                    $bit_index++;
                }
                if ($bit_index < $total_bits) {
                    $byte_idx = intval($bit_index / 8);
                    $bit_pos = 7 - ($bit_index % 8);
                    $bit = (ord($full_data[$byte_idx]) >> $bit_pos) & 1;
                    $g = ($g & 0xFE) | $bit;
                    $bit_index++;
                }
                if ($bit_index < $total_bits) {
                    $byte_idx = intval($bit_index / 8);
                    $bit_pos = 7 - ($bit_index % 8);
                    $bit = (ord($full_data[$byte_idx]) >> $bit_pos) & 1;
                    $b = ($b & 0xFE) | $bit;
                    $bit_index++;
                }
                
                $color = imagecolorallocate($image, $r, $g, $b);
                imagesetpixel($image, $x, $y, $color);
            }
        }
        
        return true;
    }
    
    /**
     * Extract data from image using LSB
     */
    private function extract_lsb($image) {
        $width = imagesx($image);
        $height = imagesy($image);
        
        // First extract length (4 bytes = 32 bits)
        $bits = [];
        $pixels_for_header = ceil(32 / 3) + 5;
        $extracted = 0;
        
        for ($y = 0; $y < $height && $extracted < $pixels_for_header; $y++) {
            for ($x = 0; $x < $width && $extracted < $pixels_for_header; $x++) {
                $rgb = imagecolorat($image, $x, $y);
                $bits[] = ($rgb >> 16) & 1;
                $bits[] = ($rgb >> 8) & 1;
                $bits[] = $rgb & 1;
                $extracted++;
            }
        }
        
        // Convert first 32 bits to length
        $length = 0;
        for ($i = 0; $i < 32; $i++) {
            $length = ($length << 1) | $bits[$i];
        }
        
        // Sanity check
        if ($length <= 0 || $length > $this->carrier_capacity) {
            return null;
        }
        
        // Extract all data
        $total_bits_needed = 32 + ($length * 8);
        $all_bits = [];
        
        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                $rgb = imagecolorat($image, $x, $y);
                $all_bits[] = ($rgb >> 16) & 1;
                $all_bits[] = ($rgb >> 8) & 1;
                $all_bits[] = $rgb & 1;
                
                if (count($all_bits) >= $total_bits_needed) break 2;
            }
        }
        
        // Convert bits to bytes (skip header)
        $data = '';
        for ($i = 32; $i < 32 + $length * 8; $i += 8) {
            $byte = 0;
            for ($j = 0; $j < 8; $j++) {
                $byte = ($byte << 1) | ($all_bits[$i + $j] ?? 0);
            }
            $data .= chr($byte);
        }
        
        return $data;
    }
}
