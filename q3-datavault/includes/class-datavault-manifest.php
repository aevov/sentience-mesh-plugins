<?php
/**
 * DataVault Manifest Manager
 * 
 * Tracks files and their associated chunks.
 * Provides file-level operations.
 * 
 * @package Q3_DataVault
 */

if (!defined('ABSPATH')) exit;

class Q3_DataVault_Manifest {
    
    /** @var Q3_DataVault_Core */
    private $core;
    
    /**
     * Constructor
     */
    public function __construct(Q3_DataVault_Core $core) {
        $this->core = $core;
    }
    
    /**
     * Create a new manifest for file upload
     * 
     * @param string $filename Original filename
     * @param int $filesize File size in bytes
     * @param int $chunk_size Size of each chunk
     * @return array Manifest data with ID
     */
    public function create($filename, $filesize, $chunk_size = null) {
        if (!$chunk_size) {
            $chunk_size = intval(get_option('q3_datavault_chunk_size', 512 * 1024));
        }
        
        $manifest_id = $this->core->generate_id();
        $chunk_count = max(1, ceil($filesize / $chunk_size));
        $category = $this->core->categorize_file($filename);
        
        // Create manifest post
        $post_id = wp_insert_post([
            'post_type' => Q3_DataVault_Core::CPT_MANIFEST,
            'post_status' => 'publish',
            'post_title' => $filename
        ]);
        
        if (is_wp_error($post_id)) {
            return [
                'success' => false,
                'error' => $post_id->get_error_message()
            ];
        }
        
        // Store metadata
        update_post_meta($post_id, Q3_DataVault_Core::META_FILENAME, $filename);
        update_post_meta($post_id, Q3_DataVault_Core::META_FILESIZE, $filesize);
        update_post_meta($post_id, Q3_DataVault_Core::META_FILETYPE, pathinfo($filename, PATHINFO_EXTENSION));
        update_post_meta($post_id, Q3_DataVault_Core::META_CHUNK_COUNT, $chunk_count);
        update_post_meta($post_id, Q3_DataVault_Core::META_FOLDER, '/' . $category);
        update_post_meta($post_id, Q3_DataVault_Core::META_UPLOADED_AT, current_time('mysql'));
        update_post_meta($post_id, Q3_DataVault_Core::META_DOWNLOADS, 0);
        update_post_meta($post_id, Q3_DataVault_Core::META_MANIFEST_ID, $manifest_id);
        
        return [
            'success' => true,
            'manifest_id' => $manifest_id,
            'post_id' => $post_id,
            'filename' => $filename,
            'filesize' => $filesize,
            'chunk_size' => $chunk_size,
            'chunk_count' => $chunk_count,
            'folder' => '/' . $category
        ];
    }
    
    /**
     * Finalize manifest after all chunks uploaded
     */
    public function finalize($manifest_id, $chunk_ids = [], $file_checksum = '', $parity_data = null) {
        $post_id = $this->find_by_manifest_id($manifest_id);
        
        if (!$post_id) {
            return ['success' => false, 'error' => 'Manifest not found'];
        }
        
        // Store chunk IDs
        update_post_meta($post_id, Q3_DataVault_Core::META_CHUNK_IDS, $chunk_ids);
        
        // Store file checksum
        if ($file_checksum) {
            update_post_meta($post_id, Q3_DataVault_Core::META_FILE_CHECKSUM, $file_checksum);
        }
        
        // Store parity data
        if ($parity_data) {
            update_post_meta($post_id, Q3_DataVault_Core::META_PARITY_DATA, $parity_data);
        }
        
        return [
            'success' => true,
            'manifest_id' => $manifest_id,
            'chunks_stored' => count($chunk_ids)
        ];
    }
    
    /**
     * Get manifest by ID
     */
    public function get($manifest_id) {
        $post_id = $this->find_by_manifest_id($manifest_id);
        
        if (!$post_id) {
            return null;
        }
        
        return $this->build_manifest_data($post_id);
    }
    
    /**
     * Get manifest by post ID
     */
    public function get_by_post_id($post_id) {
        $post = get_post($post_id);
        
        if (!$post || $post->post_type !== Q3_DataVault_Core::CPT_MANIFEST) {
            return null;
        }
        
        return $this->build_manifest_data($post_id);
    }
    
    /**
     * Build manifest data array from post ID
     */
    private function build_manifest_data($post_id) {
        return [
            'post_id' => $post_id,
            'manifest_id' => get_post_meta($post_id, Q3_DataVault_Core::META_MANIFEST_ID, true),
            'filename' => get_post_meta($post_id, Q3_DataVault_Core::META_FILENAME, true),
            'filesize' => intval(get_post_meta($post_id, Q3_DataVault_Core::META_FILESIZE, true)),
            'filetype' => get_post_meta($post_id, Q3_DataVault_Core::META_FILETYPE, true),
            'chunk_count' => intval(get_post_meta($post_id, Q3_DataVault_Core::META_CHUNK_COUNT, true)),
            'chunk_ids' => get_post_meta($post_id, Q3_DataVault_Core::META_CHUNK_IDS, true) ?: [],
            'folder' => get_post_meta($post_id, Q3_DataVault_Core::META_FOLDER, true),
            'uploaded_at' => get_post_meta($post_id, Q3_DataVault_Core::META_UPLOADED_AT, true),
            'downloads' => intval(get_post_meta($post_id, Q3_DataVault_Core::META_DOWNLOADS, true)),
            'file_checksum' => get_post_meta($post_id, Q3_DataVault_Core::META_FILE_CHECKSUM, true),
            'parity_data' => get_post_meta($post_id, Q3_DataVault_Core::META_PARITY_DATA, true)
        ];
    }
    
