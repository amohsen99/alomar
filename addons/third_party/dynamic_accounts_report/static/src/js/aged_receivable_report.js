/** @odoo-module */
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useRef, useState, onWillStart } from "@odoo/owl";
import { download } from "@web/core/network/download";
import { formatFloat } from "@web/core/utils/numbers";

const actionRegistry = registry.category("actions");
const today = luxon.DateTime.now();

class AgedReceivable extends Component {
    setup() {
        super.setup(...arguments);
        this.orm = useService('orm');
        this.action = useService('action');
        this.tbody = useRef('tbody');
        this.date_range = useRef('date_to');

        this.state = useState({
            move_line: null,
            data: null,
            total: null,
            currency: 'LE',
            total_debit: 0,
            diff0_sum: 0,
            diff1_sum: 0,
            diff2_sum: 0,
            diff3_sum: 0,
            diff4_sum: 0,
            diff5_sum: 0,
            total_debit_display: '0.00',
            diff0_sum_display: '0.00',
            diff1_sum_display: '0.00',
            diff2_sum_display: '0.00',
            diff3_sum_display: '0.00',
            diff4_sum_display: '0.00',
            diff5_sum_display: '0.00',
            selected_partner: [],
            selected_partner_rec: [],
            is_unfolded_all: false,
            expanded_partners: {},
            search_query: '',
            end_date: '',
            date_filter_label: 'Date Range',
            title: this.props.action ? this.props.action.display_name : 'Aged Receivable',
        });

        onWillStart(async () => {
            await this.load_data();
        });
    }

    async load_data() {
        let move_line_list = [];
        let move_lines_total = {};
        let diff0Sum = 0;
        let diff1Sum = 0;
        let diff2Sum = 0;
        let diff3Sum = 0;
        let diff4Sum = 0;
        let diff5Sum = 0;
        let TotalDebit = 0;
        let currency = 'LE';

        try {
            const data = await this.orm.call("age.receivable.report", "view_report", []);
            this.state.data = data;
            for (const index in data) {
                const value = data[index];
                if (index !== 'partner_totals') {
                    move_line_list.push(index);
                } else {
                    move_lines_total = value || {};
                    for (const moveLine of Object.values(move_lines_total)) {
                        if (moveLine.currency_id) {
                            currency = moveLine.currency_id;
                        }
                        diff0Sum += (typeof moveLine.diff0_sum === 'number' ? moveLine.diff0_sum : parseFloat(moveLine.diff0_sum) || 0);
                        diff1Sum += (typeof moveLine.diff1_sum === 'number' ? moveLine.diff1_sum : parseFloat(moveLine.diff1_sum) || 0);
                        diff2Sum += (typeof moveLine.diff2_sum === 'number' ? moveLine.diff2_sum : parseFloat(moveLine.diff2_sum) || 0);
                        diff3Sum += (typeof moveLine.diff3_sum === 'number' ? moveLine.diff3_sum : parseFloat(moveLine.diff3_sum) || 0);
                        diff4Sum += (typeof moveLine.diff4_sum === 'number' ? moveLine.diff4_sum : parseFloat(moveLine.diff4_sum) || 0);
                        diff5Sum += (typeof moveLine.diff5_sum === 'number' ? moveLine.diff5_sum : parseFloat(moveLine.diff5_sum) || 0);
                        TotalDebit += (typeof moveLine.debit_sum === 'number' ? moveLine.debit_sum : parseFloat(moveLine.debit_sum) || 0);
                    }
                }
            }
            this.state.move_line = move_line_list;
            this.state.total = move_lines_total;
            this.state.currency = currency;
            this.state.total_debit = TotalDebit;
            this.state.diff0_sum = diff0Sum;
            this.state.diff1_sum = diff1Sum;
            this.state.diff2_sum = diff2Sum;
            this.state.diff3_sum = diff3Sum;
            this.state.diff4_sum = diff4Sum;
            this.state.diff5_sum = diff5Sum;

            this.state.total_debit_display = this.formatNumber(TotalDebit);
            this.state.diff0_sum_display = this.formatNumber(diff0Sum);
            this.state.diff1_sum_display = this.formatNumber(diff1Sum);
            this.state.diff2_sum_display = this.formatNumber(diff2Sum);
            this.state.diff3_sum_display = this.formatNumber(diff3Sum);
            this.state.diff4_sum_display = this.formatNumber(diff4Sum);
            this.state.diff5_sum_display = this.formatNumber(diff5Sum);
        } catch (error) {
            console.error("Error loading aged receivable data:", error);
        }
    }

