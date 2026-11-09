/* @odoo-module */

import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";

export class LanguageSwitcher extends Component {
    static props = [];
    static template = "am_language_switcher.LanguageSwitcher";

    setup() {
        this.action = useService("action");
        this.orm = useService("orm");
        this.state = useState({
            languages: [],
            lang_code: user.lang ? user.lang.replace('-', '_') : 'en_US',
        });
        this.getLanguages();
    }

    async getLanguages() {
        try {
            this.state.languages = await this.orm.call("res.lang", "get_installed");
        } catch (e) {
            console.error("Error fetching installed languages", e);
        }
    }

    get currentLangShort() {
        if (!this.state.lang_code) return "EN";
        const parts = this.state.lang_code.split('_');
        return parts[0].toUpperCase();
    }

    async onChangeLanguage(lang_code) {
        if (this.state.lang_code === lang_code) return;
        this.state.lang_code = lang_code;

        // Write language preference to res.users
        await this.orm.call("res.users", "write", [[user.userId], { lang: lang_code }]);

        // Execute reload_context action so Odoo reloads session info & direction (RTL/LTR)
        await this.action.doAction({
            type: "ir.actions.client",
            tag: "reload_context",
        });
    }
}

registry.category("systray").add("am_language_switcher.LanguageSwitcher", { Component: LanguageSwitcher }, { sequence: 15 });

