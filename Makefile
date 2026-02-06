include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-ripperdoc
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI support for Ripperdoc AI Coding Agent
LUCI_DESCRIPTION:=Web interface for managing Ripperdoc, an open-source AI coding agent
LUCI_DEPENDS:=+python3 +python3-pip
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildance Makefile
$(eval $(call BuildPackage,$(PKG_NAME)))