    async applyDatePreset(preset, label) {
        let dateVal = '';
        if (preset === 'today') {
            dateVal = today.toFormat('yyyy-MM-dd');
        } else if (preset === 'last-month-end') {
            dateVal = today.startOf('month').minus({ days: 1 }).toFormat('yyyy-MM-dd');
        } else if (preset === 'last-quarter-end') {
            dateVal = today.startOf('quarter').minus({ days: 1 }).toFormat('yyyy-MM-dd');
        } else if (preset === 'last-year-end') {
            dateVal = today.startOf('year').minus({ days: 1 }).toFormat('yyyy-MM-dd');
        }
        this.state.end_date = dateVal;
        this.state.date_filter_label = label || (dateVal ? `As of ${dateVal}` : 'Date Range');
        if (this.date_range && this.date_range.el) {
            this.date_range.el.value = dateVal;
        }
        await this.fetchFilteredData();
    }

    async applyCustomDate(ev) {
        const val = ev.target.value;
        this.state.end_date = val;
        this.state.date_filter_label = val ? `As of ${val}` : 'Date Range';
        await this.fetchFilteredData();
    }

    async fetchFilteredData() {
        let move_line_list = [];
        let move_lines_total = {};
        let diff0Sum = 0;
        let diff1Sum = 0;
        let diff2Sum = 0;
        let diff3Sum = 0;
        let diff4Sum = 0;
        let diff5Sum = 0;
        let TotalDebit = 0;

        try {
            const filtered_data = await this.orm.call("age.receivable.report", "get_filter_values", [
                this.state.end_date || false,
                this.state.selected_partner || [],
            ]);
            this.state.data = filtered_data;
            for (const index in filtered_data) {
                const value = filtered_data[index];
                if (index !== 'partner_totals') {
                    move_line_list.push(index);
                } else {
                    move_lines_total = value || {};
                    for (const moveLine of Object.values(move_lines_total)) {
                        diff0Sum += (typeof moveLine.diff0_sum === 'number' ? moveLine.diff0_sum : parseFloat(moveLine.diff0_sum) || 0);
                        diff1Sum += (typeof moveLine.diff1_sum === 'number' ? moveLine.diff1_sum : parseFloat(moveLine.diff1_sum) || 0);
                        diff2Sum += (typeof moveLine.diff2_sum === 'number' ? moveLine.diff2_sum : parseFloat(moveLine.diff2_sum) || 0);
                        diff3Sum += (typeof moveLine.diff3_sum === 'number' ? moveLine.diff3_sum : parseFloat(moveLine.diff3_sum) || 0);
                        diff4Sum += (typeof moveLine.diff4_sum === 'number' ? moveLine.diff4_sum : parseFloat(moveLine.diff4_sum) || 0);
                        diff5Sum += (typeof moveLine.diff5_sum === 'number' ? moveLine.diff5_sum : parseFloat(moveLine.diff5_sum) || 0);
                        TotalDebit += (typeof moveLine.debit_sum === 'number' ? moveLine.debit_sum : parseFloat(moveLine.debit_sum) || 0);
                    }
                }
            }
            this.state.move_line = move_line_list;
            this.state.total = move_lines_total;
            this.state.total_debit = TotalDebit;
            this.state.diff0_sum = diff0Sum;
            this.state.diff1_sum = diff1Sum;
            this.state.diff2_sum = diff2Sum;
            this.state.diff3_sum = diff3Sum;
            this.state.diff4_sum = diff4Sum;
            this.state.diff5_sum = diff5Sum;

            this.state.total_debit_display = this.formatNumber(TotalDebit);
            this.state.diff0_sum_display = this.formatNumber(diff0Sum);
            this.state.diff1_sum_display = this.formatNumber(diff1Sum);
            this.state.diff2_sum_display = this.formatNumber(diff2Sum);
            this.state.diff3_sum_display = this.formatNumber(diff3Sum);
            this.state.diff4_sum_display = this.formatNumber(diff4Sum);
            this.state.diff5_sum_display = this.formatNumber(diff5Sum);
        } catch (error) {
            console.error("Error applying filter in aged receivable:", error);
        }
    }

    async applyFilter(ev, e, is_delete = false) {
        if (ev && ev.target && ev.target.attributes && ev.target.attributes["data-value"]) {
            const val = ev.target.attributes["data-value"].value;
            return this.applyDatePreset(val);
        }
        return this.fetchFilteredData();
    }

    onSearchInput(ev) {
        this.state.search_query = (ev.target.value || '').trim();
    }

