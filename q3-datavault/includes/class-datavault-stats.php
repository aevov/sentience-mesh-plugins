<?php
/**
 * DataVault Statistics
 * 
 * Provides detailed statistics and monitoring.
 * 
 * @package Q3_DataVault
 */

if (!defined('ABSPATH')) exit;

class Q3_DataVault_Stats {
    
    /** @var Q3_DataVault_Core */
    private $core;
    
    /**
     * Constructor
     */
    public function __construct(Q3_DataVault_Core $core) {
        $this->core = $core;
    }
    
    /**
     * Get comprehensive statistics
     */
    public function get_all() {
        return [
            'storage' => $this->get_storage_stats(),
            'files' => $this->get_file_stats(),
            'compression' => $this->get_compression_stats(),
            'activity' => $this->get_activity_stats(),
            'capacity' => $this->get_capacity_estimate()
        ];
    }
    
    /**
     * Get storage statistics
     */
    public function get_storage_stats() {
        return $this->core->get_storage_stats();
    }
    
    /**
     * Get file statistics by type
     */
    public function get_file_stats() {
        global $wpdb;
        
        $results = $wpdb->get_results($wpdb->prepare(
            "SELECT meta_value as folder, COUNT(*) as count
             FROM {$wpdb->postmeta} pm
             JOIN {$wpdb->posts} p ON pm.post_id = p.ID
             WHERE p.post_type = %s AND pm.meta_key = %s
             GROUP BY meta_value
             ORDER BY count DESC",
            Q3_DataVault_Core::CPT_MANIFEST,
            Q3_DataVault_Core::META_FOLDER
        ));
        
        $by_folder = [];
        foreach ($results as $row) {
            $by_folder[$row->folder] = intval($row->count);
        }
        
        return [
            'by_folder' => $by_folder,
            'total_folders' => count($by_folder)
        ];
    }
    
    /**
     * Get compression statistics
     */
    public function get_compression_stats() {
        global $wpdb;
        
        // Get compressed vs uncompressed counts
        $compressed = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} pm
             JOIN {$wpdb->posts} p ON pm.post_id = p.ID
             WHERE p.post_type = %s AND pm.meta_key = %s AND pm.meta_value = '1'",
            Q3_DataVault_Core::CPT_CHUNK,
            Q3_DataVault_Core::META_COMPRESSED
        ));
        
        $uncompressed = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} pm
             JOIN {$wpdb->posts} p ON pm.post_id = p.ID
             WHERE p.post_type = %s AND pm.meta_key = %s AND pm.meta_value = '0'",
            Q3_DataVault_Core::CPT_CHUNK,
            Q3_DataVault_Core::META_COMPRESSED
        ));
        
        $total = intval($compressed) + intval($uncompressed);
        
        return [
            'compressed_chunks' => intval($compressed),
            'uncompressed_chunks' => intval($uncompressed),
            'compression_rate' => $total > 0 
                ? round($compressed / $total * 100, 1) . '%' 
                : '0%'
        ];
    }
    
    /**
     * Get activity statistics
     */
    public function get_activity_stats() {
        global $wpdb;
        
        // Files uploaded in last 24 hours
        $last_24h = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->posts}
             WHERE post_type = %s AND post_date > DATE_SUB(NOW(), INTERVAL 24 HOUR)",
            Q3_DataVault_Core::CPT_MANIFEST
        ));
        
        // Files uploaded in last 7 days
        $last_7d = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->posts}
             WHERE post_type = %s AND post_date > DATE_SUB(NOW(), INTERVAL 7 DAY)",
            Q3_DataVault_Core::CPT_MANIFEST
        ));
        
        // Total downloads
        $total_downloads = $wpdb->get_var($wpdb->prepare(
            "SELECT SUM(CAST(meta_value AS UNSIGNED)) FROM {$wpdb->postmeta} pm
             JOIN {$wpdb->posts} p ON pm.post_id = p.ID
             WHERE p.post_type = %s AND pm.meta_key = %s",
            Q3_DataVault_Core::CPT_MANIFEST,
            Q3_DataVault_Core::META_DOWNLOADS
        ));
        
        return [
            'uploads_24h' => intval($last_24h),
            'uploads_7d' => intval($last_7d),
            'total_downloads' => intval($total_downloads)
        ];
    }
    
    /**
     * Get capacity estimate
     */
    public function get_capacity_estimate() {
        $storage = $this->core->get_storage_stats();
        $db = $this->core->get_database_sizes();
        
        // Estimate based on typical MySQL limits
        // InnoDB max table size: ~64TB
        // PostMeta can grow to ~256TB with proper partitioning
        
        $current_used_mb = $db['total_mb'];
        $estimated_limit_tb = 64; // Conservative estimate
        $estimated_limit_mb = $estimated_limit_tb * 1024 * 1024;
        
        $used_percentage = $current_used_mb / $estimated_limit_mb * 100;
        $remaining_tb = $estimated_limit_tb - ($current_used_mb / 1024 / 1024);
        
        return [
            'used_mb' => $current_used_mb,
            'estimated_limit_tb' => $estimated_limit_tb,
            'remaining_tb' => round($remaining_tb, 2),
            'used_percentage' => round($used_percentage, 4) . '%',
            'theoretical_max' => '64TB per database (scalable with sharding)'
        ];
    }
    
    /**
     * Get top files by size
     */
    public function get_top_files($limit = 10) {
        global $wpdb;
        
        $results = $wpdb->get_results($wpdb->prepare(
            "SELECT p.ID, p.post_title, pm.meta_value as filesize
             FROM {$wpdb->posts} p
             JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
             WHERE p.post_type = %s AND pm.meta_key = %s
             ORDER BY CAST(pm.meta_value AS UNSIGNED) DESC
             LIMIT %d",
            Q3_DataVault_Core::CPT_MANIFEST,
            Q3_DataVault_Core::META_FILESIZE,
            $limit
        ));
        
        $files = [];
        foreach ($results as $row) {
            $files[] = [
                'id' => $row->ID,
                'filename' => $row->post_title,
                'size' => intval($row->filesize),
                'size_mb' => round(intval($row->filesize) / 1024 / 1024, 2)
            ];
        }
        
        return $files;
    }
    
    /**
     * Get most downloaded files
     */
    public function get_most_downloaded($limit = 10) {
        global $wpdb;
        
        $results = $wpdb->get_results($wpdb->prepare(
            "SELECT p.ID, p.post_title, pm.meta_value as downloads
             FROM {$wpdb->posts} p
             JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
             WHERE p.post_type = %s AND pm.meta_key = %s
             ORDER BY CAST(pm.meta_value AS UNSIGNED) DESC
             LIMIT %d",
            Q3_DataVault_Core::CPT_MANIFEST,
            Q3_DataVault_Core::META_DOWNLOADS,
            $limit
        ));
        
        $files = [];
        foreach ($results as $row) {
            $files[] = [
                'id' => $row->ID,
                'filename' => $row->post_title,
                'downloads' => intval($row->downloads)
            ];
        }
        
        return $files;
    }
}
