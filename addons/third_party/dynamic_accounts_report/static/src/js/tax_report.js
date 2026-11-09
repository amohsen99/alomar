/** @odoo-module */
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useRef, useState, onWillStart } from "@odoo/owl";
import { download } from "@web/core/network/download";

const actionRegistry = registry.category("actions");
const today = luxon.DateTime.now();
const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

class TaxReport extends Component {
    setup() {
        super.setup(...arguments);
        this.orm = useService('orm');
        this.action = useService('action');
        this.tbody = useRef('tbody');
        this.end_date_ref = useRef('date_to');
        this.start_date_ref = useRef('date_from');
        this.period_ref = useRef('periods');
        this.period_year_ref = useRef('period_year');

        const startOfMonth = today.startOf('month').toFormat('yyyy-MM-dd');
        const endOfMonth = today.endOf('month').toFormat('yyyy-MM-dd');

        this.state = useState({
            data: null,
            sale_total: 0.0,
            sale_net_total: 0.0,
            purchase_total: 0.0,
            purchase_net_total: 0.0,
            currency: 'LE',
            start_date: startOfMonth,
            end_date: endOfMonth,
            date_range: 'month',
            date_type: 'month',
            date_filter_label: 'This Month',
            apply_comparison: false,
            comparison_type: null,
            comparison_number: null,
            date_viewed: [today.monthShort + ' ' + today.year],
            options: null,
            report_type: null,
            title: this.props.action ? this.props.action.display_name : 'Tax Report',
        });

        onWillStart(async () => {
            await this.load_data();
        });
    }

    async load_data() {
        try {
            const data = await this.orm.call("tax.report", "view_report", []);
            this.state.data = data;
            this.calculateTotals(data);
        } catch (error) {
            console.error("Error loading tax report data:", error);
        }
    }

    calculateTotals(data) {
        let saleTotal = 0.0;
        let saleNet = 0.0;
        let purchaseTotal = 0.0;
        let purchaseNet = 0.0;

        if (data && data.sale && Array.isArray(data.sale)) {
            data.sale.forEach(line => {
                saleTotal += parseFloat(line.tax) || 0.0;
                saleNet += parseFloat(line.net) || 0.0;
            });
        }

        if (data && data.purchase && Array.isArray(data.purchase)) {
            data.purchase.forEach(line => {
                purchaseTotal += parseFloat(line.tax) || 0.0;
                purchaseNet += parseFloat(line.net) || 0.0;
            });
        }

        this.state.sale_total = saleTotal;
        this.state.sale_net_total = saleNet;
        this.state.purchase_total = purchaseTotal;
        this.state.purchase_net_total = purchaseNet;
        if (data && data.currency) {
            this.state.currency = data.currency;
        }
    }

    get net_tax_position() {
        return this.state.sale_total - this.state.purchase_total;
    }

    get net_tax_base() {
        return this.state.sale_net_total - this.state.purchase_net_total;
    }

    get total_taxable_base() {
        return this.state.sale_net_total + this.state.purchase_net_total;
    }

