# -*- coding: utf-8 -*-
import base64
from collections import defaultdict

from odoo import models, fields, api, _, Command
from odoo.exceptions import ValidationError, UserError
from odoo.tools import SQL
from odoo.addons.web.controllers.utils import clean_action


class AccountPaymentMethod(models.Model):
    _inherit = 'account.payment.method'

    @api.model
    def _get_payment_method_information(self):
        res = super()._get_payment_method_information()
        res['batch_payment'] = {'mode': 'multi', 'type': ('bank',)}
        return res


class AccountBatchPayment(models.Model):
    _name = "account.batch.payment"
    _description = "Batch Payment"
    _order = "date desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, copy=False, string='Reference')
    date = fields.Date(required=True, copy=False, default=fields.Date.context_today, tracking=True)
    state = fields.Selection([
        ('draft', 'New'),
        ('sent', 'Sent'),
        ('reconciled', 'Reconciled'),
    ], store=True, compute='_compute_state', default='draft', tracking=True)
    journal_id = fields.Many2one(
        'account.journal',
        string='Bank',
        check_company=True,
        domain=[('type', '=', 'bank')],
        tracking=True,
    )
    company_id = fields.Many2one('res.company', related='journal_id.company_id', readonly=True)
    payment_ids = fields.One2many('account.payment', 'batch_payment_id', string="Payments", required=True)
    currency_id = fields.Many2one('res.currency', compute='_compute_currency', store=True, readonly=True)
    company_currency_id = fields.Many2one(
        string="Company Currency",
        related='journal_id.company_id.currency_id',
        store=True,
    )
    amount_residual = fields.Monetary(
        currency_field='company_currency_id',
        compute='_compute_from_payment_ids',
        store=True,
    )
    amount_residual_currency = fields.Monetary(
        currency_field='currency_id',
        compute='_compute_from_payment_ids',
        store=True,
    )
    amount = fields.Monetary(
        currency_field='currency_id',
        compute='_compute_from_payment_ids',
        store=True,
    )
    batch_type = fields.Selection(selection=[('inbound', 'Inbound'), ('outbound', 'Outbound')], required=True, default='inbound', tracking=True)
    payment_method_id = fields.Many2one(
        comodel_name='account.payment.method',
        string='Payment Method', store=True, readonly=False,
        compute='_compute_payment_method_id',
        domain="[('id', 'in', available_payment_method_ids)]",
        help="The payment method used by the payments in this batch.", tracking=True)
    available_payment_method_ids = fields.Many2many(
        comodel_name='account.payment.method',
        compute='_compute_available_payment_method_ids')
    payment_method_code = fields.Char(related='payment_method_id.code', tracking=True)
    export_file_create_date = fields.Date(string='Generation Date', default=fields.Date.today, readonly=True, help="Creation date of the related export file.", copy=False)
    export_file = fields.Binary(string='File', readonly=True, help="Export file related to this batch", copy=False)
    export_filename = fields.Char(string='File Name', help="Name of the export file generated for this batch", store=True, copy=False)

    file_generation_enabled = fields.Boolean(help="Whether or not this batch payment should display the 'Generate File' button instead of 'Print' in form view.", compute='_compute_file_generation_enabled')

    def _valid_payment_states(self):
        return ['in_process', 'paid'] if self.env['account.move']._get_invoice_in_payment_state() == 'paid' else ['in_process']

    @api.depends('batch_type', 'journal_id', 'payment_ids')
    def _compute_payment_method_id(self):
        for batch in self:
            if batch.payment_ids:
                batch.payment_method_id = batch.payment_ids.payment_method_line_id[0].payment_method_id
                continue

            if not batch.journal_id:
                batch.available_payment_method_ids = False
                batch.payment_method_id = False
                continue

            available_payment_method_lines = batch.journal_id._get_available_payment_method_lines(batch.batch_type)
            batch.available_payment_method_ids = available_payment_method_lines.mapped('payment_method_id')

            if batch.available_payment_method_ids:
                batch.payment_method_id = batch.available_payment_method_ids[0]._origin
            else:
                batch.payment_method_id = False

    @api.depends('batch_type', 'journal_id')
    def _compute_available_payment_method_ids(self):
        for batch in self:
            available_payment_method_lines = batch.journal_id._get_available_payment_method_lines(batch.batch_type)
            batch.available_payment_method_ids = available_payment_method_lines.mapped('payment_method_id')

    @api.depends('payment_ids.is_sent', 'payment_ids.is_matched')
    def _compute_state(self):
        for batch in self:
            if batch.payment_ids and all(pay.is_matched and pay.is_sent for pay in batch.payment_ids.filtered(lambda p: p.state not in ('canceled', 'rejected'))):
                batch.state = 'reconciled'
            elif batch.payment_ids and all(pay.is_sent for pay in batch.payment_ids.filtered(lambda p: p.state not in ('canceled', 'rejected'))):
                batch.state = 'sent'
            else:
                batch.state = 'draft'

    @api.depends('payment_method_id')
    def _compute_file_generation_enabled(self):
        for record in self:
            record.file_generation_enabled = record.payment_method_id.code in record._get_methods_generating_files()

    def _get_methods_generating_files(self):
        return []

    @api.depends('journal_id')
    def _compute_currency(self):
        for batch in self:
            batch.currency_id = batch.journal_id.currency_id or batch.company_currency_id or self.env.company.currency_id

    @api.depends('currency_id', 'payment_ids.amount', 'payment_ids.is_matched', 'payment_ids.state')
    def _compute_from_payment_ids(self):
        valid_payment_states = self._valid_payment_states()
        for batch in self:
            amount = 0.0
            amount_residual = 0.0
            amount_residual_currency = 0.0
            for payment in batch.payment_ids.filtered(lambda p: p.state in valid_payment_states):
                if payment.move_id:
                    liquidity_lines, _counterpart_lines, _writeoff_lines = payment._seek_for_lines()
                    for line in liquidity_lines:
                        amount += line.currency_id._convert(
                            from_amount=line.amount_currency,
                            to_currency=batch.currency_id,
                            company=line.company_id,
                            date=line.date,
                        )
                        amount_residual += line.amount_residual
                        amount_residual_currency += line.amount_residual_currency
                else:
                    converted_amount = payment.currency_id._convert(
                        from_amount=payment.amount_signed,
                        to_currency=batch.currency_id,
                        company=payment.company_id,
                        date=payment.date,
                    )
                    amount += converted_amount
                    amount_residual += converted_amount
                    amount_residual_currency += payment.amount_signed

            batch.amount_residual = amount_residual
            batch.amount = amount
            batch.amount_residual_currency = amount_residual_currency

    @api.constrains('batch_type', 'journal_id', 'payment_ids', 'payment_method_id')
    def _check_payments_constrains(self):
        for record in self:
            all_companies = set(record.payment_ids.mapped('company_id'))
            if len(all_companies) > 1:
                raise ValidationError(_("All payments in the batch must belong to the same company."))
            if record.payment_ids and record.journal_id != record.payment_ids.journal_id:
                raise ValidationError(_("The journal of the batch payment and of the payments it contains must be the same."))
            all_types = set(record.payment_ids.mapped('payment_type'))
            if all_types and record.batch_type not in all_types:
                raise ValidationError(_("The batch must have the same type as the payments it contains."))
            all_payment_methods = record.payment_ids.payment_method_id
            if len(all_payment_methods) > 1:
                raise ValidationError(_("All payments in the batch must share the same payment method."))
            if all_payment_methods and record.payment_method_id not in all_payment_methods:
                raise ValidationError(_("The batch must have the same payment method as the payments it contains."))
            payment_null = record.payment_ids.filtered(lambda p: p.amount == 0)
            if payment_null:
                raise ValidationError(_('You cannot add payments with zero amount in a Batch Payment.'))

    @api.model_create_multi
    def create(self, vals_list):
        today = fields.Date.context_today(self)
        all_payment_ids = []
        for vals in vals_list:
            vals['name'] = self._get_batch_name(
                vals.get('batch_type'),
                vals.get('date', today),
                vals)
            if 'payment_ids' in vals:
                payments = self.new({'payment_ids': vals['payment_ids']}).payment_ids
                if payments._origin.batch_payment_id:
                    raise ValidationError(_('You cannot create a batch with payments that are already in another batch.'))
                all_payment_ids.extend(payments.ids)

        if len(all_payment_ids) != len(set(all_payment_ids)):
            raise ValidationError(_('You cannot create batches with overlapping payments.'))
        return super().create(vals_list)

    def write(self, vals):
        if 'batch_type' in vals:
            vals['name'] = self.with_context(default_journal_id=self.journal_id.id)._get_batch_name(vals['batch_type'], self.date, vals)
        if 'payment_ids' in vals:
            if len(self) > 1:
                raise ValidationError(_('You cannot add the same payment to multiple batches.'))
            original_payments = self.new({'payment_ids': vals['payment_ids']}).payment_ids._origin
            if original_payments.batch_payment_id - self:
                raise ValidationError(_('You cannot create a batch with payments that are already in another batch.'))

        return super(AccountBatchPayment, self).write(vals)

    @api.model
    def _get_batch_name(self, batch_type, sequence_date, vals):
        if not vals.get('name'):
            sequence_code = 'account.inbound.batch.payment'
            if batch_type == 'outbound':
                sequence_code = 'account.outbound.batch.payment'
            return self.env['ir.sequence'].with_context(sequence_date=sequence_date).next_by_code(sequence_code)
        return vals['name']

    @api.depends('name', 'state')
    def _compute_display_name(self):
        state_values = dict(self._fields['state'].selection)
        for batch in self:
            state_label = state_values.get(batch.state)
            if batch.name:
                batch.display_name = f"{batch.name} ({state_label})" if state_label else batch.name
            else:
                batch.display_name = _("New")

    def validate_batch(self):
        self._check_batch_validity()
        return self._send_after_validation()

    def _check_batch_validity(self):
        self.ensure_one()
        if not self.payment_ids:
            raise UserError(_("Cannot validate an empty batch. Please add some payments to it first."))

        valid_payment_states = self._valid_payment_states()
        if self.payment_ids.filtered(lambda p: p.state not in valid_payment_states):
            raise ValidationError(_("All payments must be posted to validate the batch."))

        errors = not self.export_file and self.check_payments_for_errors() or []
        warnings = self.check_payments_for_warnings()
        if errors or warnings:
            return {
                'type': 'ir.actions.act_window',
                'view_mode': 'form',
                'res_model': 'account.batch.error.wizard',
                'target': 'new',
                'res_id': self.env['account.batch.error.wizard'].create_from_errors_list(self, errors, warnings).id,
            }

    def validate_batch_button(self):
        return self.validate_batch()

    def _send_after_validation(self):
        self.ensure_one()
        if self.payment_ids:
            self.payment_ids.mark_as_sent()
            if self.file_generation_enabled:
                return self.export_batch_payment()

    def check_payments_for_warnings(self):
        return []

    def check_payments_for_errors(self):
        self.ensure_one()
        rslt = self._check_and_post_draft_payments(self.payment_ids.filtered(lambda x: x.state in ('draft', 'approved')))

        valid_payment_states = self._valid_payment_states()
        wrong_state_payments = self.payment_ids.filtered(lambda x: x.state not in valid_payment_states)

        if wrong_state_payments:
            rslt.append({
                'title': _("Payments must be posted to be added to a batch."),
                'records': wrong_state_payments,
                'help': _("Set payments state to \"In Process\".")
            })

        if self.batch_type == 'outbound':
            not_allowed_payments = self.payment_ids.filtered(lambda x: x.partner_bank_id and not x.partner_bank_id.allow_out_payment)
            if not_allowed_payments:
                rslt.append({
                    'code': 'out_payment_not_allowed',
                    'title': _("Some recipient accounts do not allow out payments."),
                    'records': not_allowed_payments,
                    'help': _("Target another recipient account or allow sending money to the current one.")
                })

        sent_payments = self.payment_ids.filtered(lambda x: x.is_sent)
        if sent_payments:
            rslt.append({
                'title': _("Some payments have already been sent."),
                'records': sent_payments,
            })

        if self.batch_type == 'inbound':
            pmls = self.journal_id.inbound_payment_method_line_ids
        else:
            pmls = self.journal_id.outbound_payment_method_line_ids
        pmls = pmls.filtered(lambda x: x.payment_method_id == self.payment_method_id)
        no_statement_reconciliation = self.journal_id.default_account_id == pmls.payment_account_id[:1]
        bank_reconciled_payments = self.payment_ids.filtered(lambda x: x.is_matched)
        if bank_reconciled_payments and not no_statement_reconciliation:
            rslt.append({
                'title': _("Some payments have already been matched with a bank statement."),
                'records': bank_reconciled_payments,
            })

        return rslt

    def _check_and_post_draft_payments(self, draft_payments):
        exceptions_mapping = {}
        for payment in draft_payments:
            try:
                payment.action_post()
            except UserError as e:
                name = e.args[0]
                if name in exceptions_mapping:
                    exceptions_mapping[name] += payment
                else:
                    exceptions_mapping[name] = payment

        return [{'title': error, 'records': pmts} for error, pmts in exceptions_mapping.items()]

    def export_batch_payment(self):
        self.check_access('write')
        for record in self.sudo():
            record = record.with_company(record.journal_id.company_id)
            export_file_data = record._generate_export_file()
            record.export_file = export_file_data['file']
            record.export_filename = export_file_data['filename']
            record.export_file_create_date = fields.Date.today()
            record.message_post(
                attachments=[
                    (record.export_filename, base64.decodebytes(record.export_file)),
                ]
            )

    def print_batch_payment(self):
        return self.env.ref('am_account_kit.action_print_batch_payment').report_action(self, config=False)

    def _generate_export_file(self):
        self.ensure_one()
        return False

    def action_open_batch_payment(self):
        self.ensure_one()
        return {
            'name': _("Batch Payment"),
            'type': 'ir.actions.act_window',
            'view_mode': 'form',
            'view_id': self.env.ref('am_account_kit.view_batch_payment_form').id,
            'res_model': self._name,
            'res_id': self.id,
            'context': {
                'create': False,
                'delete': False,
            },
            'target': 'current',
        }


