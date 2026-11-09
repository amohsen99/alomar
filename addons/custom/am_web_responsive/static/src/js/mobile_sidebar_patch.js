/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { NavBar } from "@web/webclient/navbar/navbar";

patch(NavBar.prototype, {
    _openAppMenuSidebar() {
        this.state.isAppMenuSidebarOpened = !this.state.isAppMenuSidebarOpened;
        this.render();
    },

    _closeAppMenuSidebar() {
        this.state.isAppMenuSidebarOpened = false;
        this.state.isAllAppsMenuOpened = false;
        this.render();
    },

    onAllAppsBtnClick() {
        this._closeAppMenuSidebar();
        // Trigger web_responsive apps grid to open
        this.env.bus.trigger("APP_MENU:OPEN_APP_MENU");
        this.env.bus.trigger("APPS_MENU:STATE_CHANGED", true);
    },

    async _onMenuClicked(menu) {
        await this.menuService.selectMenu(menu);
        this._closeAppMenuSidebar();
    },
});
