<?php
/**
 * Plugin Name: SitePunch License & Telemetry Manager
 * Plugin URI: https://sitepunch.app
 * Description: Connects your SitePunch Mobile PWA with your WordPress marketing website. Captures PayPal payment telemetry, customer contact info, project names, and device project stats in your WordPress Admin dashboard.
 * Version: 1.0.0
 * Author: SitePunch
 * Author URI: https://sitepunch.app
 * License: GPL-2.0+
 * Text Domain: sitepunch-licenses
 */

if (!defined('ABSPATH')) {
    exit; // Prevent direct access
}

define('SITEPUNCH_VERSION', '1.0.0');
define('SITEPUNCH_DEFAULT_SECRET', 'sitepunch_secret_key_8829');

/**
 * 1. Database Table Creation on Activation
 */
register_activation_hook(__FILE__, 'sitepunch_activate_plugin');
function sitepunch_activate_plugin() {
    global $wpdb;
    $table_name = $wpdb->prefix . 'sitepunch_licenses';
    $charset_collate = $wpdb->get_charset_collate();

    $sql = "CREATE TABLE $table_name (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        customer_name VARCHAR(150) NOT NULL DEFAULT '',
        customer_email VARCHAR(150) NOT NULL DEFAULT '',
        customer_phone VARCHAR(60) NOT NULL DEFAULT '',
        project_name VARCHAR(255) NOT NULL DEFAULT '',
        project_uuid VARCHAR(100) NOT NULL DEFAULT '',
        total_projects INT(11) NOT NULL DEFAULT 1,
        total_reports INT(11) NOT NULL DEFAULT 1,
        total_items INT(11) NOT NULL DEFAULT 0,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        paypal_order_id VARCHAR(100) NOT NULL DEFAULT '',
        gateway VARCHAR(50) NOT NULL DEFAULT 'paypal',
        status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
        user_agent TEXT NULL,
        ip_address VARCHAR(50) NOT NULL DEFAULT '',
        PRIMARY KEY (id),
        KEY customer_email (customer_email),
        KEY project_uuid (project_uuid)
    ) $charset_collate;";

    require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
    dbDelta($sql);

    if (!get_option('sitepunch_api_key')) {
        update_option('sitepunch_api_key', SITEPUNCH_DEFAULT_SECRET);
    }
}

/**
 * 2. REST API Endpoint: POST /wp-json/sitepunch/v1/log-license
 */
add_action('rest_api_init', function () {
    register_rest_route('sitepunch/v1', '/log-license', array(
        'methods'             => 'POST',
        'callback'            => 'sitepunch_handle_log_license',
        'permission_callback' => 'sitepunch_verify_api_key',
    ));
});

function sitepunch_verify_api_key($request) {
    $expected_key = get_option('sitepunch_api_key', SITEPUNCH_DEFAULT_SECRET);
    $received_key = $request->get_header('x_sitepunch_key');
    if (!$received_key) {
        $received_key = $request->get_header('X-SitePunch-Key');
    }
    if (!$received_key || $received_key !== $expected_key) {
        return new WP_Error('sitepunch_unauthorized', 'Invalid or missing API key', array('status' => 401));
    }
    return true;
}

