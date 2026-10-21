#!/bin/sh
# Rebuilds the downloadable WooCommerce plugin. Run after changing anything in plugins/acezilla-for-woocommerce.
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/apps/web/public/downloads"
mkdir -p "$out"
rm -f "$out/acezilla-for-woocommerce.zip"
cd "$root/plugins" && zip -qr -X "$out/acezilla-for-woocommerce.zip" acezilla-for-woocommerce -x "*.DS_Store"
unzip -l "$out/acezilla-for-woocommerce.zip" | tail -n +4
