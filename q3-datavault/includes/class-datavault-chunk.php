<?php
/**
 * DataVault Chunk Manager
 * 
 * Handles individual chunk storage and retrieval.
 * All operations use database only - no filesystem access.
 * 
 * @package Q3_DataVault
 */

if (!defined('ABSPATH')) exit;

class Q3_DataVault_Chunk {
    
    /** @var Q3_DataVault_Core */
    private $core;
    
    /**
     * Constructor
     */
    public function __construct(Q3_DataVault_Core $core) {
        $this->core = $core;
    }
    
    /**
     * Store a chunk of data
     * 
     * @param string $manifest_id Manifest this chunk belongs to
     * @param int $index Chunk index (0-based)
     * @param string $data Raw binary data
     * @param string $cdn_url Optional CDN backup URL
     * @return array Result with post_id, sizes, etc.
     */
    public function store($manifest_id, $index, $data, $cdn_url = '') {
        $original_size = strlen($data);
        
        // Calculate checksum BEFORE compression
        $checksum = $this->core->checksum($data);
        
        // Compress
        $compression = $this->core->compress($data);
        $data_to_store = $compression['data'];
        $is_compressed = $compression['compressed'];
        
        $stored_size = strlen($data_to_store);
        
        // Encode to base64
        $encoded = $this->core->encode($data_to_store);
        
        // Add compression prefix
        $storage_value = ($is_compressed ? 'gz:' : 'raw:') . $encoded;
        
        // Check if chunk already exists
        $existing_id = $this->find_chunk_id($manifest_id, $index);
        
        // Prepare post data
        $post_data = [
            'post_type' => Q3_DataVault_Core::CPT_CHUNK,
            'post_status' => 'publish',
            'post_title' => "Chunk {$index} | {$manifest_id}"
        ];
        
        if ($existing_id) {
            $post_data['ID'] = $existing_id;
            $post_id = wp_update_post($post_data);
        } else {
            $post_id = wp_insert_post($post_data);
        }
        
        if (is_wp_error($post_id)) {
            return [
                'success' => false,
                'error' => $post_id->get_error_message()
            ];
        }
        
        // Store all metadata
        update_post_meta($post_id, Q3_DataVault_Core::META_DATA, $storage_value);
        update_post_meta($post_id, Q3_DataVault_Core::META_CHECKSUM, $checksum);
        update_post_meta($post_id, Q3_DataVault_Core::META_SIZE_ORIGINAL, $original_size);
        update_post_meta($post_id, Q3_DataVault_Core::META_SIZE_STORED, $stored_size);
        update_post_meta($post_id, Q3_DataVault_Core::META_MANIFEST_ID, $manifest_id);
        update_post_meta($post_id, Q3_DataVault_Core::META_CHUNK_INDEX, $index);
        update_post_meta($post_id, Q3_DataVault_Core::META_COMPRESSED, $is_compressed ? '1' : '0');
        
        if ($cdn_url) {
            update_post_meta($post_id, Q3_DataVault_Core::META_CDN_URL, $cdn_url);
        }
        
        return [
            'success' => true,
            'post_id' => $post_id,
            'index' => $index,
            'original_size' => $original_size,
            'stored_size' => $stored_size,
            'checksum' => $checksum,
            'compressed' => $is_compressed,
            'compression_ratio' => $is_compressed 
                ? round($stored_size / $original_size * 100, 1) . '%' 
                : '100%'
        ];
    }
    
    /**
     * Retrieve a chunk
     * 
     * @param string $manifest_id Manifest ID
     * @param int $index Chunk index
     * @return array Result with data, source, etc.
     */
    public function retrieve($manifest_id, $index) {
        $post_id = $this->find_chunk_id($manifest_id, $index);
        
        if (!$post_id) {
            return [
                'success' => false,
                'error' => "Chunk {$index} not found for manifest {$manifest_id}"
            ];
        }
        
        // Get stored data from database
        $storage_value = get_post_meta($post_id, Q3_DataVault_Core::META_DATA, true);
        
        if (!$storage_value) {
            return [
                'success' => false,
                'error' => 'Chunk data not found in database'
            ];
        }
        
        // Decode the stored data
        $data = $this->decode_storage_value($storage_value);
        
        if ($data === false) {
            // Try CDN fallback
            return $this->retrieve_from_cdn($post_id, $manifest_id, $index);
        }
        
        // Verify checksum
        $expected_checksum = get_post_meta($post_id, Q3_DataVault_Core::META_CHECKSUM, true);
        
        if ($expected_checksum && !$this->core->verify_checksum($data, $expected_checksum)) {
            error_log("[DataVault] Checksum mismatch for chunk {$index} of {$manifest_id}");
            
            // Try CDN fallback
            return $this->retrieve_from_cdn($post_id, $manifest_id, $index);
        }
        
        return [
            'success' => true,
            'data' => $data,
            'source' => 'database',
            'post_id' => $post_id,
            'size' => strlen($data),
            'checksum_verified' => true
        ];
    }
    
