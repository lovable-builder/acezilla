=== acezilla for WooCommerce ===
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.1
License: GPLv2 or later

Sends each WooCommerce order's value, date and marketing source to acezilla so it can measure real return on ad spend.

== Description ==
Install the plugin, create a connection code in acezilla, paste it under the acezilla item in the WordPress menu, and click Send test.

* Read-only: acezilla never changes your store.
* Private: customer names, emails and addresses never leave your store. The customer is an anonymous hash made on your server.
* Safe: every message is signed with a secret that only your store and acezilla share. acezilla gets no key or login to your store.
* Light: orders are sent in the background after checkout, with automatic retries.

== Changelog ==
= 1.0.1 =
Adds an acezilla item to the main WordPress menu, a Settings link on the Plugins page, and a setup banner.

= 1.0.0 =
First release.
