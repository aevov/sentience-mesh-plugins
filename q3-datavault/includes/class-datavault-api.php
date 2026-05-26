<?php
/**
 * DataVault REST API
 * 
 * Complete REST API for upload, download, and file management.
 * 
 * @package Q3_DataVault
 */

if (!defined('ABSPATH')) exit;

class Q3_DataVault_API {
    
    /** @var Q3_DataVault */
    private $datavault;
    
    /** @var string */
    private $namespace = 'datavault/v1';
    
    /**
     * Constructor
     */
    public function __construct(Q3_DataVault $datavault) {
        $this->datavault = $datavault;
    }
    
    /**
     * Register REST routes
     */
    public function register_routes() {
        // Upload endpoints
        register_rest_route($this->namespace, '/upload/init', [
            'methods' => 'POST',
            'callback' => [$this, 'upload_init'],
            'permission_callback' => [$this, 'check_upload_permission']
        ]);
        
        register_rest_route($this->namespace, '/upload/chunk', [
            'methods' => 'POST',
            'callback' => [$this, 'upload_chunk'],
            'permission_callback' => [$this, 'check_upload_permission']
        ]);
        
        register_rest_route($this->namespace, '/upload/finalize', [
            'methods' => 'POST',
            'callback' => [$this, 'upload_finalize'],
            'permission_callback' => [$this, 'check_upload_permission']
        ]);
        
        // Download endpoint
        register_rest_route($this->namespace, '/download/(?P<id>[a-zA-Z0-9-]+)', [
            'methods' => 'GET',
            'callback' => [$this, 'download'],
            'permission_callback' => '__return_true' // Public downloads
        ]);
        
        // File endpoints
        register_rest_route($this->namespace, '/files', [
            'methods' => 'GET',
            'callback' => [$this, 'list_files'],
            'permission_callback' => [$this, 'check_read_permission']
        ]);
        
        register_rest_route($this->namespace, '/files/(?P<id>[a-zA-Z0-9-]+)', [
            'methods' => 'GET',
            'callback' => [$this, 'get_file'],
            'permission_callback' => [$this, 'check_read_permission']
        ]);
        
        register_rest_route($this->namespace, '/files/(?P<id>[a-zA-Z0-9-]+)', [
            'methods' => 'DELETE',
            'callback' => [$this, 'delete_file'],
            'permission_callback' => [$this, 'check_admin_permission']
        ]);
        
        register_rest_route($this->namespace, '/files/(?P<id>[a-zA-Z0-9-]+)/move', [
            'methods' => 'POST',
            'callback' => [$this, 'move_file'],
            'permission_callback' => [$this, 'check_admin_permission']
        ]);
        
        register_rest_route($this->namespace, '/files/(?P<id>[a-zA-Z0-9-]+)/rename', [
            'methods' => 'POST',
            'callback' => [$this, 'rename_file'],
            'permission_callback' => [$this, 'check_admin_permission']
        ]);
        
        // Stats endpoint
        register_rest_route($this->namespace, '/stats', [
            'methods' => 'GET',
            'callback' => [$this, 'get_stats'],
            'permission_callback' => [$this, 'check_read_permission']
        ]);
        
        // Folders endpoint
        register_rest_route($this->namespace, '/folders', [
            'methods' => 'GET',
            'callback' => [$this, 'get_folders'],
            'permission_callback' => [$this, 'check_read_permission']
        ]);
        
        // Verify file integrity
        register_rest_route($this->namespace, '/files/(?P<id>[a-zA-Z0-9-]+)/verify', [
            'methods' => 'POST',
            'callback' => [$this, 'verify_file'],
            'permission_callback' => [$this, 'check_admin_permission']
        ]);
        
        // ═══════════════════════════════════════════════════════════════
        // ARCHIVE ENDPOINTS - CDN backup with LSB steganography
        // ═══════════════════════════════════════════════════════════════
        
        // Create archive image from manifest
        register_rest_route($this->namespace, '/archive/(?P<id>[a-zA-Z0-9-]+)', [
            'methods' => 'POST',
            'callback' => [$this, 'create_archive'],
            'permission_callback' => [$this, 'check_admin_permission']
        ]);
        
        // Download archive image
        register_rest_route($this->namespace, '/archive/(?P<id>[a-zA-Z0-9-]+)/download', [
            'methods' => 'GET',
            'callback' => [$this, 'download_archive'],
           'permission_callback' => [$this, 'check_admin_permission']
        ]);
        
        // Restore from archive
        register_rest_route($this->namespace, '/archive/restore', [
            'methods' => 'POST',
            'callback' => [$this, 'restore_from_archive'],
            'permission_callback' => [$this, 'check_admin_permission']
        ]);
        
        // Archive statistics
        register_rest_route($this->namespace, '/archive/stats', [
            'methods' => 'GET',
            'callback' => [$this, 'get_archive_stats'],
            'permission_callback' => [$this, 'check_read_permission']
        ]);
    }
    
