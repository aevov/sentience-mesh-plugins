<?php
/**
 * DataVault Admin Dashboard
 * 
 * Provides the WordPress admin interface.
 * 
 * @package Q3_DataVault
 */

if (!defined('ABSPATH')) exit;

class Q3_DataVault_Admin {
    
    /** @var Q3_DataVault */
    private $datavault;
    
    /**
     * Constructor
     */
    public function __construct(Q3_DataVault $datavault) {
        $this->datavault = $datavault;
        
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
    }
    
    /**
     * Add admin menu
     */
    public function add_menu() {
        add_menu_page(
            'DataVault',
            'DataVault',
            'upload_files',
            'datavault',
            [$this, 'render_dashboard'],
            'dashicons-vault',
            30
        );
        
        add_submenu_page(
            'datavault',
            'Upload',
            'Upload',
            'upload_files',
            'datavault',
            [$this, 'render_dashboard']
        );
        
        add_submenu_page(
            'datavault',
            'Files',
            'Files',
            'upload_files',
            'datavault-files',
            [$this, 'render_files']
        );
        
        add_submenu_page(
            'datavault',
            'Statistics',
            'Statistics',
            'manage_options',
            'datavault-stats',
            [$this, 'render_stats']
        );
        
        add_submenu_page(
            'datavault',
            'Settings',
            'Settings',
            'manage_options',
            'datavault-settings',
            [$this, 'render_settings']
        );
    }
    
    /**
     * Enqueue admin assets
     */
    public function enqueue_assets($hook) {
        if (strpos($hook, 'datavault') === false) {
            return;
        }
        
        wp_enqueue_style(
            'datavault-admin',
            Q3_DATAVAULT_PLUGIN_URL . 'assets/css/datavault-admin.css',
            [],
            Q3_DATAVAULT_VERSION
        );
        
        wp_enqueue_script(
            'datavault-uploader',
            Q3_DATAVAULT_PLUGIN_URL . 'assets/js/datavault-uploader.js',
            ['jquery'],
            Q3_DATAVAULT_VERSION,
            true
        );
        
        wp_enqueue_script(
            'datavault-admin',
            Q3_DATAVAULT_PLUGIN_URL . 'assets/js/datavault-admin.js',
            ['jquery', 'datavault-uploader'],
            Q3_DATAVAULT_VERSION,
            true
        );
        
        wp_localize_script('datavault-admin', 'DataVaultConfig', [
            'apiBase' => rest_url('datavault/v1'),
            'nonce' => wp_create_nonce('wp_rest'),
            'chunkSize' => intval(get_option('q3_datavault_chunk_size', 512 * 1024)),
            'maxParallel' => 4
        ]);
    }
    
