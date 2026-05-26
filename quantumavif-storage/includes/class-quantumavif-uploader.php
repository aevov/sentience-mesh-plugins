<?php
/**
 * QuantumAVIF Upload Interceptor
 * 
 * Intercepts WordPress media uploads and processes them through
 * the QuantumAVIF encoding pipeline
 */

class QuantumAVIF_Uploader {
    
    private $original_file;
    private $original_name;
    private $skip_processing = false;
    
    public function __construct() {
        // Hook into upload process
        add_filter('wp_handle_upload_prefilter', [$this, 'intercept_upload']);
        add_filter('wp_handle_upload', [$this, 'process_upload']);
    }
    
    /**
     * Intercept upload before processing
     */
    public function intercept_upload($file) {
        // Skip if already a shard
        if (strpos($file['name'], 'shard-') === 0 || strpos($file['name'], 'manifest-') === 0) {
            $this->skip_processing = true;
            return $file;
        }
        
        // Skip if file is too small (< 100KB)
        if ($file['size'] < 100 * 1024) {
            $this->skip_processing = true;
            return $file;
        }
        
        // Store original for processing
        $this->original_file = $file['tmp_name'];
        $this->original_name = $file['name'];
        $this->skip_processing = false;
        
        error_log('[QuantumAVIF] Intercepted upload: ' . $file['name'] . ' (' . size_format($file['size']) . ')');
        
        return $file;
    }
    
    /**
     * Process upload through QuantumAVIF pipeline
     */
    public function process_upload($params) {
        if ($this->skip_processing || !$this->original_file) {
            return $params;
        }
        
        try {
            error_log('[QuantumAVIF] Starting encoding pipeline...');
            
            // Read original file
            $data = file_get_contents($this->original_file);
            $original_size = strlen($data);
            
            // Process through encoding pipeline
            $result = $this->encode_to_shards($data);
            
            // Upload shards to media library
            $shard_urls = [];
            foreach ($result['shards'] as $i => $shard_avif) {
                $url = $this->upload_shard_avif($shard_avif, $i);
                if ($url) {
                    $shard_urls[] = $url;
                }
            }
            
            // Update manifest with shard URLs
            $result['manifest']['shard_urls'] = $shard_urls;
            
            // Create manifest file
            $manifest_id = $this->create_manifest($result['manifest']);
            
            // Update statistics
            $this->update_stats($original_size, count($shard_urls), $result['physical_size']);
            
            error_log('[QuantumAVIF] Success! Encoded to ' . count($shard_urls) . ' shards. Manifest ID: ' . $manifest_id);
            
            // Replace original upload with manifest reference
            $manifest_path = get_attached_file($manifest_id);
            $params['file'] = $manifest_path;
            $params['url'] = wp_get_attachment_url($manifest_id);
            $params['type'] = 'application/json';
            
        } catch (Exception $e) {
            error_log('[QuantumAVIF] Error: ' . $e->getMessage());
            // Fall back to original upload
        }
        
        return $params;
    }
    
    /**
     * Encode data through full QuantumAVIF pipeline
     */
    private function encode_to_shards($data) {
        $start_time = microtime(true);
        
        // 1. Chunk file
        $chunker = new QuantumAVIF_Shard_Engine();
        $chunks = $chunker->chunk($data, 4 * 1024 * 1024); // 4MB chunks
        error_log('[QuantumAVIF] Created ' . count($chunks) . ' chunks');
        
        // 2. Erasure coding (8+4)
        $erasure = new QuantumAVIF_Erasure_Coder(8, 4);
        $shards = $erasure->encode($chunks);
        error_log('[QuantumAVIF] Generated ' . count($shards) . ' shards via (8+4) Reed-Solomon');
        
        // 3. LEANN compression
        $leann = new QuantumAVIF_LEANN_Engine();
        $compressed = $leann->encode($shards);
        error_log('[QuantumAVIF] LEANN compressed to ' . count($compressed['physical']) . ' physical shards');
        
        // 4. Steganography into 2048x2048 AVIF
        $stego = new QuantumAVIF_Stego_Engine(2048, 2048);
        $avif_blobs = [];
        $physical_size = 0;
        
        foreach ($compressed['physical'] as $shard) {
            $carrier = $this->generate_carrier_image(2048, 2048);
            $encoded = $stego->embed($carrier, $shard['data']);
            $avif_blob = $this->to_avif($encoded);
            $avif_blobs[] = $avif_blob;
            $physical_size += strlen($avif_blob);
        }
        
        error_log('[QuantumAVIF] Generated ' . count($avif_blobs) . ' AVIF images');
        
        // 5. Calculate amplification
        $logical_size = count($shards) * (strlen($data) / count($chunks));
        $amplification = $logical_size / $physical_size;
        
        $elapsed = microtime(true) - $start_time;
        error_log(sprintf('[QuantumAVIF] Encoding took %.2fs, amplification: %.1fx', $elapsed, $amplification));
        
        // Generate manifest
        $manifest = [
            'version' => '1.0',
            'original_name' => $this->original_name,
            'original_size' => strlen($data),
            'amplification' => round($amplification, 1) . 'x',
            'shards' => count($avif_blobs),
            'erasure_coding' => '8+4',
            'image_size' => '2048x2048',
            'leann_metadata' => $compressed['metadata'],
            'encoding_time' => round($elapsed, 2),
            'timestamp' => time()
        ];
        
        return [
            'shards' => $avif_blobs,
            'manifest' => $manifest,
            'physical_size' => $physical_size
        ];
    }
    
