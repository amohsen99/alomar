/** @odoo-module **/
const now = new Date();
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useRef, useState, onWillStart } from "@odoo/owl";
import { BlockUI } from "@web/core/ui/block_ui";
import { download } from "@web/core/network/download";
const actionRegistry = registry.category("actions");

class BalanceSheet extends Component {
    setup() {
        super.setup(...arguments);
        this.initial_render = true;
        this.orm = useService('orm');
        this.action = useService('action');
        this.tbody = useRef('tbody');
        this.posted = useRef('posted');
        this.period = useRef('periods');
        this.period_year = useRef('period_year');
        this.draft = useRef('draft');
        this.state = useState({
            data: null,
            datas: [],
            filter_data: {
                journal: [],
                journals: [],
                account: [],
                accounts: [],
                analytic: [],
                analytics: [],
            },
            year: [now.getFullYear()],
            comparison: false,
            comparison_type: null,
            title: this.props.action?.display_name || 'Balance Sheet',
            is_unfolded_all: false,
            expanded_groups: {},
        });

        onWillStart(async () => {
            try {
                this.wizard_id = await this.orm.call("dynamic.balance.sheet.report", "create", [{}]);
                await this.load_data(true);
            } catch (err) {
                console.error("Error initializing BalanceSheet:", err);
            }
        });
    }

    async load_data(initial = true) {
        /**
         * Loads the data for the balance sheet report.
         */
        var action_title = this.props.action?.display_name || 'Balance Sheet';
        try {
            let data = await this.orm.call("dynamic.balance.sheet.report", "view_report", [
                this.wizard_id,
                this.state.comparison,
                this.state.comparison_type
            ]);
            this.state.data = data[0];
            const filterData = data[1] || {};
            // Provide aliases for journals, accounts, analytics
            filterData.journals = filterData.journals || filterData.journal || [];
            filterData.journal = filterData.journals;
            filterData.accounts = filterData.accounts || filterData.account || [];
            filterData.account = filterData.accounts;
            filterData.analytics = filterData.analytics || filterData.analytic || [];
            filterData.analytic = filterData.analytics;

            this.state.filter_data = filterData;
            this.state.filters = filterData;
            this.state.datas = data[2] || [];
            this.state.title = action_title;
        } catch (el) {
            console.error("Error loading balance sheet data:", el);
        }
    }

    async show_gl(ev) {
        /**
         * Shows the General Ledger view by triggering an action.
         */
        return this.action.doAction({
            type: 'ir.actions.client',
            name: 'General Ledger',
            tag: 'gen_l',
        });
    }

    async print_pdf(ev) {
        ev.preventDefault();
        let data = await this.orm.call("dynamic.balance.sheet.report", "view_report", [
            this.wizard_id,
            this.state.comparison,
            this.state.comparison_type
        ]);
        this.state.data = data[0];
        const filterData = data[1] || {};
        this.state.filter_data = filterData;
        this.state.filters = filterData;
        this.state.datas = data[2];
        return this.action.doAction({
            'type': 'ir.actions.report',
            'report_type': 'qweb-pdf',
            'report_name': 'dynamic_accounts_report.balance_sheet',
            'report_file': 'dynamic_accounts_report.balance_sheet',
            'data': {
                'data': this.state,
                'report_name': this.props.action?.display_name || 'Balance Sheet'
            },
            'display_name': this.props.action?.display_name || 'Balance Sheet',
        });
    }

    async print_xlsx(ev) {
        let data = await this.orm.call("dynamic.balance.sheet.report", "view_report", [
            this.wizard_id,
            this.state.comparison,
            this.state.comparison_type
        ]);
        this.state.data = data[0];
        this.state.datas = data[2];
        var action = {
            'data': {
                'model': 'dynamic.balance.sheet.report',
                'data': JSON.stringify(this.state),
                'output_format': 'xlsx',
                'report_name': this.props.action?.display_name || 'Balance Sheet',
                'report_action': this.props.action?.xml_id,
            },
        };
        await download({
            url: '/xlsx_report',
            data: action.data,
            error: (error) => console.error('Error downloading xlsx:', error),
        });
    }

    async apply_journal(ev) {
        const btn = ev.currentTarget || ev.target;
        btn.classList.toggle('selected-filter');
        const idSpan = btn.querySelector('span');
        if (!idSpan) return;
        this.filter = {
            'journal_ids': idSpan.textContent.trim(),
        };
        let res = await this.orm.call("dynamic.balance.sheet.report", "filter", [this.wizard_id, this.filter]);
        const dropdown = btn.closest('.dropdown');
        const label = dropdown ? dropdown.querySelector('.code') : null;
        if (label && res && res[0]) {
            label.textContent = Array.isArray(res[0].journal_ids) ? (res[0].journal_ids.join(', ') || 'Journals') : (res[0].journal_ids || 'Journals');
        }
        await this.load_data(false);
    }