    /**
     * Render main dashboard
     */
    public function render_dashboard() {
        $stats = $this->datavault->stats->get_all();
        ?>
        <div class="wrap datavault-wrap">
            <h1>🔐 DataVault <span class="version">v<?php echo Q3_DATAVAULT_VERSION; ?></span></h1>
            
            <div class="datavault-hero">
                <div class="hero-stats">
                    <div class="stat-card">
                        <div class="stat-value"><?php echo $stats['storage']['files']; ?></div>
                        <div class="stat-label">Files Stored</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value"><?php echo $stats['storage']['stored_mb']; ?> MB</div>
                        <div class="stat-label">Storage Used</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value"><?php echo $stats['storage']['compression_ratio']; ?></div>
                        <div class="stat-label">Space Saved</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value"><?php echo $stats['storage']['chunks']; ?></div>
                        <div class="stat-label">Total Chunks</div>
                    </div>
                </div>
            </div>
            
            <div class="datavault-upload-section">
                <h2>📤 Upload Files</h2>
                
                <div id="dv-drop-zone" class="drop-zone">
                    <div class="drop-zone-content">
                        <div class="drop-icon">📁</div>
                        <div class="drop-text">Drag & Drop Files or Folders Here</div>
                        <div class="drop-subtext">or</div>
                        <div class="drop-buttons">
                            <label class="button button-primary">
                                📄 Select Files
                                <input type="file" id="dv-file-input" multiple hidden>
                            </label>
                            <label class="button">
                                📁 Select Folder
                                <input type="file" id="dv-folder-input" webkitdirectory directory multiple hidden>
                            </label>
                        </div>
                    </div>
                </div>
                
                <div id="dv-queue" class="upload-queue" style="display:none;">
                    <div class="queue-header">
                        <h3>📋 Upload Queue (<span id="dv-queue-count">0</span> files)</h3>
                        <span id="dv-queue-size"></span>
                    </div>
                    <div id="dv-queue-list" class="queue-list"></div>
                    <div class="queue-actions">
                        <button id="dv-start-upload" class="button button-primary" disabled>🚀 Start Upload</button>
                        <button id="dv-clear-queue" class="button" disabled>🗑️ Clear Queue</button>
                    </div>
                </div>
                
                <div id="dv-progress" class="upload-progress" style="display:none;">
                    <div class="progress-bar-container">
                        <div id="dv-progress-bar" class="progress-bar" style="width:0%">0%</div>
                    </div>
                    <div id="dv-progress-status" class="progress-status">Initializing...</div>
                </div>
                
                <div id="dv-result" class="upload-result"></div>
            </div>
            
            <div class="datavault-info">
                <h2>ℹ️ About DataVault</h2>
                <div class="info-grid">
                    <div class="info-card">
                        <h4>🔐 Pure Database Storage</h4>
                        <p>All data stored as compressed base64 in WordPress database. Zero local files.</p>
                    </div>
                    <div class="info-card">
                        <h4>📈 Exabyte Scale</h4>
                        <p>Theoretical capacity of 5+ Exabytes with database replication.</p>
                    </div>
                    <div class="info-card">
                        <h4>🔒 Integrity Protection</h4>
                        <p>Per-chunk checksums and XOR parity for data recovery.</p>
                    </div>
                    <div class="info-card">
                        <h4>⚡ Fast Access</h4>
                        <p>Direct database queries - no filesystem I/O or CDN requests.</p>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
    
    /**
     * Render files page
     */
    public function render_files() {
        $page = isset($_GET['paged']) ? intval($_GET['paged']) : 1;
        $folder = isset($_GET['folder']) ? sanitize_text_field($_GET['folder']) : '';
        $search = isset($_GET['s']) ? sanitize_text_field($_GET['s']) : '';
        
        $result = $this->datavault->manifest->list_files([
            'page' => $page,
            'per_page' => 20,
            'folder' => $folder,
            'search' => $search
        ]);
        
        $folders = $this->datavault->manifest->get_folders();
        ?>
        <div class="wrap datavault-wrap">
            <h1>📂 DataVault Files</h1>
            
            <div class="tablenav top">
                <div class="alignleft actions">
                    <select id="dv-folder-filter" onchange="location.href='?page=datavault-files&folder='+this.value">
                        <option value="">All Folders</option>
                        <?php foreach ($folders as $f): ?>
                            <option value="<?php echo esc_attr($f); ?>" <?php selected($f, $folder); ?>><?php echo esc_html($f); ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                
                <form class="search-box" method="get">
                    <input type="hidden" name="page" value="datavault-files">
                    <input type="search" name="s" value="<?php echo esc_attr($search); ?>" placeholder="Search files...">
                    <input type="submit" class="button" value="Search">
                </form>
            </div>
            
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th>Filename</th>
                        <th>Size</th>
                        <th>Chunks</th>
                        <th>Folder</th>
                        <th>Uploaded</th>
                        <th>Downloads</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($result['files'])): ?>
                        <tr><td colspan="7">No files found.</td></tr>
                    <?php else: ?>
                        <?php foreach ($result['files'] as $file): ?>
                            <tr data-manifest-id="<?php echo esc_attr($file['manifest_id']); ?>">
                                <td><strong><?php echo esc_html($file['filename']); ?></strong></td>
                                <td><?php echo size_format($file['filesize']); ?></td>
                                <td><?php echo $file['chunk_count']; ?></td>
                                <td><?php echo esc_html($file['folder']); ?></td>
                                <td><?php echo $file['uploaded_at']; ?></td>
                                <td><?php echo $file['downloads']; ?></td>
                                <td>
                                    <a href="<?php echo rest_url('datavault/v1/download/' . $file['manifest_id']); ?>" class="button button-small">⬇️ Download</a>
                                    <button class="button button-small dv-delete-file" data-id="<?php echo esc_attr($file['manifest_id']); ?>">🗑️</button>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
            
            <?php if ($result['pages'] > 1): ?>
                <div class="tablenav bottom">
                    <div class="tablenav-pages">
                        <?php
                        echo paginate_links([
                            'base' => add_query_arg('paged', '%#%'),
                            'format' => '',
                            'current' => $page,
                            'total' => $result['pages']
                        ]);
                        ?>
                    </div>
                </div>
            <?php endif; ?>
        </div>
        <?php
    }
    
