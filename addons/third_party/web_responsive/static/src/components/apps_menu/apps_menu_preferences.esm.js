/* Copyright 2023 Taras Shabaranskyi
 * License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl). */

import {Component, xml, useState} from "@odoo/owl";
import {registry} from "@web/core/registry";
import {useService} from "@web/core/utils/hooks";
import {user} from "@web/core/user";
import {cookie} from "@web/core/browser/cookie";
import {browser} from "@web/core/browser/browser";

export class DarkModeToggle extends Component {
    static props = {};
    setup() {
        const isDark = cookie.get("color_scheme") === "dark";
        this.state = useState({isDark});
    }

    toggleScheme() {
        const nextScheme = this.state.isDark ? "light" : "dark";
        cookie.set("color_scheme", nextScheme);
        this.state.isDark = !this.state.isDark;
        browser.location.reload();
    }
}

DarkModeToggle.template = xml`
    <div class="o-dropdown dropdown o-dropdown--no-caret">
        <button
            role="button"
            type="button"
            t-att-title="state.isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            class="dropdown-toggle o-dropdown--narrow"
            t-on-click="toggleScheme">
                <i t-if="state.isDark" class="fa fa-sun-o fa-lg text-warning px-1"/>
                <i t-else="" class="fa fa-moon-o fa-lg px-1"/>
        </button>
    </div>
`;

export class AppsMenuPreferences extends Component {
    static props = {};
    setup() {
        this.action = useService("action");
        this.user = user;
    }

    async _onClick() {
        const onClose = () => this.action.doAction("reload_context");
        const action = await this.action.loadAction(
            "web_responsive.res_users_view_form_apps_menu_preferences_action"
        );
        this.action.doAction({...action, res_id: this.user.userId}, {onClose}).then();
    }
}

AppsMenuPreferences.template = xml`
    <div class="o-dropdown dropdown o-dropdown--no-caret">
        <button
            role="button"
            type="button"
            title="App Menu Preferences"
            class="dropdown-toggle o-dropdown--narrow"
            t-on-click="_onClick">
                <i class="fa fa-paint-brush fa-lg px-1"/>
        </button>
    </div>
`;

registry
    .category("systray")
    .add("DarkModeToggle", {Component: DarkModeToggle}, {sequence: 99});

registry
    .category("systray")
    .add("AppMenuTheme", {Component: AppsMenuPreferences}, {sequence: 100});