    async apply_account(ev) {
        const btn = ev.currentTarget || ev.target;
        btn.classList.toggle('selected-filter');
        const idSpan = btn.querySelector('span');
        if (!idSpan) return;
        this.filter = {
            'account_ids': idSpan.textContent.trim(),
        };
        let res = await this.orm.call("dynamic.balance.sheet.report", "filter", [this.wizard_id, this.filter]);
        const dropdown = btn.closest('.dropdown');
        const label = dropdown ? dropdown.querySelector('.account') : null;
        if (label && res && res[0]) {
            label.textContent = Array.isArray(res[0].account_ids) ? (res[0].account_ids.join(', ') || 'Accounts') : (res[0].account_ids || 'Accounts');
        }
        await this.load_data(false);
    }

    async apply_analytic_accounts(ev) {
        const btn = ev.currentTarget || ev.target;
        btn.classList.toggle('selected-filter');
        const idSpan = btn.querySelector('span');
        if (!idSpan) return;
        this.filter = {
            'analytic_ids': idSpan.textContent.trim(),
        };
        let res = await this.orm.call("dynamic.balance.sheet.report", "filter", [this.wizard_id, this.filter]);
        const dropdown = btn.closest('.dropdown');
        const label = dropdown ? dropdown.querySelector('.analytic') : null;
        if (label && res && res[0]) {
            label.textContent = Array.isArray(res[0].analytic_ids) ? (res[0].analytic_ids.join(', ') || 'Analytic') : (res[0].analytic_ids || 'Analytic');
        }
        await this.load_data(false);
    }

    async apply_entries(ev) {
        const btn = ev.currentTarget || ev.target;
        const val = btn.getAttribute('value') || btn.value;
        if (this.posted?.el && this.draft?.el) {
            if (val === 'draft') {
                this.posted.el.classList.remove('selected-filter');
                this.draft.el.classList.add('selected-filter');
            } else {
                this.draft.el.classList.remove('selected-filter');
                this.posted.el.classList.add('selected-filter');
            }
        }
        this.filter = {
            'target': val,
        };
        let res = await this.orm.call("dynamic.balance.sheet.report", "filter", [this.wizard_id, this.filter]);
        const dropdown = btn.closest('.dropdown');
        const label = dropdown ? dropdown.querySelector('.target') : null;
        if (label && res && res[0]) {
            label.textContent = res[0].target_move === 'draft' ? 'Include Draft Entries' : 'Posted Entries Only';
        }
        await this.load_data(false);
    }

    toggleGroup(groupKey) {
        const current = this.isGroupExpanded(groupKey);
        this.state.expanded_groups = {
            ...this.state.expanded_groups,
            [groupKey]: !current,
        };
    }

    isGroupExpanded(groupKey) {
        if (this.state.expanded_groups[groupKey] !== undefined) {
            return !!this.state.expanded_groups[groupKey];
        }
        return !!this.state.is_unfolded_all;
    }

    unfoldAll(ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        this.state.is_unfolded_all = !this.state.is_unfolded_all;
        this.state.expanded_groups = {};
    }

    async apply_date(ev) {
        const target = ev.currentTarget || ev.target;
        if (target.name === 'start_date') {
            this.filter = {
                ...this.filter,
                date_from: target.value
            };
        } else if (target.name === 'end_date') {
            this.filter = {
                ...this.filter,
                date_to: target.value
            };
        } else {
            const dataVal = target.getAttribute('data-value') || target.dataset.value;
            if (dataVal) {
                this.filter = dataVal;
            }
        }
        await this.orm.call("dynamic.balance.sheet.report", "filter", [this.wizard_id, this.filter]);
        await this.load_data(false);
    }

    onPeriodChange(ev) {
        if (this.period_year?.el) {
            this.period_year.el.value = ev.target.value;
        }
    }

    onPeriodYearChange(ev) {
        if (this.period?.el) {
            this.period.el.value = ev.target.value;
        }
    }

    async applyComparisonPeriod() {
        if (!this.period?.el?.value) return;
        this.state.comparison = this.period.el.value;
        this.state.comparison_type = "month";
        let monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        let res = await this.orm.call("dynamic.balance.sheet.report", "comparison_filter", [this.wizard_id, this.state.comparison]);
        this.state.year = [monthNamesShort[now.getMonth()] + '  ' + now.getFullYear()];
        for (var i = 0; i < res.length; i++) {
            const dateObject = new Date(res[i]['date_to']);
            this.state.year.push(monthNamesShort[dateObject.getMonth()] + '  ' + dateObject.getFullYear());
        }
        await this.load_data(false);
    }

    async applyComparisonYear() {
        if (!this.period_year?.el?.value) return;
        this.state.comparison = this.period_year.el.value;
        this.state.comparison_type = "year";
        let res = await this.orm.call("dynamic.balance.sheet.report", "comparison_filter_year", [this.wizard_id, this.state.comparison]);
        this.state.year = [now.getFullYear()];
        for (var i = 0; i < res.length; i++) {
            const dateObject = new Date(res[i]['date_to']);
            this.state.year.push(dateObject.getFullYear());
        }
        await this.load_data(false);
    }

    async apply_comparison() {
        this.state.comparison = false;
        this.state.comparison_type = null;
        this.state.year = [now.getFullYear()];
        await this.load_data(false);
    }
}
BalanceSheet.template = 'bls_template_new';
//BalanceSheet.components = {
//    FinancialReportControlPanel
//}
actionRegistry.add("bl_s", BalanceSheet);