    /**
     * Render statistics page
     */
    public function render_stats() {
        $stats = $this->datavault->stats->get_all();
        $top_files = $this->datavault->stats->get_top_files(10);
        $most_downloaded = $this->datavault->stats->get_most_downloaded(10);
        ?>
        <div class="wrap datavault-wrap">
            <h1>📊 DataVault Statistics</h1>
            
            <div class="stats-grid">
                <div class="stats-card">
                    <h3>💾 Storage</h3>
                    <table>
                        <tr><th>Files</th><td><?php echo $stats['storage']['files']; ?></td></tr>
                        <tr><th>Chunks</th><td><?php echo $stats['storage']['chunks']; ?></td></tr>
                        <tr><th>Stored</th><td><?php echo $stats['storage']['stored_mb']; ?> MB</td></tr>
                        <tr><th>Original</th><td><?php echo $stats['storage']['original_mb']; ?> MB</td></tr>
                        <tr><th>Compression</th><td><?php echo $stats['storage']['compression_ratio']; ?></td></tr>
                        <tr><th>Space Saved</th><td><?php echo $stats['storage']['space_saved_mb']; ?> MB</td></tr>
                    </table>
                </div>
                
                <div class="stats-card">
                    <h3>📅 Activity</h3>
                    <table>
                        <tr><th>Uploads (24h)</th><td><?php echo $stats['activity']['uploads_24h']; ?></td></tr>
                        <tr><th>Uploads (7d)</th><td><?php echo $stats['activity']['uploads_7d']; ?></td></tr>
                        <tr><th>Total Downloads</th><td><?php echo $stats['activity']['total_downloads']; ?></td></tr>
                    </table>
                </div>
                
                <div class="stats-card">
                    <h3>📦 Compression</h3>
                    <table>
                        <tr><th>Compressed</th><td><?php echo $stats['compression']['compressed_chunks']; ?> chunks</td></tr>
                        <tr><th>Uncompressed</th><td><?php echo $stats['compression']['uncompressed_chunks']; ?> chunks</td></tr>
                        <tr><th>Rate</th><td><?php echo $stats['compression']['compression_rate']; ?></td></tr>
                    </table>
                </div>
                
                <div class="stats-card">
                    <h3>🚀 Capacity</h3>
                    <table>
                        <tr><th>DB Used</th><td><?php echo $stats['capacity']['used_mb']; ?> MB</td></tr>
                        <tr><th>Estimated Limit</th><td><?php echo $stats['capacity']['estimated_limit_tb']; ?> TB</td></tr>
                        <tr><th>Remaining</th><td><?php echo $stats['capacity']['remaining_tb']; ?> TB</td></tr>
                        <tr><th>Used %</th><td><?php echo $stats['capacity']['used_percentage']; ?></td></tr>
                    </table>
                </div>
            </div>
            
            <div class="stats-tables">
                <div class="stats-table">
                    <h3>📁 Top Files by Size</h3>
                    <table class="wp-list-table widefat">
                        <thead><tr><th>Filename</th><th>Size</th></tr></thead>
                        <tbody>
                            <?php foreach ($top_files as $file): ?>
                                <tr><td><?php echo esc_html($file['filename']); ?></td><td><?php echo $file['size_mb']; ?> MB</td></tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                
                <div class="stats-table">
                    <h3>⬇️ Most Downloaded</h3>
                    <table class="wp-list-table widefat">
                        <thead><tr><th>Filename</th><th>Downloads</th></tr></thead>
                        <tbody>
                            <?php foreach ($most_downloaded as $file): ?>
                                <tr><td><?php echo esc_html($file['filename']); ?></td><td><?php echo $file['downloads']; ?></td></tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        <?php
    }
    