    /**
     * Decode storage value (handles compression prefix)
     */
    private function decode_storage_value($storage_value) {
        // Check for compression prefix
        if (str_starts_with($storage_value, 'gz:')) {
            $base64 = substr($storage_value, 3);
            $binary = $this->core->decode($base64);
            
            if ($binary === false) return false;
            
            return $this->core->decompress($binary);
        }
        
        if (str_starts_with($storage_value, 'raw:')) {
            $base64 = substr($storage_value, 4);
            return $this->core->decode($base64);
        }
        
        // Legacy format - plain base64
        return $this->core->decode($storage_value);
    }
    
    /**
     * Retrieve from CDN backup
     */
    private function retrieve_from_cdn($post_id, $manifest_id, $index) {
        $cdn_url = get_post_meta($post_id, Q3_DataVault_Core::META_CDN_URL, true);
        
        if (!$cdn_url) {
            return [
                'success' => false,
                'error' => "Chunk {$index} corrupted and no CDN backup available"
            ];
        }
        
        error_log("[DataVault] Falling back to CDN for chunk {$index} of {$manifest_id}");
        
        $response = wp_remote_get($cdn_url, ['timeout' => 30]);
        
        if (is_wp_error($response)) {
            return [
                'success' => false,
                'error' => 'CDN fallback failed: ' . $response->get_error_message()
            ];
        }
        
        $code = wp_remote_retrieve_response_code($response);
        
        if ($code !== 200) {
            return [
                'success' => false,
                'error' => "CDN returned HTTP {$code}"
            ];
        }
        
        $data = wp_remote_retrieve_body($response);
        
        return [
            'success' => true,
            'data' => $data,
            'source' => 'cdn',
            'url' => $cdn_url,
            'size' => strlen($data),
            'recovered' => true
        ];
    }
    
    /**
     * Find chunk post ID by manifest and index
     */
    private function find_chunk_id($manifest_id, $index) {
        global $wpdb;
        
        $post_id = $wpdb->get_var($wpdb->prepare(
            "SELECT p.ID FROM {$wpdb->posts} p
             JOIN {$wpdb->postmeta} pm1 ON p.ID = pm1.post_id
             JOIN {$wpdb->postmeta} pm2 ON p.ID = pm2.post_id
             WHERE p.post_type = %s
             AND pm1.meta_key = %s AND pm1.meta_value = %s
             AND pm2.meta_key = %s AND pm2.meta_value = %s
             LIMIT 1",
            Q3_DataVault_Core::CPT_CHUNK,
            Q3_DataVault_Core::META_MANIFEST_ID, $manifest_id,
            Q3_DataVault_Core::META_CHUNK_INDEX, $index
        ));
        
        return $post_id ? intval($post_id) : null;
    }
    
    /**
     * Delete all chunks for a manifest
     */
    public function delete_manifest_chunks($manifest_id) {
        global $wpdb;
        
        $chunk_ids = $wpdb->get_col($wpdb->prepare(
            "SELECT p.ID FROM {$wpdb->posts} p
             JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
             WHERE p.post_type = %s
             AND pm.meta_key = %s AND pm.meta_value = %s",
            Q3_DataVault_Core::CPT_CHUNK,
            Q3_DataVault_Core::META_MANIFEST_ID, $manifest_id
        ));
        
        $deleted = 0;
        foreach ($chunk_ids as $id) {
            if (wp_delete_post($id, true)) {
                $deleted++;
            }
        }
        
        return $deleted;
    }
    
    /**
     * Get all chunks for a manifest
     */
    public function get_manifest_chunks($manifest_id) {
        global $wpdb;
        
        $results = $wpdb->get_results($wpdb->prepare(
            "SELECT p.ID, pm.meta_value as chunk_index
             FROM {$wpdb->posts} p
             JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
             WHERE p.post_type = %s
             AND pm.meta_key = %s
             AND p.ID IN (
                 SELECT post_id FROM {$wpdb->postmeta}
                 WHERE meta_key = %s AND meta_value = %s
             )
             ORDER BY CAST(pm.meta_value AS UNSIGNED) ASC",
            Q3_DataVault_Core::CPT_CHUNK,
            Q3_DataVault_Core::META_CHUNK_INDEX,
            Q3_DataVault_Core::META_MANIFEST_ID, $manifest_id
        ));
        
        $chunks = [];
        foreach ($results as $row) {
            $chunks[] = [
                'post_id' => intval($row->ID),
                'index' => intval($row->chunk_index),
                'original_size' => intval(get_post_meta($row->ID, Q3_DataVault_Core::META_SIZE_ORIGINAL, true)),
                'stored_size' => intval(get_post_meta($row->ID, Q3_DataVault_Core::META_SIZE_STORED, true)),
                'checksum' => get_post_meta($row->ID, Q3_DataVault_Core::META_CHECKSUM, true),
                'has_cdn' => !empty(get_post_meta($row->ID, Q3_DataVault_Core::META_CDN_URL, true))
            ];
        }
        
        return $chunks;
    }
}
