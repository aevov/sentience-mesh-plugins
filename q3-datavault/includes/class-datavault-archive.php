<?php
/**
 * DataVault Archive Encoder
 * 
 * Packs thousands of data URLs into single archive images via LSB steganography.
 * Creates ultra-efficient CDN backup - 1 image = ~700 data URLs.
 * 
 * Architecture:
 * - TIER 1 (HOT): WordPress database (primary access)
 * - TIER 2 (COLD): Archive images on CDN (disaster recovery)
 * 
 * Math:
 * - 1920x1080 image = 6,220,800 pixels = 777,600 bytes LSB capacity
 * - Average compressed data URL = ~1KB
 * - 1 archive image = ~700 data URLs
 * - 1 million chunks = ~1,400 archive images
 * 
 * @package Q3_DataVault
 */

if (!defined('ABSPATH')) exit;

class Q3_DataVault_Archive {
    
    // Archive image dimensions (optimized for LSB capacity)
    const IMAGE_WIDTH = 1920;
    const IMAGE_HEIGHT = 1080;
    const BITS_PER_CHANNEL = 2;  // 2 bits per RGB channel = 6 bits/pixel
    
    // Calculated capacity
    const PIXELS = 2073600; // 1920 * 1080
    const BYTES_PER_PIXEL = 0.75; // 6 bits = 0.75 bytes
    const CAPACITY = 1555200; // ~1.5MB per archive image
    
    // Archive metadata
    const ARCHIVE_CPT = 'q3dv_archive';
    const META_ARCHIVE_INDEX = '_q3dv_archive_index';
    const META_CHUNK_RANGE = '_q3dv_chunk_range';
    const META_CDN_URL = '_q3dv_archive_cdn_url';
    const META_CREATED = '_q3dv_archive_created';
    
    /** @var Q3_DataVault_Core */
    private $core;
    
    /**
     * Constructor
     */
    public function __construct(Q3_DataVault_Core $core) {
        $this->core = $core;
        add_action('init', [$this, 'register_post_type']);
    }
    
    /**
     * Register archive CPT
     */
    public function register_post_type() {
        register_post_type(self::ARCHIVE_CPT, [
            'labels' => ['name' => 'DataVault Archives'],
            'public' => false,
            'show_ui' => false,
            'supports' => ['title']
        ]);
    }
    
    /**
     * Create archive image from multiple data URLs
     * 
     * @param array $chunks Array of ['index' => X, 'data' => 'base64...']
     * @param string $archive_name Name for this archive
     * @return array Result with image data, CDN URL if uploaded
     */
    public function create_archive($chunks, $archive_name = null) {
        if (empty($chunks)) {
            return ['success' => false, 'error' => 'No chunks provided'];
        }
        
        // Serialize chunks with index mapping
        $archive_data = $this->serialize_chunks($chunks);
        $archive_size = strlen($archive_data);
        
        if ($archive_size > self::CAPACITY) {
            return [
                'success' => false,
                'error' => "Data too large ({$archive_size} bytes) for single archive (max " . self::CAPACITY . ")",
                'suggestion' => 'Split into multiple archives'
            ];
        }
        
        // Create carrier image
        $image = $this->create_carrier_image();
        
        if (!$image) {
            return ['success' => false, 'error' => 'Failed to create carrier image'];
        }
        
        // Embed data via LSB
        $embed_result = $this->embed_data($image, $archive_data);
        
        if (!$embed_result) {
            imagedestroy($image);
            return ['success' => false, 'error' => 'Failed to embed data'];
        }
        
        // Encode to PNG (lossless required for LSB)
        ob_start();
        imagepng($image, null, 0); // No compression to preserve LSB
        $image_data = ob_get_clean();
        imagedestroy($image);
        
        // Calculate stats
        $chunk_indices = array_column($chunks, 'index');
        
        return [
            'success' => true,
            'image_data' => $image_data,
            'image_size' => strlen($image_data),
            'data_size' => $archive_size,
            'chunks_packed' => count($chunks),
            'chunk_range' => [min($chunk_indices), max($chunk_indices)],
            'efficiency' => round(count($chunks) / (strlen($image_data) / 1024), 2) . ' chunks/KB'
        ];
    }
    
    /**
     * Extract data URLs from archive image
     * 
     * @param string $image_data Raw PNG image data
     * @return array Extracted chunks with indices
     */
    public function extract_archive($image_data) {
        $image = imagecreatefromstring($image_data);
        
        if (!$image) {
            return ['success' => false, 'error' => 'Failed to load archive image'];
        }
        
        // Extract embedded data
        $data = $this->extract_data($image);
        imagedestroy($image);
        
        if (!$data) {
            return ['success' => false, 'error' => 'Failed to extract data from archive'];
        }
        
        // Deserialize chunks
        $chunks = $this->deserialize_chunks($data);
        
        if ($chunks === false) {
            return ['success' => false, 'error' => 'Failed to deserialize archive data'];
        }
        
        return [
            'success' => true,
            'chunks' => $chunks,
            'count' => count($chunks)
        ];
    }
    
