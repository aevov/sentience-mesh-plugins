<?php
/**
 * QuantumAVIF Download & Reconstruction
 * 
 * Handles downloading and reconstructing files from AVIF shards
 */

if (!defined('ABSPATH')) {
    exit;
}

class QuantumAVIF_Downloader {
    
    private $stego;
    private $leann;
    private $erasure;
    
    public function __construct() {
        $this->stego = new QuantumAVIF_Stego_Engine(2048, 2048);
        $this->leann = new QuantumAVIF_LEANN_Engine();
        $this->erasure = new QuantumAVIF_Erasure_Coder(8, 4);
    }
    
    /**
     * Download and reconstruct file from manifest
     * 
     * @param int $manifest_id WordPress attachment ID of manifest
     * @return array ['success' => bool, 'data' => string, 'filename' => string]
     */
    public function download($manifest_id) {
        try {
            // 1. Load manifest
            $manifest = $this->load_manifest($manifest_id);
            
            error_log('[QuantumAVIF Download] Starting reconstruction for: ' . $manifest['original_name']);
            
            // 2. Download all shard AVIFs
            $shard_images = $this->download_shards($manifest['shard_urls']);
            
            // 3. Extract data from steganography
            $encoded_shards = $this->extract_from_stego($shard_images);
            
            // 4. LEANN decompress
            $leann_shards = $this->leann_decompress($encoded_shards, $manifest['leann_metadata']);
            
            // 5. Reed-Solomon decode
            $original_data = $this->erasure_decode($leann_shards, $manifest['original_size']);
            
            error_log('[QuantumAVIF Download] Success! Reconstructed ' . strlen($original_data) . ' bytes');
            
            return [
                'success' => true,
                'data' => $original_data,
                'filename' => $manifest['original_name'],
                'size' => strlen($original_data)
            ];
            
        } catch (Exception $e) {
            error_log('[QuantumAVIF Download] Error: ' . $e->getMessage());
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
    
    /**
     * Load manifest from WordPress attachment
     */
    private function load_manifest($manifest_id) {
        $post = get_post($manifest_id);
        if (!$post) {
            throw new Exception('Manifest not found');
        }
        
        $manifest = json_decode($post->post_content, true);
        if (!$manifest) {
            throw new Exception('Invalid manifest JSON');
        }
        
        return $manifest;
    }
    
    /**
     * Download all shard AVIFs
     */
    private function download_shards($shard_urls) {
        $images = [];
        
        foreach ($shard_urls as $i => $url) {
            error_log('[QuantumAVIF Download] Fetching shard ' . ($i + 1) . '/' . count($shard_urls));
            
            // Download image
            $response = wp_remote_get($url, [
                'timeout' => 30,
                'sslverify' => false // For local testing
            ]);
            
            if (is_wp_error($response)) {
                throw new Exception('Failed to download shard: ' . $response->get_error_message());
            }
            
            $body = wp_remote_retrieve_body($response);
            
            // Load image from blob
            $image = imagecreatefromstring($body);
            if (!$image) {
                throw new Exception('Failed to load shard image');
            }
            
            $images[] = $image;
        }
        
        return $images;
    }
    
    /**
     * Extract data from steganography
     */
    private function extract_from_stego($images) {
        $shards = [];
        
        foreach ($images as $i => $image) {
            error_log('[QuantumAVIF Download] Extracting shard ' . ($i + 1));
            $data = $this->stego->extract($image);
            $shards[] = $data;
            imagedestroy($image);
        }
        
        return $shards;
    }
    
    /**
     * LEANN decompress
     */
    private function leann_decompress($encoded_shards, $metadata) {
        error_log('[QuantumAVIF Download] LEANN decompressing...');
        
        // Parse physical shards
        $physical = [];
        foreach ($encoded_shards as $shard_data) {
            // Decode shard structure (simplified)
            $physical[] = [
                'type' => 'hub', // TODO: Proper type detection
                'data' => $shard_data
            ];
        }
        
        $shards = $this->leann->decode($physical, $metadata);
        
        error_log('[QuantumAVIF Download] LEANN output: ' . count($shards) . ' shards');
        
        return $shards;
    }
    
    /**
     * Reed-Solomon decode
     */
    private function erasure_decode($shards, $original_size) {
        error_log('[QuantumAVIF Download] Reed-Solomon decoding...');
        
        $data = $this->erasure->decode($shards, $original_size);
        
        return $data;
    }
    
    /**
     * Stream file download to browser
     */
    public function stream_download($manifest_id) {
        $result = $this->download($manifest_id);
        
        if (!$result['success']) {
            wp_die('Download failed: ' . $result['error']);
        }
        
        // Set headers
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $result['filename'] . '"');
        header('Content-Length: ' . $result['size']);
        header('Cache-Control: no-cache');
        
        // Stream data
        echo $result['data'];
        exit;
    }
}
