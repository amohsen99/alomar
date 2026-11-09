/** @odoo-module **/
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useRef, useState, onWillStart } from "@odoo/owl";
import { download } from "@web/core/network/download";
const actionRegistry = registry.category("actions");

class GeneralLedger extends Component {
    setup() {
        super.setup(...arguments);
        this.orm = useService('orm');
        this.action = useService('action');
        this.tbody = useRef('tbody');

        this.state = useState({
            account: [],
            account_data: {},
            account_total: {},
            total_debit: 0,
            total_debit_display: '0.00',
            total_credit: 0,
            total_credit_display: '0.00',
            currency: '',
            journals: [],
            selected_journal_list: [],
            analytics: [],
            selected_analytic_list: [],
            title: this.props.action?.display_name || 'General Ledger',
            date_range: null,
            options: null,
            method: { 'accrual': true },
            is_unfolded_all: false,
            expanded_accounts: {},
            search_query: '',
        });

        onWillStart(async () => {
            try {
                this.wizard_id = await this.orm.call("account.general.ledger", "create", [{}]);
                await this.load_data();
            } catch (err) {
                console.error("Error initializing GeneralLedger:", err);
            }
        });
    }

    formatNumber(number) {
        const parsed = parseFloat(number);
        if (isNaN(parsed)) return "0.00";
        return parsed.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    async load_data() {
        const action_title = this.props.action?.display_name || 'General Ledger';
        try {
            const filtered_data = await this.orm.call(
                "account.general.ledger",
                "get_filter_values",
                [
                    this.state.selected_journal_list,
                    this.state.date_range,
                    this.state.options,
                    this.state.selected_analytic_list,
                    this.state.method
                ]
            );

            this.state.journals = filtered_data['journal_ids'] || [];
            this.state.analytics = filtered_data['analytic_ids'] || [];
            const account_totals = filtered_data['account_totals'] || {};

            let totalDebitSum = 0;
            let totalCreditSum = 0;
            let currency = '';
            const account_list = [];

            for (const key of Object.keys(filtered_data)) {
                if (key !== 'account_totals' && key !== 'journal_ids' && key !== 'analytic_ids') {
                    account_list.push(key);
                }
            }

            for (const [accName, tot] of Object.entries(account_totals)) {
                currency = tot.currency_id || currency;
                const deb = tot.total_debit || 0;
                const cred = tot.total_credit || 0;
                totalDebitSum += deb;
                totalCreditSum += cred;
                const bal = deb - cred;
                tot.total_debit_display = this.formatNumber(deb);
                tot.total_credit_display = this.formatNumber(cred);
                tot.balance = bal;
                tot.balance_display = this.formatNumber(bal);
            }

            this.state.account = account_list;
            this.state.account_data = filtered_data;
            this.state.account_total = account_totals;
            this.state.currency = currency || 'LE';
            this.state.total_debit = totalDebitSum.toFixed(2);
            this.state.total_debit_display = this.formatNumber(totalDebitSum);
            this.state.total_credit = totalCreditSum.toFixed(2);
            this.state.total_credit_display = this.formatNumber(totalCreditSum);
            this.state.title = action_title;
        } catch (err) {
            console.error("Error loading general ledger data:", err);
        }
    }

    get displayed_accounts() {
        if (!this.state.account) return [];
        if (!this.state.search_query || !this.state.search_query.trim()) {
            return this.state.account;
        }
        const q = this.state.search_query.trim().toLowerCase();
        return this.state.account.filter(acc => acc.toLowerCase().includes(q));
    }

    onSearchInput(ev) {
        this.state.search_query = ev.target.value;
    }

    toggleAccount(accountName) {
        const current = this.isAccountExpanded(accountName);
        this.state.expanded_accounts = {
            ...this.state.expanded_accounts,
            [accountName]: !current,
        };
    }

    isAccountExpanded(accountName) {
        if (this.state.expanded_accounts[accountName] !== undefined) {
            return !!this.state.expanded_accounts[accountName];
        }
        return !!this.state.is_unfolded_all;
    }

    unfoldAll(ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        this.state.is_unfolded_all = !this.state.is_unfolded_all;
        this.state.expanded_accounts = {};
    }

    async apply_date(ev) {
        const target = ev.currentTarget || ev.target;
        if (target.name === 'start_date') {
            this.state.date_range = {
                ...(typeof this.state.date_range === 'object' && this.state.date_range !== null ? this.state.date_range : {}),
                start_date: target.value,
            };
        } else if (target.name === 'end_date') {
            this.state.date_range = {
                ...(typeof this.state.date_range === 'object' && this.state.date_range !== null ? this.state.date_range : {}),
                end_date: target.value,
            };
        } else {
            const dataVal = target.getAttribute('data-value') || target.dataset.value;
            if (dataVal) {
                this.state.date_range = dataVal;
            }
        }
        await this.load_data();
    }

    async toggle_journal(journalId) {
        const id = parseInt(journalId, 10);
        if (this.state.selected_journal_list.includes(id)) {
            this.state.selected_journal_list = this.state.selected_journal_list.filter(item => item !== id);
        } else {
            this.state.selected_journal_list = [...this.state.selected_journal_list, id];
        }
        await this.load_data();
    }

    async toggle_analytic(analyticId) {
        const id = parseInt(analyticId, 10);
        if (this.state.selected_analytic_list.includes(id)) {
            this.state.selected_analytic_list = this.state.selected_analytic_list.filter(item => item !== id);
        } else {
            this.state.selected_analytic_list = [...this.state.selected_analytic_list, id];
        }
        await this.load_data();
    }

    async apply_target_move(val) {
        this.state.options = val === 'draft' ? { 'draft': true } : null;
        await this.load_data();
    }

    async apply_method(val) {
        this.state.method = val === 'cash' ? { 'cash': true } : { 'accrual': true };
        await this.load_data();
    }

    gotoJournalEntry(moveId, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const id = typeof moveId === 'number' ? moveId : parseInt(moveId?.target?.dataset?.id || moveId, 10);
        if (!id) return;
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: 'account.move',
            res_id: id,
            views: [[false, "form"]],
            target: "current",
        });
    }

    gotoJournalItem(accountId, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const id = typeof accountId === 'number' ? accountId : parseInt(accountId?.target?.dataset?.id || accountId, 10);
        if (!id) return;
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: 'account.move.line',
            name: "Journal Items",
            views: [[false, "list"]],
            domain: [["account_id", "=", id]],
            target: "current",
        });
    }

    async printPdf(ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        const totals = {
            'total_debit': this.state.total_debit || false,
            'total_debit_display': this.state.total_debit_display || false,
            'total_credit': this.state.total_credit || false,
            'total_credit_display': this.state.total_credit_display || false,
            'currency': this.state.currency || false,
        };
        const action_title = this.props.action?.display_name || 'General Ledger';
        return this.action.doAction({
            type: 'ir.actions.report',
            report_type: 'qweb-pdf',
            report_name: 'dynamic_accounts_report.general_ledger',
            report_file: 'dynamic_accounts_report.general_ledger',
            data: {
                account: this.state.account,
                account_data: this.state.account_data,
                total: this.state.account_total,
                title: action_title,
                filters: this.filter(),
                grand_total: totals,
                report_name: action_title,
                is_unfolded_all: this.state.is_unfolded_all,
                expanded_accounts: this.state.expanded_accounts || {},
            },
            display_name: action_title,
        });
    }

    async print_xlsx() {
        const totals = {
            total_debit: this.state.total_debit,
            total_debit_display: this.state.total_debit_display || false,
            total_credit: this.state.total_credit,
            total_credit_display: this.state.total_credit_display || false,
            currency: this.state.currency,
        };
        const action_title = this.props.action?.display_name || 'General Ledger';
        const datas = {
            account: this.state.account,
            data: this.state.account_data,
            total: this.state.account_total,
            title: action_title,
            filters: this.filter(),
            grand_total: totals,
        };
        const action = {
            data: {
                model: 'account.general.ledger',
                data: JSON.stringify(datas),
                output_format: 'xlsx',
                report_action: this.props.action?.xml_id,
                report_name: action_title,
            },
        };
        await download({
            url: '/xlsx_report',
            data: action.data,
            error: (error) => console.error('Error downloading XLSX:', error),
        });
    }

    filter() {
        let startDate, endDate;
        let startYear, startMonth, startDay, endYear, endMonth, endDay;
        if (this.state.date_range) {
            const today = new Date();
            if (this.state.date_range === 'year') {
                startDate = new Date(today.getFullYear(), 0, 1);
                endDate = new Date(today.getFullYear(), 11, 31);
            } else if (this.state.date_range === 'quarter') {
                const currentQuarter = Math.floor(today.getMonth() / 3);
                startDate = new Date(today.getFullYear(), currentQuarter * 3, 1);
                endDate = new Date(today.getFullYear(), (currentQuarter + 1) * 3, 0);
            } else if (this.state.date_range === 'month') {
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            } else if (this.state.date_range === 'last-month') {
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                endDate = new Date(today.getFullYear(), today.getMonth(), 0);
            } else if (this.state.date_range === 'last-year') {
                startDate = new Date(today.getFullYear() - 1, 0, 1);
                endDate = new Date(today.getFullYear() - 1, 11, 31);
            } else if (this.state.date_range === 'last-quarter') {
                const lastQuarter = Math.floor((today.getMonth() - 3) / 3);
                startDate = new Date(today.getFullYear(), lastQuarter * 3, 1);
                endDate = new Date(today.getFullYear(), (lastQuarter + 1) * 3, 0);
            } else if (typeof this.state.date_range === 'object' && this.state.date_range !== null) {
                if (this.state.date_range.start_date) startDate = new Date(this.state.date_range.start_date);
                if (this.state.date_range.end_date) endDate = new Date(this.state.date_range.end_date);
            }
            if (startDate && !isNaN(startDate.getTime())) {
                startYear = startDate.getFullYear();
                startMonth = startDate.getMonth() + 1;
                startDay = startDate.getDate();
            }
            if (endDate && !isNaN(endDate.getTime())) {
                endYear = endDate.getFullYear();
                endMonth = endDate.getMonth() + 1;
                endDay = endDate.getDate();
            }
        }
        const selectedJournalNames = (this.state.selected_journal_list || []).map((journalID) => {
            const journal = (this.state.journals || []).find((j) => j.id === journalID);
            return journal ? journal.name : '';
        }).filter(Boolean);

        const selectedAnalyticNames = (this.state.selected_analytic_list || []).map((analyticID) => {
            const analytic = (this.state.analytics || []).find((a) => a.id === analyticID);
            return analytic ? analytic.name : '';
        }).filter(Boolean);

        const filters = {
            journal: selectedJournalNames,
            analytic: selectedAnalyticNames,
            account: [],
            options: this.state.options,
            start_date: null,
            end_date: null,
        };
        if (startYear !== undefined && startMonth !== undefined && startDay !== undefined &&
            endYear !== undefined && endMonth !== undefined && endDay !== undefined) {
            filters.start_date = `${startYear}-${startMonth < 10 ? '0' : ''}${startMonth}-${startDay < 10 ? '0' : ''}${startDay}`;
            filters.end_date = `${endYear}-${endMonth < 10 ? '0' : ''}${endMonth}-${endDay < 10 ? '0' : ''}${endDay}`;
        }
        return filters;
    }
}

GeneralLedger.defaultProps = {
    resIds: [],
};
GeneralLedger.template = 'gl_template_new';
actionRegistry.add("gen_l", GeneralLedger);