    /**
     * Serialize chunks for embedding
     */
    private function serialize_chunks($chunks) {
        $data = [];
        
        foreach ($chunks as $chunk) {
            $data[] = [
                'i' => $chunk['index'],             // index
                'd' => $chunk['data'],              // data (already base64)
                'c' => $chunk['checksum'] ?? null   // checksum
            ];
        }
        
        // Compress the serialized data
        $json = json_encode($data, JSON_UNESCAPED_SLASHES);
        $compressed = gzencode($json, 9);
        
        // Add header: [4 bytes: length][compressed data]
        $length = strlen($compressed);
        $header = pack('N', $length);
        
        return $header . $compressed;
    }
    
    /**
     * Deserialize chunks from extracted data
     */
    private function deserialize_chunks($data) {
        // Read header
        if (strlen($data) < 4) return false;
        
        $header = unpack('Nlength', substr($data, 0, 4));
        $length = $header['length'];
        
        $compressed = substr($data, 4, $length);
        $json = gzdecode($compressed);
        
        if ($json === false) return false;
        
        $data = json_decode($json, true);
        
        if (!is_array($data)) return false;
        
        // Reconstruct chunks
        $chunks = [];
        foreach ($data as $item) {
            $chunks[] = [
                'index' => $item['i'],
                'data' => $item['d'],
                'checksum' => $item['c'] ?? null
            ];
        }
        
        return $chunks;
    }
    
    /**
     * Create carrier image with noise pattern
     */
    private function create_carrier_image() {
        $image = imagecreatetruecolor(self::IMAGE_WIDTH, self::IMAGE_HEIGHT);
        
        if (!$image) return null;
        
        // Fill with pseudo-random noise (looks natural, good for steganography)
        $seed = crc32(microtime());
        mt_srand($seed);
        
        for ($y = 0; $y < self::IMAGE_HEIGHT; $y++) {
            for ($x = 0; $x < self::IMAGE_WIDTH; $x++) {
                $r = mt_rand(40, 215);
                $g = mt_rand(40, 215);
                $b = mt_rand(40, 215);
                imagesetpixel($image, $x, $y, imagecolorallocate($image, $r, $g, $b));
            }
        }
        
        return $image;
    }
    
    /**
     * Embed data into image using LSB steganography
     */
    private function embed_data($image, $data) {
        $width = imagesx($image);
        $height = imagesy($image);
        $data_len = strlen($data);
        
        // Prepend length header (4 bytes)
        $data = pack('N', $data_len) . $data;
        $data_bits = $this->bytes_to_bits($data);
        $bit_index = 0;
        $total_bits = count($data_bits);
        
        for ($y = 0; $y < $height && $bit_index < $total_bits; $y++) {
            for ($x = 0; $x < $width && $bit_index < $total_bits; $x++) {
                $rgb = imagecolorat($image, $x, $y);
                $r = ($rgb >> 16) & 0xFF;
                $g = ($rgb >> 8) & 0xFF;
                $b = $rgb & 0xFF;
                
                // Embed 2 bits per channel (6 bits per pixel)
                if ($bit_index < $total_bits) {
                    $r = ($r & 0xFC) | ($data_bits[$bit_index++] << 1);
                    if ($bit_index < $total_bits) $r = ($r & 0xFD) | $data_bits[$bit_index++];
                }
                if ($bit_index < $total_bits) {
                    $g = ($g & 0xFC) | ($data_bits[$bit_index++] << 1);
                    if ($bit_index < $total_bits) $g = ($g & 0xFD) | $data_bits[$bit_index++];
                }
                if ($bit_index < $total_bits) {
                    $b = ($b & 0xFC) | ($data_bits[$bit_index++] << 1);
                    if ($bit_index < $total_bits) $b = ($b & 0xFD) | $data_bits[$bit_index++];
                }
                
                $color = imagecolorallocate($image, $r, $g, $b);
                imagesetpixel($image, $x, $y, $color);
            }
        }
        
        return $bit_index >= $total_bits;
    }
    
