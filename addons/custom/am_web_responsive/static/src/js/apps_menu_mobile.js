/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { AppsMenu } from "@web_responsive/components/apps_menu/apps_menu.esm";

patch(AppsMenu.prototype, {
    setup() {
        super.setup();

        // On mobile initial load without an active app, default to opening the App Grid (Enterprise style)
        if (this.env.isSmall && !this.menuService.getCurrentApp()) {
            this.setOpenState(true);
        }
    },
});
