/** @odoo-module */
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, useRef, useState } from "@odoo/owl";
import { BlockUI } from "@web/core/ui/block_ui";
import { download } from "@web/core/network/download";

const actionRegistry = registry.category("actions");

class PartnerLedger extends Component {
    setup() {
        super.setup(...arguments);
        this.initial_render = true;
        this.orm = useService('orm');
        this.action = useService('action');
        this.dialog = useService("dialog");

        this.state = useState({
            report_mode: 'detailed',       // 'detailed' or 'summary'
            search_query: '',              // real-time search term
            partner_type: 'all',           // 'all', 'customer', 'vendor'
            partner_type_label: 'All Partners',
            date_range_label: 'Date Range',
            expanded_partners: {},         // partner_name -> boolean
            is_unfolded_all: false,

            partners: null,
            visible_partners: [],
            data: null,
            total: null,
            summary_list: [],
            filtered_summary: [],
            title: null,
            currency: 'LE',
            filter_applied: null,

            selected_partner: [],
            selected_partner_rec: [],
            all_partners: [],
            filtered_partners: [],

            total_debit: 0,
            total_debit_display: '0.00 LE',
            total_credit: 0,
            total_credit_display: '0.00 LE',
            total_initial: 0,
            total_initial_display: '0.00 LE',
            total_balance: 0,
            total_balance_display: '0.00 LE',

            date_range: null,
            account: null,
            options: null,
            selected_tags: [],
            selected_tag_ids: [],
            all_tags: [],
            filtered_tags: [],
            selected_accounts: [],
            selected_account_ids: [],
            all_accounts: [],
            filtered_accounts: [],
        });

        this.load_data();
        this.loadPartners();
        this.loadTags();
        this.loadAccounts();
    }

    // ==================== NUMBER & AMOUNT FORMATTING ====================
    formatAmount(amount, currency = null) {
        const curr = currency || this.state.currency || 'LE';
        if (amount === undefined || amount === null || isNaN(amount)) {
            return `0.00 ${curr}`;
        }
        const val = Number(amount);
        const formatted = Math.abs(val).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        if (val < 0) {
            return `-${formatted} ${curr}`;
        }
        return `${formatted} ${curr}`;
    }