    /**
     * Extract data from image using LSB
     */
    private function extract_data($image) {
        $width = imagesx($image);
        $height = imagesy($image);
        
        // First, extract length header (32 bits = first ~6 pixels)
        $bits = [];
        $pixels_needed = ceil(32 / 6) + 10; // Extra for safety
        
        $extracted = 0;
        for ($y = 0; $y < $height && $extracted < $pixels_needed; $y++) {
            for ($x = 0; $x < $width && $extracted < $pixels_needed; $x++) {
                $rgb = imagecolorat($image, $x, $y);
                $r = ($rgb >> 16) & 0xFF;
                $g = ($rgb >> 8) & 0xFF;
                $b = $rgb & 0xFF;
                
                $bits[] = ($r >> 1) & 1;
                $bits[] = $r & 1;
                $bits[] = ($g >> 1) & 1;
                $bits[] = $g & 1;
                $bits[] = ($b >> 1) & 1;
                $bits[] = $b & 1;
                
                $extracted++;
            }
        }
        
        // Convert first 32 bits to length
        $length_bits = array_slice($bits, 0, 32);
        $length_bytes = $this->bits_to_bytes($length_bits);
        $length = unpack('N', $length_bytes)[1];
        
        // Sanity check
        if ($length <= 0 || $length > self::CAPACITY) {
            return null;
        }
        
        // Now extract all data
        $total_bits_needed = 32 + ($length * 8);
        $all_bits = [];
        
        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                $rgb = imagecolorat($image, $x, $y);
                $r = ($rgb >> 16) & 0xFF;
                $g = ($rgb >> 8) & 0xFF;
                $b = $rgb & 0xFF;
                
                $all_bits[] = ($r >> 1) & 1;
                $all_bits[] = $r & 1;
                $all_bits[] = ($g >> 1) & 1;
                $all_bits[] = $g & 1;
                $all_bits[] = ($b >> 1) & 1;
                $all_bits[] = $b & 1;
                
                if (count($all_bits) >= $total_bits_needed) break 2;
            }
        }
        
        // Skip header, extract data
        $data_bits = array_slice($all_bits, 32, $length * 8);
        return $this->bits_to_bytes($data_bits);
    }
    
    /**
     * Convert bytes to bit array
     */
    private function bytes_to_bits($bytes) {
        $bits = [];
        for ($i = 0; $i < strlen($bytes); $i++) {
            $byte = ord($bytes[$i]);
            for ($b = 7; $b >= 0; $b--) {
                $bits[] = ($byte >> $b) & 1;
            }
        }
        return $bits;
    }
    
    /**
     * Convert bit array to bytes
     */
    private function bits_to_bytes($bits) {
        $bytes = '';
        for ($i = 0; $i < count($bits); $i += 8) {
            $byte = 0;
            for ($b = 0; $b < 8 && ($i + $b) < count($bits); $b++) {
                $byte = ($byte << 1) | $bits[$i + $b];
            }
            $bytes .= chr($byte);
        }
        return $bytes;
    }
    
    /**
     * Create archive from manifest (all chunks)
     */
    public function archive_manifest($manifest_id) {
        $datavault = q3_datavault();
        $manifest = $datavault->manifest->get($manifest_id);
        
        if (!$manifest) {
            return ['success' => false, 'error' => 'Manifest not found'];
        }
        
        // Get all chunks
        $chunks_info = $datavault->chunk->get_manifest_chunks($manifest_id);
        
        $chunks_data = [];
        foreach ($chunks_info as $chunk) {
            $result = $datavault->chunk->retrieve($manifest_id, $chunk['index']);
            
            if ($result['success']) {
                $chunks_data[] = [
                    'index' => $chunk['index'],
                    'data' => base64_encode(gzencode($result['data'], 9)),
                    'checksum' => $chunk['checksum']
                ];
            }
        }
        
        // Split into archive-sized batches (~700 per archive)
        $archives = [];
        $batch_size = 500; // Conservative to account for overhead
        
        for ($i = 0; $i < count($chunks_data); $i += $batch_size) {
            $batch = array_slice($chunks_data, $i, $batch_size);
            $archive = $this->create_archive($batch, "Archive {$manifest_id} - Part " . (floor($i / $batch_size) + 1));
            
            if ($archive['success']) {
                $archives[] = $archive;
            }
        }
        
        return [
            'success' => true,
            'manifest_id' => $manifest_id,
            'total_chunks' => count($chunks_data),
            'archives_created' => count($archives),
            'archives' => $archives
        ];
    }
    
    /**
     * Get archive statistics
     */
    public function get_stats() {
        return [
            'image_dimensions' => self::IMAGE_WIDTH . 'x' . self::IMAGE_HEIGHT,
            'capacity_bytes' => self::CAPACITY,
            'capacity_mb' => round(self::CAPACITY / 1024 / 1024, 2),
            'estimated_chunks_per_archive' => '500-700',
            'chunks_per_1000_archives' => '500,000 - 700,000'
        ];
    }
}