class AccountBatchPaymentRejection(models.TransientModel):
    _name = 'account.batch.payment.rejection'
    _description = "Manage the payment rejection from batch payments"

    in_reconcile_payment_ids = fields.Many2many(comodel_name='account.payment')

    rejected_payment_ids = fields.Many2many(
        comodel_name='account.payment',
        compute='_compute_rejected_payment_ids',
    )
    nb_rejected_payment_ids = fields.Integer(compute='_compute_rejected_payment_ids')
    nb_batch_payment_ids = fields.Integer(compute='_compute_rejected_payment_ids')

    @api.model
    def _fetch_rejected_payment_ids(self, in_reconcile_payments):
        batch_ids = in_reconcile_payments.batch_payment_id.ids
        if batch_ids:
            return self.env['account.payment'].search([
                ('is_matched', '=', False),
                ('batch_payment_id', 'in', batch_ids),
                ('id', 'not in', in_reconcile_payments.ids),
            ])
        else:
            return self.env['account.payment']

    @api.depends('in_reconcile_payment_ids')
    def _compute_rejected_payment_ids(self):
        for wizard in self:
            rejected_payments = wizard._fetch_rejected_payment_ids(wizard.in_reconcile_payment_ids)
            wizard.rejected_payment_ids = [Command.set(rejected_payments.ids)]
            wizard.nb_rejected_payment_ids = len(wizard.rejected_payment_ids)
            wizard.nb_batch_payment_ids = len(rejected_payments.batch_payment_id)

    def button_cancel_payments(self):
        self.rejected_payment_ids.batch_payment_id = False
        to_unlink = self.rejected_payment_ids.move_id.filtered(lambda x: not x._get_violated_lock_dates(x.date, False))
        to_reject = self.rejected_payment_ids.move_id - to_unlink
        if to_unlink:
            to_unlink.button_draft()
            to_unlink.button_cancel()
        if to_reject:
            to_reject._reverse_moves(cancel=True)
        return {'type': 'ir.actions.act_window_close', 'infos': 'validate'}

    def button_continue(self):
        return {'type': 'ir.actions.act_window_close', 'infos': 'validate'}

    def button_cancel(self):
        return True


