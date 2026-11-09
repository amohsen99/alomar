/** @odoo-module */
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useRef, useState, onWillStart } from "@odoo/owl";
import { download } from "@web/core/network/download";

const actionRegistry = registry.category("actions");
const today = luxon.DateTime.now();

class BankBook extends Component {
    setup() {
        super.setup(...arguments);
        this.orm = useService('orm');
        this.action = useService('action');
        this.tbody = useRef('tbody');
        this.startDateRef = useRef('start_date');
        this.endDateRef = useRef('end_date');

        this.state = useState({
            move_line: null,
            data: null,
            total: null,
            accounts: [],
            selected_account_list: [],
            selected_partner: [],
            selected_partner_rec: [],
            total_debit: 0,
            total_credit: 0,
            total_balance: 0,
            currency: 'LE',
            is_unfolded_all: false,
            expanded_accounts: {},
            search_query: '',
            target_move: 'posted',
            date_range: null,
            start_date: '',
            end_date: '',
            date_filter_label: 'Date Range',
            title: this.props.action ? this.props.action.display_name : 'Bank Book',
        });

        onWillStart(async () => {
            await this.load_data();
        });
    }

    async load_data() {
        let move_line_list = [];
        let move_lines_total = {};
        let accounts = [];
        let totalDebitSum = 0;
        let totalCreditSum = 0;
        let currency = 'LE';

        try {
            const data = await this.orm.call("bank.book.report", "view_report", []);
            this.state.data = data;
            for (const index in data) {
                const value = data[index];
                if (index !== 'move_lines_total' && index !== 'accounts') {
                    move_line_list.push(index);
                } else if (index === 'accounts') {
                    accounts = value || [];
                } else {
                    move_lines_total = value || {};
                    for (const moveLine of Object.values(move_lines_total)) {
                        if (moveLine.currency_id) {
                            currency = moveLine.currency_id;
                        }
                        totalDebitSum += (typeof moveLine.total_debit === 'number' ? moveLine.total_debit : parseFloat(moveLine.total_debit) || 0);
                        totalCreditSum += (typeof moveLine.total_credit === 'number' ? moveLine.total_credit : parseFloat(moveLine.total_credit) || 0);
                    }
                }
            }
            this.state.move_line = move_line_list;
            this.state.total = move_lines_total;
            this.state.accounts = accounts;
            this.state.currency = currency;
            this.state.total_debit = totalDebitSum;
            this.state.total_credit = totalCreditSum;
            this.state.total_balance = totalDebitSum - totalCreditSum;
        } catch (error) {
            console.error("Error loading bank book report data:", error);
        }
    }

    async fetchFilteredData() {
        let move_line_list = [];
        let move_lines_total = {};
        let totalDebitSum = 0;
        let totalCreditSum = 0;
        let currency = 'LE';

        let dateParam = null;
        if (this.state.start_date || this.state.end_date) {
            dateParam = {};
            if (this.state.start_date) dateParam.start_date = this.state.start_date;
            if (this.state.end_date) dateParam.end_date = this.state.end_date;
        } else if (this.state.date_range) {
            dateParam = this.state.date_range;
        }

        const options = {
            draft: this.state.target_move === 'draft',
        };

        try {
            const filtered_data = await this.orm.call("bank.book.report", "get_filter_values", [
                this.state.selected_partner || [],
                dateParam,
                this.state.selected_account_list || [],
                options,
            ]);
            this.state.data = filtered_data;
            for (const index in filtered_data) {
                const value = filtered_data[index];
                if (index !== 'move_lines_total' && index !== 'accounts') {
                    move_line_list.push(index);
                } else if (index === 'accounts') {
                    if (value && value.length > 0) {
                        this.state.accounts = value;
                    }
                } else {
                    move_lines_total = value || {};
                    for (const moveLine of Object.values(move_lines_total)) {
                        if (moveLine.currency_id) {
                            currency = moveLine.currency_id;
                        }
                        totalDebitSum += (typeof moveLine.total_debit === 'number' ? moveLine.total_debit : parseFloat(moveLine.total_debit) || 0);
                        totalCreditSum += (typeof moveLine.total_credit === 'number' ? moveLine.total_credit : parseFloat(moveLine.total_credit) || 0);
                    }
                }
            }
            this.state.move_line = move_line_list;
            this.state.total = move_lines_total;
            this.state.currency = currency;
            this.state.total_debit = totalDebitSum;
            this.state.total_credit = totalCreditSum;
            this.state.total_balance = totalDebitSum - totalCreditSum;
        } catch (error) {
            console.error("Error applying bank book filter:", error);
        }
    }

    async applyDatePreset(preset, label) {
        this.state.date_range = preset;
        this.state.start_date = '';
        this.state.end_date = '';
        this.state.date_filter_label = label || 'Date Range';
        if (this.startDateRef && this.startDateRef.el) this.startDateRef.el.value = '';
        if (this.endDateRef && this.endDateRef.el) this.endDateRef.el.value = '';
        await this.fetchFilteredData();
    }

    async applyCustomDate() {
        const startVal = this.startDateRef && this.startDateRef.el ? this.startDateRef.el.value : '';
        const endVal = this.endDateRef && this.endDateRef.el ? this.endDateRef.el.value : '';
        this.state.start_date = startVal;
        this.state.end_date = endVal;
        this.state.date_range = null;

        if (startVal && endVal) {
            this.state.date_filter_label = `${startVal} to ${endVal}`;
        } else if (startVal) {
            this.state.date_filter_label = `From ${startVal}`;
        } else if (endVal) {
            this.state.date_filter_label = `Until ${endVal}`;
        } else {
            this.state.date_filter_label = 'Date Range';
        }
        await this.fetchFilteredData();
    }