    formatNumber(val) {
        if (val === undefined || val === null || val === '') return '0.00';
        let num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    formatCurrency(val) {
        return (this.state.currency || 'LE') + ' ' + this.formatNumber(val);
    }

    async applyDatePreset(preset, label) {
        let startVal = '';
        let endVal = '';
        let dateView = '';

        if (preset === 'month') {
            startVal = today.startOf('month').toFormat('yyyy-MM-dd');
            endVal = today.endOf('month').toFormat('yyyy-MM-dd');
            dateView = today.monthShort + ' ' + today.year;
            this.state.date_type = 'month';
        } else if (preset === 'quarter') {
            startVal = today.startOf('quarter').toFormat('yyyy-MM-dd');
            endVal = today.endOf('quarter').toFormat('yyyy-MM-dd');
            dateView = 'Q' + today.quarter + ' ' + today.year;
            this.state.date_type = 'quarter';
        } else if (preset === 'year') {
            startVal = today.startOf('year').toFormat('yyyy-MM-dd');
            endVal = today.endOf('year').toFormat('yyyy-MM-dd');
            dateView = String(today.year);
            this.state.date_type = 'year';
        } else if (preset === 'last-month') {
            const lastM = today.minus({ months: 1 });
            startVal = lastM.startOf('month').toFormat('yyyy-MM-dd');
            endVal = lastM.endOf('month').toFormat('yyyy-MM-dd');
            dateView = lastM.monthShort + ' ' + lastM.year;
            this.state.date_type = 'month';
        } else if (preset === 'last-quarter') {
            const lastQ = today.minus({ quarters: 1 });
            startVal = lastQ.startOf('quarter').toFormat('yyyy-MM-dd');
            endVal = lastQ.endOf('quarter').toFormat('yyyy-MM-dd');
            dateView = 'Q' + lastQ.quarter + ' ' + lastQ.year;
            this.state.date_type = 'quarter';
        } else if (preset === 'last-year') {
            const lastY = today.minus({ years: 1 });
            startVal = lastY.startOf('year').toFormat('yyyy-MM-dd');
            endVal = lastY.endOf('year').toFormat('yyyy-MM-dd');
            dateView = String(lastY.year);
            this.state.date_type = 'year';
        }

        this.state.start_date = startVal;
        this.state.end_date = endVal;
        this.state.date_filter_label = label || dateView;
        this.state.date_viewed = [dateView];
        this.state.comparison_type = this.state.date_type;
        this.state.date_range = preset;

        if (this.start_date_ref && this.start_date_ref.el) this.start_date_ref.el.value = startVal;
        if (this.end_date_ref && this.end_date_ref.el) this.end_date_ref.el.value = endVal;

        await this.fetchFilteredData();
    }

    async applyCustomDates() {
        const startVal = this.start_date_ref && this.start_date_ref.el ? this.start_date_ref.el.value : this.state.start_date;
        const endVal = this.end_date_ref && this.end_date_ref.el ? this.end_date_ref.el.value : this.state.end_date;
        this.state.start_date = startVal;
        this.state.end_date = endVal;
        this.state.date_filter_label = `${startVal} to ${endVal}`;
        this.state.date_viewed = [`${startVal} to ${endVal}`];
        await this.fetchFilteredData();
    }

    async toggleDraftEntries() {
        if (this.state.options && this.state.options.draft) {
            this.state.options = null;
        } else {
            this.state.options = { draft: true };
        }
        await this.fetchFilteredData();
    }

    async setReportGrouping(type) {
        if (type === 'global') {
            this.state.report_type = null;
        } else if (type === 'account') {
            this.state.report_type = { account: true };
        } else if (type === 'tax') {
            this.state.report_type = { tax: true };
        }
        await this.fetchFilteredData();
    }

    async applyComparisonPeriod() {
        const count = this.period_ref && this.period_ref.el ? parseInt(this.period_ref.el.value, 10) : 1;
        this.state.apply_comparison = true;
        this.state.comparison_type = this.state.date_type || 'month';
        this.state.comparison_number = count || 1;
        await this.fetchFilteredData();
    }

    async applyComparisonYear() {
        const count = this.period_year_ref && this.period_year_ref.el ? parseInt(this.period_year_ref.el.value, 10) : 1;
        this.state.apply_comparison = true;
        this.state.comparison_type = 'year';
        this.state.comparison_number = count || 1;
        await this.fetchFilteredData();
    }

    async removeComparison() {
        this.state.apply_comparison = false;
        this.state.comparison_type = null;
        this.state.comparison_number = null;
        if (this.state.date_viewed.length > 1) {
            this.state.date_viewed = [this.state.date_viewed[0]];
        }
        await this.fetchFilteredData();
    }

    async fetchFilteredData() {
        try {
            const data = await this.orm.call("tax.report", "get_filter_values", [
                this.state.start_date,
                this.state.end_date,
                this.state.comparison_number,
                this.state.comparison_type,
                this.state.options,
                this.state.report_type,
            ]);
            this.state.data = data;
            this.calculateTotals(data);

            if (data && data.dynamic_date_num) {
                const dateViewed = [];
                const iterable = Array.isArray(data.dynamic_date_num)
                    ? data.dynamic_date_num
                    : Object.values(data.dynamic_date_num);
                for (const d of iterable) {
                    if (!dateViewed.includes(d)) {
                        dateViewed.push(d);
                    }
                }
                if (dateViewed.length > 0) {
                    this.state.date_viewed = dateViewed.reverse();
                }
            }
        } catch (error) {
            console.error("Error fetching filtered tax report:", error);
        }
    }

    get comparison_number_range() {
        const range = [];
        const num = parseInt(this.state.comparison_number, 10) || 0;
        for (let i = 1; i <= num; i++) {
            range.push(i);
        }
        return range.reverse();
    }

    filter() {
        return {
            'options': this.state.options,
            'comparison_type': this.state.comparison_type,
            'comparison_number_range': this.state.comparison_number,
            'start_date': this.state.start_date,
            'end_date': this.state.end_date,
        };
    }

    async printPdf(ev) {
        if (ev) ev.preventDefault();
        const action_title = this.props.action ? this.props.action.display_name : 'Tax Report';
        let comparison_number_range = this.comparison_number_range;
        let date_viewed = this.state.date_viewed;

        if (this.state.apply_comparison && this.comparison_number_range.length > 10) {
            comparison_number_range = this.comparison_number_range.slice(-10);
            date_viewed = this.state.date_viewed.slice(-11);
        }

        return this.action.doAction({
            'type': 'ir.actions.report',
            'report_type': 'qweb-pdf',
            'report_name': 'dynamic_accounts_report.tax_report',
            'report_file': 'dynamic_accounts_report.tax_report',
            'data': {
                'data': this.state.data,
                'sale_total': this.state.sale_total,
                'sale_net_total': this.state.sale_net_total,
                'purchase_total': this.state.purchase_total,
                'purchase_net_total': this.state.purchase_net_total,
                'net_tax_position': this.net_tax_position,
                'currency': this.state.currency || 'LE',
                'date_viewed': date_viewed,
                'apply_comparison': this.state.apply_comparison,
                'comparison_number_range': comparison_number_range,
                'report_type': this.state.report_type,
                'filters': this.filter(),
                'title': action_title,
                'report_name': action_title
            },
            'display_name': action_title,
        });
    }

    async print_xlsx() {
        const action_title = this.props.action ? this.props.action.display_name : 'Tax Report';
        const datas = {
            'data': this.state.data,
            'sale_total': this.state.sale_total,
            'purchase_total': this.state.purchase_total,
            'date_viewed': this.state.date_viewed,
            'apply_comparison': this.state.apply_comparison,
            'comparison_number_range': this.comparison_number_range,
            'report_type': this.state.report_type,
            'filters': this.filter(),
            'title': action_title,
            'report_name': action_title
        };
        const action = {
            'data': {
                'model': 'tax.report',
                'data': JSON.stringify(datas),
                'output_format': 'xlsx',
                'report_action': this.props.action ? this.props.action.id : '',
                'report_name': action_title,
            },
        };
        await download({
            url: '/xlsx_report',
            data: action.data,
        });
    }
}

TaxReport.template = 'tax_r_template_new';
actionRegistry.add("tax_r", TaxReport);