    /**
     * Generate carrier image (2048x2048 with random gradient)
     */
    private function generate_carrier_image($width, $height) {
        $image = imagecreatetruecolor($width, $height);
        
        // Random gradient colors
        $r1 = rand(50, 200);
        $g1 = rand(50, 200);
        $b1 = rand(50, 200);
        $r2 = rand(50, 200);
        $g2 = rand(50, 200);
        $b2 = rand(50, 200);
        
        // Create gradient
        for ($y = 0; $y < $height; $y++) {
            $ratio = $y / $height;
            $r = $r1 + ($r2 - $r1) * $ratio;
            $g = $g1 + ($g2 - $g1) * $ratio;
            $b = $b1 + ($b2 - $b1) * $ratio;
            
            $color = imagecolorallocate($image, $r, $g, $b);
            imageline($image, 0, $y, $width, $y, $color);
        }
        
        // Add noise
        for ($i = 0; $i < $width * $height * 0.1; $i++) {
            $x = rand(0, $width - 1);
            $y = rand(0, $height - 1);
            $noise = rand(-10, 10);
            
            $rgb = imagecolorat($image, $x, $y);
            $r = min(255, max(0, ($rgb >> 16) & 0xFF) + $noise);
            $g = min(255, max(0, ($rgb >> 8) & 0xFF) + $noise);
            $b = min(255, max(0, $rgb & 0xFF) + $noise);
            
            $color = imagecolorallocate($image, $r, $g, $b);
            imagesetpixel($image, $x, $y, $color);
        }
        
        return $image;
    }
    
    /**
     * Convert GD image to AVIF blob
     */
    private function to_avif($image) {
        ob_start();
        
        // Try AVIF first (if available)
        if (function_exists('imageavif')) {
            imageavif($image, null, 100); // Lossless
        } else {
            // Fallback to PNG (lossless)
            imagepng($image, null, 0);
        }
        
        $blob = ob_get_clean();
        imagedestroy($image);
        
        return $blob;
    }
    
    /**
     * Upload shard AVIF to media library
     */
    private function upload_shard_avif($avif_blob, $index) {
        $filename = sprintf('shard-%s-%04d.avif', wp_generate_uuid4(), $index);
        
        $upload_dir = wp_upload_dir();
        $filepath = $upload_dir['path'] . '/' . $filename;
        
        file_put_contents($filepath, $avif_blob);
        
        $attachment = [
            'post_mime_type' => function_exists('imageavif') ? 'image/avif' : 'image/png',
            'post_title' => $filename,
            'post_content' => '',
            'post_status' => 'inherit'
        ];
        
        $attach_id = wp_insert_attachment($attachment, $filepath);
        require_once(ABSPATH . 'wp-admin/includes/image.php');
        $attach_data = wp_generate_attachment_metadata($attach_id, $filepath);
        wp_update_attachment_metadata($attach_id, $attach_data);
        
        return wp_get_attachment_url($attach_id);
    }
    
    /**
     * Create manifest JSON file
     */
    private function create_manifest($manifest_data) {
        $filename = 'manifest-' . wp_generate_uuid4() . '.json';
        $upload_dir = wp_upload_dir();
        $filepath = $upload_dir['path'] . '/' . $filename;
        
        file_put_contents($filepath, json_encode($manifest_data, JSON_PRETTY_PRINT));
        
        $attachment = [
            'post_mime_type' => 'application/json',
            'post_title' => 'QuantumAVIF Manifest: ' . $manifest_data['original_name'],
            'post_content' => json_encode($manifest_data),
            'post_status' => 'inherit'
        ];
        
        $attach_id = wp_insert_attachment($attachment, $filepath);
        
        return $attach_id;
    }
    
    /**
     * Update statistics
     */
    private function update_stats($original_size, $shard_count, $physical_size) {
        $files_encoded = get_option('quantumavif_files_encoded', 0) + 1;
        $shards_generated = get_option('quantumavif_shards_generated', 0) + $shard_count;
        $physical_bytes = get_option('quantumavif_physical_bytes', 0) + $physical_size;
        $logical_bytes = get_option('quantumavif_logical_bytes', 0) + $original_size;
        
        $ratio = $logical_bytes / max(1, $physical_bytes);
        
        update_option('quantumavif_files_encoded', $files_encoded);
        update_option('quantumavif_shards_generated', $shards_generated);
        update_option('quantumavif_physical_bytes', $physical_bytes);
        update_option('quantumavif_logical_bytes', $logical_bytes);
        update_option('quantumavif_amplification_ratio', round($ratio, 1) . 'x');
    }
}
