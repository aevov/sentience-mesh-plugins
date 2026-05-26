/**
 * DataVault Admin JavaScript
 * 
 * Handles admin UI interactions.
 */

(function ($) {
    'use strict';

    // Uploader instance
    let uploader = null;
    let uploadQueue = [];

    /**
     * Initialize uploader
     */
    function initUploader() {
        uploader = new DataVaultUploader({
            apiBase: DataVaultConfig.apiBase,
            nonce: DataVaultConfig.nonce,
            chunkSize: DataVaultConfig.chunkSize,
            maxParallel: DataVaultConfig.maxParallel,

            onProgress: function (data) {
                updateProgress(data.progress, `Uploading ${data.filename}: ${data.uploaded}/${data.total} chunks`);
            },

            onComplete: function (data) {
                addResult('success', `✅ ${data.filename} uploaded successfully!`);
            },

            onError: function (data) {
                addResult('error', `❌ ${data.filename}: ${data.error}`);
            }
        });
    }

    /**
     * Initialize UI
     */
    function initUI() {
        const dropZone = $('#dv-drop-zone');
        const fileInput = $('#dv-file-input');
        const folderInput = $('#dv-folder-input');

        // Drop zone events
        dropZone.on('dragover', function (e) {
            e.preventDefault();
            $(this).addClass('dragover');
        });

        dropZone.on('dragleave drop', function (e) {
            e.preventDefault();
            $(this).removeClass('dragover');
        });

        dropZone.on('drop', function (e) {
            e.preventDefault();
            const items = e.originalEvent.dataTransfer.items;
            handleDropItems(items);
        });

        // File input
        fileInput.on('change', function () {
            addFilesToQueue(Array.from(this.files));
            this.value = '';
        });

        // Folder input
        folderInput.on('change', function () {
            const files = Array.from(this.files).map(file => {
                file.relativePath = file.webkitRelativePath;
                return file;
            });
            addFilesToQueue(files);
            this.value = '';
        });

        // Start upload button
        $('#dv-start-upload').on('click', startUpload);

        // Clear queue button
        $('#dv-clear-queue').on('click', clearQueue);

        // Delete file buttons
        $(document).on('click', '.dv-delete-file', function () {
            const id = $(this).data('id');
            deleteFile(id, $(this).closest('tr'));
        });
    }

    /**
     * Handle dropped items (files/folders)
     */
    async function handleDropItems(items) {
        const files = [];

        for (const item of items) {
            const entry = item.webkitGetAsEntry();

            if (entry) {
                await traverseEntry(entry, '', files);
            }
        }

        addFilesToQueue(files);
    }

    /**
     * Traverse file entry recursively
     */
    async function traverseEntry(entry, path, files) {
        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file(file => {
                    file.relativePath = path + file.name;
                    files.push(file);
                    resolve();
                });
            });
        } else if (entry.isDirectory) {
            const reader = entry.createReader();

            return new Promise((resolve) => {
                reader.readEntries(async entries => {
                    for (const e of entries) {
                        await traverseEntry(e, path + entry.name + '/', files);
                    }
                    resolve();
                });
            });
        }
    }

    /**
     * Add files to upload queue
     */
    function addFilesToQueue(files) {
        files.forEach(file => {
            uploadQueue.push(file);
        });

        updateQueueUI();
    }

    /**
     * Update queue UI
     */
    function updateQueueUI() {
        const $queue = $('#dv-queue');
        const $list = $('#dv-queue-list');
        const $count = $('#dv-queue-count');
        const $size = $('#dv-queue-size');

        if (uploadQueue.length === 0) {
            $queue.hide();
            return;
        }

        $queue.show();
        $count.text(uploadQueue.length);

        const totalSize = uploadQueue.reduce((sum, f) => sum + f.size, 0);
        $size.text(formatSize(totalSize));

        $list.empty();
        uploadQueue.forEach((file, index) => {
            $list.append(`
                <div class="queue-item" data-index="${index}">
                    <span class="file-name">${file.relativePath || file.name}</span>
                    <span class="file-size">${formatSize(file.size)}</span>
                    <span class="file-status"></span>
                </div>
            `);
        });

        $('#dv-start-upload, #dv-clear-queue').prop('disabled', false);
    }

    /**
     * Start upload process
     */
    async function startUpload() {
        if (uploadQueue.length === 0) return;

        $('#dv-start-upload, #dv-clear-queue').prop('disabled', true);
        $('#dv-progress').show();
        $('#dv-result').empty();

        let completed = 0;
        const total = uploadQueue.length;

        for (const file of uploadQueue) {
            const $item = $(`.queue-item[data-index="${uploadQueue.indexOf(file)}"]`);
            $item.find('.file-status').html('⏳');

            try {
                await uploader.uploadFile(file);
                $item.find('.file-status').html('✅');
            } catch (error) {
                $item.find('.file-status').html('❌');
            }

            completed++;
            updateProgress(Math.round(completed / total * 100), `${completed}/${total} files`);
        }

        uploadQueue = [];
        updateQueueUI();

        updateProgress(100, 'All uploads complete!');
        $('#dv-start-upload, #dv-clear-queue').prop('disabled', false);
    }

    /**
     * Clear upload queue
     */
    function clearQueue() {
        uploadQueue = [];
        updateQueueUI();
    }

    /**
     * Update progress bar
     */
    function updateProgress(percent, status) {
        $('#dv-progress-bar').css('width', percent + '%').text(percent + '%');
        $('#dv-progress-status').text(status);
    }

    /**
     * Add result message
     */
    function addResult(type, message) {
        $('#dv-result').append(`<div class="result-${type}">${message}</div>`);
    }

    /**
     * Delete file
     */
    async function deleteFile(id, $row) {
        if (!confirm('Delete this file?')) return;

        try {
            const response = await fetch(`${DataVaultConfig.apiBase}/files/${id}`, {
                method: 'DELETE',
                headers: { 'X-WP-Nonce': DataVaultConfig.nonce }
            });

            const result = await response.json();

            if (result.success) {
                $row.fadeOut(() => $row.remove());
            } else {
                alert('Failed to delete: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    /**
     * Format file size
     */
    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Initialize on document ready
    $(document).ready(function () {
        if (typeof DataVaultConfig !== 'undefined') {
            initUploader();
            initUI();
        }
    });

})(jQuery);
