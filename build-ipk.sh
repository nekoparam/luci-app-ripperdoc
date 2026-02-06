#!/bin/sh
#
# Build luci-app-ripperdoc .ipk package without OpenWrt SDK
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

# --- data.tar.gz ---
DATA_DIR="${BUILD_DIR}/data"
mkdir -p "${DATA_DIR}"

# Copy root filesystem overlay
cp -a "${SCRIPT_DIR}/root/"* "${DATA_DIR}/"

# Copy LuCI JS views to www path
mkdir -p "${DATA_DIR}/www/luci-static/resources/view/ripperdoc"
cp "${SCRIPT_DIR}/htdocs/luci-static/resources/view/ripperdoc/"*.js \
   "${DATA_DIR}/www/luci-static/resources/view/ripperdoc/"

# Ensure correct permissions
chmod 755 "${DATA_DIR}/etc/init.d/ripperdoc"
chmod 755 "${DATA_DIR}/etc/uci-defaults/luci-ripperdoc"
chmod 644 "${DATA_DIR}/etc/config/ripperdoc"

cd "${DATA_DIR}"
tar czf "${BUILD_DIR}/data.tar.gz" --owner=0 --group=0 ./*

# --- control.tar.gz ---
CTRL_DIR="${BUILD_DIR}/control"
mkdir -p "${CTRL_DIR}"

cat > "${CTRL_DIR}/control" <<EOF
Package: ${PKG_NAME}
Version: ${PKG_VERSION}-${PKG_RELEASE}
Depends: libc, luci-base, python3, python3-pip
Source: package/${PKG_NAME}
SourceName: ${PKG_NAME}
License: Apache-2.0
Section: luci
URL: https://github.com/quantmew/ripperdoc
Architecture: ${PKG_ARCH}
Installed-Size: $(du -sb "${DATA_DIR}" | cut -f1)
Description: LuCI support for Ripperdoc AI Coding Agent
Maintainer: OpenWrt LuCI community
EOF

cat > "${CTRL_DIR}/conffiles" <<EOF
/etc/config/ripperdoc
EOF

cat > "${CTRL_DIR}/postinst" <<'EOF'
#!/bin/sh
[ "${IPKG_NO_SCRIPT}" = "1" ] && exit 0
[ -s ${IPKG_INSTROOT}/lib/functions.sh ] || exit 0
. ${IPKG_INSTROOT}/lib/functions.sh
default_postinst $0 $@
EOF

cat > "${CTRL_DIR}/prerm" <<'EOF'
#!/bin/sh
[ -s ${IPKG_INSTROOT}/lib/functions.sh ] || exit 0
. ${IPKG_INSTROOT}/lib/functions.sh
default_prerm $0 $@
EOF

chmod 755 "${CTRL_DIR}/postinst" "${CTRL_DIR}/prerm"

cd "${CTRL_DIR}"
tar czf "${BUILD_DIR}/control.tar.gz" --owner=0 --group=0 ./*

# --- debian-binary ---
echo "2.0" > "${BUILD_DIR}/debian-binary"

# --- assemble .ipk ---
cd "${BUILD_DIR}"
ar r "${SCRIPT_DIR}/${IPK_FILE}" debian-binary control.tar.gz data.tar.gz 2>/dev/null

echo "Done: ${SCRIPT_DIR}/${IPK_FILE}"
echo ""
echo "Install on OpenWrt with:"
echo "  scp ${IPK_FILE} root@<router>:/tmp/"
echo "  ssh root@<router> 'opkg install /tmp/${IPK_FILE}'"