    formatNumberWithSeparators(number) {
        const parsedNumber = parseFloat(number);
        if (isNaN(parsedNumber)) {
            return "0.00";
        }
        return parsedNumber.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // ==================== PARTNER, TAG, ACCOUNT LOADERS ====================
    async loadPartners() {
        try {
            const partners = await this.orm.searchRead(
                'res.partner',
                [],
                ['id', 'name', 'display_name', 'ref'],
                { limit: 200, order: 'name' }
            );
            this.state.all_partners = partners;
            this.state.filtered_partners = partners;
        } catch (error) {
            console.error('Error loading partners:', error);
        }
    }

    async loadTags() {
        try {
            const tags = await this.orm.searchRead(
                'res.partner.category',
                [],
                ['id', 'name'],
                { limit: 200, order: 'name' }
            );
            this.state.all_tags = tags;
            this.state.filtered_tags = tags;
        } catch (error) {
            console.error('Error loading tags:', error);
        }
    }

    async loadAccounts() {
        try {
            const accounts = await this.orm.searchRead(
                'account.account',
                [['account_type', 'in', ['asset_receivable', 'liability_payable']]],
                ['id', 'name', 'code', 'account_type'],
                { limit: 200, order: 'code' }
            );
            this.state.all_accounts = accounts;
            this.state.filtered_accounts = accounts;
        } catch (error) {
            console.error('Error loading accounts:', error);
        }
    }

    // ==================== DATA LOADING & PROCESSING ====================
    async load_data() {
        const action_title = this.props.action.display_name;
        this.state.title = action_title;
        try {
            const rawData = await this.orm.call(
                "account.partner.ledger",
                "view_report",
                [[this.wizard_id], action_title]
            );
            this._processReportData(rawData);
        } catch (error) {
            console.error('Error loading partner ledger data:', error);
        }
    }

    _processReportData(data) {
        if (!data) return;

        let partner_list = [];
        let partner_totals = data.partner_totals || {};
        let summary_list = [];

        let totalDebitSum = 0;
        let totalCreditSum = 0;
        let totalInitialSum = 0;
        let totalFinalSum = 0;
        let currency = this.state.currency || 'LE';

        // 1. Process move lines
        const reservedKeys = ['partner_totals', 'summary_list', 'grand_total'];
        Object.entries(data).forEach(([key, value]) => {
            if (!reservedKeys.includes(key)) {
                partner_list.push(key);
                if (Array.isArray(value)) {
                    value.forEach(entry => {
                        if (entry && entry[0]) {
                            entry[0].debit_display = this.formatNumberWithSeparators(entry[0].debit || 0);
                            entry[0].credit_display = this.formatNumberWithSeparators(entry[0].credit || 0);
                            entry[0].amount_currency_display = this.formatNumberWithSeparators(entry[0].amount_currency || 0);
                            if (entry[0].balance !== undefined) {
                                entry[0].balance_display = this.formatNumberWithSeparators(entry[0].balance || 0);
                            }
                        }
                    });
                }
            }
        });

        // 2. Process totals & build summary items
        Object.entries(partner_totals).forEach(([partnerName, pTotal]) => {
            if (pTotal && typeof pTotal === 'object') {
                currency = pTotal.currency_id || currency;
                const deb = pTotal.total_debit || 0;
                const cred = pTotal.total_credit || 0;
                const init = pTotal.initial_balance || 0;
                const finalBal = (pTotal.final_balance !== undefined) ? pTotal.final_balance : (init + deb - cred);

                totalDebitSum += deb;
                totalCreditSum += cred;
                totalInitialSum += init;
                totalFinalSum += finalBal;

                pTotal.total_debit_display = this.formatNumberWithSeparators(deb);
                pTotal.total_credit_display = this.formatNumberWithSeparators(cred);
                pTotal.initial_balance_display = this.formatNumberWithSeparators(init);
                pTotal.final_balance_display = this.formatNumberWithSeparators(finalBal);

                summary_list.push({
                    partner_id: pTotal.partner_id,
                    partner_name: partnerName,
                    partner_ref: pTotal.partner_ref || '',
                    partner_vat: pTotal.partner_vat || '',
                    initial_balance: init,
                    total_debit: deb,
                    total_credit: cred,
                    final_balance: finalBal,
                    currency_id: currency,
                    is_customer: pTotal.is_customer,
                    is_vendor: pTotal.is_vendor,
                });
            }
        });

        this.state.data = data;
        this.state.total = partner_totals;
        this.state.partners = partner_list;
        this.state.summary_list = summary_list;
        this.state.currency = currency;

        this.state.total_debit = totalDebitSum;
        this.state.total_debit_display = this.formatAmount(totalDebitSum, currency);
        this.state.total_credit = totalCreditSum;
        this.state.total_credit_display = this.formatAmount(totalCreditSum, currency);
        this.state.total_initial = totalInitialSum;
        this.state.total_initial_display = this.formatAmount(totalInitialSum, currency);
        this.state.total_balance = totalFinalSum;
        this.state.total_balance_display = this.formatAmount(totalFinalSum, currency);

        this._applyLocalFilters();
    }

    // ==================== DYNAMIC SEARCH & LOCAL FILTERS ====================
    onSearchInput(ev) {
        this.state.search_query = (ev.target.value || '').trim().toLowerCase();
        this._applyLocalFilters();
    }

    setPartnerType(type) {
        this.state.partner_type = type;
        if (type === 'customer') {
            this.state.partner_type_label = 'Customers Only (عملاء)';
            this.state.account = { 'Receivable': true };
        } else if (type === 'vendor') {
            this.state.partner_type_label = 'Vendors Only (موردين)';
            this.state.account = { 'Payable': true };
        } else {
            this.state.partner_type_label = 'All Partners (الكل)';
            this.state.account = null;
        }
        this.applyAllFilters();
    }

    setReportMode(mode) {
        this.state.report_mode = mode;
        this._applyLocalFilters();
    }

    toggleReportMode() {
        this.setReportMode(this.state.report_mode === 'detailed' ? 'summary' : 'detailed');
    }

    _applyLocalFilters() {
        const query = this.state.search_query;
        const type = this.state.partner_type;

        // Filter Detailed Partners
        if (this.state.partners && this.state.total) {
            this.state.visible_partners = this.state.partners.filter(partnerName => {
                const pTotal = this.state.total[partnerName] || {};
                const nameMatch = !query || partnerName.toLowerCase().includes(query) || (pTotal.partner_ref || '').toLowerCase().includes(query);
                if (!nameMatch) return false;

                if (type === 'customer' && !pTotal.is_customer) return false;
                if (type === 'vendor' && !pTotal.is_vendor) return false;
                return true;
            });
        } else {
            this.state.visible_partners = [];
        }

        // Filter Summary List
        if (this.state.summary_list) {
            this.state.filtered_summary = this.state.summary_list.filter(item => {
                const nameMatch = !query || item.partner_name.toLowerCase().includes(query) || item.partner_ref.toLowerCase().includes(query);
                if (!nameMatch) return false;

                if (type === 'customer' && !item.is_customer) return false;
                if (type === 'vendor' && !item.is_vendor) return false;
                return true;
            });
        } else {
            this.state.filtered_summary = [];
        }
    }

    // ==================== FOLD / UNFOLD LOGIC ====================
    togglePartner(partnerName) {
        this.state.expanded_partners[partnerName] = !this.state.expanded_partners[partnerName];
    }

    isExpanded(partnerName) {
        return !!this.state.expanded_partners[partnerName];
    }

    unfoldAll() {
        this.state.is_unfolded_all = !this.state.is_unfolded_all;
        if (this.state.partners) {
            this.state.partners.forEach(p => {
                this.state.expanded_partners[p] = this.state.is_unfolded_all;
            });
        }
    }

    // ==================== DRILL-DOWN INTERACTIONS ====================
    // ==================== DRILL-DOWN INTERACTIONS ====================
    openPartner(arg) {
        let partnerId = arg;
        if (arg && typeof arg === 'object' && arg.target) {
            partnerId = arg.currentTarget?.dataset?.id || arg.target?.dataset?.id || (arg.target.getAttribute && arg.target.getAttribute('data-id'));
        }
        if (!partnerId) return;
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: 'res.partner',
            res_id: parseInt(partnerId, 10),
            views: [[false, "form"]],
            target: "current",
        });
    }

    openPartnerInvoices(partnerId, partnerName) {
        if (!partnerId) return;
        const domain = [
            ['partner_id', '=', parseInt(partnerId, 10)],
            ['move_type', 'in', ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']],
        ];
        const dateFilter = this.filter();
        if (dateFilter.start_date) domain.push(['date', '>=', dateFilter.start_date]);
        if (dateFilter.end_date) domain.push(['date', '<=', dateFilter.end_date]);

        return this.action.doAction({
            type: "ir.actions.act_window",
            name: `Invoices: ${partnerName || ''}`,
            res_model: 'account.move',
            domain: domain,
            views: [[false, "list"], [false, "form"]],
            target: "current",
        });
    }

    openPartnerPayments(partnerId, partnerName) {
        if (!partnerId) return;
        const domain = [
            ['partner_id', '=', parseInt(partnerId, 10)],
        ];
        const dateFilter = this.filter();
        if (dateFilter.start_date) domain.push(['date', '>=', dateFilter.start_date]);
        if (dateFilter.end_date) domain.push(['date', '<=', dateFilter.end_date]);

        return this.action.doAction({
            type: "ir.actions.act_window",
            name: `Payments: ${partnerName || ''}`,
            res_model: 'account.payment',
            domain: domain,
            views: [[false, "list"], [false, "form"]],
            target: "current",
        });
    }

    gotoJournalEntry(arg) {
        let moveId = arg;
        if (arg && typeof arg === 'object' && arg.target) {
            moveId = arg.currentTarget?.dataset?.id || arg.target?.dataset?.id || (arg.target.getAttribute && arg.target.getAttribute('data-id'));
        }
        if (!moveId) return;
        const id = Array.isArray(moveId) ? moveId[0] : moveId;
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: 'account.move',
            res_id: parseInt(id, 10),
            views: [[false, "form"]],
            target: "current",
        });
    }

    gotoJournalItem(arg) {
        let partnerId = arg;
        if (arg && typeof arg === 'object' && arg.target) {
            partnerId = arg.currentTarget?.dataset?.id || arg.target?.dataset?.id || (arg.target.getAttribute && arg.target.getAttribute('data-id'));
        }
        if (!partnerId) return;
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: 'account.move.line',
            name: "Journal Items",
            views: [[false, "list"]],
            domain: [
                ["partner_id", "=", parseInt(partnerId, 10)],
                ['account_type', 'in', ['liability_payable', 'asset_receivable']]
            ],
            target: "current",
        });
    }

    // ==================== FILTERING ENGINE ====================
    async applyFilter(val) {
        if (val && val.target) {
            const target = val.target;
            const dataValue = target.attributes["data-value"] ? target.attributes["data-value"].value : null;

            if (target.name === 'start_date') {
                this.state.date_range = { ...this.state.date_range, start_date: target.value };
                this.state.date_range_label = `${target.value || ''} - ${(this.state.date_range && this.state.date_range.end_date) || ''}`;
            } else if (target.name === 'end_date') {
                this.state.date_range = { ...this.state.date_range, end_date: target.value };
                this.state.date_range_label = `${(this.state.date_range && this.state.date_range.start_date) || ''} - ${target.value || ''}`;
            } else if (dataValue) {
                if (['month', 'year', 'quarter', 'last-month', 'last-year', 'last-quarter'].includes(dataValue)) {
                    this.state.date_range = dataValue;
                    const labels = {
                        'month': 'This Month',
                        'quarter': 'This Quarter',
                        'year': 'This Year',
                        'last-month': 'Last Month',
                        'last-quarter': 'Last Quarter',
                        'last-year': 'Last Year'
                    };
                    this.state.date_range_label = labels[dataValue] || dataValue;
                } else if (dataValue === 'receivable') {
                    this.setPartnerType('customer');
                    return;
                } else if (dataValue === 'payable') {
                    this.setPartnerType('vendor');
                    return;
                } else if (dataValue === 'all_types') {
                    this.setPartnerType('all');
                    return;
                } else if (dataValue === 'draft') {
                    if (this.state.options && this.state.options.draft) {
                        this.state.options = null;
                    } else {
                        this.state.options = { 'draft': true };
                    }
                }
            }
            await this.applyAllFilters();
        }
    }

    async applyAllFilters() {
        try {
            const filtered_data = await this.orm.call(
                "account.partner.ledger",
                "get_filter_values",
                [
                    this.state.selected_partner,
                    this.state.date_range,
                    this.state.account,
                    this.state.options,
                    this.state.selected_tag_ids,
                    this.state.selected_account_ids
                ]
            );
            this._processReportData(filtered_data);
        } catch (error) {
            console.error('Error applying filters:', error);
        }
    }

    filter() {
        let filters = {
            'partner': this.state.selected_partner_rec,
            'account': this.state.account,
            'options': this.state.options,
            'start_date': null,
            'end_date': null,
        };
        if (this.state.date_range && typeof this.state.date_range === 'object') {
            filters.start_date = this.state.date_range.start_date || null;
            filters.end_date = this.state.date_range.end_date || null;
        }
        return filters;
    }

    // ==================== PARTNER, TAG, ACCOUNT SELECTION ====================
    searchPartners(ev) {
        const searchTerm = ev.target.value.toLowerCase();
        if (!searchTerm) {
            this.state.filtered_partners = this.state.all_partners;
        } else {
            this.state.filtered_partners = this.state.all_partners.filter(partner => {
                const name = (partner.display_name || partner.name || '').toLowerCase();
                const ref = (partner.ref || '').toLowerCase();
                return name.includes(searchTerm) || ref.includes(searchTerm);
            });
        }
    }

    selectPartner(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const partnerId = parseInt(ev.target.dataset.partnerId, 10);
        if (this.state.selected_partner.includes(partnerId)) return;
        const partner = this.state.all_partners.find(p => p.id === partnerId);
        if (partner) {
            this.state.selected_partner.push(partnerId);
            this.state.selected_partner_rec.push(partner);
            this.applyAllFilters();
        }
    }

    removePartner(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const partnerId = parseInt(ev.target.dataset.partnerId, 10);
        const partnerIndex = this.state.selected_partner.indexOf(partnerId);
        if (partnerIndex > -1) {
            this.state.selected_partner.splice(partnerIndex, 1);
            this.state.selected_partner_rec.splice(partnerIndex, 1);
            this.applyAllFilters();
        }
    }

    clearAllPartners(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        this.state.selected_partner = [];
        this.state.selected_partner_rec = [];
        this.applyAllFilters();
    }

    searchTags(ev) {
        const searchTerm = ev.target.value.toLowerCase();
        if (!searchTerm) {
            this.state.filtered_tags = this.state.all_tags;
        } else {
            this.state.filtered_tags = this.state.all_tags.filter(tag => tag.name.toLowerCase().includes(searchTerm));
        }
    }

    selectTag(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const tagId = parseInt(ev.target.dataset.tagId, 10);
        if (this.state.selected_tag_ids.includes(tagId)) return;
        const tag = this.state.all_tags.find(t => t.id === tagId);
        if (tag) {
            this.state.selected_tag_ids.push(tagId);
            this.state.selected_tags.push(tag);
            this.applyAllFilters();
        }
    }

    removeTag(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const tagId = parseInt(ev.target.dataset.tagId, 10);
        const tagIndex = this.state.selected_tag_ids.indexOf(tagId);
        if (tagIndex > -1) {
            this.state.selected_tag_ids.splice(tagIndex, 1);
            this.state.selected_tags.splice(tagIndex, 1);
            this.applyAllFilters();
        }
    }

    clearAllTags(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        this.state.selected_tag_ids = [];
        this.state.selected_tags = [];
        this.applyAllFilters();
    }

    searchAccounts(ev) {
        const searchTerm = ev.target.value.toLowerCase();
        if (!searchTerm) {
            this.state.filtered_accounts = this.state.all_accounts;
        } else {
            this.state.filtered_accounts = this.state.all_accounts.filter(acc => {
                const code = (acc.code || '').toLowerCase();
                const name = (acc.name || '').toLowerCase();
                return code.includes(searchTerm) || name.includes(searchTerm);
            });
        }
    }

    selectAccount(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const accountId = parseInt(ev.target.dataset.accountId, 10);
        if (this.state.selected_account_ids.includes(accountId)) return;
        const account = this.state.all_accounts.find(a => a.id === accountId);
        if (account) {
            this.state.selected_account_ids.push(accountId);
            this.state.selected_accounts.push(account);
            this.applyAllFilters();
        }
    }

    removeAccount(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const accountId = parseInt(ev.target.dataset.accountId, 10);
        const accountIndex = this.state.selected_account_ids.indexOf(accountId);
        if (accountIndex > -1) {
            this.state.selected_account_ids.splice(accountIndex, 1);
            this.state.selected_accounts.splice(accountIndex, 1);
            this.applyAllFilters();
        }
    }

    clearAllAccounts(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        this.state.selected_account_ids = [];
        this.state.selected_accounts = [];
        this.applyAllFilters();
    }

    // ==================== PRINT PDF & EXPORT XLSX ====================
    async printPdf(ev) {
        ev.preventDefault();
        const totals = {
            'total_debit': this.state.total_debit,
            'total_debit_display': this.state.total_debit_display,
            'total_credit': this.state.total_credit,
            'total_credit_display': this.state.total_credit_display,
            'total_initial': this.state.total_initial,
            'final_balance': this.state.total_balance,
            'currency': this.state.currency,
        };
        const action_title = this.props.action.display_name;
        return this.action.doAction({
            'type': 'ir.actions.report',
            'report_type': 'qweb-pdf',
            'report_name': 'dynamic_accounts_report.partner_ledger',
            'report_file': 'dynamic_accounts_report.partner_ledger',
            'data': {
                'partners': this.state.visible_partners,
                'filters': this.filter(),
                'grand_total': totals,
                'data': this.state.data,
                'total': this.state.total,
                'title': action_title,
                'report_name': action_title,
                'is_unfolded_all': this.state.is_unfolded_all,
                'expanded_partners': this.state.expanded_partners || {},
            },
            'display_name': action_title,
        });
    }

    async print_xlsx() {
        const action_title = this.props.action.display_name;
        const totals = {
            'total_debit': this.state.total_debit,
            'total_credit': this.state.total_credit,
            'total_initial': this.state.total_initial,
            'final_balance': this.state.total_balance,
            'currency': this.state.currency,
        };
        const datas = {
            'partners': this.state.visible_partners,
            'data': this.state.data,
            'total': this.state.total,
            'title': action_title,
            'filters': this.filter(),
            'grand_total': totals,
        };
        const action = {
            'data': {
                'model': 'account.partner.ledger',
                'data': JSON.stringify(datas),
                'output_format': 'xlsx',
                'report_action': this.props.action.xml_id,
                'report_name': action_title,
            },
        };
        BlockUI;
        await download({
            url: '/xlsx_report',
            data: action.data,
            complete: () => unblockUI,
            error: (error) => this.call('crash_manager', 'rpc_error', error),
        });
    }
}

PartnerLedger.defaultProps = {
    resIds: [],
};
PartnerLedger.template = 'pl_template_new';
actionRegistry.add("p_l", PartnerLedger);
