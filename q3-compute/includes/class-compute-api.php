<?php
/**
 * Compute REST API
 * All REST endpoints for Q3 Compute
 */

defined('ABSPATH') || exit;

class Q3_Compute_API {
    
    private $scheduler;
    private $qubit_pool;
    
    public function __construct($scheduler, $qubit_pool) {
        $this->scheduler = $scheduler;
        $this->qubit_pool = $qubit_pool;
        
        add_action('rest_api_init', [$this, 'register_routes']);
    }
    
    public function register_routes() {
        $namespace = 'q3-compute/v1';
        
        // Public endpoints
        register_rest_route($namespace, '/capacity', [
            'methods' => 'GET',
            'callback' => [$this, 'get_capacity'],
            'permission_callback' => '__return_true'
        ]);
        
        register_rest_route($namespace, '/operations', [
            'methods' => 'GET',
            'callback' => [$this, 'get_operations'],
            'permission_callback' => '__return_true'
        ]);
        
        // Authenticated endpoints
        register_rest_route($namespace, '/submit', [
            'methods' => 'POST',
            'callback' => [$this, 'submit_job'],
            'permission_callback' => [$this, 'check_auth']
        ]);
        
        register_rest_route($namespace, '/compute', [
            'methods' => 'POST',
            'callback' => [$this, 'compute_sync'],
            'permission_callback' => [$this, 'check_auth']
        ]);
        
        register_rest_route($namespace, '/status/(?P<job_id>[a-zA-Z0-9_-]+)', [
            'methods' => 'GET',
            'callback' => [$this, 'get_status'],
            'permission_callback' => [$this, 'check_auth']
        ]);
        
        register_rest_route($namespace, '/result/(?P<job_id>[a-zA-Z0-9_-]+)', [
            'methods' => 'GET',
            'callback' => [$this, 'get_result'],
            'permission_callback' => [$this, 'check_auth']
        ]);
        
        register_rest_route($namespace, '/cancel/(?P<job_id>[a-zA-Z0-9_-]+)', [
            'methods' => 'POST',
            'callback' => [$this, 'cancel_job'],
            'permission_callback' => [$this, 'check_auth']
        ]);
    }
    
    /**
     * Check authentication
     */
    public function check_auth($request) {
        if (is_user_logged_in()) {
            return true;
        }
        
        // 1. Check for Mesh-to-Mesh Secret Auth (X-Mesh-Secret)
        // This is the preferred method for automated mesh coordination
        $mesh_secret = get_option('q3_edge_config', [])['mesh_secret'] ?? null;
        if (!$mesh_secret) {
            // Fallback to q3-compute specific secret if set
            $mesh_secret = 'JD18/MYZk6uRTwZ9t2NVR4FFTiv4eKNCJMy61uvIrBw='; // Default placeholder
        }
        
        $provided_secret = $request->get_header('X-Mesh-Secret');
        if ($provided_secret && $provided_secret === $mesh_secret) {
            return true;
        }

        // 2. Fallback to Basic Auth (WordPress Users)
        $auth = $request->get_header('Authorization');
        if ($auth && strpos($auth, 'Basic ') === 0) {
            $credentials = base64_decode(substr($auth, 6));
            list($user, $pass) = explode(':', $credentials, 2);
            $user_obj = wp_authenticate($user, $pass);
            if (!is_wp_error($user_obj)) {
                wp_set_current_user($user_obj->ID);
                return true;
            }
        }
        
        return new WP_Error('unauthorized', 'Authentication required', ['status' => 401]);
    }
    
    /**
     * GET /capacity
     */
    public function get_capacity($request) {
        $capacity = $this->qubit_pool->get_capacity();
        $capacity['active_jobs'] = $this->scheduler->get_active_count();
        $capacity['queued_jobs'] = $this->scheduler->get_queued_count();
        
        return new WP_REST_Response([
            'success' => true,
            'capacity' => $capacity,
            'status' => 'online',
            'version' => Q3_COMPUTE_VERSION
        ]);
    }
    
    /**
     * GET /operations
     */
    public function get_operations($request) {
        $vm = Q3_Compute::instance()->quantum_vm;
        return new WP_REST_Response([
            'success' => true,
            'operations' => $vm->get_operations()
        ]);
    }
    
