# -*- coding: utf-8 -*-
################################################################################
#
#    Cybrosys Technologies Pvt. Ltd.
#
#    Copyright (C) 2024-TODAY Cybrosys Technologies(<https://www.cybrosys.com>)
#    Author: Bhagyadev KP (<https://www.cybrosys.com>)
#
#    You can modify it under the terms of the GNU LESSER
#    GENERAL PUBLIC LICENSE (LGPL v3), Version 3.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU LESSER GENERAL PUBLIC LICENSE (LGPL v3) for more details.
#
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
################################################################################
import io
import json
from collections import defaultdict
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
import xlsxwriter

from odoo import api, fields, models
from odoo.tools import date_utils


class AccountPartnerLedger(models.TransientModel):
    """For creating Partner Ledger and Customer/Vendor Debt Summary reports"""
    _name = 'account.partner.ledger'
    _description = 'Partner Ledger Report'

    @api.model
    def _get_date_bounds(self, data_range):
        """
        Resolves date presets or custom start/end dates into (start_date, end_date) as date objects.
        Safely handles month transitions, quarters, and custom date ranges.
        """
        today = fields.Date.today()
        start_date = None
        end_date = None

        if isinstance(data_range, str):
            if data_range == 'month':
                start_date = today.replace(day=1)
                next_month = start_date + relativedelta(months=1)
                end_date = next_month - relativedelta(days=1)
            elif data_range == 'quarter':
                start_date, end_date = date_utils.get_quarter(today)
            elif data_range == 'year':
                start_date = today.replace(month=1, day=1)
                end_date = today.replace(month=12, day=31)
            elif data_range == 'last-month':
                first_of_this_month = today.replace(day=1)
                start_date = first_of_this_month - relativedelta(months=1)
                end_date = first_of_this_month - relativedelta(days=1)
            elif data_range == 'last-quarter':
                quarter_start, _ = date_utils.get_quarter(today)
                start_date = quarter_start - relativedelta(months=3)
                end_date = quarter_start - relativedelta(days=1)
            elif data_range == 'last-year':
                start_date = today.replace(year=today.year - 1, month=1, day=1)
                end_date = today.replace(year=today.year - 1, month=12, day=31)
        elif isinstance(data_range, dict):
            if data_range.get('start_date'):
                try:
                    start_date = fields.Date.to_date(data_range['start_date'])
                except Exception:
                    start_date = None
            if data_range.get('end_date'):
                try:
                    end_date = fields.Date.to_date(data_range['end_date'])
                except Exception:
                    end_date = None

        return start_date, end_date

    @api.model
    def view_report(self, option=None, tag=None):
        """
        Retrieve partner-related data for initial report rendering.
        Uses optimized get_filter_values with safe defaults.
        """
        return self.get_filter_values(
            partner_id=None,
            data_range=None,
            account=None,
            options=None,
            tag_ids=None,
            account_ids=None
        )

    @api.model
    def get_filter_values(self, partner_id, data_range, account, options, tag_ids=None, account_ids=None, report_mode=None, search_query=None):
        """
        Retrieve filtered partner data for Detailed Partner Ledger and Summary Debt Reports.
        Optimized with batch aggregation (read_group) for high performance and strict accounting accuracy.
        """
        if options == {}:
            options = None
        if account == {}:
            account = None

        # Determine target account types (Receivable / Payable)
        account_type_domain = []
        if account is None or ('Receivable' in account and 'Payable' in account):
            account_type_domain = ['asset_receivable', 'liability_payable']
        elif 'Receivable' in account:
            account_type_domain = ['asset_receivable']
        elif 'Payable' in account:
            account_type_domain = ['liability_payable']
        else:
            account_type_domain = ['asset_receivable', 'liability_payable']

        # Determine target move state (posted or posted+draft)
        option_domain = ['posted']
        if options and 'draft' in options:
            option_domain = ['posted', 'draft']

        # Resolve date boundaries
        start_date, end_date = self._get_date_bounds(data_range)

        # Handle partner tag filter
        partners_with_tags = None
        if tag_ids:
            partners_with_tags = set(self.env['res.partner'].search([
                ('category_id', 'in', tag_ids)
            ]).ids)

        # Resolve target partner IDs
        selected_partner_ids = None
        if partner_id:
            if isinstance(partner_id, int):
                selected_partner_ids = [partner_id]
            else:
                selected_partner_ids = list(partner_id)
            if partners_with_tags is not None:
                selected_partner_ids = list(set(selected_partner_ids) & partners_with_tags)
        elif partners_with_tags is not None:
            selected_partner_ids = list(partners_with_tags)

        current_company_id = self.env.company.id

        # 1. Compute Initial Balances (before start_date)
        # Accurate accounting: Uses date < start_date across all journal items
        init_by_partner = {}
        if start_date:
            domain_initial = [
                ('account_type', 'in', account_type_domain),
                ('parent_state', 'in', option_domain),
                ('company_id', '=', current_company_id),
                ('partner_id', '!=', False),
                ('date', '<', start_date),
            ]
            if account_ids:
                domain_initial.append(('account_id', 'in', account_ids))
            if selected_partner_ids is not None:
                domain_initial.append(('partner_id', 'in', selected_partner_ids))

            initial_groups = self.env['account.move.line'].read_group(
                domain_initial,
                ['partner_id', 'debit:sum', 'credit:sum'],
                ['partner_id'],
                lazy=False
            )
            for grp in initial_groups:
                pid = grp['partner_id'][0] if grp.get('partner_id') else None
                if pid:
                    deb = grp.get('debit', 0.0) or 0.0
                    cred = grp.get('credit', 0.0) or 0.0
                    init_by_partner[pid] = {
                        'debit': deb,
                        'credit': cred,
                        'balance': deb - cred
                    }

        # 2. Fetch Period Move Lines (within start_date and end_date)
        domain_period = [
            ('account_type', 'in', account_type_domain),
            ('parent_state', 'in', option_domain),
            ('company_id', '=', current_company_id),
            ('partner_id', '!=', False),
        ]
        if account_ids:
            domain_period.append(('account_id', 'in', account_ids))
        if selected_partner_ids is not None:
            domain_period.append(('partner_id', 'in', selected_partner_ids))
        if start_date:
            domain_period.append(('date', '>=', start_date))
        if end_date:
            domain_period.append(('date', '<=', end_date))

        period_move_lines = self.env['account.move.line'].search(
            domain_period,
            order='date ASC, id ASC'
        )

        moves_by_partner = defaultdict(list)
        for ml in period_move_lines:
            moves_by_partner[ml.partner_id.id].append(ml)

        # 3. Identify all relevant partners
        if selected_partner_ids is not None:
            target_pids = set(selected_partner_ids)
        else:
            target_pids = set(init_by_partner.keys()) | set(moves_by_partner.keys())

        if not target_pids:
            return {'partner_totals': {}}

        partners = self.env['res.partner'].browse(list(target_pids)).sorted(key=lambda p: (p.name or '').lower())

        partner_dict = {}
        partner_totals = {}
        summary_list = []

        currency_symbol = self.env.company.currency_id.symbol or ''
        grand_total_debit = 0.0
        grand_total_credit = 0.0
        grand_total_initial = 0.0
        grand_total_balance = 0.0

        for partner in partners:
            pid = partner.id
            p_init = init_by_partner.get(pid, {'debit': 0.0, 'credit': 0.0, 'balance': 0.0})
            init_debit = round(p_init['debit'], 2)
            init_credit = round(p_init['credit'], 2)
            init_balance = round(p_init['balance'], 2)

            p_moves = moves_by_partner.get(pid, [])
            p_debit = round(sum(m.debit for m in p_moves), 2)
            p_credit = round(sum(m.credit for m in p_moves), 2)
            p_final_balance = round(init_balance + p_debit - p_credit, 2)

            # Skip partners with 0 initial and 0 period moves unless specifically filtered
            if selected_partner_ids is None and init_balance == 0.0 and p_debit == 0.0 and p_credit == 0.0:
                continue

            # Compute running balance per move line
            running_balance = init_balance
            move_line_list = []
            has_receivable = False
            has_payable = False

            for ml in p_moves:
                running_balance += ml.debit - ml.credit
                if ml.account_type == 'asset_receivable':
                    has_receivable = True
                elif ml.account_type == 'liability_payable':
                    has_payable = True

                account_code = ml.account_id.code or ''
                journal_code = ml.journal_id.code or ''
                date_str = str(ml.date) if ml.date else ''
                maturity_str = str(ml.date_maturity) if ml.date_maturity else ''

                ml_data = {
                    'id': ml.id,
                    'date': date_str,
                    'invoice_date': str(ml.invoice_date or ml.date or ''),
                    'move_name': ml.move_id.name or '',
                    'move_id': [ml.move_id.id, ml.move_id.name or ''],
                    'move_type': ml.move_id.move_type or 'entry',
                    'account_type': ml.account_type,
                    'account_id': [ml.account_id.id, ml.account_id.display_name or ''],
                    'code': account_code,
                    'jrnl': journal_code,
                    'journal_id': [ml.journal_id.id, ml.journal_id.name or ''],
                    'ref': ml.ref or ml.move_id.ref or '',
                    'date_maturity': maturity_str,
                    'matching_number': ml.matching_number or '',
                    'debit': round(ml.debit, 2),
                    'debit_display': "{:,.2f}".format(round(ml.debit, 2)),
                    'credit': round(ml.credit, 2),
                    'credit_display': "{:,.2f}".format(round(ml.credit, 2)),
                    'amount_currency': round(ml.amount_currency, 2),
                    'amount_currency_display': "{:,.2f}".format(round(ml.amount_currency, 2)),
                    'currency_id': ml.currency_id.symbol or currency_symbol,
                    'balance': round(running_balance, 2),
                    'balance_display': "{:,.2f}".format(round(running_balance, 2)),
                }
                move_line_list.append([ml_data])

            partner_name = partner.name or f"Partner #{partner.id}"
            partner_dict[partner_name] = move_line_list

            partner_totals[partner_name] = {
                'partner_id': partner.id,
                'partner_name': partner_name,
                'partner_ref': partner.ref or '',
                'partner_vat': partner.vat or '',
                'currency_id': currency_symbol,
                'initial_balance': init_balance,
                'initial_balance_display': "{:,.2f}".format(init_balance),
                'initial_debit': init_debit,
                'initial_credit': init_credit,
                'move_name': 'Initial Balance',
                'total_debit': p_debit,
                'total_debit_display': "{:,.2f}".format(p_debit),
                'total_credit': p_credit,
                'total_credit_display': "{:,.2f}".format(p_credit),
                'final_balance': p_final_balance,
                'final_balance_display': "{:,.2f}".format(p_final_balance),
                'balance': p_final_balance,
                'is_customer': has_receivable,
                'is_vendor': has_payable,
            }

            summary_list.append({
                'partner_id': partner.id,
                'partner_name': partner_name,
                'partner_ref': partner.ref or '',
                'partner_vat': partner.vat or '',
                'initial_debit': init_debit,
                'initial_credit': init_credit,
                'initial_balance': init_balance,
                'total_debit': p_debit,
                'total_credit': p_credit,
                'final_balance': p_final_balance,
                'currency_id': currency_symbol,
                'moves_count': len(p_moves),
                'is_customer': has_receivable,
                'is_vendor': has_payable,
            })

            grand_total_initial += init_balance
            grand_total_debit += p_debit
            grand_total_credit += p_credit
            grand_total_balance += p_final_balance

        partner_dict['partner_totals'] = partner_totals
        return partner_dict

    @api.model
    def get_xlsx_report(self, data, response, report_name=None, report_action=None, **kwargs):
        """
        Generate an Excel report for Detailed Partner Ledger or Summary Debt Report.
        Accurately writes initial balance, running balances on move lines, and ending totals.
        """
        if isinstance(data, (str, bytes)):

            data = json.loads(data)
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        filters = data.get('filters', {}) or {}
        start_date = filters.get('start_date') or ''
        end_date = filters.get('end_date') or ''
        sheet = workbook.add_worksheet('Partner Ledger')

        # Styles
        head = workbook.add_format({'font_size': 14, 'align': 'center', 'bold': True, 'valign': 'vcenter'})
        sub_heading = workbook.add_format({
            'align': 'center', 'bold': True, 'font_size': 10, 'border': 1,
            'bg_color': '#244a73', 'color': '#ffffff', 'valign': 'vcenter'
        })
        filter_head = workbook.add_format({
            'align': 'left', 'bold': True, 'font_size': 9, 'border': 1,
            'bg_color': '#E8EEF5', 'valign': 'vcenter'
        })
        filter_body = workbook.add_format({
            'align': 'left', 'font_size': 9, 'border': 1, 'valign': 'vcenter'
        })
        partner_head = workbook.add_format({
            'align': 'left', 'bold': True, 'font_size': 10, 'border': 1,
            'bg_color': '#F0F4F8', 'valign': 'vcenter'
        })
        partner_num = workbook.add_format({
            'align': 'right', 'bold': True, 'font_size': 10, 'border': 1,
            'bg_color': '#F0F4F8', 'num_format': '#,##0.00', 'valign': 'vcenter'
        })
        txt_regular = workbook.add_format({'font_size': 9, 'border': 1, 'valign': 'vcenter'})
        num_regular = workbook.add_format({
            'font_size': 9, 'border': 1, 'align': 'right',
            'num_format': '#,##0.00', 'valign': 'vcenter'
        })
        initial_txt = workbook.add_format({
            'font_size': 9, 'border': 1, 'italic': True,
            'bg_color': '#FAFBFD', 'valign': 'vcenter'
        })
        initial_num = workbook.add_format({
            'font_size': 9, 'border': 1, 'align': 'right', 'italic': True,
            'bg_color': '#FAFBFD', 'num_format': '#,##0.00', 'valign': 'vcenter'
        })
        grand_head = workbook.add_format({
            'align': 'left', 'bold': True, 'font_size': 10, 'border': 1,
            'bg_color': '#17365d', 'color': '#ffffff', 'valign': 'vcenter'
        })
        grand_num = workbook.add_format({
            'align': 'right', 'bold': True, 'font_size': 10, 'border': 1,
            'bg_color': '#17365d', 'color': '#ffffff', 'num_format': '#,##0.00', 'valign': 'vcenter'
        })

        # Column widths
        sheet.set_column(0, 0, 14)  # Date / Code
        sheet.set_column(1, 1, 10)  # JRNL
        sheet.set_column(2, 2, 12)  # Account
        sheet.set_column(3, 3, 24)  # Ref / Move Name
        sheet.set_column(4, 4, 14)  # Due Date / Match
        sheet.set_column(5, 5, 16)  # Debit
        sheet.set_column(6, 6, 16)  # Credit
        sheet.set_column(7, 7, 18)  # Balance

        # Title
        sheet.merge_range('A1:H1', report_name or 'Partner Ledger', head)
        sheet.set_row(0, 28)

        # Filters block
        sheet.write('A3', 'Date Range', filter_head)
        sheet.merge_range('B3:D3', f"{start_date or 'From start'} to {end_date or 'Latest'}", filter_body)

        partners_filter_str = 'All Partners'
        if filters.get('partner'):
            names = [p.get('display_name', '') for p in filters['partner'] if p.get('display_name')]
            if names:
                partners_filter_str = ', '.join(names)
        sheet.write('E3', 'Partners', filter_head)
        sheet.merge_range('F3:H3', partners_filter_str, filter_body)

        row = 4
        # Table Headers
        sheet.write(row, 0, 'Date', sub_heading)
        sheet.write(row, 1, 'JRNL', sub_heading)
        sheet.write(row, 2, 'Account', sub_heading)
        sheet.write(row, 3, 'Ref / Entry', sub_heading)
        sheet.write(row, 4, 'Due Date', sub_heading)
        sheet.write(row, 5, 'Debit', sub_heading)
        sheet.write(row, 6, 'Credit', sub_heading)
        sheet.write(row, 7, 'Balance', sub_heading)
        sheet.set_row(row, 22)

        partners = data.get('partners', []) or []
        totals_dict = data.get('total', {}) or {}
        moves_data = data.get('data', {}) or {}

        for partner in partners:
            row += 1
            p_total = totals_dict.get(partner, {})
            tot_debit = float(p_total.get('total_debit', 0.0) or 0.0)
            tot_credit = float(p_total.get('total_credit', 0.0) or 0.0)
            init_balance = float(p_total.get('initial_balance', 0.0) or 0.0)
            final_balance = float(p_total.get('final_balance', init_balance + tot_debit - tot_credit) or 0.0)

            # Partner Header Row
            sheet.merge_range(row, 0, row, 4, f" {partner}", partner_head)
            sheet.write(row, 5, tot_debit, partner_num)
            sheet.write(row, 6, tot_credit, partner_num)
            sheet.write(row, 7, final_balance, partner_num)
            sheet.set_row(row, 20)

            # Initial Balance Row (if non-zero)
            if init_balance != 0.0 or p_total.get('initial_debit') or p_total.get('initial_credit'):
                row += 1
                init_deb = float(p_total.get('initial_debit', 0.0) or 0.0)
                init_cred = float(p_total.get('initial_credit', 0.0) or 0.0)
                sheet.write(row, 0, '', initial_txt)
                sheet.write(row, 1, '', initial_txt)
                sheet.write(row, 2, '', initial_txt)
                sheet.merge_range(row, 3, row, 4, ' Initial Balance', initial_txt)
                sheet.write(row, 5, init_deb, initial_num)
                sheet.write(row, 6, init_cred, initial_num)
                sheet.write(row, 7, init_balance, initial_num)

            # Move Lines
            p_entries = moves_data.get(partner, [])
            for entry in p_entries:
                rec = entry[0] if isinstance(entry, list) and entry else entry
                if not rec:
                    continue
                row += 1
                sheet.write(row, 0, rec.get('date', ''), txt_regular)
                sheet.write(row, 1, rec.get('jrnl', ''), txt_regular)
                sheet.write(row, 2, rec.get('code', ''), txt_regular)
                sheet.write(row, 3, rec.get('move_name') or rec.get('ref') or '', txt_regular)
                sheet.write(row, 4, rec.get('date_maturity', '') or rec.get('matching_number', ''), txt_regular)
                sheet.write(row, 5, float(rec.get('debit', 0.0) or 0.0), num_regular)
                sheet.write(row, 6, float(rec.get('credit', 0.0) or 0.0), num_regular)
                sheet.write(row, 7, float(rec.get('balance', 0.0) or 0.0), num_regular)

        # Grand Totals
        row += 1
        grand = data.get('grand_total', {}) or {}
        g_debit = float(grand.get('total_debit', 0.0) or 0.0)
        g_credit = float(grand.get('total_credit', 0.0) or 0.0)
        g_init = float(grand.get('total_initial', 0.0) or 0.0)
        g_balance = float(grand.get('final_balance', g_init + g_debit - g_credit) or 0.0)

        sheet.merge_range(row, 0, row, 4, ' Total', grand_head)
        sheet.write(row, 5, g_debit, grand_num)
        sheet.write(row, 6, g_credit, grand_num)
        sheet.write(row, 7, g_balance, grand_num)
        sheet.set_row(row, 22)

        workbook.close()
        output.seek(0)
        response.stream.write(output.read())
        output.close()
