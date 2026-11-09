/** @odoo-module **/

import { registry } from "@web/core/registry";
import { session } from "@web/session";

export const amThemeService = {
    start() {
        const isThemeActive =
            (session.am_enable_theme === true || session.mkt_enable_theme === true) &&
            Boolean(session.apps_menu && (session.apps_menu.theme === "am" || session.apps_menu.theme === "mishkat"));
        if (isThemeActive) {
            document.body.classList.add("o_am_theme_active", "o_mkt_theme_active");
            document.documentElement.setAttribute("data-am-theme", "active");
        } else {
            document.body.classList.remove("o_am_theme_active", "o_mkt_theme_active");
            document.documentElement.removeAttribute("data-am-theme");
        }
    },
};

registry.category("services").add("am_theme_service", amThemeService);
