=== acezilla for WooCommerce ===
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.3.0
License: GPLv2 or later

Sends each WooCommerce order's value, date and marketing source to acezilla so it can measure real return on ad spend.

== Description ==
Install the plugin, create a connection code in acezilla, paste it under the acezilla item in the WordPress menu, and click Send test.

* Read-only: acezilla never changes your store.
* Private: customer names, emails and addresses never leave your store. The customer is an anonymous hash made on your server.
* Safe: every message is signed with a secret that only your store and acezilla share. acezilla gets no key or login to your store.
* Light: orders are sent in the background after checkout, with automatic retries.

== Changelog ==
= 1.3.0 =
* Sends each product's main image address, so acezilla can show your product photos next to your products and in the campaign builder. Only the address is sent, never the file.

= 1.2.0 =
* Sends how many units are in stock (when you manage stock), so acezilla can warn when a product you advertise is running out.

= 1.1.0 =
* Sends your product list (name, price, stock) and what each order contained, so acezilla can show every product, including ones that have not sold yet.

= 1.0.2 =
The history import now sends its first batch immediately and reports the result, including when there are no recent orders.

= 1.0.1 =
Adds an acezilla item to the main WordPress menu, a Settings link on the Plugins page, and a setup banner.

= 1.0.0 =
First release.
