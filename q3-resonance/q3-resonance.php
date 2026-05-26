<?php
/**
 * Plugin Name: Q3 Resonance
 * Plugin URI: https://cr8os.com
 * Description: Neuroresonance Theory (NRT) Coupling & Sentience Mesh Node
 * Version: 1.0.0
 * Author: Afolabi Quantum Computing
 * License: GPLv2 or later (Core Hooks) & CC BY-NC 4.0 (Algorithms)
 */

defined('ABSPATH') || exit;

class Q3_Resonance_Plugin {
    
    private static $instance = null;
    
    public static function init() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        // Init Resonance Engine
        require_once plugin_dir_path(__FILE__) . 'includes/class-resonance-engine.php';
        
        // Hooks
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        add_filter('sentience_mesh_capacity_report', array($this, 'report_resonance_capacity'));
    }
    
    public function register_rest_routes() {
        register_rest_route('q3/v1', '/resonance/couple', array(
            'methods' => 'POST',
            'callback' => array($this, 'api_couple'),
            'permission_callback' => '__return_true'
        ));
    }
    
    public function api_couple(WP_REST_Request $request) {
        $params = $request->get_json_params();
        
        try {
            $engine = new Q3_Resonance_Engine();
            $result = $engine->execute_coupling($params);
            
            return new WP_REST_Response([
                'success' => true,
                'data' => $result
            ], 200);
            
        } catch (Exception $e) {
            return new WP_REST_Response([
                'success' => false,
                'error' => $e->getMessage()
            ], 400);
        }
    }
    
    public function report_resonance_capacity($capacity) {
        $capacity['resonance_tier'] = 'T2';
        $capacity['gamma_hz'] = 40;
        $capacity['nrt_active'] = true;
        return $capacity;
    }
}

add_action('plugins_loaded', array('Q3_Resonance_Plugin', 'init'));
