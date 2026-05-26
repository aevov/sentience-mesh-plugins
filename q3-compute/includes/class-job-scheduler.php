<?php
/**
 * Job Scheduler
 * Background job processing with WP Cron
 */

defined('ABSPATH') || exit;

class Q3_Job_Scheduler {
    
    private $quantum_vm;
    private $jobs_key = 'q3_compute_jobs';
    private $max_concurrent = 100;
    
    public function __construct($quantum_vm) {
        $this->quantum_vm = $quantum_vm;
        
        // Register cron hook
        add_action('q3_compute_process_job', [$this, 'process_job'], 10, 1);
        
        if (!get_option($this->jobs_key)) {
            update_option($this->jobs_key, []);
        }
    }
    
    /**
     * Get all jobs
     */
    public function get_jobs() {
        return get_option($this->jobs_key, []);
    }
    
    /**
     * Get job by ID
     */
    public function get_job($job_id) {
        $jobs = $this->get_jobs();
        return $jobs[$job_id] ?? null;
    }
    
    /**
     * Get active job count
     */
    public function get_active_count() {
        $jobs = $this->get_jobs();
        return count(array_filter($jobs, fn($j) => $j['status'] === 'running'));
    }
    
    /**
     * Get queued job count
     */
    public function get_queued_count() {
        $jobs = $this->get_jobs();
        return count(array_filter($jobs, fn($j) => $j['status'] === 'queued'));
    }
    
    /**
     * Submit a new job
     */
    public function submit($type, $params, $options = []) {
        // Check concurrent limit
        if ($this->get_active_count() >= $this->max_concurrent) {
            return new WP_Error('limit_reached', 'Max concurrent jobs reached');
        }
        
        // Create job
        $job_id = 'qc_' . bin2hex(random_bytes(8));
        $qubits = $this->quantum_vm->estimate_qubits($type, $params);
        
        $job = [
            'id' => $job_id,
            'type' => $type,
            'params' => $params,
            'priority' => $options['priority'] ?? 'normal',
            'callback_url' => $options['callback_url'] ?? null,
            'qubits' => $qubits,
            'status' => 'queued',
            'created_at' => time(),
            'user_id' => get_current_user_id(),
            'result' => null,
            'error' => null
        ];
        
        // Save
        $jobs = $this->get_jobs();
        $jobs[$job_id] = $job;
        update_option($this->jobs_key, $jobs);
        
        // Schedule processing
        wp_schedule_single_event(time(), 'q3_compute_process_job', [$job_id]);
        
        return [
            'success' => true,
            'job_id' => $job_id,
            'status' => 'queued',
            'qubits_allocated' => $qubits,
            'estimated_time_ms' => $this->quantum_vm->estimate_time($type, $params)
        ];
    }
    
    /**
     * Process a job (called by WP Cron)
     */
    public function process_job($job_id) {
        $jobs = $this->get_jobs();
        
        if (!isset($jobs[$job_id]) || $jobs[$job_id]['status'] !== 'queued') {
            return;
        }
        
        // Mark as running
        $jobs[$job_id]['status'] = 'running';
        $jobs[$job_id]['started_at'] = time();
        update_option($this->jobs_key, $jobs);
        
        $job = $jobs[$job_id];
        
        try {
            // Check for Dual Tether routing (Industry QPU Master)
            $qpu_url = get_option('q3_industry_qpu_master_url');
            if (!empty($qpu_url)) {
                // Forward to external orchestrator
                $response = wp_remote_post($qpu_url, [
                    'body' => json_encode(['type' => $job['type'], 'params' => $job['params']]),
                    'headers' => ['Content-Type' => 'application/json', 'X-Sentience-Mesh' => 'Dual-Tether'],
                    'timeout' => 45
                ]);
                if (is_wp_error($response)) {
                    throw new Exception('External QPU Error: ' . $response->get_error_message());
                }
                $result = json_decode(wp_remote_retrieve_body($response), true);
                if (!$result) {
                    throw new Exception('Invalid response from external QPU Master.');
                }
                $result['routed_via'] = 'industry_qpu_master';
            } else {
                // Execute natively on obfuscated VM
                $result = $this->quantum_vm->execute($job['type'], $job['params']);
                $result['routed_via'] = 'native_sentience_vm';
            }
            
            // Update job with result
            $jobs[$job_id]['status'] = 'completed';
            $jobs[$job_id]['completed_at'] = time();
            $jobs[$job_id]['result'] = $result;
            
            // Archive to Q3 DataVault for perpetual storage
            if (function_exists('q3_datavault')) {
                $dv = q3_datavault();
                $manifest_id = $dv->core->store_data(
                    'Computation Result: ' . $job['id'],
                    json_encode($result),
                    ['job_id' => $job_id, 'type' => $job['type']]
                );
                $jobs[$job_id]['datavault_id'] = $manifest_id;
            }
            
            // Callback if specified
            if ($job['callback_url']) {
                wp_remote_post($job['callback_url'], [
                    'body' => json_encode([
                        'job_id' => $job_id,
                        'status' => 'completed',
                        'result' => $result,
                        'datavault_id' => $jobs[$job_id]['datavault_id'] ?? null
                    ]),
                    'headers' => ['Content-Type' => 'application/json']
                ]);
            }
            
        } catch (Exception $e) {
            $jobs[$job_id]['status'] = 'failed';
            $jobs[$job_id]['error'] = $e->getMessage();
            $jobs[$job_id]['completed_at'] = time();
        }
        
        update_option($this->jobs_key, $jobs);
    }
    
    /**
     * Execute job synchronously (for small jobs)
     */
    public function execute_sync($type, $params) {
        $qpu_url = get_option('q3_industry_qpu_master_url');
        if (!empty($qpu_url)) {
            $response = wp_remote_post($qpu_url, [
                'body' => json_encode(['type' => $type, 'params' => $params]),
                'headers' => ['Content-Type' => 'application/json', 'X-Sentience-Mesh' => 'Dual-Tether'],
                'timeout' => 15
            ]);
            if (is_wp_error($response)) return ['error' => $response->get_error_message()];
            $res = json_decode(wp_remote_retrieve_body($response), true);
            $res['routed_via'] = 'industry_qpu_master';
            return $res;
        }
        $res = $this->quantum_vm->execute($type, $params);
        $res['routed_via'] = 'native_sentience_vm';
        return $res;
    }
    
    /**
     * Cancel a job
     */
    public function cancel($job_id) {
        $jobs = $this->get_jobs();
        
        if (!isset($jobs[$job_id])) {
            return new WP_Error('not_found', 'Job not found');
        }
        
        if (in_array($jobs[$job_id]['status'], ['completed', 'failed'])) {
            return new WP_Error('already_finished', 'Job already finished');
        }
        
        $jobs[$job_id]['status'] = 'cancelled';
        $jobs[$job_id]['cancelled_at'] = time();
        update_option($this->jobs_key, $jobs);
        
        return ['success' => true, 'job_id' => $job_id, 'status' => 'cancelled'];
    }
    
    /**
     * Get recent jobs
     */
    public function get_recent($limit = 10) {
        $jobs = $this->get_jobs();
        usort($jobs, fn($a, $b) => ($b['created_at'] ?? 0) - ($a['created_at'] ?? 0));
        return array_slice($jobs, 0, $limit);
    }
}
