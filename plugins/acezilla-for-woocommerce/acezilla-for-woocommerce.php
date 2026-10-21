<?php
/**
 * Plugin Name:       acezilla for WooCommerce
 * Plugin URI:        https://acezilla.vercel.app
 * Description:       Sends each WooCommerce order's value, date and marketing source to acezilla so it can measure real return on ad spend. Read-only: acezilla never changes your store, and customer names, emails and addresses never leave it.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Requires Plugins:  woocommerce
 * WC requires at least: 7.0
 * Author:            acezilla
 * License:           GPL-2.0-or-later
 * Text Domain:       acezilla-for-woocommerce
 */

defined( 'ABSPATH' ) || exit;

define( 'ACEZILLA_WC_VERSION', '1.0.0' ); // keep in step with apps/web/app/(app)/connections/woocommerce/page.tsx
if ( ! defined( 'ACEZILLA_URL' ) ) {
	// Override in wp-config.php (define( 'ACEZILLA_URL', 'http://localhost:3000' );) when testing against a local acezilla.
	define( 'ACEZILLA_URL', 'https://acezilla.vercel.app' );
}

const ACEZILLA_WC_OPT_CONN  = 'acezilla_wc_connection';
const ACEZILLA_WC_OPT_STATE = 'acezilla_wc_state';
const ACEZILLA_WC_GROUP     = 'acezilla';
const ACEZILLA_WC_BACKFILL_DAYS = 90;
const ACEZILLA_WC_BATCH     = 50;

/* ---------------------------------------------------------------- compatibility */

add_action( 'before_woocommerce_init', function () {
	if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
	}
} );

add_action( 'plugins_loaded', function () {
	if ( ! class_exists( 'WooCommerce' ) ) {
		add_action( 'admin_notices', function () {
			echo '<div class="notice notice-error"><p>' . esc_html__( 'acezilla for WooCommerce needs WooCommerce to be installed and active.', 'acezilla-for-woocommerce' ) . '</p></div>';
		} );
		return;
	}
	add_action( 'admin_menu', 'acezilla_wc_menu' );
	add_action( 'admin_post_acezilla_wc_connect', 'acezilla_wc_handle_connect' );
	add_action( 'admin_post_acezilla_wc_test', 'acezilla_wc_handle_test' );
	add_action( 'admin_post_acezilla_wc_backfill', 'acezilla_wc_handle_backfill' );
	add_action( 'admin_post_acezilla_wc_disconnect', 'acezilla_wc_handle_disconnect' );
	add_action( 'woocommerce_order_status_changed', 'acezilla_wc_queue_order', 20, 1 );
	add_action( 'woocommerce_order_refunded', 'acezilla_wc_queue_order', 20, 1 );
	add_action( 'acezilla_wc_push_order', 'acezilla_wc_push_order', 10, 2 );
	add_action( 'acezilla_wc_backfill_batch', 'acezilla_wc_backfill_batch', 10, 1 );
}, 20 );

/* ---------------------------------------------------------------- state */

function acezilla_wc_conn() {
	$c = get_option( ACEZILLA_WC_OPT_CONN );
	return ( is_array( $c ) && ! empty( $c['connection_id'] ) && ! empty( $c['secret'] ) ) ? $c : null;
}

function acezilla_wc_state( $patch = null ) {
	$s = get_option( ACEZILLA_WC_OPT_STATE, array() );
	$s = is_array( $s ) ? $s : array();
	if ( is_array( $patch ) ) {
		$s = array_merge( $s, $patch );
		update_option( ACEZILLA_WC_OPT_STATE, $s, false );
	}
	return $s;
}

function acezilla_wc_notice( $type, $msg ) {
	set_transient( 'acezilla_wc_notice_' . get_current_user_id(), array( 'type' => $type, 'msg' => $msg ), 120 );
}

/* ---------------------------------------------------------------- talking to acezilla */

/** Plain JSON POST. Returns array( status, decoded body or null, error string ). */
function acezilla_wc_http( $url, $body, $headers = array() ) {
	$res = wp_remote_post( $url, array(
		'timeout' => 20,
		'headers' => array_merge( array( 'Content-Type' => 'application/json', 'Accept' => 'application/json' ), $headers ),
		'body'    => $body,
	) );
	if ( is_wp_error( $res ) ) {
		return array( 0, null, $res->get_error_message() );
	}
	$status  = (int) wp_remote_retrieve_response_code( $res );
	$decoded = json_decode( wp_remote_retrieve_body( $res ), true );
	return array( $status, is_array( $decoded ) ? $decoded : null, '' );
}