    /**
     * Find post ID by manifest ID
     */
    private function find_by_manifest_id($manifest_id) {
        global $wpdb;
        
        return $wpdb->get_var($wpdb->prepare(
            "SELECT p.ID FROM {$wpdb->posts} p
             JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
             WHERE p.post_type = %s
             AND pm.meta_key = %s AND pm.meta_value = %s
             LIMIT 1",
            Q3_DataVault_Core::CPT_MANIFEST,
            Q3_DataVault_Core::META_MANIFEST_ID, $manifest_id
        ));
    }
    
    /**
     * Delete manifest and all its chunks
     */
    public function delete($manifest_id) {
        $datavault = q3_datavault();
        
        $post_id = $this->find_by_manifest_id($manifest_id);
        
        if (!$post_id) {
            return ['success' => false, 'error' => 'Manifest not found'];
        }
        
        // Delete all chunks first
        $chunks_deleted = $datavault->chunk->delete_manifest_chunks($manifest_id);
        
        // Delete manifest
        wp_delete_post($post_id, true);
        
        return [
            'success' => true,
            'chunks_deleted' => $chunks_deleted
        ];
    }
    
    /**
     * List all files with pagination
     */
    public function list_files($args = []) {
        $defaults = [
            'page' => 1,
            'per_page' => 20,
            'folder' => '',
            'search' => '',
            'orderby' => 'date',
            'order' => 'DESC'
        ];
        
        $args = wp_parse_args($args, $defaults);
        
        $query_args = [
            'post_type' => Q3_DataVault_Core::CPT_MANIFEST,
            'post_status' => 'publish',
            'posts_per_page' => $args['per_page'],
            'paged' => $args['page'],
            'orderby' => $args['orderby'],
            'order' => $args['order']
        ];
        
        // Filter by folder
        if ($args['folder']) {
            $query_args['meta_query'][] = [
                'key' => Q3_DataVault_Core::META_FOLDER,
                'value' => $args['folder'],
                'compare' => '='
            ];
        }
        
        // Search
        if ($args['search']) {
            $query_args['s'] = $args['search'];
        }
        
        $query = new WP_Query($query_args);
        
        $files = [];
        foreach ($query->posts as $post) {
            $files[] = $this->build_manifest_data($post->ID);
        }
        
        return [
            'files' => $files,
            'total' => $query->found_posts,
            'pages' => $query->max_num_pages,
            'page' => $args['page']
        ];
    }
    
    /**
     * Get all folders
     */
    public function get_folders() {
        global $wpdb;
        
        $folders = $wpdb->get_col($wpdb->prepare(
            "SELECT DISTINCT meta_value FROM {$wpdb->postmeta} pm
             JOIN {$wpdb->posts} p ON pm.post_id = p.ID
             WHERE p.post_type = %s AND pm.meta_key = %s
             ORDER BY meta_value ASC",
            Q3_DataVault_Core::CPT_MANIFEST,
            Q3_DataVault_Core::META_FOLDER
        ));
        
        return $folders ?: [];
    }
    
    /**
     * Increment download count
     */
    public function increment_downloads($manifest_id) {
        $post_id = $this->find_by_manifest_id($manifest_id);
        
        if ($post_id) {
            $current = intval(get_post_meta($post_id, Q3_DataVault_Core::META_DOWNLOADS, true));
            update_post_meta($post_id, Q3_DataVault_Core::META_DOWNLOADS, $current + 1);
        }
    }
    
    /**
     * Move file to different folder
     */
    public function move($manifest_id, $new_folder) {
        $post_id = $this->find_by_manifest_id($manifest_id);
        
        if (!$post_id) {
            return ['success' => false, 'error' => 'File not found'];
        }
        
        update_post_meta($post_id, Q3_DataVault_Core::META_FOLDER, $new_folder);
        
        return ['success' => true, 'folder' => $new_folder];
    }
    
    /**
     * Rename file
     */
    public function rename($manifest_id, $new_name) {
        $post_id = $this->find_by_manifest_id($manifest_id);
        
        if (!$post_id) {
            return ['success' => false, 'error' => 'File not found'];
        }
        
        wp_update_post(['ID' => $post_id, 'post_title' => $new_name]);
        update_post_meta($post_id, Q3_DataVault_Core::META_FILENAME, $new_name);
        
        return ['success' => true, 'filename' => $new_name];
    }
}
