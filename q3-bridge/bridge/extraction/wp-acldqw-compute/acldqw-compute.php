<?php
/**
 * Plugin Name: ACLDQW Compute
 * Description: Edge compute endpoint for ACLDQW swarm mining, cached by QUIC.cloud
 * Version: 1.0.0
 * Author: Cr8OS
 */

defined('ABSPATH') || exit;

class ACLDQW_Compute {
    
    private $cubbit_endpoint = 'https://s3.cubbit.eu';
    private $cubbit_bucket = 'cr8os1';
    private $checkpoint_path = 'mining/checkpoints';
    
    public function __construct() {
        add_action('rest_api_init', [$this, 'register_routes']);
        add_action('init', [$this, 'add_cache_headers']);
    }
    
    /**
     * Register REST API endpoints
     */
    public function register_routes() {
        // Main compute endpoint
        register_rest_route('acldqw/v1', '/compute/(?P<worker_id>[a-zA-Z0-9_-]+)', [
            'methods' => 'GET',
            'callback' => [$this, 'handle_compute'],
            'permission_callback' => '__return_true'
        ]);
        
        // Status endpoint
        register_rest_route('acldqw/v1', '/status', [
            'methods' => 'GET',
            'callback' => [$this, 'handle_status'],
            'permission_callback' => '__return_true'
        ]);
        
        // Checkpoint endpoint (returns as AVIF)
        register_rest_route('acldqw/v1', '/checkpoint/(?P<worker_id>[a-zA-Z0-9_-]+).avif', [
            'methods' => 'GET',
            'callback' => [$this, 'handle_checkpoint_avif'],
            'permission_callback' => '__return_true'
        ]);
    }
    
    /**
     * Main compute endpoint - does SHA256d mining for TTL duration
     */
    public function handle_compute($request) {
        $worker_id = $request->get_param('worker_id');
        $duration = min(intval($request->get_param('duration') ?? 30), 55); // Max 55s (leave buffer)
        
        // Load existing checkpoint
        $checkpoint = $this->load_checkpoint($worker_id);
        
        // Mining state
        $state = [
            'worker_id' => $worker_id,
            'nonce' => $checkpoint['nonce'] ?? 0,
            'total_hashes' => $checkpoint['total_hashes'] ?? 0,
            'shares_found' => $checkpoint['shares_found'] ?? 0,
            'start_time' => microtime(true)
        ];
        
        // Mine for duration
        $end_time = time() + $duration;
        $batch_size = 10000;
        
        while (time() < $end_time) {
            // SHA256d batch
            for ($i = 0; $i < $batch_size; $i++) {
                $header = pack('V', $state['nonce']);
                $hash = hash('sha256', hash('sha256', $header, true), true);
                
                // Check difficulty (2 leading zero bytes)
                if (ord($hash[0]) === 0 && ord($hash[1]) === 0) {
                    $state['shares_found']++;
                }
                
                $state['nonce']++;
                $state['total_hashes']++;
            }
        }
        
        $state['elapsed'] = microtime(true) - $state['start_time'];
        $state['hashrate'] = $state['elapsed'] > 0 
            ? round($batch_size * floor($duration / ($state['elapsed'] / floor($state['total_hashes'] / $batch_size))) / $state['elapsed'])
            : 0;
        
        // Save checkpoint
        $this->save_checkpoint($worker_id, $state);
        
        // Set cache headers for QUIC.cloud
        $this->set_cache_headers(60); // 60s TTL
        
        return new WP_REST_Response([
            'success' => true,
            'worker_id' => $worker_id,
            'computed' => [
                'hashes' => $state['total_hashes'],
                'shares' => $state['shares_found'],
                'hashrate' => $state['hashrate'],
                'duration' => round($state['elapsed'], 2)
            ],
            'checkpoint' => $this->checkpoint_path . '/' . $worker_id . '/latest.json',
            'cached_by' => 'quic.cloud',
            'ttl' => 60
        ], 200);
    }
    
    /**
     * Return checkpoint as AVIF container (for QUIC.cloud image caching)
     */
    public function handle_checkpoint_avif($request) {
        $worker_id = $request->get_param('worker_id');
        $checkpoint = $this->load_checkpoint($worker_id);
        
        // Create minimal AVIF with embedded checkpoint data
        $avif_data = $this->create_avif_with_data($checkpoint);
        
        // Cache for 60s
        $this->set_cache_headers(60);
        
        header('Content-Type: image/avif');
        header('X-ACLDQW-Worker: ' . $worker_id);
        header('X-ACLDQW-Shares: ' . ($checkpoint['shares_found'] ?? 0));
        
        echo $avif_data;
        exit;
    }
    
    /**
     * Status endpoint
     */
    public function handle_status($request) {
        return new WP_REST_Response([
            'status' => 'online',
            'version' => '1.0.0',
            'endpoints' => [
                'compute' => '/wp-json/acldqw/v1/compute/{worker_id}',
                'checkpoint' => '/wp-json/acldqw/v1/checkpoint/{worker_id}.avif',
                'status' => '/wp-json/acldqw/v1/status'
            ],
            'cache' => 'quic.cloud',
            'storage' => 'cubbit-s3'
        ], 200);
    }
    