    /**
     * POST /submit
     */
    public function submit_job($request) {
        $body = $request->get_json_params();
        
        $type = $body['type'] ?? null;
        $params = $body['params'] ?? [];
        
        if (!$type) {
            return new WP_REST_Response(['success' => false, 'error' => 'Missing type'], 400);
        }
        
        $result = $this->scheduler->submit($type, $params, [
            'priority' => $body['priority'] ?? 'normal',
            'callback_url' => $body['callback_url'] ?? null
        ]);
        
        if (is_wp_error($result)) {
            return new WP_REST_Response([
                'success' => false,
                'error' => $result->get_error_message()
            ], 400);
        }
        
        $result['status_url'] = rest_url("q3-compute/v1/status/{$result['job_id']}");
        $result['result_url'] = rest_url("q3-compute/v1/result/{$result['job_id']}");
        
        return new WP_REST_Response($result);
    }
    
    /**
     * POST /compute (sync)
     */
    public function compute_sync($request) {
        $body = $request->get_json_params();
        
        $type = $body['type'] ?? null;
        $params = $body['params'] ?? [];
        
        if (!$type) {
            return new WP_REST_Response(['success' => false, 'error' => 'Missing type'], 400);
        }
        
        $vm = Q3_Compute::instance()->quantum_vm;
        $time_limit = $vm->estimate_time($type, $params);
        
        if ($time_limit > 1000) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'Job too large for sync. Use /submit for async processing.'
            ], 400);
        }
        
        try {
            $result = $this->scheduler->execute_sync($type, $params);
            return new WP_REST_Response([
                'success' => true,
                'type' => $type,
                'qubits_used' => $vm->estimate_qubits($type, $params),
                'result' => $result
            ]);
        } catch (Exception $e) {
            return new WP_REST_Response([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * GET /status/{job_id}
     */
    public function get_status($request) {
        $job_id = $request['job_id'];
        $job = $this->scheduler->get_job($job_id);
        
        if (!$job) {
            return new WP_REST_Response(['success' => false, 'error' => 'Job not found'], 404);
        }
        
        // Read granular status info from worker
        $info = '';
        $work_dir = "/tmp/q3-build-" . $job_id;
        if (file_exists($work_dir . "/status_info")) {
            $info = trim(file_get_contents($work_dir . "/status_info"));
        }
        
        return new WP_REST_Response([
            'success' => true,
            'job_id' => $job_id,
            'status' => $job['status'],
            'type' => $job['type'],
            'qubits' => $job['qubits'],
            'created_at' => $job['created_at'],
            'completed_at' => $job['completed_at'] ?? null,
            'has_result' => $job['result'] !== null,
            'error' => $job['error'],
            'info' => $info
        ]);
    }
    
    /**
     * GET /result/{job_id}
     */
    public function get_result($request) {
        $job_id = $request['job_id'];
        $job = $this->scheduler->get_job($job_id);
        
        if (!$job) {
            return new WP_REST_Response(['success' => false, 'error' => 'Job not found'], 404);
        }
        
        if (in_array($job['status'], ['queued', 'running'])) {
            return new WP_REST_Response([
                'success' => false,
                'error' => 'Job not complete',
                'status' => $job['status']
            ], 202);
        }
        
        if ($job['status'] === 'failed') {
            return new WP_REST_Response([
                'success' => false,
                'error' => $job['error'],
                'status' => 'failed'
            ], 500);
        }
        
        return new WP_REST_Response([
            'success' => true,
            'job_id' => $job_id,
            'type' => $job['type'],
            'qubits' => $job['qubits'],
            'result' => $job['result']
        ]);
    }
    
    /**
     * POST /cancel/{job_id}
     */
    public function cancel_job($request) {
        $job_id = $request['job_id'];
        $result = $this->scheduler->cancel($job_id);
        
        if (is_wp_error($result)) {
            return new WP_REST_Response([
                'success' => false,
                'error' => $result->get_error_message()
            ], 400);
        }
        
        return new WP_REST_Response($result);
    }
}
