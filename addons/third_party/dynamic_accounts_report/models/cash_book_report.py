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
from dateutil.relativedelta import relativedelta
import xlsxwriter
from datetime import datetime
from odoo.tools import date_utils
from odoo import api, fields, models


class CashBookReport(models.TransientModel):
    """For creating Cash Book report"""
    _name = 'cash.book.report'
    _description = 'Account Cash Book Report'

    @api.model
    def _get_cash_journals_and_accounts(self):
        """Helper to get cash journals and related cash safe accounts."""
        journals = self.env['account.journal'].search([('type', '=', 'cash')])
        cash_accounts = self.env['account.account'].search([
            '|',
            ('id', 'in', journals.mapped('default_account_id').ids),
            '&', ('account_type', '=', 'asset_cash'), ('code', '=like', '1221%')
        ])
        return journals, cash_accounts

    @api.model
    def view_report(self):
        """
        Retrieves and formats data for the cash book report.
        """
        data = {}
        move_lines_total = {}
        currency_id = self.env.company.currency_id.symbol
        journals, cash_accounts = self._get_cash_journals_and_accounts()

        domain = [
            ('parent_state', '=', 'posted'),
            '|',
            ('journal_id', 'in', journals.ids),
            ('account_id', 'in', cash_accounts.ids)
        ]
        account_move_lines = self.env['account.move.line'].search(domain, order='date asc, id asc')

        for acc in account_move_lines.mapped('account_id'):
            move_lines = account_move_lines.filtered(lambda x: x.account_id == acc)
            move_line_data = move_lines.read([
                'date', 'journal_id', 'partner_id', 'move_name', 'debit',
                'move_id', 'credit', 'name', 'ref'
            ])
            for l in move_line_data:
                l['account_code'] = acc.code or ''
            acc_name = acc.display_name
            data[acc_name] = move_line_data
            tot_debit = round(sum(move_lines.mapped('debit')), 2)
            tot_credit = round(sum(move_lines.mapped('credit')), 2)
            move_lines_total[acc_name] = {
                'total_debit': tot_debit,
                'total_credit': tot_credit,
                'balance': round(tot_debit - tot_credit, 2),
                'currency_id': currency_id,
                'account_id': acc.id,
                'account_code': acc.code or '',
            }

        data['move_lines_total'] = move_lines_total
        data['accounts'] = cash_accounts.read(['display_name', 'name'])
        return data

    @api.model
    def get_filter_values(self, partner_id, data_range, account_list, options):
        """
        Retrieves and formats filtered data for the cash book report based on
        the provided filter criteria.
        """
        data = {}
        move_lines_total = {}
        today = fields.Date.today()
        currency_id = self.env.company.currency_id.symbol
        journals, cash_accounts = self._get_cash_journals_and_accounts()

        option_domain = ['posted']
        if options and 'draft' in options:
            option_domain = ['posted', 'draft']

        domain = [('parent_state', 'in', option_domain)]

        if account_list:
            domain.append(('account_id', 'in', account_list))
        else:
            domain.extend([
                '|',
                ('journal_id', 'in', journals.ids),
                ('account_id', 'in', cash_accounts.ids)
            ])

        if partner_id:
            domain.append(('partner_id', 'in', partner_id))

        if data_range:
            if data_range == 'month':
                domain.extend([('date', '>=', date_utils.start_of(today, 'month')), ('date', '<=', date_utils.end_of(today, 'month'))])
            elif data_range == 'quarter':
                q_start, q_end = date_utils.get_quarter(today)
                domain.extend([('date', '>=', q_start), ('date', '<=', q_end)])
            elif data_range == 'year':
                domain.extend([('date', '>=', date_utils.start_of(today, 'year')), ('date', '<=', date_utils.end_of(today, 'year'))])
            elif data_range == 'last-month':
                last_m = today - relativedelta(months=1)
                domain.extend([('date', '>=', date_utils.start_of(last_m, 'month')), ('date', '<=', date_utils.end_of(last_m, 'month'))])
            elif data_range == 'last-quarter':
                q_start, _ = date_utils.get_quarter(today)
                prev_q_start = q_start - relativedelta(months=3)
                prev_q_end = q_start - relativedelta(days=1)
                domain.extend([('date', '>=', prev_q_start), ('date', '<=', prev_q_end)])
            elif data_range == 'last-year':
                last_y = today - relativedelta(years=1)
                domain.extend([('date', '>=', date_utils.start_of(last_y, 'year')), ('date', '<=', date_utils.end_of(last_y, 'year'))])
            elif isinstance(data_range, dict):
                if data_range.get('start_date'):
                    domain.append(('date', '>=', data_range['start_date']))
                if data_range.get('end_date'):
                    domain.append(('date', '<=', data_range['end_date']))

        account_move_lines = self.env['account.move.line'].search(domain, order='date asc, id asc')

        for acc in account_move_lines.mapped('account_id'):
            move_lines = account_move_lines.filtered(lambda x: x.account_id == acc)
            move_line_data = move_lines.read([
                'date', 'journal_id', 'partner_id', 'move_name', 'debit',
                'move_id', 'credit', 'name', 'ref'
            ])
            for l in move_line_data:
                l['account_code'] = acc.code or ''
            acc_name = acc.display_name
            data[acc_name] = move_line_data
            tot_debit = round(sum(move_lines.mapped('debit')), 2)
            tot_credit = round(sum(move_lines.mapped('credit')), 2)
            move_lines_total[acc_name] = {
                'total_debit': tot_debit,
                'total_credit': tot_credit,
                'balance': round(tot_debit - tot_credit, 2),
                'currency_id': currency_id,
                'account_id': acc.id,
                'account_code': acc.code or '',
            }

        data['move_lines_total'] = move_lines_total
        data['accounts'] = cash_accounts.read(['display_name', 'name'])
        return data

    @api.model
    def get_xlsx_report(self, data, response, report_name=None, report_action=None, **kwargs):
        """
        Generate an Excel report based on the provided data.
        """
        if isinstance(data, (str, bytes)):

            data = json.loads(data)
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        start_date = data['filters'].get('start_date', '')
        end_date = data['filters'].get('end_date', '')
        sheet = workbook.add_worksheet()
        head = workbook.add_format({'align': 'center', 'bold': True, 'font_size': '15px'})
        sub_heading = workbook.add_format({
            'align': 'center', 'bold': True, 'font_size': '10px',
            'border': 1, 'bg_color': '#D3D3D3', 'border_color': 'black'
        })
        filter_head = workbook.add_format({
            'align': 'center', 'bold': True, 'font_size': '10px',
            'border': 1, 'bg_color': '#D3D3D3', 'border_color': 'black'
        })
        filter_body = workbook.add_format({'align': 'center', 'bold': True, 'font_size': '10px'})
        txt_name = workbook.add_format({'font_size': '10px', 'border': 1})
        txt_name.set_indent(1)
        num_format = workbook.add_format({'font_size': '10px', 'border': 1, 'num_format': '#,##0.00'})

        sheet.set_column(0, 0, 15)
        sheet.set_column(1, 1, 20)
        sheet.set_column(2, 2, 20)
        sheet.set_column(3, 3, 25)
        sheet.set_column(4, 4, 15)
        sheet.set_column(5, 5, 15)
        sheet.set_column(6, 6, 15)
        col = 0
        sheet.write('A1:b1', report_name, head)
        sheet.write('B3:b4', 'Date Range', filter_head)
        sheet.write('B4:b4', 'Partners', filter_head)
        sheet.write('B5:b4', 'Accounts', filter_head)
        sheet.write('B6:b4', 'Options', filter_head)
        if start_date or end_date:
            sheet.merge_range('C3:G3', f"{start_date} to {end_date}", filter_body)
        if data['filters'].get('partner'):
            display_names = [partner.get('display_name', 'undefined') for partner in data['filters']['partner']]
            sheet.merge_range('C4:G4', ', '.join(display_names), filter_body)
        if data['filters'].get('account'):
            sheet.merge_range('C5:G5', ', '.join(str(a) for a in data['filters']['account']), filter_body)
        if data['filters'].get('options'):
            sheet.merge_range('C6:G6', ', '.join(data['filters']['options'].keys()), filter_body)

        if data.get('move_lines'):
            sheet.write(8, col, 'Date', sub_heading)
            sheet.write(8, col + 1, 'Journal', sub_heading)
            sheet.write(8, col + 2, 'Partner', sub_heading)
            sheet.write(8, col + 3, 'Ref / Move', sub_heading)
            sheet.write(8, col + 4, 'Debit', sub_heading)
            sheet.write(8, col + 5, 'Credit', sub_heading)
            sheet.write(8, col + 6, 'Balance', sub_heading)
            row = 8
            for move_line in data['move_lines']:
                row += 1
                tot = data['total'].get(move_line, {})
                sheet.write(row, col, move_line, sub_heading)
                sheet.write(row, col + 1, '', sub_heading)
                sheet.write(row, col + 2, '', sub_heading)
                sheet.write(row, col + 3, '', sub_heading)
                sheet.write(row, col + 4, tot.get('total_debit', 0.0), num_format)
                sheet.write(row, col + 5, tot.get('total_credit', 0.0), num_format)
                sheet.write(row, col + 6, tot.get('total_debit', 0.0) - tot.get('total_credit', 0.0), num_format)
                for rec in data.get('data', {}).get(move_line, []):
                    row += 1
                    partner = rec['partner_id'][1] if rec.get('partner_id') else ''
                    sheet.write(row, col, rec.get('date', ''), txt_name)
                    sheet.write(row, col + 1, rec.get('journal_id', ['', ''])[1], txt_name)
                    sheet.write(row, col + 2, partner, txt_name)
                    sheet.write(row, col + 3, rec.get('move_name') or rec.get('name') or '', txt_name)
                    sheet.write(row, col + 4, rec.get('debit', 0.0), num_format)
                    sheet.write(row, col + 5, rec.get('credit', 0.0), num_format)
                    sheet.write(row, col + 6, '', txt_name)

            gt = data.get('grand_total', {})
            row += 1
            sheet.merge_range(row, col, row, col + 3, 'Total', filter_head)
            sheet.write(row, col + 4, float(gt.get('total_debit', 0.0)), num_format)
            sheet.write(row, col + 5, float(gt.get('total_credit', 0.0)), num_format)
            sheet.write(row, col + 6, float(gt.get('total_debit', 0.0)) - float(gt.get('total_credit', 0.0)), num_format)

        workbook.close()
        output.seek(0)
        response.stream.write(output.read())
        output.close()