    /**
     * Load checkpoint from Cubbit or local cache
     */
    private function load_checkpoint($worker_id) {
        $local_path = WP_CONTENT_DIR . '/acldqw-checkpoints/' . $worker_id . '.json';
        
        if (file_exists($local_path)) {
            return json_decode(file_get_contents($local_path), true) ?? [];
        }
        
        return [];
    }
    
    /**
     * Save checkpoint locally and async to Cubbit
     */
    private function save_checkpoint($worker_id, $state) {
        $checkpoint = [
            'worker_id' => $worker_id,
            'nonce' => $state['nonce'],
            'total_hashes' => $state['total_hashes'],
            'shares_found' => $state['shares_found'],
            'hashrate' => $state['hashrate'] ?? 0,
            'saved_at' => date('c')
        ];
        
        // Local save
        $dir = WP_CONTENT_DIR . '/acldqw-checkpoints';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents($dir . '/' . $worker_id . '.json', json_encode($checkpoint, JSON_PRETTY_PRINT));
        
        // Async Cubbit save (fire and forget)
        $this->save_to_cubbit_async($worker_id, $checkpoint);
        
        return $checkpoint;
    }
    
    /**
     * Async save to Cubbit S3
     */
    private function save_to_cubbit_async($worker_id, $data) {
        $url = $this->cubbit_endpoint . '/' . $this->cubbit_bucket . '/' . 
               $this->checkpoint_path . '/' . $worker_id . '/latest.json';
        
        // Use WordPress HTTP API with blocking=false for async
        wp_remote_request($url, [
            'method' => 'PUT',
            'body' => json_encode($data),
            'headers' => [
                'Content-Type' => 'application/json',
                // Note: Add AWS Sig v4 headers here for real implementation
            ],
            'blocking' => false,
            'timeout' => 0.01
        ]);
    }
    
    /**
     * Create minimal AVIF with embedded data
     */
    private function create_avif_with_data($data) {
        // AVIF file structure (minimal)
        // ftyp box + meta box with XMP containing our data
        
        $json = json_encode($data);
        $xmp = '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' .
               '<x:xmpmeta xmlns:x="adobe:ns:meta/">' .
               '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' .
               '<rdf:Description xmlns:acldqw="http://cr8os.io/acldqw/1.0/">' .
               '<acldqw:checkpoint>' . htmlspecialchars($json) . '</acldqw:checkpoint>' .
               '</rdf:Description></rdf:RDF></x:xmpmeta>' .
               '<?xpacket end="w"?>';
        
        // Minimal 1x1 AVIF (pre-generated base64)
        $avif_1x1 = base64_decode(
            'AAAAGGZ0eXBhdmlmAAAAAGF2aWZtaWYxAAAA' .
            'DG1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBp' .
            'Y3QAAAAAAAAAAAAAAAAAAAAADnBpdG0AAAAA' .
            'AQAAABppbG9jAAAAAEQAAAEAAQAAAAEAAAAe' .
            'AAAAFAAAABBpaW5mAAAAAAABAAAAEmluZmUC' .
            'AAAAAAEAAGF2MDEAAAAyaXByb3AAAAAlY29s' .
            'cm5jbHgAAAAKAQANCgEADQoFAQAAABlpc3Bl' .
            'AAAAAAAAAQAAAAEAAAAQaWlwbQAAAAAAAAAQ' .
            'cGl4aQAAAAADCAgIAAAAGGlwbWEAAAAAAAAAAQAB' .
            'hAABggGDAAAAFGlsb2MAAAAARAAAFAAAAAAe'
        );
        
        // Append XMP as custom box (simplified - real impl would be proper AVIF boxing)
        return $avif_1x1 . pack('N', strlen($xmp) + 8) . 'XMP ' . $xmp;
    }
    
    /**
     * Set LiteSpeed/QUIC.cloud cache headers
     */
    private function set_cache_headers($ttl) {
        header('Cache-Control: public, max-age=' . $ttl);
        header('X-LiteSpeed-Cache-Control: public, max-age=' . $ttl);
        header('X-LiteSpeed-Tag: acldqw');
    }
    
    /**
     * Add cache control for LiteSpeed
     */
    public function add_cache_headers() {
        if (defined('LSCACHE_IS_ESI') && LSCACHE_IS_ESI) {
            return;
        }
    }
}

// Initialize
new ACLDQW_Compute();

// CLI for testing
if (defined('WP_CLI') && WP_CLI) {
    WP_CLI::add_command('acldqw', function($args, $assoc_args) {
        $worker_id = $args[0] ?? 'test-worker';
        $duration = $assoc_args['duration'] ?? 10;
        
        WP_CLI::log("Mining for {$duration}s with worker {$worker_id}...");
        
        $state = ['nonce' => 0, 'total_hashes' => 0, 'shares_found' => 0];
        $end = time() + $duration;
        
        while (time() < $end) {
            for ($i = 0; $i < 10000; $i++) {
                $hash = hash('sha256', hash('sha256', pack('V', $state['nonce']), true), true);
                if (ord($hash[0]) === 0 && ord($hash[1]) === 0) {
                    $state['shares_found']++;
                    WP_CLI::log("Share found! Nonce: " . $state['nonce']);
                }
                $state['nonce']++;
                $state['total_hashes']++;
            }
        }
        
        WP_CLI::success("Hashes: {$state['total_hashes']}, Shares: {$state['shares_found']}");
    });
}