/** Sends one signed message. Returns array( ok, status, body, error ). */
function acezilla_wc_send( $type, $data = array() ) {
	$conn = acezilla_wc_conn();
	if ( ! $conn ) {
		return array( 'ok' => false, 'status' => 0, 'body' => null, 'error' => 'Not connected to acezilla.' );
	}
	$body = wp_json_encode( array_merge( array( 'type' => $type ), $data ) );
	$ts   = (string) time();
	$sig  = 'sha256=' . hash_hmac( 'sha256', $ts . '.' . $body, $conn['secret'] );
	list( $status, $json, $err ) = acezilla_wc_http( rtrim( ACEZILLA_URL, '/' ) . '/api/connect/woocommerce/events', $body, array(
		'X-Acezilla-Connection' => $conn['connection_id'],
		'X-Acezilla-Timestamp'  => $ts,
		'X-Acezilla-Signature'  => $sig,
	) );
	$ok = ( 200 === $status && is_array( $json ) && ! empty( $json['ok'] ) );
	if ( $ok ) {
		acezilla_wc_state( array( 'last_ok' => time(), 'last_error' => '' ) );
		return array( 'ok' => true, 'status' => $status, 'body' => $json, 'error' => '' );
	}
	if ( 401 === $status ) {
		$err = 'acezilla no longer accepts this store (it may have been disconnected). Create a new code in acezilla and connect again.';
	} elseif ( '' === $err ) {
		$err = ( is_array( $json ) && ! empty( $json['error'] ) ) ? (string) $json['error'] : 'acezilla answered with HTTP ' . $status . '.';
	}
	acezilla_wc_state( array( 'last_error' => $err ) );
	return array( 'ok' => false, 'status' => $status, 'body' => $json, 'error' => $err );
}

/* ---------------------------------------------------------------- orders */

/** The order as acezilla needs it. No names, emails or addresses: the customer is a hash made here. */
function acezilla_wc_order_payload( $order ) {
	$created = $order->get_date_created();
	$utm     = array();
	foreach ( array( 'source', 'medium', 'campaign', 'content', 'term' ) as $k ) {
		$v = $order->get_meta( '_wc_order_attribution_utm_' . $k );
		if ( is_string( $v ) && '' !== trim( $v ) ) {
			$utm[ $k ] = substr( sanitize_text_field( $v ), 0, 200 );
		}
	}
	$click_ids = array();
	$entry     = $order->get_meta( '_wc_order_attribution_session_entry' );
	if ( is_string( $entry ) && '' !== $entry ) {
		$query = wp_parse_url( $entry, PHP_URL_QUERY );
		if ( is_string( $query ) ) {
			wp_parse_str( $query, $params );
			foreach ( array( 'gclid', 'wbraid', 'gbraid', 'fbclid', 'ttclid', 'msclkid' ) as $k ) {
				if ( ! empty( $params[ $k ] ) && is_string( $params[ $k ] ) ) {
					$click_ids[ $k ] = substr( sanitize_text_field( $params[ $k ] ), 0, 200 );
				}
			}
		}
	}
	$email = strtolower( trim( (string) $order->get_billing_email() ) );
	return array(
		'id'           => (int) $order->get_id(),
		'status'       => (string) $order->get_status(),
		'created_gmt'  => gmdate( 'c', $created ? $created->getTimestamp() : time() ),
		'total'        => round( (float) $order->get_total(), 2 ),
		'tax'          => round( (float) $order->get_total_tax(), 2 ),
		'shipping'     => round( (float) $order->get_shipping_total(), 2 ),
		'shipping_tax' => round( (float) $order->get_shipping_tax(), 2 ),
		'refunded'     => round( (float) $order->get_total_refunded(), 2 ),
		'currency'     => (string) $order->get_currency(),
		'customer_id'  => (int) $order->get_customer_id(),
		'email_hash'   => '' !== $email ? hash( 'sha256', $email ) : '',
		'utm'          => (object) $utm,
		'click_ids'    => (object) $click_ids,
	);
}