    /**
     * Permission callbacks
     */
    public function check_upload_permission() {
        return current_user_can('upload_files');
    }
    
    public function check_read_permission() {
        return current_user_can('read');
    }
    
    public function check_admin_permission() {
        return current_user_can('manage_options');
    }
    
    /**
     * Initialize upload session
     */
    public function upload_init($request) {
        $filename = sanitize_file_name($request->get_param('filename'));
        $filesize = intval($request->get_param('filesize'));
        
        if (!$filename || !$filesize) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'Missing filename or filesize'
            ], 400);
        }
        
        $result = $this->datavault->manifest->create($filename, $filesize);
        
        if (!$result['success']) {
            return new WP_REST_Response($result, 500);
        }
        
        // Store in transient for session tracking
        set_transient('q3dv_upload_' . $result['manifest_id'], [
            'manifest_id' => $result['manifest_id'],
            'filename' => $filename,
            'filesize' => $filesize,
            'chunk_size' => $result['chunk_size'],
            'chunk_count' => $result['chunk_count'],
            'received_chunks' => [],
            'chunk_ids' => [],
            'started_at' => time()
        ], HOUR_IN_SECONDS);
        
        return new WP_REST_Response([
            'success' => true,
            'manifest_id' => $result['manifest_id'],
            'chunk_size' => $result['chunk_size'],
            'chunk_count' => $result['chunk_count']
        ]);
    }
    
    /**
     * Upload a single chunk
     */
    public function upload_chunk($request) {
        $manifest_id = $request->get_param('manifest_id') ?: $request->get_header('X-Manifest-ID');
        $chunk_index = intval($request->get_param('chunk_index') ?? $request->get_header('X-Chunk-Index'));
        
        if (!$manifest_id) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'Missing manifest_id'
            ], 400);
        }
        
        // Get session
        $session = get_transient('q3dv_upload_' . $manifest_id);
        
        if (!$session) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'Upload session expired or invalid'
            ], 404);
        }
        
        // Get chunk data
        $files = $request->get_file_params();
        $chunk_data = null;
        
        if (!empty($files['chunk']['tmp_name'])) {
            $chunk_data = file_get_contents($files['chunk']['tmp_name']);
        } else {
            $chunk_data = $request->get_body();
        }
        
        if (!$chunk_data) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'No chunk data received'
            ], 400);
        }
        
        // Handle client-side compression
        $compressed = $request->get_param('compressed') || $request->get_header('X-Chunk-Compressed');
        if ($compressed) {
            $decompressed = @gzdecode($chunk_data);
            if ($decompressed !== false) {
                $chunk_data = $decompressed;
            }
        }
        
        // Store chunk
        $result = $this->datavault->chunk->store($manifest_id, $chunk_index, $chunk_data);
        
        if (!$result['success']) {
            return new WP_REST_Response($result, 500);
        }
        
        // Update session
        $session['received_chunks'][$chunk_index] = true;
        $session['chunk_ids'][$chunk_index] = $result['post_id'];
        set_transient('q3dv_upload_' . $manifest_id, $session, HOUR_IN_SECONDS);
        
        $received = count($session['received_chunks']);
        $progress = round($received / $session['chunk_count'] * 100, 1);
        
        return new WP_REST_Response([
            'success' => true,
            'chunk_index' => $chunk_index,
            'received' => $received,
            'total' => $session['chunk_count'],
            'progress' => $progress,
            'compression_ratio' => $result['compression_ratio']
        ]);
    }
    
    /**
     * Finalize upload
     */
    public function upload_finalize($request) {
        $manifest_id = $request->get_param('manifest_id') ?: $request->get_header('X-Manifest-ID');
        
        if (!$manifest_id) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'Missing manifest_id'
            ], 400);
        }
        
        // Get session
        $session = get_transient('q3dv_upload_' . $manifest_id);
        
        if (!$session) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'Upload session expired or invalid'
            ], 404);
        }
        
        // Verify all chunks received
        $received = count($session['received_chunks']);
        if ($received < $session['chunk_count']) {
            return new WP_REST_Response([
                'success' => false,
                'error' => "Missing chunks: {$received}/{$session['chunk_count']}"
            ], 400);
        }
        
        // Generate parity data if enabled
        $parity_data = null;
        $settings = $this->datavault->get_settings();
        
        if ($settings['parity_group_size'] > 0) {
            // We would need to load all chunks to generate parity
            // For now, store chunk IDs for later parity generation
        }
        
        // Finalize manifest
        $result = $this->datavault->manifest->finalize(
            $manifest_id,
            $session['chunk_ids'],
            '', // File checksum calculated on demand
            $parity_data
        );
        
        // Clean up session
        delete_transient('q3dv_upload_' . $manifest_id);
        
        $duration = time() - $session['started_at'];
        
        return new WP_REST_Response([
            'success' => true,
            'manifest_id' => $manifest_id,
            'filename' => $session['filename'],
            'filesize' => $session['filesize'],
            'chunks' => $session['chunk_count'],
            'duration' => $duration,
            'download_url' => rest_url($this->namespace . '/download/' . $manifest_id)
        ]);
    }
    
    /**
     * Download a file
     */
    public function download($request) {
        $manifest_id = $request['id'];
        
        $manifest = $this->datavault->manifest->get($manifest_id);
        
        if (!$manifest) {
            return new WP_Error('not_found', 'File not found', ['status' => 404]);
        }
        
        // Reconstruct file from chunks
        $data = '';
        $chunk_count = $manifest['chunk_count'];
        
        for ($i = 0; $i < $chunk_count; $i++) {
            $result = $this->datavault->chunk->retrieve($manifest_id, $i);
            
            if (!$result['success']) {
                return new WP_Error(
                    'chunk_error',
                    "Failed to retrieve chunk {$i}: " . ($result['error'] ?? 'Unknown'),
                    ['status' => 500]
                );
            }
            
            $data .= $result['data'];
        }
        
        // Trim to original size
        $data = substr($data, 0, $manifest['filesize']);
        
        // Increment download count
        $this->datavault->manifest->increment_downloads($manifest_id);
        
        // Stream file
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $manifest['filename'] . '"');
        header('Content-Length: ' . strlen($data));
        header('X-DataVault-Chunks: ' . $chunk_count);
        header('Cache-Control: private, max-age=3600');
        echo $data;
        exit;
    }
    
    /**
     * List all files
     */
    public function list_files($request) {
        $args = [
            'page' => intval($request->get_param('page') ?? 1),
            'per_page' => intval($request->get_param('per_page') ?? 20),
            'folder' => sanitize_text_field($request->get_param('folder') ?? ''),
            'search' => sanitize_text_field($request->get_param('search') ?? ''),
            'orderby' => sanitize_text_field($request->get_param('orderby') ?? 'date'),
            'order' => strtoupper($request->get_param('order') ?? 'DESC')
        ];
        
        return new WP_REST_Response($this->datavault->manifest->list_files($args));
    }
    
    /**
     * Get single file
     */
    public function get_file($request) {
        $manifest = $this->datavault->manifest->get($request['id']);
        
        if (!$manifest) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'File not found'
            ], 404);
        }
        
        return new WP_REST_Response([
            'success' => true,
            'file' => $manifest
        ]);
    }
    
    /**
     * Delete file
     */
    public function delete_file($request) {
        $result = $this->datavault->manifest->delete($request['id']);
        
        return new WP_REST_Response($result, $result['success'] ? 200 : 404);
    }
    
    /**
     * Move file
     */
    public function move_file($request) {
        $folder = sanitize_text_field($request->get_param('folder'));
        
        if (!$folder) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'Missing folder'
            ], 400);
        }
        
        $result = $this->datavault->manifest->move($request['id'], $folder);
        
        return new WP_REST_Response($result, $result['success'] ? 200 : 404);
    }
    
    /**
     * Rename file
     */
    public function rename_file($request) {
        $name = sanitize_file_name($request->get_param('name'));
        
        if (!$name) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'Missing name'
            ], 400);
        }
        
        $result = $this->datavault->manifest->rename($request['id'], $name);
        
        return new WP_REST_Response($result, $result['success'] ? 200 : 404);
    }
    
    /**
     * Get statistics
     */
    public function get_stats($request) {
        return new WP_REST_Response([
            'success' => true,
            'storage' => $this->datavault->core->get_storage_stats(),
            'database' => $this->datavault->core->get_database_sizes()
        ]);
    }
    
    /**
     * Get folders
     */
    public function get_folders($request) {
        return new WP_REST_Response([
            'success' => true,
            'folders' => $this->datavault->manifest->get_folders()
        ]);
    }
    
    /**
     * Verify file integrity
     */
    public function verify_file($request) {
        $manifest = $this->datavault->manifest->get($request['id']);
        
        if (!$manifest) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'File not found'
            ], 404);
        }
        
        $result = $this->datavault->integrity->verify_file($manifest);
        
        return new WP_REST_Response([
            'success' => true,
            'manifest_id' => $request['id'],
            'integrity' => $result
        ]);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // ARCHIVE METHODS - CDN backup with LSB steganography
    // ═══════════════════════════════════════════════════════════════════
    
    /**
     * Create archive image from manifest
     * Packs 500-700 data URLs into single image for CDN backup
     */
    public function create_archive($request) {
        $manifest_id = $request['id'];
        
        $result = $this->datavault->archive->archive_manifest($manifest_id);
        
        if (!$result['success']) {
            return new WP_REST_Response($result, 500);
        }
        
        // Store archive images with base64 for response
        $archives_info = [];
        foreach ($result['archives'] as $archive) {
            $archives_info[] = [
                'chunks_packed' => $archive['chunks_packed'],
                'chunk_range' => $archive['chunk_range'],
                'image_size' => $archive['image_size'],
                'efficiency' => $archive['efficiency']
            ];
        }
        
        return new WP_REST_Response([
            'success' => true,
            'manifest_id' => $manifest_id,
            'total_chunks' => $result['total_chunks'],
            'archives_created' => $result['archives_created'],
            'archives' => $archives_info,
            'download_urls' => array_map(function($i) use ($manifest_id) {
                return rest_url($this->namespace . "/archive/{$manifest_id}/download?part={$i}");
            }, range(0, $result['archives_created'] - 1))
        ]);
    }
    
    /**
     * Download archive image
     */
    public function download_archive($request) {
        $manifest_id = $request['id'];
        $part = intval($request->get_param('part') ?? 0);
        
        // Generate archive on-the-fly
        $result = $this->datavault->archive->archive_manifest($manifest_id);
        
        if (!$result['success'] || !isset($result['archives'][$part])) {
            return new WP_Error('archive_error', 'Archive not found', ['status' => 404]);
        }
        
        $archive = $result['archives'][$part];
        
        // Stream PNG image
        header('Content-Type: image/png');
        header('Content-Disposition: attachment; filename="datavault-archive-' . $manifest_id . '-part' . $part . '.png"');
        header('Content-Length: ' . strlen($archive['image_data']));
        header('X-DataVault-Chunks: ' . $archive['chunks_packed']);
        header('X-DataVault-Range: ' . implode('-', $archive['chunk_range']));
        echo $archive['image_data'];
        exit;
    }
    
    /**
     * Restore data from archive image
     */
    public function restore_from_archive($request) {
        $files = $request->get_file_params();
        
        if (empty($files['archive']['tmp_name'])) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'No archive image uploaded'
            ], 400);
        }
        
        $image_data = file_get_contents($files['archive']['tmp_name']);
        
        // Extract chunks from archive
        $result = $this->datavault->archive->extract_archive($image_data);
        
        if (!$result['success']) {
            return new WP_REST_Response($result, 500);
        }
        
        $restored = 0;
        $errors = [];
        
        // Restore each chunk
        foreach ($result['chunks'] as $chunk) {
            // Decompress and decode the chunk data
            $chunk_data = gzdecode(base64_decode($chunk['data']));
            
            if ($chunk_data === false) {
                $errors[] = "Failed to decode chunk {$chunk['index']}";
                continue;
            }
            
            // We need manifest_id - this would come from the restore request
            $manifest_id = $request->get_param('manifest_id');
            
            if (!$manifest_id) {
                return new WP_REST_Response([
                    'success' => false,
                    'error' => 'manifest_id required for restoration'
                ], 400);
            }
            
            // Store chunk
            $store_result = $this->datavault->chunk->store($manifest_id, $chunk['index'], $chunk_data);
            
            if ($store_result['success']) {
                $restored++;
            } else {
                $errors[] = "Failed to store chunk {$chunk['index']}: " . ($store_result['error'] ?? 'Unknown');
            }
        }
        
        return new WP_REST_Response([
            'success' => count($errors) === 0,
            'chunks_found' => $result['count'],
            'chunks_restored' => $restored,
            'errors' => $errors
        ]);
    }
    
    /**
     * Get archive statistics
     */
    public function get_archive_stats($request) {
        return new WP_REST_Response([
            'success' => true,
            'archive' => $this->datavault->archive->get_stats()
        ]);
    }
}
