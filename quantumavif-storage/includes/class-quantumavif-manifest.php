<?php
/**
 * QuantumAVIF Manifest Handler
 * 
 * Manages shard manifests for reconstruction
 */

if (!defined('ABSPATH')) {
    exit;
}

class QuantumAVIF_Manifest {
    
    /**
     * Create manifest for uploaded file
     */
    public function create_manifest($file_id, $shards, $metadata = []) {
        $manifest = [
            'file_id' => $file_id,
            'timestamp' => time(),
            'shards' => $shards,
            'metadata' => $metadata,
            'version' => '1.0'
        ];
        
        // Store in WordPress options
        add_option('quantumavif_manifest_' . $file_id, json_encode($manifest));
        
        return $manifest;
    }
    
    /**
     * Get manifest by ID
     */
    public function get_manifest($file_id) {
        $manifest_json = get_option('quantumavif_manifest_' . $file_id);
        
        if (!$manifest_json) {
            return false;
        }
        
        return json_decode($manifest_json, true);
    }
    
    /**
     * Delete manifest
     */
    public function delete_manifest($file_id) {
        delete_option('quantumavif_manifest_' . $file_id);
    }
}