/** Order changed (new, paid, cancelled, refunded): push it in the background so checkout is never slowed down. */
function acezilla_wc_queue_order( $order_id ) {
	if ( ! acezilla_wc_conn() ) {
		return;
	}
	$args = array( (int) $order_id, 0 );
	if ( function_exists( 'as_enqueue_async_action' ) ) {
		if ( function_exists( 'as_has_scheduled_action' ) && as_has_scheduled_action( 'acezilla_wc_push_order', $args, ACEZILLA_WC_GROUP ) ) {
			return;
		}
		as_enqueue_async_action( 'acezilla_wc_push_order', $args, ACEZILLA_WC_GROUP );
	} else {
		wp_schedule_single_event( time() + 5, 'acezilla_wc_push_order', $args );
	}
}

function acezilla_wc_push_order( $order_id, $attempt = 0 ) {
	$order = wc_get_order( $order_id );
	if ( ! $order instanceof WC_Order ) {
		return;
	}
	$r = acezilla_wc_send( 'order', array( 'order' => acezilla_wc_order_payload( $order ) ) );
	if ( $r['ok'] || in_array( $r['status'], array( 400, 401, 403, 404 ), true ) || $attempt >= 5 ) {
		return;
	}
	// Temporary trouble (network, server error): try again after 1, 3, 9, 27 and 81 minutes.
	$when = time() + (int) ( 60 * pow( 3, $attempt ) );
	if ( function_exists( 'as_schedule_single_action' ) ) {
		as_schedule_single_action( $when, 'acezilla_wc_push_order', array( (int) $order_id, $attempt + 1 ), ACEZILLA_WC_GROUP );
	} else {
		wp_schedule_single_event( $when, 'acezilla_wc_push_order', array( (int) $order_id, $attempt + 1 ) );
	}
}

/** History import: 50 orders per background job, newest first, last 90 days. */
function acezilla_wc_backfill_batch( $page = 1 ) {
	$page = max( 1, (int) $page );
	$ids  = wc_get_orders( array(
		'limit'        => ACEZILLA_WC_BATCH,
		'paged'        => $page,
		'type'         => 'shop_order',
		'status'       => array_keys( wc_get_order_statuses() ),
		'orderby'      => 'date',
		'order'        => 'DESC',
		'date_created' => '>' . ( time() - ACEZILLA_WC_BACKFILL_DAYS * DAY_IN_SECONDS ),
		'return'       => 'ids',
	) );
	$state = acezilla_wc_state();
	if ( 1 === $page ) {
		$state['backfill_sent'] = 0;
	}
	if ( empty( $ids ) ) {
		acezilla_wc_state( array( 'backfill_done' => time() ) );
		return;
	}
	$orders = array();
	foreach ( $ids as $id ) {
		$o = wc_get_order( $id );
		if ( $o instanceof WC_Order ) {
			$orders[] = acezilla_wc_order_payload( $o );
		}
	}
	$r = acezilla_wc_send( 'orders', array( 'orders' => $orders ) );
	if ( ! $r['ok'] ) {
		return; // last_error is set; the owner can press the button again
	}
	acezilla_wc_state( array( 'backfill_sent' => (int) ( $state['backfill_sent'] ?? 0 ) + count( $orders ), 'backfill_done' => 0 ) );
	if ( count( $ids ) >= ACEZILLA_WC_BATCH && function_exists( 'as_enqueue_async_action' ) ) {
		as_enqueue_async_action( 'acezilla_wc_backfill_batch', array( $page + 1 ), ACEZILLA_WC_GROUP );
	} else {
		acezilla_wc_state( array( 'backfill_done' => time() ) );
	}
}

/* ---------------------------------------------------------------- admin page */

function acezilla_wc_menu() {
	add_submenu_page( 'woocommerce', 'acezilla', 'acezilla', 'manage_woocommerce', 'acezilla-wc', 'acezilla_wc_page' );
}

function acezilla_wc_action_url( $action ) {
	return wp_nonce_url( admin_url( 'admin-post.php?action=' . $action ), 'acezilla_wc' );
}

