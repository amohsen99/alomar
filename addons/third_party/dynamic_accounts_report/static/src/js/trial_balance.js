/** @odoo-module */
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useRef, useState, onWillStart } from "@odoo/owl";
import { download } from "@web/core/network/download";

const actionRegistry = registry.category("actions");
const today = luxon.DateTime.now();
const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

class TrialBalance extends Component {
    setup() {
        super.setup(...arguments);
        this.orm = useService('orm');
        this.action = useService('action');
        this.tbody = useRef('tbody');
        this.startDateRef = useRef('start_date');
        this.endDateRef = useRef('end_date');
        this.periodRef = useRef('periods');
        this.periodYearRef = useRef('period_year');

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        this.state = useState({
            data: [],
            totals: {},
            journals: [],
            selected_journal_list: [],
            selected_analytic: [],
            selected_analytic_account_rec: [],
            date_range: 'month',
            date_type: 'month',
            start_date: startOfMonth.toISOString().split('T')[0],
            end_date: endOfMonth.toISOString().split('T')[0],
            date_filter_label: 'This Month',
            apply_comparison: false,
            comparison_type: null,
            comparison_number: null,
            date_viewed: [monthNamesShort[now.getMonth()] + ' ' + now.getFullYear()],
            options: {},
            method: { 'accrual': true },
            currency: 'LE',
            search_query: '',
            target_move: 'posted',
            title: this.props.action ? this.props.action.display_name : 'Trial Balance',
        });

        onWillStart(async () => {
            await this.load_data();
        });
    }

    async load_data() {
        try {
            const result = await this.orm.call("account.trial.balance", "view_report", []);
            if (result && Array.isArray(result)) {
                this.state.data = result[0] || [];
                if (result[1] && result[1]['journal_ids']) {
                    this.state.journals = result[1]['journal_ids'];
                }
                this.state.totals = result[2] || {};
                if (this.state.totals && this.state.totals.currency) {
                    this.state.currency = this.state.totals.currency;
                }
            }
        } catch (error) {
            console.error("Error loading trial balance:", error);
        }
    }

    get displayed_accounts() {
        if (!this.state.data) return [];
        if (!this.state.search_query) return this.state.data;
        const q = this.state.search_query.toLowerCase();
        return this.state.data.filter(item => {
            return (item.account && item.account.toLowerCase().includes(q)) ||
                   (item.account_code && item.account_code.toLowerCase().includes(q)) ||
                   (item.account_name && item.account_name.toLowerCase().includes(q));
        });
    }

    get total_period_debit() {
        if (!this.state.data) return 0;
        return this.state.data.reduce((acc, item) => acc + (this.parseNumber(item.total_debit) || 0), 0);
    }

    get total_period_credit() {
        if (!this.state.data) return 0;
        return this.state.data.reduce((acc, item) => acc + (this.parseNumber(item.total_credit) || 0), 0);
    }

    get total_end_debit() {
        if (!this.state.data) return 0;
        return this.state.data.reduce((acc, item) => acc + (this.parseNumber(item.end_total_debit) || 0), 0);
    }

    get total_end_credit() {
        if (!this.state.data) return 0;
        return this.state.data.reduce((acc, item) => acc + (this.parseNumber(item.end_total_credit) || 0), 0);
    }

    get is_balanced() {
        const periodDiff = Math.abs(this.total_period_debit - this.total_period_credit);
        const endDiff = Math.abs(this.total_end_debit - this.total_end_credit);
        return periodDiff < 0.05 && endDiff < 0.05;
    }

    get comparison_number_range() {
        const range = [];
        const num = parseInt(this.state.comparison_number, 10) || 0;
        for (let i = 1; i <= num; i++) {
            range.push(i);
        }
        return range;
    }

    parseNumber(val) {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return val;
        let num = parseFloat(String(val).replace(/,/g, ''));
        return isNaN(num) ? 0 : num;
    }

