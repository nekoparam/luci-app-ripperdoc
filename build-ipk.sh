#!/bin/sh
#
# Build luci-app-ripperdoc .ipk package without OpenWrt SDK
# Follows the same format as OpenWrt's official ipkg-build
# Usage: ./build-ipk.sh
#

set -e

PKG_NAME="luci-app-ripperdoc"
PKG_VERSION="1.0.0"
PKG_RELEASE="1"
PKG_ARCH="all"
IPK_FILE="${PKG_NAME}_${PKG_VERSION}-${PKG_RELEASE}_${PKG_ARCH}.ipk"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$(mktemp -d)"

trap "rm -rf '$BUILD_DIR'" EXIT

echo "Building ${IPK_FILE}..."

# --- Stage data files ---
DATA_DIR="${BUILD_DIR}/data"
mkdir -p "${DATA_DIR}"

cp -a "${SCRIPT_DIR}/root/"* "${DATA_DIR}/"

mkdir -p "${DATA_DIR}/www/luci-static/resources/view/ripperdoc"
cp "${SCRIPT_DIR}/htdocs/luci-static/resources/view/ripperdoc/"*.js \
   "${DATA_DIR}/www/luci-static/resources/view/ripperdoc/"

chmod 755 "${DATA_DIR}/etc/init.d/ripperdoc"
chmod 755 "${DATA_DIR}/etc/uci-defaults/luci-ripperdoc"
chmod 644 "${DATA_DIR}/etc/config/ripperdoc"

# --- data.tar.gz (use --format=gnu and '.' like OpenWrt ipkg-build) ---
cd "${DATA_DIR}"
tar --format=gnu --sort=name --owner=0 --group=0 -czf "${BUILD_DIR}/data.tar.gz" .

# --- control files ---
CTRL_DIR="${BUILD_DIR}/control"
mkdir -p "${CTRL_DIR}"

INSTALLED_SIZE=$(du -sb "${DATA_DIR}" | cut -f1)

cat > "${CTRL_DIR}/control" <<EOF
Package: ${PKG_NAME}
Version: ${PKG_VERSION}-${PKG_RELEASE}
Depends: libc, luci-base, python3, python3-pip
License: Apache-2.0
Section: luci
Architecture: ${PKG_ARCH}
Installed-Size: ${INSTALLED_SIZE}
Description: LuCI support for Ripperdoc AI Coding Agent
Maintainer: OpenWrt LuCI community
EOF

cat > "${CTRL_DIR}/conffiles" <<EOF
/etc/config/ripperdoc
EOF

cat > "${CTRL_DIR}/postinst" <<'SCRIPT'
#!/bin/sh
[ "${IPKG_NO_SCRIPT}" = "1" ] && exit 0
[ -s ${IPKG_INSTROOT}/lib/functions.sh ] || exit 0
. ${IPKG_INSTROOT}/lib/functions.sh
default_postinst $0 $@
SCRIPT

cat > "${CTRL_DIR}/prerm" <<'SCRIPT'
#!/bin/sh
[ -s ${IPKG_INSTROOT}/lib/functions.sh ] || exit 0
. ${IPKG_INSTROOT}/lib/functions.sh
default_prerm $0 $@
SCRIPT

chmod 755 "${CTRL_DIR}/postinst" "${CTRL_DIR}/prerm"

# --- control.tar.gz ---
cd "${CTRL_DIR}"
tar --format=gnu --sort=name --owner=0 --group=0 -czf "${BUILD_DIR}/control.tar.gz" .

# --- debian-binary ---
echo "2.0" > "${BUILD_DIR}/debian-binary"

# --- assemble .ipk (ar -crf like OpenWrt ipkg-build) ---
cd "${BUILD_DIR}"
ar -crf "${SCRIPT_DIR}/${IPK_FILE}" \
   "${BUILD_DIR}/debian-binary" \
   "${BUILD_DIR}/control.tar.gz" \
   "${BUILD_DIR}/data.tar.gz"

echo "Done: ${SCRIPT_DIR}/${IPK_FILE} ($(du -h "${SCRIPT_DIR}/${IPK_FILE}" | cut -f1))"
echo ""
echo "Install on OpenWrt:"
echo "  scp ${IPK_FILE} root@<router>:/tmp/"
echo "  ssh root@<router> 'opkg install /tmp/${IPK_FILE}'"
