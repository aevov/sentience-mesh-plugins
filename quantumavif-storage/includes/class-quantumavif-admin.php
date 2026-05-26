<?php
/**
 * QuantumAVIF Admin Interface
 * 
 * Settings page and dashboard
 */

if (!defined('ABSPATH')) {
    exit;
}

class QuantumAVIF_Admin {
    
    public function __construct() {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_init', [$this, 'register_settings']);
    }
    
    public function add_menu() {
        // Add top-level menu for better visibility
        add_menu_page(
            'QuantumAVIF Storage',           // Page title
            'QuantumAVIF',                   // Menu title
            'manage_options',                 // Capability
            'quantumavif-storage',           // Menu slug
            [$this, 'render_settings_page'], // Callback
            'dashicons-cloud',               // Icon (cloud icon)
            80                               // Position
        );
    }
    
    public function register_settings() {
        register_setting('quantumavif_options', 'quantumavif_amplification_mode');
        register_setting('quantumavif_options', 'quantumavif_qudit_enabled');
    }
    
    public function render_settings_page() {
        ?>
        <div class="wrap">
            <h1>QuantumAVIF Storage Settings</h1>
            
            <h2>Statistics</h2>
            <table class="widefat">
                <tr>
                    <td><strong>Files Encoded:</strong></td>
                    <td><?php echo get_option('quantumavif_files_encoded', 0); ?></td>
                </tr>
                <tr>
                    <td><strong>Shards Generated:</strong></td>
                    <td><?php echo get_option('quantumavif_shards_generated', 0); ?></td>
                </tr>
                <tr>
                    <td><strong>Physical Storage Used:</strong></td>
                    <td><?php echo size_format(get_option('quantumavif_physical_bytes', 0)); ?></td>
                </tr>
                <tr>
                    <td><strong>Logical Capacity:</strong></td>
                    <td><?php echo size_format(get_option('quantumavif_logical_bytes', 0)); ?></td>
                </tr>
                <tr>
                    <td><strong>Amplification Ratio:</strong></td>
                    <td><strong style="color: #00a32a;"><?php echo get_option('quantumavif_amplification_ratio', '20x'); ?></strong></td>
                </tr>
            </table>
            
            <h2>Configuration</h2>
            <form method="post" action="options.php">
                <?php settings_fields('quantumavif_options'); ?>
                <table class="form-table">
                    <tr>
                        <th>Amplification Mode</th>
                        <td>
                            <select name="quantumavif_amplification_mode">
                                <option value="20x">20x (Phase 1)</option>
                                <option value="30x">30x (Phase 1+2)</option>
                                <option value="50x">50x (All Phases)</option>
                            </select>
                            <p class="description">Current: Phase 1 (Erasure + LEANN)</p>
                        </td>
                    </tr>
                    <tr>
                        <th>Qudit Metadata (Phase 3)</th>
                        <td>
                            <label>
                                <input type="checkbox" name="quantumavif_qudit_enabled" value="1" <?php checked(get_option('quantumavif_qudit_enabled'), 1); ?> />
                                Enable qutrit encoding
                            </label>
                            <p class="description">Experimental quantum-classical hybrid features</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            
            <h2>System Info</h2>
            <table class="widefat">
                <tr>
                    <td>Plugin Version</td>
                    <td><?php echo QUANTUMAVIF_VERSION; ?></td>
                </tr>
                <tr>
                    <td>Image Size</td>
                    <td>2048×2048 (3.15 MB capacity per AVIF)</td>
                </tr>
                <tr>
                    <td>Erasure Coding</td>
                    <td>(8+4) Reed-Solomon</td>
                </tr>
                <tr>
                    <td>AVIF Support</td>
                    <td><?php echo function_exists('imageavif') ? '✓ Native' : '⚠ Fallback to PNG'; ?></td>
                </tr>
            </table>
        </div>
        <?php
    }
}