    formatNumber(val) {
        const num = this.parseNumber(val);
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    formatAmount(val) {
        const num = this.parseNumber(val);
        if (Math.abs(num) < 0.001) return '-';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    onSearchInput(ev) {
        this.state.search_query = (ev.target.value || '').trim();
    }

    async applyDatePreset(preset, label) {
        this.state.date_type = preset;
        this.state.date_filter_label = label || preset;
        const now = luxon.DateTime.now();

        if (preset === 'month') {
            this.state.start_date = now.startOf('month').toFormat('yyyy-MM-dd');
            this.state.end_date = now.endOf('month').toFormat('yyyy-MM-dd');
            this.state.date_viewed = [now.monthShort + ' ' + now.year];
        } else if (preset === 'quarter') {
            this.state.start_date = now.startOf('quarter').toFormat('yyyy-MM-dd');
            this.state.end_date = now.endOf('quarter').toFormat('yyyy-MM-dd');
            this.state.date_viewed = ['Q' + now.quarter + ' ' + now.year];
        } else if (preset === 'year') {
            this.state.start_date = now.startOf('year').toFormat('yyyy-MM-dd');
            this.state.end_date = now.endOf('year').toFormat('yyyy-MM-dd');
            this.state.date_viewed = [String(now.year)];
        } else if (preset === 'last-month') {
            const prev = now.minus({ months: 1 });
            this.state.start_date = prev.startOf('month').toFormat('yyyy-MM-dd');
            this.state.end_date = prev.endOf('month').toFormat('yyyy-MM-dd');
            this.state.date_viewed = [prev.monthShort + ' ' + prev.year];
        } else if (preset === 'last-quarter') {
            const prev = now.minus({ quarters: 1 });
            this.state.start_date = prev.startOf('quarter').toFormat('yyyy-MM-dd');
            this.state.end_date = prev.endOf('quarter').toFormat('yyyy-MM-dd');
            this.state.date_viewed = ['Q' + prev.quarter + ' ' + prev.year];
        } else if (preset === 'last-year') {
            const prev = now.minus({ years: 1 });
            this.state.start_date = prev.startOf('year').toFormat('yyyy-MM-dd');
            this.state.end_date = prev.endOf('year').toFormat('yyyy-MM-dd');
            this.state.date_viewed = [String(prev.year)];
        }

        if (this.startDateRef && this.startDateRef.el) this.startDateRef.el.value = this.state.start_date;
        if (this.endDateRef && this.endDateRef.el) this.endDateRef.el.value = this.state.end_date;

        await this.fetchFilteredData();
    }

    async applyCustomDate() {
        const startVal = this.startDateRef && this.startDateRef.el ? this.startDateRef.el.value : '';
        const endVal = this.endDateRef && this.endDateRef.el ? this.endDateRef.el.value : '';
        this.state.start_date = startVal;
        this.state.end_date = endVal;

        if (startVal && endVal) {
            this.state.date_filter_label = `${startVal} to ${endVal}`;
            this.state.date_viewed = [`${startVal} to ${endVal}`];
        } else if (startVal) {
            this.state.date_filter_label = `From ${startVal}`;
            this.state.date_viewed = [`From ${startVal}`];
        } else if (endVal) {
            this.state.date_filter_label = `Until ${endVal}`;
            this.state.date_viewed = [`Until ${endVal}`];
        } else {
            this.state.date_filter_label = 'Date Range';
        }

        await this.fetchFilteredData();
    }

    async toggleJournalFilter(journalId) {
        const list = [...this.state.selected_journal_list];
        const idx = list.indexOf(journalId);
        if (idx > -1) {
            list.splice(idx, 1);
        } else {
            list.push(journalId);
        }
        this.state.selected_journal_list = list;
        await this.fetchFilteredData();
    }

    async applyTargetMove(target) {
        this.state.target_move = target;
        if (target === 'draft') {
            this.state.options = { ...this.state.options, draft: true };
        } else {
            const { draft, ...rest } = this.state.options;
            this.state.options = rest;
        }
        await this.fetchFilteredData();
    }

    async applyMethod(methodName) {
        if (methodName === 'cash-basis') {
            this.state.method = { 'cash': true };
        } else {
            this.state.method = { 'accrual': true };
        }
        await this.fetchFilteredData();
    }

    onPeriodChange(ev) {
        if (this.periodYearRef && this.periodYearRef.el) {
            this.periodYearRef.el.value = ev.target.value;
        }
    }

    onPeriodYearChange(ev) {
        if (this.periodRef && this.periodRef.el) {
            this.periodRef.el.value = ev.target.value;
        }
    }

    async applyComparisonPeriod(ev) {
        const val = this.periodRef && this.periodRef.el ? this.periodRef.el.value : '1';
        this.state.apply_comparison = true;
        this.state.comparison_type = this.state.date_type || 'month';
        this.state.comparison_number = val;
        await this.fetchFilteredData();
    }

    async applyComparisonYear(ev) {
        const val = this.periodYearRef && this.periodYearRef.el ? this.periodYearRef.el.value : '1';
        this.state.apply_comparison = true;
        this.state.comparison_type = 'year';
        this.state.comparison_number = val;
        await this.fetchFilteredData();
    }

    async applyComparison(ev) {
        this.state.apply_comparison = false;
        this.state.comparison_type = null;
        this.state.comparison_number = null;
        if (this.state.date_viewed.length > 1) {
            this.state.date_viewed = [this.state.date_viewed[this.state.date_viewed.length - 1]];
        }
        await this.fetchFilteredData();
    }

    async fetchFilteredData() {
        try {
            const result = await this.orm.call("account.trial.balance", "get_filter_values", [
                this.state.start_date,
                this.state.end_date,
                this.state.comparison_number,
                this.state.comparison_type,
                this.state.selected_journal_list,
                this.state.selected_analytic,
                this.state.options,
                this.state.method,
            ]);
            if (result && Array.isArray(result)) {
                this.state.data = result[0] || [];
                this.state.totals = result[1] || {};
                if (this.state.totals && this.state.totals.currency) {
                    this.state.currency = this.state.totals.currency;
                }
            }
        } catch (error) {
            console.error("Error filtering trial balance:", error);
        }
    }

    gotoJournalItem(accountId, ev) {
        if (ev) ev.stopPropagation();
        const id = typeof accountId === 'number' ? accountId : parseInt(accountId || (ev && ev.target.dataset.id), 10);
        if (!id) return;
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: 'account.move.line',
            name: "Journal Items",
            views: [[false, "list"]],
            domain: [["account_id", "=", id]],
            context: { search_default_posted: 1 },
            target: "current",
        });
    }