    /**
     * Render settings page
     */
    public function render_settings() {
        if (isset($_POST['datavault_save_settings'])) {
            check_admin_referer('datavault_settings');
            
            update_option('q3_datavault_chunk_size', intval($_POST['chunk_size']));
            update_option('q3_datavault_compression_level', intval($_POST['compression_level']));
            update_option('q3_datavault_parity_group_size', intval($_POST['parity_group_size']));
            
            echo '<div class="notice notice-success"><p>Settings saved!</p></div>';
        }
        
        $settings = $this->datavault->get_settings();
        ?>
        <div class="wrap datavault-wrap">
            <h1>⚙️ DataVault Settings</h1>
            
            <form method="post">
                <?php wp_nonce_field('datavault_settings'); ?>
                
                <table class="form-table">
                    <tr>
                        <th>Chunk Size</th>
                        <td>
                            <select name="chunk_size">
                                <option value="262144" <?php selected($settings['chunk_size'], 262144); ?>>256 KB</option>
                                <option value="524288" <?php selected($settings['chunk_size'], 524288); ?>>512 KB (Recommended)</option>
                                <option value="1048576" <?php selected($settings['chunk_size'], 1048576); ?>>1 MB</option>
                                <option value="2097152" <?php selected($settings['chunk_size'], 2097152); ?>>2 MB</option>
                            </select>
                            <p class="description">Smaller = more chunks, better resumability. Larger = fewer DB rows.</p>
                        </td>
                    </tr>
                    <tr>
                        <th>Compression Level</th>
                        <td>
                            <select name="compression_level">
                                <?php for ($i = 1; $i <= 9; $i++): ?>
                                    <option value="<?php echo $i; ?>" <?php selected($settings['compression_level'], $i); ?>><?php echo $i; ?> <?php echo $i === 9 ? '(Maximum)' : ($i === 1 ? '(Fastest)' : ''); ?></option>
                                <?php endfor; ?>
                            </select>
                            <p class="description">Higher = smaller files, slower processing.</p>
                        </td>
                    </tr>
                    <tr>
                        <th>Parity Group Size</th>
                        <td>
                            <select name="parity_group_size">
                                <option value="0" <?php selected($settings['parity_group_size'], 0); ?>>Disabled</option>
                                <option value="4" <?php selected($settings['parity_group_size'], 4); ?>>4 chunks (Recommended)</option>
                                <option value="8" <?php selected($settings['parity_group_size'], 8); ?>>8 chunks</option>
                            </select>
                            <p class="description">XOR parity allows recovery of 1 lost chunk per group.</p>
                        </td>
                    </tr>
                </table>
                
                <p class="submit">
                    <input type="submit" name="datavault_save_settings" class="button button-primary" value="Save Settings">
                </p>
            </form>
            
            <hr>
            
            <h2>📖 API Endpoints</h2>
            <table class="wp-list-table widefat">
                <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
                <tbody>
                    <tr><td><code>/datavault/v1/upload/init</code></td><td>POST</td><td>Initialize upload</td></tr>
                    <tr><td><code>/datavault/v1/upload/chunk</code></td><td>POST</td><td>Upload chunk</td></tr>
                    <tr><td><code>/datavault/v1/upload/finalize</code></td><td>POST</td><td>Finalize upload</td></tr>
                    <tr><td><code>/datavault/v1/download/{id}</code></td><td>GET</td><td>Download file</td></tr>
                    <tr><td><code>/datavault/v1/files</code></td><td>GET</td><td>List files</td></tr>
                    <tr><td><code>/datavault/v1/stats</code></td><td>GET</td><td>Get statistics</td></tr>
                </tbody>
            </table>
        </div>
        <?php
    }
}