    async toggleAccountFilter(accountId) {
        const list = [...this.state.selected_account_list];
        const idx = list.indexOf(accountId);
        if (idx > -1) {
            list.splice(idx, 1);
        } else {
            list.push(accountId);
        }
        this.state.selected_account_list = list;
        await this.fetchFilteredData();
    }

    async applyTargetMove(target) {
        this.state.target_move = target;
        await this.fetchFilteredData();
    }

    async applyFilter(ev) {
        if (ev && ev.target && ev.target.dataset && ev.target.dataset.value) {
            const val = ev.target.dataset.value;
            if (val === 'draft') {
                return this.applyTargetMove(this.state.target_move === 'draft' ? 'posted' : 'draft');
            }
            return this.applyDatePreset(val, ev.target.innerText.trim());
        }
        return this.fetchFilteredData();
    }

    onSearchInput(ev) {
        this.state.search_query = (ev.target.value || '').trim();
    }

    get displayed_accounts() {
        if (!this.state.move_line) return [];
        if (!this.state.search_query) return this.state.move_line;
        const q = this.state.search_query.toLowerCase();
        return this.state.move_line.filter(accName => {
            if (accName.toLowerCase().includes(q)) return true;
            const lines = this.state.data && this.state.data[accName];
            if (lines && Array.isArray(lines)) {
                return lines.some(l =>
                    (l.move_name && l.move_name.toLowerCase().includes(q)) ||
                    (l.name && l.name.toLowerCase().includes(q)) ||
                    (l.ref && l.ref.toLowerCase().includes(q)) ||
                    (l.partner_id && l.partner_id[1] && l.partner_id[1].toLowerCase().includes(q)) ||
                    (l.journal_id && l.journal_id[1] && l.journal_id[1].toLowerCase().includes(q))
                );
            }
            return false;
        });
    }

    toggleAccount(accountName) {
        const current = this.isAccountExpanded(accountName);
        this.state.expanded_accounts[accountName] = !current;
    }

    isAccountExpanded(accountName) {
        if (this.state.expanded_accounts[accountName] !== undefined) {
            return this.state.expanded_accounts[accountName];
        }
        return this.state.is_unfolded_all;
    }

    unfoldAll() {
        this.state.is_unfolded_all = !this.state.is_unfolded_all;
        this.state.expanded_accounts = {};
    }

    gotoJournalEntry(moveId, ev) {
        if (ev) ev.stopPropagation();
        const id = typeof moveId === 'number' ? moveId : parseInt(moveId || (ev && ev.target.dataset.id), 10);
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
        if (ev) ev.stopPropagation();
        const id = typeof accountId === 'number' ? accountId : parseInt(accountId || (ev && ev.target.dataset.id), 10);
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

    formatNumber(val) {
        if (val === undefined || val === null || val === '') return '0.00';
        let num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    formatAmount(val) {
        if (val === undefined || val === null || val === '') return '-';
        let num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
        if (isNaN(num) || Math.abs(num) < 0.001) return '-';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    filter() {
        return {
            'account': this.state.selected_account_list,
            'partner': this.state.selected_partner_rec,
            'start_date': this.state.start_date,
            'end_date': this.state.end_date,
            'options': { draft: this.state.target_move === 'draft' },
        };
    }

    async printPdf(ev) {
        if (ev) ev.preventDefault();
        const action_title = this.props.action ? this.props.action.display_name : 'Bank Book';
        let totals = {
            'total_debit': this.state.total_debit,
            'total_credit': this.state.total_credit,
            'currency': this.state.currency || 'LE',
        };
        return this.action.doAction({
            'type': 'ir.actions.report',
            'report_type': 'qweb-pdf',
            'report_name': 'dynamic_accounts_report.bank_book',
            'report_file': 'dynamic_accounts_report.bank_book',
            'data': {
                'move_lines': this.state.move_line,
                'filters': this.filter(),
                'grand_total': totals,
                'data': this.state.data,
                'total': this.state.total,
                'title': action_title,
                'report_name': action_title,
                'is_unfolded_all': Boolean(this.state.is_unfolded_all),
                'expanded_accounts': this.state.expanded_accounts || {},
            },
            'display_name': action_title,
        });
    }

    async print_xlsx() {
        const action_title = this.props.action ? this.props.action.display_name : 'Bank Book';
        let totals = {
            'total_debit': this.state.total_debit,
            'total_credit': this.state.total_credit,
            'currency': this.state.currency,
        };
        let datas = {
            'move_lines': this.state.move_line,
            'data': this.state.data,
            'total': this.state.total,
            'filters': this.filter(),
            'grand_total': totals,
            'title': action_title,
        };
        let action = {
            'data': {
                'model': 'bank.book.report',
                'data': JSON.stringify(datas),
                'output_format': 'xlsx',
                'report_action': this.props.action ? this.props.action.xml_id : 'dynamic_accounts_report.action_bank_book',
                'report_name': action_title,
            },
        };
        await download({
            url: '/xlsx_report',
            data: action.data,
        });
    }

    getDomain() {
        return [];
    }
}

BankBook.template = 'bnk_b_template_new';
BankBook.defaultProps = {
    resIds: [],
};
actionRegistry.add("bnk_b", BankBook);