    get displayed_partners() {
        if (!this.state.move_line) return [];
        if (!this.state.search_query) return this.state.move_line;
        const q = this.state.search_query.toLowerCase();
        return this.state.move_line.filter(partnerName => {
            if (partnerName.toLowerCase().includes(q)) return true;
            const lines = this.state.data && this.state.data[partnerName];
            if (lines && Array.isArray(lines)) {
                return lines.some(l =>
                    (l.move_name && l.move_name.toLowerCase().includes(q)) ||
                    (l.name && l.name.toLowerCase().includes(q)) ||
                    (l.account_id && l.account_id[1] && l.account_id[1].toLowerCase().includes(q))
                );
            }
            return false;
        });
    }

    togglePartner(partnerName) {
        const current = this.isPartnerExpanded(partnerName);
        this.state.expanded_partners[partnerName] = !current;
    }

    isPartnerExpanded(partnerName) {
        if (this.state.expanded_partners[partnerName] !== undefined) {
            return this.state.expanded_partners[partnerName];
        }
        return this.state.is_unfolded_all;
    }

    unfoldAll() {
        this.state.is_unfolded_all = !this.state.is_unfolded_all;
        this.state.expanded_partners = {};
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

    gotoJournalItem(partnerId, ev) {
        if (ev) ev.stopPropagation();
        const id = typeof partnerId === 'number' ? partnerId : parseInt(partnerId || (ev && ev.target.dataset.id), 10);
        if (!id) return;
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: 'account.move.line',
            name: "Journal Items",
            views: [[false, "list"]],
            domain: [["partner_id", "=", id], ['account_type', 'in', ['asset_receivable']]],
            target: "current",
        });
    }

    openPartner(partnerId, ev) {
        if (ev) ev.stopPropagation();
        const id = typeof partnerId === 'number' ? partnerId : parseInt(partnerId || (ev && ev.target.dataset.id), 10);
        if (!id) return;
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: 'res.partner',
            res_id: id,
            views: [[false, "form"]],
            target: "current",
        });
    }

    formatNumber(val) {
        if (val === undefined || val === null || val === '') return '0.00';
        let num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    formatBucket(val) {
        if (val === undefined || val === null || val === '') return '-';
        let num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
        if (isNaN(num) || Math.abs(num) < 0.001) return '-';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    filter() {
        return {
            'partner': this.state.selected_partner_rec,
            'end_date': this.state.end_date || (this.date_range && this.date_range.el ? this.date_range.el.value : ''),
        };
    }

    async printPdf(ev) {
        if (ev) ev.preventDefault();
        const action_title = this.props.action ? this.props.action.display_name : 'Aged Receivable';
        let totals = {
            'diff0_sum': this.state.diff0_sum,
            'diff0_sum_display': this.state.diff0_sum_display,
            'diff1_sum': this.state.diff1_sum,
            'diff1_sum_display': this.state.diff1_sum_display,
            'diff2_sum': this.state.diff2_sum,
            'diff2_sum_display': this.state.diff2_sum_display,
            'diff3_sum': this.state.diff3_sum,
            'diff3_sum_display': this.state.diff3_sum_display,
            'diff4_sum': this.state.diff4_sum,
            'diff4_sum_display': this.state.diff4_sum_display,
            'diff5_sum': this.state.diff5_sum,
            'diff5_sum_display': this.state.diff5_sum_display,
            'total_debit': this.state.total_debit,
            'total_debit_display': this.state.total_debit_display,
            'currency': this.state.currency,
        };
        return this.action.doAction({
            'type': 'ir.actions.report',
            'report_type': 'qweb-pdf',
            'report_name': 'dynamic_accounts_report.aged_receivable',
            'report_file': 'dynamic_accounts_report.aged_receivable',
            'data': {
                'move_lines': this.state.move_line,
                'data': this.state.data,
                'total': this.state.total,
                'filters': this.filter(),
                'grand_total': totals,
                'title': action_title,
                'report_name': action_title,
                'is_unfolded_all': this.state.is_unfolded_all,
                'expanded_partners': this.state.expanded_partners || {},
            },
            'display_name': action_title,
        });
    }

    async print_xlsx() {
        const action_title = this.props.action ? this.props.action.display_name : 'Aged Receivable';
        let totals = {
            'diff0_sum': this.state.diff0_sum,
            'diff1_sum': this.state.diff1_sum,
            'diff2_sum': this.state.diff2_sum,
            'diff3_sum': this.state.diff3_sum,
            'diff4_sum': this.state.diff4_sum,
            'diff5_sum': this.state.diff5_sum,
            'total_debit': this.state.total_debit,
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
                'model': 'age.receivable.report',
                'data': JSON.stringify(datas),
                'output_format': 'xlsx',
                'report_action': this.props.action ? this.props.action.xml_id : '',
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

AgedReceivable.template = 'age_r_template_new';
AgedReceivable.defaultProps = {
    resIds: [],
};
actionRegistry.add("age_r", AgedReceivable);