function sitepunch_handle_log_license($request) {
    global $wpdb;
    $table_name = $wpdb->prefix . 'sitepunch_licenses';
    $params = $request->get_json_params();

    if (empty($params)) {
        return new WP_Error('invalid_data', 'Missing telemetry payload', array('status' => 400));
    }

    $customer   = isset($params['customer']) ? $params['customer'] : array();
    $project    = isset($params['project']) ? $params['project'] : array();
    $device     = isset($params['deviceStats']) ? $params['deviceStats'] : array();
    $payment    = isset($params['payment']) ? $params['payment'] : array();

    $name       = sanitize_text_field(isset($customer['name']) ? $customer['name'] : 'Customer');
    $email      = sanitize_email(isset($customer['email']) ? $customer['email'] : '');
    $phone      = sanitize_text_field(isset($customer['phone']) ? $customer['phone'] : '');
    $proj_name  = sanitize_text_field(isset($project['name']) ? $project['name'] : 'Site Project');
    $proj_uuid  = sanitize_text_field(isset($project['uuid']) ? $project['uuid'] : '');
    
    $total_proj = intval(isset($device['totalProjectsOnDevice']) ? $device['totalProjectsOnDevice'] : 1);
    $total_rep  = intval(isset($device['totalReportsOnDevice']) ? $device['totalReportsOnDevice'] : 1);
    $total_it   = intval(isset($project['observationsCount']) ? $project['observationsCount'] : 0);

    $amount     = floatval(isset($payment['amount']) ? $payment['amount'] : 4.99);
    $currency   = sanitize_text_field(isset($payment['currency']) ? $payment['currency'] : 'USD');
    $order_id   = sanitize_text_field(isset($payment['orderId']) ? $payment['orderId'] : '');
    $gateway    = sanitize_text_field(isset($payment['gateway']) ? $payment['gateway'] : 'paypal');
    $status     = sanitize_text_field(isset($payment['status']) ? $payment['status'] : 'COMPLETED');
    $ua         = sanitize_text_field(isset($device['platform']) ? $device['platform'] : '');
    $ip         = sanitize_text_field(isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');

    $result = $wpdb->insert($table_name, array(
        'customer_name'   => $name,
        'customer_email'  => $email,
        'customer_phone'  => $phone,
        'project_name'    => $proj_name,
        'project_uuid'    => $proj_uuid,
        'total_projects'  => $total_proj,
        'total_reports'   => $total_rep,
        'total_items'     => $total_it,
        'amount'          => $amount,
        'currency'        => $currency,
        'paypal_order_id' => $order_id,
        'gateway'         => $gateway,
        'status'          => $status,
        'user_agent'      => $ua,
        'ip_address'      => $ip,
        'created_at'      => current_time('mysql'),
    ));

    if ($result === false) {
        return new WP_Error('db_error', 'Could not record license in database', array('status' => 500));
    }

    return rest_ensure_response(array(
        'success'   => true,
        'message'   => 'Project license and customer telemetry successfully recorded.',
        'licenseId' => $wpdb->insert_id,
    ));
}

/**
 * 3. WordPress Admin Menu & Dashboard Table
 */
add_action('admin_menu', function () {
    add_menu_page(
        'SitePunch Licenses',
        'SitePunch Licenses',
        'manage_options',
        'sitepunch-licenses',
        'sitepunch_render_admin_page',
        'dashicons-clipboard',
        25
    );
});

// CSV Export Handler
add_action('admin_init', function () {
    if (isset($_GET['page']) && $_GET['page'] === 'sitepunch-licenses' && isset($_GET['action']) && $_GET['action'] === 'export_csv') {
        if (!current_user_can('manage_options')) return;
        check_admin_referer('sitepunch_export_nonce');

        global $wpdb;
        $table_name = $wpdb->prefix . 'sitepunch_licenses';
        $rows = $wpdb->get_results("SELECT * FROM $table_name ORDER BY id DESC", ARRAY_A);

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename=sitepunch_customers_' . date('Y-m-d') . '.csv');
        $output = fopen('php://output', 'w');
        fputcsv($output, array('ID', 'Date', 'Customer Name', 'Email', 'Phone', 'Project Name', 'Total Projects on Device', 'Total Reports', 'Project Items', 'Amount', 'Currency', 'PayPal Order ID', 'Status'));

        foreach ($rows as $r) {
            fputcsv($output, array(
                $r['id'], $r['created_at'], $r['customer_name'], $r['customer_email'], $r['customer_phone'],
                $r['project_name'], $r['total_projects'], $r['total_reports'], $r['total_items'],
                $r['amount'], $r['currency'], $r['paypal_order_id'], $r['status']
            ));
        }
        fclose($output);
        exit;
    }
});

function sitepunch_render_admin_page() {
    global $wpdb;
    $table_name = $wpdb->prefix . 'sitepunch_licenses';

    // Handle settings update
    if (isset($_POST['sitepunch_save_settings']) && check_admin_referer('sitepunch_settings_nonce')) {
        $new_key = sanitize_text_field($_POST['sitepunch_api_key']);
        if (!empty($new_key)) {
            update_option('sitepunch_api_key', $new_key);
            echo '<div class="notice notice-success is-dismissible"><p>Settings saved successfully.</p></div>';
        }
    }

    $api_key = get_option('sitepunch_api_key', SITEPUNCH_DEFAULT_SECRET);
    $total_revenue = $wpdb->get_var("SELECT SUM(amount) FROM $table_name WHERE status = 'COMPLETED'") ?: 0;
    $total_licenses = $wpdb->get_var("SELECT COUNT(*) FROM $table_name") ?: 0;
    $unique_customers = $wpdb->get_var("SELECT COUNT(DISTINCT customer_email) FROM $table_name") ?: 0;

    $records = $wpdb->get_results("SELECT * FROM $table_name ORDER BY id DESC LIMIT 100");
    $export_url = wp_nonce_url(admin_url('admin.php?page=sitepunch-licenses&action=export_csv'), 'sitepunch_export_nonce');
    ?>
    <div class="wrap">
        <h1 style="display:flex; align-items:center; gap:10px;">
            <span class="dashicons dashicons-clipboard" style="font-size:28px; width:28px; height:28px;"></span>
            SitePunch Customer &amp; Project Licenses
        </h1>
        <p class="description">
            Telemetry and customer data collected automatically from your SitePunch Mobile PWA when projects are unlocked via PayPal.
        </p>

        <!-- KPI Cards -->
        <div style="display:flex; gap:16px; margin: 20px 0;">
            <div style="background:#fff; border:1px solid #ccd0d4; border-radius:10px; padding:16px 20px; flex:1; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size:12px; font-weight:600; color:#646970; text-transform:uppercase;">Total Revenue</div>
                <div style="font-size:26px; font-weight:bold; color:#1d2327; margin-top:4px;">$<?php echo number_format($total_revenue, 2); ?> <span style="font-size:13px; color:#8c8f94;">USD</span></div>
            </div>
            <div style="background:#fff; border:1px solid #ccd0d4; border-radius:10px; padding:16px 20px; flex:1; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size:12px; font-weight:600; color:#646970; text-transform:uppercase;">Paid Project Licenses</div>
                <div style="font-size:26px; font-weight:bold; color:#1d2327; margin-top:4px;"><?php echo intval($total_licenses); ?></div>
            </div>
            <div style="background:#fff; border:1px solid #ccd0d4; border-radius:10px; padding:16px 20px; flex:1; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="font-size:12px; font-weight:600; color:#646970; text-transform:uppercase;">Unique Customers</div>
                <div style="font-size:26px; font-weight:bold; color:#1d2327; margin-top:4px;"><?php echo intval($unique_customers); ?></div>
            </div>
        </div>

        <!-- Table Toolbar -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h2 style="font-size:16px; margin:0;">Purchases &amp; User Telemetry (Latest 100)</h2>
            <a href="<?php echo esc_url($export_url); ?>" class="button button-secondary">
                <span class="dashicons dashicons-download" style="vertical-align:middle; font-size:16px; margin-right:3px;"></span>
                Export to CSV
            </a>
        </div>

        <!-- Table -->
        <table class="wp-list-table widefat fixed striped table-view-list">
            <thead>
                <tr>
                    <th style="width:130px;">Date</th>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Project Name</th>
                    <th style="width:110px;">Device Stats</th>
                    <th style="width:130px;">PayPal Order ID</th>
                    <th style="width:90px;">Amount</th>
                    <th style="width:90px;">Status</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($records)) : ?>
                    <tr><td colspan="8" style="text-align:center; padding:30px; color:#8c8f94;">No licenses recorded yet. Test an unlock in SitePunch to see your first purchase!</td></tr>
                <?php else : ?>
                    <?php foreach ($records as $r) : ?>
                        <tr>
                            <td><?php echo esc_html(date('M j, Y g:ia', strtotime($r->created_at))); ?></td>
                            <td><strong><?php echo esc_html($r->customer_name); ?></strong></td>
                            <td>
                                <div><a href="mailto:<?php echo esc_attr($r->customer_email); ?>"><?php echo esc_html($r->customer_email); ?></a></div>
                                <?php if (!empty($r->customer_phone)) : ?>
                                    <div style="font-size:11px; color:#646970;"><?php echo esc_html($r->customer_phone); ?></div>
                                <?php endif; ?>
                            </td>
                            <td>
                                <strong><?php echo esc_html($r->project_name); ?></strong>
                                <div style="font-size:10px; color:#8c8f94;"><?php echo esc_html($r->total_items); ?> observations</div>
                            </td>
                            <td>
                                <span class="badge" style="background:#f0f0f1; padding:3px 7px; border-radius:4px; font-size:11px;">
                                    <?php echo intval($r->total_projects); ?> Proj • <?php echo intval($r->total_reports); ?> Reports
                                </span>
                            </td>
                            <td><code style="font-size:11px;"><?php echo esc_html($r->paypal_order_id); ?></code></td>
                            <td><strong style="color:#0070ba;">$<?php echo number_format($r->amount, 2); ?></strong></td>
                            <td><span style="color:#00a32a; font-weight:600;"><?php echo esc_html($r->status); ?></span></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>

        <!-- Settings Box -->
        <div style="background:#fff; border:1px solid #ccd0d4; border-radius:10px; padding:20px; margin-top:30px; max-width:650px;">
            <h3 style="margin-top:0;">SitePunch REST API Security Settings</h3>
            <p class="description">
                Your PWA uses this secret key in the <code>X-SitePunch-Key</code> HTTP header to securely send data to <code><?php echo esc_html(home_url('/wp-json/sitepunch/v1/log-license')); ?></code>.
            </p>
            <form method="post">
                <?php wp_nonce_field('sitepunch_settings_nonce'); ?>
                <table class="form-table" style="margin-bottom:10px;">
                    <tr>
                        <th scope="row"><label for="sitepunch_api_key">API Secret Key</label></th>
                        <td>
                            <input name="sitepunch_api_key" type="text" id="sitepunch_api_key" value="<?php echo esc_attr($api_key); ?>" class="regular-text" style="font-family:monospace;" />
                        </td>
                    </tr>
                </table>
                <input type="submit" name="sitepunch_save_settings" class="button button-primary" value="Save API Key" />
            </form>
        </div>
    </div>
    <?php
}
