<?php
/**
 * DataVault Core - Storage Engine
 * 
 * Handles Custom Post Type registration and core database operations.
 * All data stored as gzip-compressed base64 in post meta.
 * 
 * @package Q3_DataVault
 */

if (!defined('ABSPATH')) exit;

class Q3_DataVault_Core {
    
    // Post types
    const CPT_CHUNK = 'q3dv_chunk';
    const CPT_MANIFEST = 'q3dv_manifest';
    
    // Meta keys for chunks
    const META_DATA = '_q3dv_data';
    const META_CHECKSUM = '_q3dv_checksum';
    const META_SIZE_ORIGINAL = '_q3dv_size_original';
    const META_SIZE_STORED = '_q3dv_size_stored';
    const META_MANIFEST_ID = '_q3dv_manifest_id';
    const META_CHUNK_INDEX = '_q3dv_chunk_index';
    const META_CDN_URL = '_q3dv_cdn_url';
    const META_COMPRESSED = '_q3dv_compressed';
    
    // Meta keys for manifests
    const META_FILENAME = '_q3dv_filename';
    const META_FILESIZE = '_q3dv_filesize';
    const META_FILETYPE = '_q3dv_filetype';
    const META_CHUNK_COUNT = '_q3dv_chunk_count';
    const META_CHUNK_IDS = '_q3dv_chunk_ids';
    const META_FILE_CHECKSUM = '_q3dv_file_checksum';
    const META_UPLOADED_AT = '_q3dv_uploaded_at';
    const META_FOLDER = '_q3dv_folder';
    const META_DOWNLOADS = '_q3dv_downloads';
    const META_PARITY_DATA = '_q3dv_parity_data';
    
    /**
     * Register Custom Post Types
     */
    public function register_post_types() {
        // Chunk CPT - stores individual data chunks
        register_post_type(self::CPT_CHUNK, [
            'labels' => [
                'name' => __('DataVault Chunks', 'q3-datavault'),
                'singular_name' => __('Chunk', 'q3-datavault')
            ],
            'public' => false,
            'show_ui' => false,
            'show_in_menu' => false,
            'show_in_rest' => false,
            'supports' => ['title'],
            'can_export' => true,
            'delete_with_user' => false
        ]);
        
        // Manifest CPT - tracks files and their chunks
        register_post_type(self::CPT_MANIFEST, [
            'labels' => [
                'name' => __('DataVault Files', 'q3-datavault'),
                'singular_name' => __('File', 'q3-datavault')
            ],
            'public' => false,
            'show_ui' => false,
            'show_in_menu' => false,
            'show_in_rest' => false,
            'supports' => ['title'],
            'can_export' => true,
            'delete_with_user' => false
        ]);
    }
    
    /**
     * Compress data using gzip
     */
    public function compress($data, $level = 9) {
        $compressed = @gzencode($data, $level);
        
        if ($compressed === false || strlen($compressed) >= strlen($data)) {
            return ['data' => $data, 'compressed' => false];
        }
        
        return ['data' => $compressed, 'compressed' => true];
    }
    
    /**
     * Decompress gzipped data
     */
    public function decompress($data) {
        $decompressed = @gzdecode($data);
        return $decompressed !== false ? $decompressed : $data;
    }
    
    /**
     * Encode binary data to base64
     */
    public function encode($data) {
        return base64_encode($data);
    }
    
    /**
     * Decode base64 to binary
     */
    public function decode($data) {
        return base64_decode($data);
    }
    
    /**
     * Calculate checksum of data
     */
    public function checksum($data) {
        // Use xxHash if available (fastest)
        if (function_exists('hash') && in_array('xxh128', hash_algos())) {
            return hash('xxh128', $data);
        }
        
        // Fallback to SHA256
        return hash('sha256', $data);
    }
    
    /**
     * Verify checksum
     */
    public function verify_checksum($data, $expected) {
        return hash_equals($expected, $this->checksum($data));
    }
    
    /**
     * Generate unique ID for manifests/chunks
     */
    public function generate_id() {
        return wp_generate_uuid4();
    }
    
