/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { NavBar } from "@web/webclient/navbar/navbar";
import { AppsMenu } from "@web_responsive/components/apps_menu/apps_menu.esm";
import { onWillStart, useEffect, useRef, useState } from "@odoo/owl";
import { useBus, useService } from "@web/core/utils/hooks";
import { useSortable } from "@web/core/utils/sortable_owl";
import { registry } from "@web/core/registry";

patch(NavBar.prototype, {
    setup() {
        super.setup();
        this.savedAppOrder = [];
        this.state.isMobileSubmenuOpen = false;
        this.state.activeMobileSection = null;

        useBus(this.env.bus, "AM_APPS_MENU:ORDER_CHANGED", (ev) => {
            this.savedAppOrder = ev.detail;
            this.render();
        });

        useBus(this.env.bus, "MKT_APPS_MENU:ORDER_CHANGED", (ev) => {
            this.savedAppOrder = ev.detail;
            this.render();
        });

        useBus(this.env.bus, "APP_MENU:TOGGLE_SIDEBAR", () => {
            this._openAppMenuSidebar();
        });

        onWillStart(async () => {
            this.savedAppOrder = await this.env.services.orm.call(
                "res.users",
                "get_responsive_app_order",
                []
            );
        });
    },

    toggleMobileSubmenu(section = null) {
        if (this.state.isMobileSubmenuOpen && this.state.activeMobileSection === section) {
            this.closeMobileSubmenu();
        } else {
            this.state.activeMobileSection = section;
            this.state.isMobileSubmenuOpen = true;
        }
    },

    openMobileAllSections() {
        this.state.activeMobileSection = null;
        this.state.isMobileSubmenuOpen = true;
    },

    closeMobileSubmenu() {
        this.state.isMobileSubmenuOpen = false;
        this.state.activeMobileSection = null;
    },

    get displayedMobileSections() {
        if (this.state.activeMobileSection) {
            return [this.state.activeMobileSection];
        }
        return this.currentAppSections;
    },

    onMobileSubmenuItemClick(menu) {
        this.onNavBarDropdownItemSelection(menu);
        this.closeMobileSubmenu();
    },

    sortAppsByUserOrder(apps) {
        if (!this.savedAppOrder || !this.savedAppOrder.length) {
            return apps;
        }

        const rank = new Map(this.savedAppOrder.map((menuId, index) => [menuId, index]));
        const ordered = apps
            .filter((app) => rank.has(app.id))
            .sort((a, b) => rank.get(a.id) - rank.get(b.id));
        const untouched = apps.filter((app) => !rank.has(app.id));

        return [...ordered, ...untouched];
    }
});

patch(AppsMenu.prototype, {
    setup() {
        super.setup();
        this.appsMenuList = useRef('appsMenuList');
        this.command = useService("command");

        useBus(this.env.bus, "APP_MENU:OPEN_APP_MENU", () => {
            this.setOpenState(true);
        });

        // Enterprise Type-to-Search: Open Command Palette Wizard when user types on keyboard
        useEffect(() => {
            const onGlobalKeyDown = (ev) => {
                const isHomeOpened = this.state.open || document.body.classList.contains("o_apps_menu_opened");
                if (!isHomeOpened) {
                    return;
                }
                const target = ev.target;
                const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
                if (isInput) {
                    return;
                }
                if (ev.ctrlKey || ev.altKey || ev.metaKey) {
                    return;
                }
                // Check if printable character (letters, numbers, etc.)
                if (ev.key && ev.key.length === 1 && ev.key !== " ") {
                    ev.preventDefault();
                    ev.stopPropagation();
                    this.command.openMainPalette({
                        searchValue: `/${ev.key}`,
                    });
                }
            };

            window.addEventListener("keydown", onGlobalKeyDown);
            return () => window.removeEventListener("keydown", onGlobalKeyDown);
        }, () => [this.state.open]);

        useSortable({
            ref: this.appsMenuList,
            elements: ".o-app-menu-item",
            delay: 300,
            touchDelay: 300,
            cursor: "move",
            placeholderClasses: ["o-app-menu-item-placeholder"],
            onDrop: (params) => this._onAppDrop(params),
        });
    },

    get currentApp() {
        return this.menuService?.getCurrentApp();
    },

    onLeftNavBtnClick() {
        this.env.bus.trigger("APP_MENU:TOGGLE_SIDEBAR");
    },

    onBackClick() {
        this.setOpenState(false);
    },

    async _onAppDrop({ element, previous, next }) {
        const appIds = [...this.appsMenuList.el.querySelectorAll(".o-app-menu-item:not(.o-app-menu-item-placeholder)")]
            .map((el) => Number(el.dataset.appId))
            .filter((appId) => appId);

        const draggedId = Number(element.dataset.appId);
        const from = appIds.indexOf(draggedId);

        if (from === -1) {
            return;
        }

        appIds.splice(from, 1);

        let to = appIds.length;
        if (previous && previous.dataset.appId) {
            const at = appIds.indexOf(Number(previous.dataset.appId));
            to = at === -1 ? appIds.length : at + 1;
        } else if (next && next.dataset.appId) {
            const at = appIds.indexOf(Number(next.dataset.appId));
            to = at === -1 ? 0 : at;
        } else if (!previous) {
            to = 0;
        }

        appIds.splice(to, 0, draggedId);

        await this.env.services.orm.call(
            "res.users",
            "set_responsive_app_order",
            [appIds]
        );

        this.env.bus.trigger("AM_APPS_MENU:ORDER_CHANGED", appIds);
        this.env.bus.trigger("MKT_APPS_MENU:ORDER_CHANGED", appIds);
    }
});

// Guard against Odoo 18 core bug in menu_providers.js where relative fallback icon paths
// like /web/static/img/default_icon_app.png get prefixed with data:image/png;base64, causing ERR_INVALID_URL
const commandProviderRegistry = registry.category("command_provider");
const menuProvider = commandProviderRegistry.get("menu");
if (menuProvider && typeof menuProvider.provide === "function") {
    const originalProvide = menuProvider.provide;
    menuProvider.provide = async function (env, options) {
        const results = await originalProvide.call(this, env, options);
        if (Array.isArray(results)) {
            for (const item of results) {
                if (item?.props && typeof item.props.webIconData === "string") {
                    if (item.props.webIconData.startsWith("data:image/png;base64,/")) {
                        item.props.webIconData = item.props.webIconData.replace("data:image/png;base64,", "");
                    }
                }
            }
        }
        return results;
    };
}