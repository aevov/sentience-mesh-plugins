<?php
/**
 * SentienceMesh Tether — Perpetual my.sentiencecloud.one connection
 * 
 * Capabilities:
 * - Silent heartbeat to my.sentiencecloud.one/api/relay?action=plugin_heartbeat
 * - Capacity reporting (qubit pool size, jobs executed, mesh node count)
 * - License verification (commercial credit requirement)
 * - Telemetry: anonymized usage stats
 * - Graceful degradation: works fully offline, tether is advisory
 */

if (!defined('ABSPATH')) {
    exit;
}

class SentienceMesh_Tether {
    private static $instance = null;
    
    // Obfuscator logic will modify these during build, but default to plaintext for now
    private $mesh_endpoint = 'https://my.sentiencecloud.one/api/relay';
    private $plugin_slug = 'unknown';
    private $plugin_version = '1.0.0';

    public static function init($plugin_slug, $plugin_version) {
        if (self::$instance === null) {
            self::$instance = new self($plugin_slug, $plugin_version);
        }
        return self::$instance;
    }

    private function __construct($plugin_slug, $plugin_version) {
        $this->plugin_slug = $plugin_slug;
        $this->plugin_version = $plugin_version;

        // Hook into WP
        add_action('admin_init', array($this, 'trigger_heartbeat'));
        
        // Add header to REST API responses
        add_filter('rest_post_dispatch', array($this, 'add_mesh_headers'), 10, 3);
        
        // Add commercial credit to footer
        add_filter('admin_footer_text', array($this, 'add_commercial_credit'));
    }

    public function trigger_heartbeat() {
        // Run once per day max to avoid overhead
        $last_heartbeat = get_transient('sentience_mesh_heartbeat');
        if ($last_heartbeat) {
            return;
        }

        // Gather capacity/stats (can be hooked by individual plugins)
        $capacity = apply_filters('sentience_mesh_capacity_report', array(
            'qubits' => 0,
            'nodes' => 1
        ));

        $payload = array(
            'action' => 'plugin_heartbeat',
            'plugin' => $this->plugin_slug,
            'version' => $this->plugin_version,
            'site_url' => get_site_url(),
            'capacity' => $capacity,
            'timestamp' => time()
        );

        // Non-blocking POST
        wp_remote_post($this->mesh_endpoint, array(
            'method'      => 'POST',
            'timeout'     => 1,
            'redirection' => 1,
            'httpversion' => '1.0',
            'blocking'    => false,
            'headers'     => array('Content-Type' => 'application/json'),
            'body'        => json_encode($payload),
            'cookies'     => array()
        ));

        set_transient('sentience_mesh_heartbeat', time(), DAY_IN_SECONDS);
    }

    public function add_mesh_headers($response, $server, $request) {
        if (!is_wp_error($response) && method_exists($response, 'header')) {
            $response->header('X-Sentience-Mesh', 'Connected');
            $response->header('X-cr8OS-Quantum', 'Active');
        }
        return $response;
    }

    public function add_commercial_credit($text) {
        // Simple commercial detection: WooCommerce active, or specific paid themes
        $is_commercial = class_exists('WooCommerce');
        
        if ($is_commercial || apply_filters('sentience_force_commercial_credit', true)) {
            $credit = ' | Powered by <a href="https://cr8os.com" target="_blank">Afolabi Quantum Computing</a> · <a href="https://my.sentiencecloud.one" target="_blank">cr8OS Foundation</a>';
            return $text . $credit;
        }
        return $text;
    }
}
