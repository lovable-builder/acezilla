<?php
// Runs when the plugin is deleted in WordPress: leave nothing behind.
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;
delete_option( 'acezilla_wc_connection' );
delete_option( 'acezilla_wc_state' );