function acezilla_wc_page() {
	if ( ! current_user_can( 'manage_woocommerce' ) ) {
		return;
	}
	$conn  = acezilla_wc_conn();
	$state = acezilla_wc_state();
	$notice = get_transient( 'acezilla_wc_notice_' . get_current_user_id() );
	if ( $notice ) {
		delete_transient( 'acezilla_wc_notice_' . get_current_user_id() );
	}
	echo '<div class="wrap"><h1>acezilla for WooCommerce</h1>';
	if ( is_array( $notice ) ) {
		printf( '<div class="notice notice-%s"><p>%s</p></div>', esc_attr( $notice['type'] ), esc_html( $notice['msg'] ) );
	}
	if ( ! is_ssl() ) {
		echo '<div class="notice notice-warning"><p>' . esc_html__( 'Your site is not using https. acezilla only accepts stores on https.', 'acezilla-for-woocommerce' ) . '</p></div>';
	}

	if ( ! $conn ) {
		echo '<p>' . esc_html__( 'Open the WooCommerce page in acezilla, create a connection code, and paste it here.', 'acezilla-for-woocommerce' ) . '</p>';
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="acezilla_wc_connect" />';
		wp_nonce_field( 'acezilla_wc' );
		echo '<p><input type="text" name="acezilla_code" class="regular-text code" placeholder="AZ-XXXX-XXXX-XXXX" autocomplete="off" required /> ';
		submit_button( __( 'Connect', 'acezilla-for-woocommerce' ), 'primary', 'submit', false );
		echo '</p></form>';
	} else {
		$last_ok = ! empty( $state['last_ok'] ) ? sprintf( '%s ago', human_time_diff( (int) $state['last_ok'] ) ) : '—';
		echo '<table class="widefat striped" style="max-width:640px"><tbody>';
		printf( '<tr><th>%s</th><td>%s</td></tr>', esc_html__( 'Status', 'acezilla-for-woocommerce' ), empty( $state['last_error'] ) ? '<span style="color:#1a7f37">&#9679; ' . esc_html__( 'Connected', 'acezilla-for-woocommerce' ) . '</span>' : '<span style="color:#b32d2e">&#9679; ' . esc_html__( 'Problem', 'acezilla-for-woocommerce' ) . '</span>' );
		printf( '<tr><th>%s</th><td>%s</td></tr>', esc_html__( 'Last message accepted', 'acezilla-for-woocommerce' ), esc_html( $last_ok ) );
		if ( ! empty( $state['last_error'] ) ) {
			printf( '<tr><th>%s</th><td>%s</td></tr>', esc_html__( 'Last problem', 'acezilla-for-woocommerce' ), esc_html( $state['last_error'] ) );
		}
		if ( isset( $state['backfill_sent'] ) ) {
			$prog = ! empty( $state['backfill_done'] ) ? __( 'finished', 'acezilla-for-woocommerce' ) : __( 'in progress', 'acezilla-for-woocommerce' );
			printf( '<tr><th>%s</th><td>%s</td></tr>', esc_html__( 'History import', 'acezilla-for-woocommerce' ), esc_html( sprintf( '%d orders sent, %s', (int) $state['backfill_sent'], $prog ) ) );
		}
		echo '</tbody></table><p>';
		printf( '<a class="button button-primary" href="%s">%s</a> ', esc_url( acezilla_wc_action_url( 'acezilla_wc_test' ) ), esc_html__( 'Send test', 'acezilla-for-woocommerce' ) );
		printf( '<a class="button" href="%s">%s</a> ', esc_url( acezilla_wc_action_url( 'acezilla_wc_backfill' ) ), esc_html__( 'Send last 90 days of orders', 'acezilla-for-woocommerce' ) );
		printf( '<a class="button" href="%s" onclick="return confirm(\'%s\');">%s</a>', esc_url( acezilla_wc_action_url( 'acezilla_wc_disconnect' ) ), esc_js( __( 'Disconnect this store from acezilla? Orders already imported are deleted in acezilla.', 'acezilla-for-woocommerce' ) ), esc_html__( 'Disconnect', 'acezilla-for-woocommerce' ) );
		echo '</p>';
	}
	echo '<p class="description">' . esc_html__( 'Sent to acezilla for each order: date, status, amounts, currency, the marketing source recorded by WooCommerce, and an anonymous customer fingerprint. Never names, emails or addresses.', 'acezilla-for-woocommerce' ) . '</p></div>';
}

function acezilla_wc_guard() {
	if ( ! current_user_can( 'manage_woocommerce' ) ) {
		wp_die( esc_html__( 'You do not have permission to do this.', 'acezilla-for-woocommerce' ), 403 );
	}
	check_admin_referer( 'acezilla_wc' );
}

function acezilla_wc_back() {
	wp_safe_redirect( admin_url( 'admin.php?page=acezilla-wc' ) );
	exit;
}