    /**
     * Get storage statistics
     */
    public function get_storage_stats() {
        global $wpdb;
        
        // Count chunks
        $chunks = wp_count_posts(self::CPT_CHUNK);
        $chunk_count = isset($chunks->publish) ? $chunks->publish : 0;
        
        // Count manifests (files)
        $manifests = wp_count_posts(self::CPT_MANIFEST);
        $file_count = isset($manifests->publish) ? $manifests->publish : 0;
        
        // Calculate total stored size
        $stored_size = $wpdb->get_var($wpdb->prepare(
            "SELECT SUM(CAST(pm.meta_value AS UNSIGNED)) 
             FROM {$wpdb->postmeta} pm
             JOIN {$wpdb->posts} p ON pm.post_id = p.ID
             WHERE p.post_type = %s AND pm.meta_key = %s",
            self::CPT_CHUNK, self::META_SIZE_STORED
        ));
        
        // Calculate total original size
        $original_size = $wpdb->get_var($wpdb->prepare(
            "SELECT SUM(CAST(pm.meta_value AS UNSIGNED)) 
             FROM {$wpdb->postmeta} pm
             JOIN {$wpdb->posts} p ON pm.post_id = p.ID
             WHERE p.post_type = %s AND pm.meta_key = %s",
            self::CPT_CHUNK, self::META_SIZE_ORIGINAL
        ));
        
        // Calculate compression ratio
        $compression_ratio = $original_size > 0 
            ? round((1 - $stored_size / $original_size) * 100, 1) 
            : 0;
        
        return [
            'files' => intval($file_count),
            'chunks' => intval($chunk_count),
            'stored_bytes' => intval($stored_size),
            'stored_mb' => round(intval($stored_size) / 1024 / 1024, 2),
            'stored_gb' => round(intval($stored_size) / 1024 / 1024 / 1024, 3),
            'original_bytes' => intval($original_size),
            'original_mb' => round(intval($original_size) / 1024 / 1024, 2),
            'compression_ratio' => $compression_ratio . '%',
            'space_saved_mb' => round((intval($original_size) - intval($stored_size)) / 1024 / 1024, 2)
        ];
    }
    
    /**
     * Get database table sizes
     */
    public function get_database_sizes() {
        global $wpdb;
        
        $result = $wpdb->get_row(
            "SELECT 
                SUM(data_length + index_length) as total_size,
                SUM(data_length) as data_size,
                SUM(index_length) as index_size
             FROM information_schema.tables 
             WHERE table_schema = DATABASE() 
             AND table_name IN ('{$wpdb->posts}', '{$wpdb->postmeta}')"
        );
        
        return [
            'total_bytes' => intval($result->total_size ?? 0),
            'total_mb' => round(intval($result->total_size ?? 0) / 1024 / 1024, 2),
            'data_mb' => round(intval($result->data_size ?? 0) / 1024 / 1024, 2),
            'index_mb' => round(intval($result->index_size ?? 0) / 1024 / 1024, 2)
        ];
    }
    
    /**
     * Categorize file by extension
     */
    public function categorize_file($filename) {
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        
        $categories = [
            'Images' => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico'],
            'Videos' => ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v'],
            'Audio' => ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a'],
            'Documents' => ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'],
            'Archives' => ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
            'Code' => ['js', 'css', 'html', 'php', 'py', 'json', 'xml', 'sql'],
            'Models' => ['safetensors', 'gguf', 'bin', 'onnx', 'pt', 'h5']
        ];
        
        foreach ($categories as $category => $extensions) {
            if (in_array($ext, $extensions)) {
                return $category;
            }
        }
        
        return 'Other';
    }

    /**
     * Helper to store raw data as a manifest with chunks
     */
    public function store_data($filename, $data, $meta = []) {
        $manifest_mgr = q3_datavault()->manifest;
        $chunk_mgr = q3_datavault()->chunk;
        
        $size = strlen($data);
        $chunk_size = intval(get_option('q3_datavault_chunk_size', 512 * 1024));
        
        $manifest = $manifest_mgr->create($filename, $size, $chunk_size);
        if (!$manifest['success']) return false;
        
        $manifest_id = $manifest['manifest_id'];
        $chunk_ids = [];
        
        // Split and store chunks
        $chunks = str_split($data, $chunk_size);
        foreach ($chunks as $index => $chunk_data) {
            $res = $chunk_mgr->store($manifest_id, $index, $chunk_data);
            if ($res['success']) {
                $chunk_ids[] = $res['post_id'];
            }
        }
        
        // Add custom meta to manifest if provided
        if (!empty($meta)) {
            $post_id = $manifest['post_id'];
            foreach ($meta as $key => $val) {
                update_post_meta($post_id, '_q3dv_ext_' . $key, $val);
            }
        }
        
        $manifest_mgr->finalize($manifest_id, $chunk_ids, $this->checksum($data));
        
        return $manifest_id;
    }
}
