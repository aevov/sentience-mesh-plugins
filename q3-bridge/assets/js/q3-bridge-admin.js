jQuery(document).ready(function ($) {
    const $startBtn = $('#q3-bridge-start');
    const $stopBtn = $('#q3-bridge-stop');
    const $refreshBtn = $('#q3-bridge-refresh');
    const $logs = $('#q3-bridge-logs');
    const $statusCard = $('.q3-bridge-status-card');
    const $statusText = $('.status-header h2');
    const $pidValue = $('.detail-item:nth-child(1) .value');
    const $portValue = $('.detail-item:nth-child(2) .value');

    const updateUI = (data) => {
        $statusCard.removeClass('running stopped').addClass(data.status);
        $statusText.text('System Status: ' + data.status.toUpperCase());
        $pidValue.text(data.pid || 'N/A');

        $portValue.text(data.port_active ? 'OPEN' : 'CLOSED')
            .removeClass('active inactive')
            .addClass(data.port_active ? 'active' : 'inactive');

        $logs.text(data.log_tail);
        $logs.scrollTop($logs[0].scrollHeight);

        $startBtn.prop('disabled', data.status === 'running');
        $stopBtn.prop('disabled', data.status === 'stopped');
    };

    const performAction = (action) => {
        const $btns = $('.status-actions .button');
        $btns.prop('disabled', true);

        $.post(q3Bridge.ajaxUrl, {
            action: 'q3_bridge_action',
            bridge_action: action,
            nonce: q3Bridge.nonce
        }, function (response) {
            if (response.success) {
                if (action === 'status' || action === 'start' || action === 'stop') {
                    // refresh status after action
                    refreshStatus();
                }
            } else {
                alert('Error: ' + response.error);
                $btns.prop('disabled', false);
            }
        });
    };

    const refreshStatus = () => {
        $.post(q3Bridge.ajaxUrl, {
            action: 'q3_bridge_action',
            bridge_action: 'status',
            nonce: q3Bridge.nonce
        }, function (response) {
            if (response.success) {
                updateUI(response);
            }
        });
    };

    $startBtn.on('click', () => performAction('start'));
    $stopBtn.on('click', () => performAction('stop'));
    $refreshBtn.on('click', refreshStatus);

    // Auto refresh status every 10 seconds
    setInterval(refreshStatus, 10000);
});