    gotoGeneralLedger(accountId, ev) {
        if (ev) ev.stopPropagation();
        return this.action.doAction({
            type: 'ir.actions.client',
            name: 'General Ledger',
            tag: 'gen_l',
        });
    }

    filter() {
        const selectedJournalIDs = Object.values(this.state.selected_journal_list);
        const selectedJournalNames = selectedJournalIDs.map(id => {
            const j = this.state.journals.find(item => item.id === id);
            return j ? j.name : '';
        }).filter(Boolean);

        return {
            'journal': selectedJournalNames,
            'account': this.state.selected_analytic_account_rec,
            'options': this.state.options,
            'comparison_type': this.state.comparison_type,
            'comparison_number_range': this.state.comparison_number,
            'start_date': this.state.start_date,
            'end_date': this.state.end_date,
        };
    }

    normalizeReportData(rawData) {
        let accounts = Array.isArray(rawData) && Array.isArray(rawData[0]) ? rawData[0] : rawData;
        return accounts.map(acc => ({
            ...acc,
            initial_total_debit: this.parseNumber(acc.initial_total_debit),
            initial_total_credit: this.parseNumber(acc.initial_total_credit),
            total_debit: this.parseNumber(acc.total_debit),
            total_credit: this.parseNumber(acc.total_credit),
            end_total_debit: this.parseNumber(acc.end_total_debit),
            end_total_credit: this.parseNumber(acc.end_total_credit),
        }));
    }

    async printPdf(ev) {
        if (ev) ev.preventDefault();
        const action_title = this.props.action ? this.props.action.display_name : 'Trial Balance';
        let comparison_number_range = this.comparison_number_range;
        let data_viewed = this.state.date_viewed;

        if (this.state.apply_comparison && this.comparison_number_range.length > 10) {
            comparison_number_range = this.comparison_number_range.slice(-10);
            data_viewed = this.state.date_viewed.slice(-11);
        }

        return this.action.doAction({
            'type': 'ir.actions.report',
            'report_type': 'qweb-pdf',
            'report_name': 'dynamic_accounts_report.trial_balance',
            'report_file': 'dynamic_accounts_report.trial_balance',
            'data': {
                'data': this.normalizeReportData(this.state.data),
                'totals': this.state.totals,
                'date_viewed': data_viewed,
                'filters': this.filter(),
                'apply_comparison': this.state.apply_comparison,
                'comparison_number_range': comparison_number_range,
                'title': action_title,
                'report_name': action_title,
            },
            'display_name': action_title,
        });
    }

    async print_xlsx() {
        const action_title = this.props.action ? this.props.action.display_name : 'Trial Balance';
        const datas = {
            'data': this.normalizeReportData(this.state.data),
            'totals': this.state.totals,
            'date_viewed': this.state.date_viewed,
            'filters': this.filter(),
            'apply_comparison': this.state.apply_comparison,
            'comparison_number_range': this.comparison_number_range,
            'title': action_title,
            'report_name': action_title,
        };
        const action = {
            'data': {
                'model': 'account.trial.balance',
                'data': JSON.stringify(datas),
                'output_format': 'xlsx',
                'report_action': this.props.action ? this.props.action.xml_id : 'dynamic_accounts_report.action_trial_balance',
                'report_name': action_title,
            },
        };
        await download({
            url: '/xlsx_report',
            data: action.data,
        });
    }
}

TrialBalance.template = 'trl_b_template_new';
TrialBalance.defaultProps = {
    resIds: [],
};
actionRegistry.add("trl_b", TrialBalance);