function acezilla_wc_handle_connect() {
	acezilla_wc_guard();
	$code = isset( $_POST['acezilla_code'] ) ? sanitize_text_field( wp_unslash( $_POST['acezilla_code'] ) ) : '';
	list( $status, $json, $err ) = acezilla_wc_http( rtrim( ACEZILLA_URL, '/' ) . '/api/connect/woocommerce/pair', wp_json_encode( array(
		'code'           => $code,
		'site_url'       => home_url(),
		'site_name'      => get_bloginfo( 'name' ),
		'plugin_version' => ACEZILLA_WC_VERSION,
	) ) );
	if ( 200 === $status && is_array( $json ) && ! empty( $json['connection_id'] ) && ! empty( $json['secret'] ) ) {
		update_option( ACEZILLA_WC_OPT_CONN, array( 'connection_id' => (string) $json['connection_id'], 'secret' => (string) $json['secret'], 'connected_at' => time() ), false );
		update_option( ACEZILLA_WC_OPT_STATE, array(), false );
		$r = acezilla_wc_send( 'ping', array( 'info' => acezilla_wc_info() ) );
		if ( function_exists( 'as_enqueue_async_action' ) ) {
			as_enqueue_async_action( 'acezilla_wc_backfill_batch', array( 1 ), ACEZILLA_WC_GROUP );
		}
		acezilla_wc_notice( 'success', $r['ok'] ? __( 'Connected to acezilla. Your last 90 days of orders are being imported in the background.', 'acezilla-for-woocommerce' ) : __( 'Paired, but acezilla did not answer the first test: ', 'acezilla-for-woocommerce' ) . $r['error'] );
	} else {
		$msg = ( is_array( $json ) && ! empty( $json['error'] ) ) ? (string) $json['error'] : ( '' !== $err ? $err : 'acezilla answered with HTTP ' . $status . '.' );
		acezilla_wc_notice( 'error', $msg );
	}
	acezilla_wc_back();
}

function acezilla_wc_info() {
	global $wp_version;
	return array(
		'currency'       => get_woocommerce_currency(),
		'site_name'      => get_bloginfo( 'name' ),
		'plugin_version' => ACEZILLA_WC_VERSION,
		'wc_version'     => defined( 'WC_VERSION' ) ? WC_VERSION : '',
		'wp_version'     => $wp_version,
		'attribution'    => 'yes' === get_option( 'woocommerce_feature_order_attribution_enabled', 'yes' ),
	);
}

function acezilla_wc_handle_test() {
	acezilla_wc_guard();
	$r = acezilla_wc_send( 'ping', array( 'info' => acezilla_wc_info() ) );
	if ( $r['ok'] ) {
		$msg = ! empty( $r['body']['message'] ) ? (string) $r['body']['message'] : 'acezilla received the test.';
		if ( ! empty( $r['body']['warnings'] ) && is_array( $r['body']['warnings'] ) ) {
			$msg .= ' ' . implode( ' ', array_map( 'strval', $r['body']['warnings'] ) );
		}
		acezilla_wc_notice( empty( $r['body']['warnings'] ) ? 'success' : 'warning', $msg );
	} else {
		acezilla_wc_notice( 'error', __( 'The test failed: ', 'acezilla-for-woocommerce' ) . $r['error'] );
	}
	acezilla_wc_back();
}

function acezilla_wc_handle_backfill() {
	acezilla_wc_guard();
	if ( function_exists( 'as_enqueue_async_action' ) ) {
		acezilla_wc_state( array( 'backfill_sent' => 0, 'backfill_done' => 0 ) );
		as_enqueue_async_action( 'acezilla_wc_backfill_batch', array( 1 ), ACEZILLA_WC_GROUP );
		acezilla_wc_notice( 'success', __( 'Import started. It runs in the background and can take a few minutes on large stores.', 'acezilla-for-woocommerce' ) );
	} else {
		acezilla_wc_notice( 'error', __( 'WooCommerce background jobs are unavailable.', 'acezilla-for-woocommerce' ) );
	}
	acezilla_wc_back();
}

function acezilla_wc_handle_disconnect() {
	acezilla_wc_guard();
	acezilla_wc_send( 'disconnect' ); // best effort; the local disconnect below always happens
	delete_option( ACEZILLA_WC_OPT_CONN );
	delete_option( ACEZILLA_WC_OPT_STATE );
	if ( function_exists( 'as_unschedule_all_actions' ) ) {
		as_unschedule_all_actions( '', array(), ACEZILLA_WC_GROUP );
	}
	acezilla_wc_notice( 'success', __( 'Disconnected from acezilla.', 'acezilla-for-woocommerce' ) );
	acezilla_wc_back();
}
