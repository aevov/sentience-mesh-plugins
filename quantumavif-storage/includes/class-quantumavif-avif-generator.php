<?php
/**
 * QuantumAVIF AVIF Generator
 * 
 * Handles AVIF generation and optimization
 * Uses PHP GD library to create 2048x2048 AVIF images
 */

if (!defined('ABSPATH')) {
    exit;
}

class QuantumAVIF_AVIF_Generator {
    
    public function __construct() {
        // Check if AVIF support is available
        if (!function_exists('imageavif')) {
            add_action('admin_notices', [$this, 'avif_not_supported_notice']);
        }
    }
    
    /**
     * Generate 2048×2048 AVIF image
     */
    public function generate_avif($width = 2048, $height = 2048) {
        if (!function_exists('imageavif')) {
            // Fallback to PNG if AVIF not available
            return $this->generate_png($width, $height);
        }
        
        $image = imagecreatetruecolor($width, $height);
        
        // Fill with random noise base
        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                $color = imagecolorallocate($image, rand(0, 255), rand(0, 255), rand(0, 255));
                imagesetpixel($image, $x, $y, $color);
            }
        }
        
        return $image;
    }
    
    /**
     * Fallback PNG generator
     */
    private function generate_png($width, $height) {
        $image = imagecreatetruecolor($width, $height);
        
        // Fill with random noise
        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                $color = imagecolorallocate($image, rand(0, 255), rand(0, 255), rand(0, 255));
                imagesetpixel($image, $x, $y, $color);
            }
        }
        
        return $image;
    }
    
    /**
     * Admin notice if AVIF not supported
     */
    public function avif_not_supported_notice() {
        ?>
        <div class="notice notice-warning">
            <p><strong>QuantumAVIF:</strong> AVIF support not detected. Using PNG fallback. For best results, enable AVIF in PHP GD.</p>
        </div>
        <?php
    }
}
