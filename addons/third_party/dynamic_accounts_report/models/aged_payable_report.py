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
import xlsxwriter
from odoo import api, fields, models


class AgePayableReport(models.TransientModel):
    """For creating Age Payable report"""
    _name = 'age.payable.report'
    _description = 'Aged Payable Report'

    @api.model
    def view_report(self):
        """
        Generate a report with move line data categorized by partner and credit difference.
        Returns:
            dict: Dictionary containing move line data categorized by partner names.
                  Each partner's data includes credit amounts and credit differences
                  based on days between maturity date and today.
                  The 'partner_totals' key contains summary data for each partner.
        """
        partner_total = {}
        move_line_list = {}
        paid = self.env['account.move.line'].search(
            [('parent_state', '=', 'posted'),
             ('account_type', '=', 'liability_payable'),
             ('reconciled', '=', False)])
        currency_id = self.env.company.currency_id.symbol
        partner_ids = paid.mapped('partner_id')
        today = fields.Date.today()

        def format_number(value):
            if value is None or value == '':
                return "0.00"
            return "{:,.2f}".format(value)

        for partner_id in partner_ids:
            move_line_ids = paid.filtered(
                lambda rec: rec.partner_id in partner_id)
            move_line_data = move_line_ids.read(
                ['name', 'move_name', 'date', 'amount_currency', 'account_id',
                 'date_maturity', 'currency_id', 'credit', 'debit', 'amount_residual', 'move_id'])
            for val in move_line_data:
                difference = 0
                due_date = val.get('date_maturity') or val.get('date') or today
                if due_date:
                    difference = (today - due_date).days

                # For payable liabilities:
                # Outstanding bill = credit > debit (amount_residual is negative, so -amount_residual is positive)
                # Payment / advance = debit > credit (amount_residual is positive, so -amount_residual is negative)
                if val.get('amount_residual') is not None and val['amount_residual'] != 0:
                    line_amount = -val['amount_residual']
                else:
                    line_amount = (val.get('credit') or 0.0) - (val.get('debit') or 0.0)

                val['raw_amount_currency'] = val.get('amount_currency') or line_amount
                val['raw_credit'] = line_amount

                val['raw_diff0'] = line_amount if difference <= 0 else 0.0
                val['raw_diff1'] = line_amount if 0 < difference <= 30 else 0.0
                val['raw_diff2'] = line_amount if 30 < difference <= 60 else 0.0
                val['raw_diff3'] = line_amount if 60 < difference <= 90 else 0.0
                val['raw_diff4'] = line_amount if 90 < difference <= 120 else 0.0
                val['raw_diff5'] = line_amount if difference > 120 else 0.0

                # Formatted values for display
                val['diff0'] = format_number(val['raw_diff0'])
                val['diff1'] = format_number(val['raw_diff1'])
                val['diff2'] = format_number(val['raw_diff2'])
                val['diff3'] = format_number(val['raw_diff3'])
                val['diff4'] = format_number(val['raw_diff4'])
                val['diff5'] = format_number(val['raw_diff5'])

                val['credit'] = format_number(val['raw_credit'])
                val['amount_currency'] = format_number(val['raw_amount_currency'])
                val['date'] = str(val.get('date')) if val.get('date') else ''
                val['date_maturity'] = str(due_date) if due_date else '-'

            move_line_list[partner_id.name] = move_line_data
            credit_sum = sum(val['raw_credit'] for val in move_line_data)
            diff0_sum = round(sum(val['raw_diff0'] for val in move_line_data), 2)
            diff1_sum = round(sum(val['raw_diff1'] for val in move_line_data), 2)
            diff2_sum = round(sum(val['raw_diff2'] for val in move_line_data), 2)
            diff3_sum = round(sum(val['raw_diff3'] for val in move_line_data), 2)
            diff4_sum = round(sum(val['raw_diff4'] for val in move_line_data), 2)
            diff5_sum = round(sum(val['raw_diff5'] for val in move_line_data), 2)

            partner_total[partner_id.name] = {
                'credit_sum': credit_sum,
                'diff0_sum': diff0_sum,
                'diff1_sum': diff1_sum,
                'diff2_sum': diff2_sum,
                'diff3_sum': diff3_sum,
                'diff4_sum': diff4_sum,
                'diff5_sum': diff5_sum,
                'credit_sum_display': format_number(credit_sum),
                'diff0_sum_display': format_number(diff0_sum),
                'diff1_sum_display': format_number(diff1_sum),
                'diff2_sum_display': format_number(diff2_sum),
                'diff3_sum_display': format_number(diff3_sum),
                'diff4_sum_display': format_number(diff4_sum),
                'diff5_sum_display': format_number(diff5_sum),
                'currency_id': currency_id,
                'partner_id': partner_id.id
            }
        move_line_list['partner_totals'] = partner_total
        return move_line_list

    @api.model
    def get_filter_values(self, date, partner):
        """
        Retrieve filtered move line data based on date and partner(s).
        Parameters:
            date (str): Date for filtering move lines (format: 'YYYY-MM-DD').
            partner (list): List of partner IDs to filter move lines for.
        Returns:
            dict: Dictionary with filtered move line data organized by partner names.
        """
        partner_total = {}
        move_line_list = {}
        if date:
            paid = self.env['account.move.line'].search(
                [('parent_state', '=', 'posted'),
                 ('account_type', '=', 'liability_payable'),
                 ('reconciled', '=', False), ('date', '<=', date)])
        else:
            paid = self.env['account.move.line'].search(
                [('parent_state', '=', 'posted'),
                 ('account_type', '=', 'liability_payable'),
                 ('reconciled', '=', False)])
        currency_id = self.env.company.currency_id.symbol
        if partner:
            partner_ids = self.env['res.partner'].search(
                [('id', 'in', partner)])
        else:
            partner_ids = paid.mapped('partner_id')
        today = fields.Date.today()

        def format_number(value):
            if value is None or value == '':
                return "0.00"
            return "{:,.2f}".format(value)

        for partner_id in partner_ids:
            move_line_ids = paid.filtered(
                lambda rec: rec.partner_id in partner_id)
            move_line_data = move_line_ids.read(
                ['name', 'move_name', 'date', 'amount_currency', 'account_id',
                 'date_maturity', 'currency_id', 'credit', 'debit', 'amount_residual', 'move_id'])
            for val in move_line_data:
                difference = 0
                due_date = val.get('date_maturity') or val.get('date') or today
                if due_date:
                    difference = (today - due_date).days

                if val.get('amount_residual') is not None and val['amount_residual'] != 0:
                    line_amount = -val['amount_residual']
                else:
                    line_amount = (val.get('credit') or 0.0) - (val.get('debit') or 0.0)

                val['raw_amount_currency'] = val.get('amount_currency') or line_amount
                val['raw_credit'] = line_amount

                val['raw_diff0'] = line_amount if difference <= 0 else 0.0
                val['raw_diff1'] = line_amount if 0 < difference <= 30 else 0.0
                val['raw_diff2'] = line_amount if 30 < difference <= 60 else 0.0
                val['raw_diff3'] = line_amount if 60 < difference <= 90 else 0.0
                val['raw_diff4'] = line_amount if 90 < difference <= 120 else 0.0
                val['raw_diff5'] = line_amount if difference > 120 else 0.0

                val['diff0'] = format_number(val['raw_diff0'])
                val['diff1'] = format_number(val['raw_diff1'])
                val['diff2'] = format_number(val['raw_diff2'])
                val['diff3'] = format_number(val['raw_diff3'])
                val['diff4'] = format_number(val['raw_diff4'])
                val['diff5'] = format_number(val['raw_diff5'])

                val['credit'] = format_number(val['raw_credit'])
                val['amount_currency'] = format_number(val['raw_amount_currency'])
                val['date'] = str(val.get('date')) if val.get('date') else ''
                val['date_maturity'] = str(due_date) if due_date else '-'

            move_line_list[partner_id.name] = move_line_data
            credit_sum = sum(val['raw_credit'] for val in move_line_data)
            diff0_sum = round(sum(val['raw_diff0'] for val in move_line_data), 2)
            diff1_sum = round(sum(val['raw_diff1'] for val in move_line_data), 2)
            diff2_sum = round(sum(val['raw_diff2'] for val in move_line_data), 2)
            diff3_sum = round(sum(val['raw_diff3'] for val in move_line_data), 2)
            diff4_sum = round(sum(val['raw_diff4'] for val in move_line_data), 2)
            diff5_sum = round(sum(val['raw_diff5'] for val in move_line_data), 2)

            partner_total[partner_id.name] = {
                'credit_sum': credit_sum,
                'diff0_sum': diff0_sum,
                'diff1_sum': diff1_sum,
                'diff2_sum': diff2_sum,
                'diff3_sum': diff3_sum,
                'diff4_sum': diff4_sum,
                'diff5_sum': diff5_sum,
                'credit_sum_display': format_number(credit_sum),
                'diff0_sum_display': format_number(diff0_sum),
                'diff1_sum_display': format_number(diff1_sum),
                'diff2_sum_display': format_number(diff2_sum),
                'diff3_sum_display': format_number(diff3_sum),
                'diff4_sum_display': format_number(diff4_sum),
                'diff5_sum_display': format_number(diff5_sum),
                'currency_id': currency_id,
                'partner_id': partner_id.id
            }
        move_line_list['partner_totals'] = partner_total
        return move_line_list

    @api.model
    def get_xlsx_report(self, data, response, report_name=None, report_action=None, **kwargs):
        """
        Generate an Excel report based on the provided data with thousand separators.
        :param data: The data used to generate the report.
        :type data: str (JSON format)
        :param response: The response object to write the report to.
        :type response: object
        :param report_name: The name of the report.
        :type report_name: str
        :return: None
        """
        if isinstance(data, (str, bytes)):

            data = json.loads(data)
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        end_date = data.get('filters', {}).get('end_date') or ''
        sheet = workbook.add_worksheet()
        head = workbook.add_format(
            {'align': 'center', 'bold': True, 'font_size': '15px'})
        sub_heading = workbook.add_format(
            {'align': 'center', 'bold': True, 'font_size': '10px',
             'border': 1, 'bg_color': '#D3D3D3',
             'border_color': 'black'})
        filter_head = workbook.add_format(
            {'align': 'center', 'bold': True, 'font_size': '10px',
             'border': 1, 'bg_color': '#D3D3D3',
             'border_color': 'black'})
        filter_body = workbook.add_format(
            {'align': 'center', 'bold': True, 'font_size': '10px'})
        txt_name = workbook.add_format({'font_size': '10px', 'border': 1})
        txt_name.set_indent(2)
        num_format = workbook.add_format({'font_size': '10px', 'border': 1, 'num_format': '#,##0.00'})
        num_format.set_indent(2)
        total_num_format = workbook.add_format(
            {'align': 'center', 'bold': True, 'font_size': '10px',
             'border': 1, 'bg_color': '#D3D3D3',
             'border_color': 'black', 'num_format': '#,##0.00'})

        sheet.set_column(0, 0, 30)
        sheet.set_column(1, 1, 20)
        sheet.set_column(2, 2, 15)
        sheet.set_column(3, 3, 15)
        col = 0
        sheet.write('A1:B1', report_name, head)
        sheet.write('B3:B4', 'Date Range', filter_head)
        sheet.write('B4:B4', 'Partners', filter_head)
        if end_date:
            sheet.merge_range('C3:G3', f"{end_date}", filter_body)
        if data.get('filters', {}).get('partner'):
            display_names = [partner.get('display_name', 'undefined') for
                             partner in data['filters']['partner']]
            display_names_str = ', '.join(display_names)
            sheet.merge_range('C4:G4', display_names_str, filter_body)

        if data:
            sheet.write(6, col, 'Vendor / Bill', sub_heading)
            sheet.write(6, col + 1, 'Bill Date', sub_heading)
            sheet.write(6, col + 2, 'Amount Currency', sub_heading)
            sheet.write(6, col + 3, 'Currency', sub_heading)
            sheet.merge_range(6, col + 4, 6, col + 5, 'Account', sub_heading)
            sheet.merge_range(6, col + 6, 6, col + 7, 'Due Date', sub_heading)
            sheet.write(6, col + 8, 'Current', sub_heading)
            sheet.write(6, col + 9, '1-30', sub_heading)
            sheet.write(6, col + 10, '31-60', sub_heading)
            sheet.write(6, col + 11, '61-90', sub_heading)
            sheet.write(6, col + 12, '91-120', sub_heading)
            sheet.write(6, col + 13, 'Older', sub_heading)
            sheet.write(6, col + 14, 'Total Due', sub_heading)
            row = 6
            for move_line in data.get('move_lines', []):
                row += 1
                p_totals = data.get('total', {}).get(move_line, {})
                sheet.write(row, col, move_line, txt_name)
                sheet.write(row, col + 1, ' ', txt_name)
                sheet.write(row, col + 2, ' ', txt_name)
                sheet.write(row, col + 3, ' ', txt_name)
                sheet.merge_range(row, col + 4, row, col + 5, ' ', txt_name)
                sheet.merge_range(row, col + 6, row, col + 7, ' ', txt_name)
                sheet.write(row, col + 8, p_totals.get('diff0_sum', 0.0), num_format)
                sheet.write(row, col + 9, p_totals.get('diff1_sum', 0.0), num_format)
                sheet.write(row, col + 10, p_totals.get('diff2_sum', 0.0), num_format)
                sheet.write(row, col + 11, p_totals.get('diff3_sum', 0.0), num_format)
                sheet.write(row, col + 12, p_totals.get('diff4_sum', 0.0), num_format)
                sheet.write(row, col + 13, p_totals.get('diff5_sum', 0.0), num_format)
                sheet.write(row, col + 14, p_totals.get('credit_sum', 0.0), num_format)

                for rec in data.get('data', {}).get(move_line, []):
                    row += 1
                    label = (rec.get('move_name') or '') + ' ' + (rec.get('name') or '')
                    sheet.write(row, col, label.strip(), txt_name)
                    sheet.write(row, col + 1, rec.get('date', ''), txt_name)
                    sheet.write(row, col + 2, rec.get('amount_currency', 0.0), num_format)
                    currency_symbol = rec.get('currency_id', ['', ''])[1] if isinstance(rec.get('currency_id'), (list, tuple)) else ''
                    sheet.write(row, col + 3, currency_symbol, txt_name)
                    account_name = rec.get('account_id', ['', ''])[1] if isinstance(rec.get('account_id'), (list, tuple)) else ''
                    sheet.merge_range(row, col + 4, row, col + 5, account_name, txt_name)
                    sheet.merge_range(row, col + 6, row, col + 7, str(rec.get('date_maturity', '')), txt_name)
                    sheet.write(row, col + 8, rec.get('diff0', 0.0), num_format)
                    sheet.write(row, col + 9, rec.get('diff1', 0.0), num_format)
                    sheet.write(row, col + 10, rec.get('diff2', 0.0), num_format)
                    sheet.write(row, col + 11, rec.get('diff3', 0.0), num_format)
                    sheet.write(row, col + 12, rec.get('diff4', 0.0), num_format)
                    sheet.write(row, col + 13, rec.get('diff5', 0.0), num_format)
                    sheet.write(row, col + 14, ' ', txt_name)

            grand = data.get('grand_total', {})
            sheet.merge_range(row + 1, col, row + 1, col + 7, 'Grand Total', filter_head)
            sheet.write(row + 1, col + 8, grand.get('diff0_sum', 0.0), total_num_format)
            sheet.write(row + 1, col + 9, grand.get('diff1_sum', 0.0), total_num_format)
            sheet.write(row + 1, col + 10, grand.get('diff2_sum', 0.0), total_num_format)
            sheet.write(row + 1, col + 11, grand.get('diff3_sum', 0.0), total_num_format)
            sheet.write(row + 1, col + 12, grand.get('diff4_sum', 0.0), total_num_format)
            sheet.write(row + 1, col + 13, grand.get('diff5_sum', 0.0), total_num_format)
            sheet.write(row + 1, col + 14, grand.get('total_credit', 0.0), total_num_format)

        workbook.close()
        output.seek(0)
        response.stream.write(output.read())
        output.close()
