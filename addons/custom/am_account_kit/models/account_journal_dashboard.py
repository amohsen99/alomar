from odoo.tools.misc import formatLang
from odoo import api, fields, models, _


class account_journal(models.Model):
    _inherit = "account.journal"

    approval_policy = fields.Selection(
        selection=[
            ('none', 'No Approval Required'),
            ('amount', 'Based on Amount Rules'),
        ],
        string='Payment Approval Policy',
        default='none',
        help="none -> Draft payments can be posted directly.\namount -> Payments are routed through the approval engine.",
    )
    default_receipt_account_id = fields.Many2one(
        comodel_name='account.account',
        string='Default Receipt Counterpart Account',
        domain="[('company_ids', '=', company_id), ('active', '=', True)]",
        help='Pre-filled destination account for direct receipt payments (Employee / Other).',
    )
    default_payment_account_id = fields.Many2one(
        comodel_name='account.account',
        string='Default Payment Counterpart Account',
        domain="[('company_ids', '=', company_id), ('active', '=', True)]",
        help='Pre-filled destination account for direct outbound payments (Employee / Other).',
    )

    def _default_inbound_payment_methods(self):
        res = super()._default_inbound_payment_methods()
        if self._is_payment_method_available('batch_payment'):
            batch_method = self.env.ref('am_account_kit.account_payment_method_batch_deposit', raise_if_not_found=False)
            if batch_method:
                res |= batch_method
        return res

    @api.model
    def _create_batch_payment_outbound_sequence(self):
        IrSequence = self.env['ir.sequence']
        if IrSequence.search_count([('code', '=', 'account.outbound.batch.payment')], limit=1):
            return
        return IrSequence.sudo().create({
            'name': _("Outbound Batch Payments Sequence"),
            'padding': 4,
            'code': 'account.outbound.batch.payment',
            'number_next': 1,
            'number_increment': 1,
            'use_date_range': True,
            'prefix': 'BATCH/OUT/%(year)s/',
            'company_id': False,
        })

    @api.model
    def _create_batch_payment_inbound_sequence(self):
        IrSequence = self.env['ir.sequence']
        if IrSequence.search_count([('code', '=', 'account.inbound.batch.payment')], limit=1):
            return
        return IrSequence.sudo().create({
            'name': _("Inbound Batch Payments Sequence"),
            'padding': 4,
            'code': 'account.inbound.batch.payment',
            'number_next': 1,
            'number_increment': 1,
            'use_date_range': True,
            'prefix': 'BATCH/IN/%(year)s/',
            'company_id': False,
        })

    def open_action_batch_payment(self):
        ctx = self._context.copy()
        ctx.update({'journal_id': self.id, 'default_journal_id': self.id})
        return {
            'name': _('Create Batch Payment'),
            'type': 'ir.actions.act_window',
            'view_mode': 'form',
            'res_model': 'account.batch.payment',
            'context': ctx,
        }

    def action_open_reconcile(self):
        self.ensure_one()

        if self.type in ('bank', 'cash', 'credit'):
            return self.env['account.bank.statement.line']._action_open_bank_reconciliation_widget(
                default_context={
                    'default_journal_id': self.id,
                    'search_default_journal_id': self.id,
                    'search_default_not_matched': True,
                },
            )
        else:
            # Open reconciliation view for customers/suppliers
            return self.env['ir.actions.act_window']._for_xml_id('am_account_kit.action_move_line_posted_unreconciled')

    def action_open_to_check(self):
        self.ensure_one()
        return self.env['account.bank.statement.line']._action_open_bank_reconciliation_widget(
            default_context={
                'search_default_to_check': True,
                'search_default_journal_id': self.id,
                'default_journal_id': self.id,
            },
        )

    def action_open_bank_transactions(self):
        self.ensure_one()
        return self.env['account.bank.statement.line']._action_open_bank_reconciliation_widget(
            default_context={
                'search_default_journal_id': self.id,
                'default_journal_id': self.id
             },
            kanban_first=False,
        )

    def action_open_reconcile_statement(self):
        return self.env['account.bank.statement.line']._action_open_bank_reconciliation_widget(
            default_context={
                'search_default_statement_id': self.env.context.get('statement_id'),
            },
        )

    def get_total_journal_amount(self):
        self.ensure_one()
        currency = self.currency_id or self.company_id.sudo().currency_id
        balance = self.current_statement_balance or 0.0
        return {
            'balance_amount': formatLang(self.env, balance, currency_obj=currency),
            'has_invalid_statements': bool(self.has_invalid_statements),
        }

    def action_open_bank_balance_in_gl(self):
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('account.action_account_moves_all')
        action['name'] = _("%s - General Ledger", self.name)
        action['domain'] = [
            ('display_type', 'not in', ('line_section', 'line_note')),
            ('parent_state', '!=', 'cancel'),
            ('account_id', '=', self.default_account_id.id),
        ]
        action['context'] = {
            'journal_type': 'general',
            'search_default_posted': 1,
        }
        return action

    def open_action(self):
        # EXTENDS account
        # set default action for liquidity journals in dashboard

        if self.type in ('bank', 'cash', 'credit') and not self._context.get('action_name'):
            self.ensure_one()
            return self.env['account.bank.statement.line']._action_open_bank_reconciliation_widget(
                extra_domain=[('line_ids.account_id', '=', self.default_account_id.id)],
                default_context={
                    'default_journal_id': self.id,
                    'search_default_journal_id': self.id,
                },
            )
        return super().open_action()
