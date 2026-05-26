<?php
/**
 * Q3 Bridge Manager - Handles Node.js process lifecycle
 */

defined('ABSPATH') || exit;

class Q3_Bridge_Manager {
    
    private $pid_option = 'q3_bridge_pid';
    private $status_option = 'q3_bridge_status';
    private $node_port = 8082;
    
    public function __construct() {
        // initialization
    }
    
    /**
     * Handle AJAX actions from the dashboard
     */
    public function handle_ajax_action() {
        check_ajax_referer('q3_bridge_nonce', 'nonce');
        
        $bridge_action = sanitize_text_field($_POST['bridge_action'] ?? '');
        
        switch ($bridge_action) {
            case 'start':
                $result = $this->start_bridge();
                break;
            case 'stop':
                $result = $this->stop_bridge();
                break;
            case 'status':
                $result = $this->get_full_status();
                break;
            default:
                $result = ['success' => false, 'error' => 'Invalid action'];
        }
        
        wp_send_json($result);
    }
    
    /**
     * Start the Node.js bridge
     */
    public function start_bridge() {
        if ($this->is_running()) {
            return ['success' => false, 'error' => 'Bridge is already running'];
        }
        
        $node_bin = $this->find_node_binary();
        if (!$node_bin) {
            return ['success' => false, 'error' => 'Node.js binary not found. Please install Node.js on the server.'];
        }
        
        $bridge_script = Q3_BRIDGE_PATH . 'bridge/q3-bridge.js';
        $log_file = Q3_BRIDGE_PATH . 'bridge/bridge.log';
        
        // Command to run in background
        $cmd = sprintf('%s %s >> %s 2>&1 & echo $!', 
            escapeshellcmd($node_bin), 
            escapeshellarg($bridge_script), 
            escapeshellarg($log_file)
        );
        
        $pid = shell_exec($cmd);
        $pid = intval(trim($pid));
        
        if ($pid > 0) {
            update_option($this->pid_option, $pid);
            update_option($this->status_option, 'running');
            return ['success' => true, 'pid' => $pid];
        }
        
        return ['success' => false, 'error' => 'Failed to start bridge. Check bridge.log for details.'];
    }
    
    /**
     * Stop the Node.js bridge
     */
    public function stop_bridge() {
        $pid = intval(get_option($this->pid_option));
        
        if ($pid > 0) {
            // Kill the process
            if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
                exec("taskkill /F /PID $pid");
            } else {
                exec("kill -9 $pid");
            }
            
            delete_option($this->pid_option);
            update_option($this->status_option, 'stopped');
            return ['success' => true];
        }
        
        return ['success' => false, 'error' => 'Bridge is not running'];
    }
    
    /**
     * Check if the bridge is currently running
     */
    public function is_running() {
        $pid = intval(get_option($this->pid_option));
        if ($pid <= 0) return false;
        
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            $check = shell_exec("tasklist /FI \"PID eq $pid\"");
            return strpos($check, $pid) !== false;
        } else {
            $check = shell_exec("ps -p $pid");
            return strpos($check, (string)$pid) !== false;
        }
    }
    
    /**
     * Get full status information
     */
    public function get_full_status() {
        $is_running = $this->is_running();
        $port_active = $this->check_port($this->node_port);
        
        return [
            'success' => true,
            'status' => $is_running ? 'running' : 'stopped',
            'pid' => get_option($this->pid_option, 0),
            'port_active' => $port_active,
            'node_version' => $this->get_node_version(),
            'log_tail' => $this->get_log_tail()
        ];
    }
    
    /**
     * Check if a port is open
     */
    private function check_port($port) {
        $connection = @fsockopen('localhost', $port, $errno, $errstr, 1);
        if (is_resource($connection)) {
            fclose($connection);
            return true;
        }
        return false;
    }
    
    /**
     * Find Node.js binary path
     */
    private function find_node_binary() {
        $paths = ['node', '/usr/bin/node', '/usr/local/bin/node', '/opt/node/bin/node'];
        foreach ($paths as $path) {
            $version = shell_exec("$path -v 2>&1");
            if (strpos($version, 'v') === 0) {
                return $path;
            }
        }
        return false;
    }
    
    private function get_node_version() {
        $node_bin = $this->find_node_binary();
        return $node_bin ? trim(shell_exec("$node_bin -v")) : 'N/A';
    }
    
    private function get_log_tail() {
        $log_file = Q3_BRIDGE_PATH . 'bridge/bridge.log';
        if (!file_exists($log_file)) return 'No logs found.';
        
        $lines = array_slice(explode("\n", file_get_contents($log_file)), -20);
        return implode("\n", $lines);
    }
}