class PrintBatchPayment(models.AbstractModel):
    _name = 'report.am_account_kit.print_batch_payment'
    _template = 'am_account_kit.print_batch_payment'
    _description = 'Batch Deposit Report'

    @api.model
    def _get_report_values(self, docids, data=None):
        report_name = 'am_account_kit.print_batch_payment'
        report = self.env['ir.actions.report']._get_report_from_name(report_name)
        return {
            'doc_ids': docids,
            'doc_model': report.model,
            'docs': self.env[report.model].browse(docids),
        }


class AccountReconcileModelBatch(models.Model):
    _inherit = 'account.reconcile.model'

    def _get_invoice_matching_batch_payments_candidates(self, st_line, partner):
        assert self.rule_type == 'invoice_matching'
        self.env['account.batch.payment'].flush_model()

        _numerical_tokens, exact_tokens, _text_tokens = self._get_invoice_matching_st_line_tokens(st_line)
        if not exact_tokens:
            return

        batches = self.env['account.batch.payment'].search([('state', '!=', 'reconciled'), ('name', 'in', exact_tokens)])
        if not batches:
            return

        aml_domain = self._get_invoice_matching_amls_domain(st_line, partner)
        query = self.env['account.move.line']._where_calc(aml_domain)

        candidate_ids = [r[0] for r in self.env.execute_query(SQL(
            '''
                SELECT DISTINCT account_move_line.id
                FROM %s
                JOIN account_payment pay ON pay.id = account_move_line.payment_id
                JOIN account_batch_payment batch
                    ON batch.id = pay.batch_payment_id
                    AND batch.id = ANY(%s)
                    AND batch.state != 'reconciled'
                WHERE %s
            ''',
            query.from_clause,
            [batches.ids],
            query.where_clause or SQL("TRUE"),
        ))]
        if candidate_ids:
            return {
                'allow_auto_reconcile': True,
                'amls': self.env['account.move.line'].browse(candidate_ids),
            }

    def _get_invoice_matching_rules_map(self):
        res = super()._get_invoice_matching_rules_map()
        res[0].append(self._get_invoice_matching_batch_payments_candidates)
        return res


