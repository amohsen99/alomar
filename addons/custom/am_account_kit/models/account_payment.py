# -*- coding: utf-8 -*-
import ast
from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


class AccountPaymentRegister(models.TransientModel):
    _inherit = 'account.payment.register'

    payment_channel = fields.Selection([
        ('cash', 'Cash'),
        ('bank_transfer', 'Bank Transfer'),
        ('card', 'Card'),
        ('wallet', 'Wallet'),
        ('check', 'Check'),
        ('other', 'Other'),
    ], string='Payment Channel', required=True, default='cash')

    def _create_payment_vals_from_wizard(self, batch_result):
        res = super()._create_payment_vals_from_wizard(batch_result)
        res['payment_channel'] = self.payment_channel
        res['partner_type_detail'] = 'customer' if self.partner_type == 'customer' else 'vendor'
        return res

    def _create_payment_vals_from_batch(self, batch_result):
        res = super()._create_payment_vals_from_batch(batch_result)
        res['payment_channel'] = self.payment_channel
        res['partner_type_detail'] = 'customer' if self.partner_type == 'customer' else 'vendor'
        return res


class AccountPayment(models.Model):
    _inherit = "account.payment"

    state = fields.Selection(
        selection_add=[
            ('to_approve', 'To Approve'),
            ('approved', 'Approved'),
            ('in_process',),
        ],
        ondelete={
            'to_approve': 'set default',
            'approved': 'set default',
        },
    )

    payment_channel = fields.Selection([
        ('cash', 'Cash'),
        ('bank_transfer', 'Bank Transfer'),
        ('card', 'Card'),
        ('wallet', 'Wallet'),
        ('check', 'Check'),
        ('other', 'Other'),
    ], string='Payment Channel', required=True, default='cash', tracking=True)

    partner_type_detail = fields.Selection([
        ('customer', 'Customer'),
        ('vendor', 'Vendor'),
        ('employee', 'Employee'),
        ('other', 'Other'),
    ], string='Partner Type Detail', default=lambda self: 'vendor' if self._context.get('default_partner_type') == 'supplier' else 'customer', required=True, tracking=True)

    destination_account_id = fields.Many2one(
        comodel_name='account.account',
        string='Destination / Counterpart Account',
        store=True,
        readonly=False,
        compute='_compute_destination_account_id',
        domain="[('active', '=', True), ('company_ids', '=', company_id)]",
        check_company=True,
        tracking=True,
    )

    rejection_reason = fields.Text(string='Rejection Reason', tracking=True, copy=False, readonly=True)
    cancellation_reason = fields.Text(string='Cancellation Reason', tracking=True, copy=False, readonly=True)
    approval_log_ids = fields.One2many('payment.approval.log', 'payment_id', string='Audit Logs', readonly=True)
    can_user_approve = fields.Boolean(compute='_compute_can_user_approve', string='Can Current User Approve')

    batch_payment_id = fields.Many2one('account.batch.payment', ondelete='set null', copy=False, check_company=True)
    payment_method_name = fields.Char(related='payment_method_line_id.name')

    amount_in_words = fields.Text(string='Amount in Words (AR)', compute='_compute_amount_in_words')
    amount_in_words_en = fields.Text(string='Amount in Words (EN)', compute='_compute_amount_in_words')

    def _get_matching_approval_rules(self):
        self.ensure_one()
        return self.env['payment.approval.rule'].search([
            ('company_id', '=', self.company_id.id),
            ('active', '=', True),
            '|', ('journal_id', '=', False), ('journal_id', '=', self.journal_id.id),
            ('min_amount', '<=', self.amount),
            '|', ('max_amount', '=', 0.0), ('max_amount', '>=', self.amount),
        ], order='sequence, id')

    def _compute_can_user_approve(self):
        user = self.env.user
        for payment in self:
            if payment.state != 'to_approve':
                payment.can_user_approve = False
                continue

            # Superuser / root can always approve
            if user._is_admin():
                payment.can_user_approve = True
                continue

            rules = payment._get_matching_approval_rules()
            if not rules:
                # If no specific rule matched, standard Account Manager can approve
                payment.can_user_approve = user.has_group('account.group_account_manager')
            else:
                # User can approve if they belong to any required approver group on matching rules
                # or belong to group_account_manager if no specific group was configured
                can_approve = False
                for rule in rules:
                    if rule.approver_group_id:
                        if rule.approver_group_id in user.groups_id:
                            can_approve = True
                            break
                    elif user.has_group('account.group_account_manager'):
                        can_approve = True
                        break
                payment.can_user_approve = can_approve

    @api.onchange('partner_type_detail', 'payment_type')
    def _onchange_partner_type_detail(self):
        if self.partner_type_detail == 'customer':
            self.partner_type = 'customer'
        elif self.partner_type_detail == 'vendor':
            self.partner_type = 'supplier'
        else:
            self.partner_type = 'customer' if self.payment_type == 'inbound' else 'supplier'

    @api.depends('journal_id', 'partner_id', 'partner_type', 'partner_type_detail', 'payment_type')
    def _compute_destination_account_id(self):
        super()._compute_destination_account_id()
        for pay in self:
            if pay.partner_type_detail in ('employee', 'other'):
                if pay.payment_type == 'inbound' and pay.journal_id.default_receipt_account_id:
                    pay.destination_account_id = pay.journal_id.default_receipt_account_id
                elif pay.payment_type == 'outbound' and pay.journal_id.default_payment_account_id:
                    pay.destination_account_id = pay.journal_id.default_payment_account_id

    @api.depends('amount', 'currency_id')
    def _compute_amount_in_words(self):
        ARABIC_CURRENCY_MAP = {
            'EGP': ('جنيه', 'قرش'),
            'SAR': ('ريال', 'هللة'),
            'AED': ('درهم', 'فلس'),
            'KWD': ('دينار', 'فلس'),
            'BHD': ('دينار', 'فلس'),
            'OMR': ('ريال', 'بيسة'),
            'QAR': ('ريال', 'درهم'),
            'JOD': ('دينار', 'فلس'),
            'USD': ('دولار', 'سنت'),
            'EUR': ('يورو', 'سنت'),
        }
        for payment in self:
            if payment.amount and payment.currency_id:
                curr_code = payment.currency_id.name
                if curr_code in ARABIC_CURRENCY_MAP:
                    currency_name, fraction_name = ARABIC_CURRENCY_MAP[curr_code]
                else:
                    currency_name = payment.currency_id.currency_unit_label or payment.currency_id.name or ''
                    fraction_name = payment.currency_id.currency_subunit_label or ''

                payment.amount_in_words = payment._amount_to_arabic_words(
                    payment.amount, currency_name, fraction_name
                )
                try:
                    payment.amount_in_words_en = payment.currency_id.amount_to_text(payment.amount)
                except Exception:
                    payment.amount_in_words_en = f"{payment.currency_id.symbol or ''} {payment.amount:,.2f}"
            else:
                payment.amount_in_words = ''
                payment.amount_in_words_en = ''

    def _amount_to_arabic_words(self, amount, currency_name='ريال', fraction_name='هللة'):
        units = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
                 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
        tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
        hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']

        def convert_group(n):
            if n == 0:
                return ''
            c_hundred = n // 100
            remainder = n % 100
            res = []
            if c_hundred > 0:
                res.append(hundreds[c_hundred])
            if remainder > 0:
                if remainder < 20:
                    res.append(units[remainder])
                else:
                    c_unit = remainder % 10
                    c_ten = remainder // 10
                    if c_unit > 0:
                        res.append(units[c_unit] + ' و' + tens[c_ten])
                    else:
                        res.append(tens[c_ten])
            return ' و'.join(res)

        def convert_number(num):
            if num == 0:
                return 'صفر'
            num = int(num)
            billions = num // 1000000000
            millions = (num % 1000000000) // 1000000
            thousands = (num % 1000000) // 1000
            remainder = num % 1000

            parts = []
            if billions > 0:
                if billions == 1:
                    parts.append('مليار')
                elif billions == 2:
                    parts.append('ملياران')
                else:
                    parts.append(convert_group(billions) + ' مليار')

            if millions > 0:
                if millions == 1:
                    parts.append('مليون')
                elif millions == 2:
                    parts.append('مليونان')
                elif 3 <= millions <= 10:
                    parts.append(convert_group(millions) + ' ملايين')
                else:
                    parts.append(convert_group(millions) + ' مليون')

            if thousands > 0:
                if thousands == 1:
                    parts.append('ألف')
                elif thousands == 2:
                    parts.append('ألفان')
                elif 3 <= thousands <= 10:
                    parts.append(convert_group(thousands) + ' آلاف')
                else:
                    parts.append(convert_group(thousands) + ' ألف')

            if remainder > 0:
                parts.append(convert_group(remainder))

            return ' و'.join(parts)

        integer_part = int(amount)
        fraction_part = int(round((amount - integer_part) * 100))

        words = convert_number(integer_part)
        if currency_name:
            words += ' ' + currency_name
        if fraction_part > 0:
            words += ' و' + convert_number(fraction_part)
            if fraction_name:
                words += ' ' + fraction_name
        words += ' فقط لا غير'
        return words

    @api.constrains('state', 'move_id')
    def _check_move_id(self):
        for payment in self:
            if (
                payment.state not in ('draft', 'to_approve', 'approved', 'rejected', 'canceled')
                and not payment.move_id
                and payment.outstanding_account_id
            ):
                raise ValidationError(_("A payment with an outstanding account cannot be confirmed without having a journal entry."))

    def _log_approval_action(self, action, reason=False):
        for payment in self:
            self.env['payment.approval.log'].sudo().create({
                'payment_id': payment.id,
                'user_id': self.env.user.id,
                'action': action,
                'reason': reason or '',
                'date': fields.Datetime.now(),
            })

    @api.model_create_multi
    def create(self, vals_list):
        payments = super().create(vals_list)
        payments._log_approval_action('create', _('Payment created'))
        return payments

    # -------------------------------------------------------------------------
    # APPROVAL & WORKFLOW ACTIONS
    # -------------------------------------------------------------------------

    def _check_attachment_requirement(self):
        require_attachment = self.env['ir.config_parameter'].sudo().get_param(
            'am_account_kit.require_payment_attachment', 'False'
        )
        if require_attachment == 'True':
            for payment in self:
                has_att = bool(payment.message_main_attachment_id) or bool(
                    self.env['ir.attachment'].search_count([
                        ('res_model', '=', 'account.payment'),
                        ('res_id', '=', payment.id),
                    ])
                )
                if not has_att:
                    raise UserError(_("Attachment is required before submitting or confirming this payment."))

    def action_send_for_approval(self):
        self._check_attachment_requirement()
        for payment in self:
            if payment.amount <= 0:
                raise ValidationError(_("The payment amount must be strictly greater than zero."))

            policy = payment.journal_id.approval_policy or 'none'
            matching_rules = self.env['payment.approval.rule'].search([
                ('company_id', '=', payment.company_id.id),
                ('active', '=', True),
                '|', ('journal_id', '=', False), ('journal_id', '=', payment.journal_id.id),
                ('min_amount', '<=', payment.amount),
                '|', ('max_amount', '=', 0.0), ('max_amount', '>=', payment.amount),
            ], order='sequence, id')

            if policy == 'none':
                payment.state = 'approved'
                payment._log_approval_action('approve', _('Auto-approved (No approval required on journal)'))
            elif matching_rules:
                payment.state = 'to_approve'
                payment._log_approval_action('send', _('Sent for approval'))
            else:
                all_rules = self.env['payment.approval.rule'].search([
                    ('company_id', '=', payment.company_id.id),
                    ('active', '=', True),
                    '|', ('journal_id', '=', False), ('journal_id', '=', payment.journal_id.id),
                ])
                finite_max_amounts = all_rules.filtered(lambda r: r.max_amount > 0.0).mapped('max_amount')
                absolute_max = max(finite_max_amounts) if finite_max_amounts else 0.0
                if absolute_max > 0.0 and payment.amount > absolute_max:
                    has_infinity_rule = any(r.max_amount == 0.0 for r in all_rules)
                    if not has_infinity_rule:
                        raise ValidationError(_(
                            "The payment amount (%(amount)s) exceeds the maximum allowed limit (%(max)s) defined in approval rules.",
                            amount=payment.amount,
                            max=absolute_max,
                        ))
                payment.state = 'approved'
                payment._log_approval_action('approve', _('Auto-approved (Amount below approval thresholds)'))

    def action_approve(self):
        user = self.env.user
        for payment in self:
            if not user._is_admin():
                rules = payment._get_matching_approval_rules()
                if rules:
                    allowed = False
                    required_group_names = []
                    for rule in rules:
                        if rule.approver_group_id:
                            required_group_names.append(rule.approver_group_id.name)
                            if rule.approver_group_id in user.groups_id:
                                allowed = True
                                break
                        elif user.has_group('account.group_account_manager'):
                            allowed = True
                            break
                    if not allowed:
                        groups_str = ', '.join(required_group_names) if required_group_names else _("Accounting Manager")
                        raise UserError(_(
                            "You are not authorized to approve this payment. Approval requires membership in: %(groups)s.",
                            groups=groups_str,
                        ))
                elif not user.has_group('account.group_account_manager'):
                    raise UserError(_("Only an Accounting Manager can approve this payment."))

            payment.state = 'approved'
            payment._log_approval_action('approve', _('Approved by %s') % user.name)

    def action_reject_with_reason(self):
        self.ensure_one()
        return {
            'name': _('Reject Payment'),
            'type': 'ir.actions.act_window',
            'res_model': 'payment.reason.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_action_type': 'reject', 'active_id': self.id},
        }

    def action_cancel_with_reason(self):
        self.ensure_one()
        return {
            'name': _('Cancel Payment'),
            'type': 'ir.actions.act_window',
            'res_model': 'payment.reason.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_action_type': 'cancel', 'active_id': self.id},
        }

    def action_post(self):
        self._check_attachment_requirement()
        for payment in self:
            if payment.journal_id.approval_policy == 'amount' and payment.state == 'draft':
                matching_rules = self.env['payment.approval.rule'].search([
                    ('company_id', '=', payment.company_id.id),
                    ('active', '=', True),
                    '|', ('journal_id', '=', False), ('journal_id', '=', payment.journal_id.id),
                    ('min_amount', '<=', payment.amount),
                    '|', ('max_amount', '=', 0.0), ('max_amount', '>=', payment.amount),
                ], limit=1)
                if matching_rules:
                    raise UserError(_("This payment requires approval before it can be confirmed. Please click 'Send for Approval' first."))
            if payment.state == 'to_approve':
                raise UserError(_("This payment is waiting for manager approval before it can be confirmed."))
            if payment.state == 'approved':
                payment.state = 'draft'

        res = super().action_post()
        self._log_approval_action('post', _('Payment confirmed and posted'))
        return res

    def action_draft(self):
        res = super().action_draft()
        self._log_approval_action('reset', _('Reset to draft'))
        return res

    # -------------------------------------------------------------------------
    # RECONCILIATION WIDGET ACTIONS
    # -------------------------------------------------------------------------

    def action_open_manual_reconciliation_widget(self):
        ''' Open the manual reconciliation widget for the current payment.
        :return: A dictionary representing an action.
        '''
        self.ensure_one()
        action_values = self.env['ir.actions.act_window']._for_xml_id('am_account_kit.action_move_line_posted_unreconciled')
        if self.partner_id:
            context = ast.literal_eval(action_values['context'])
            context.update({'search_default_partner_id': self.partner_id.id})
            if self.partner_type == 'customer':
                context.update({'search_default_trade_receivable': 1})
            elif self.partner_type == 'supplier':
                context.update({'search_default_trade_payable': 1})
            action_values['context'] = context
        return action_values

    def button_open_statement_lines(self):
        # OVERRIDE
        """ Redirect the user to the statement line(s) reconciled to this payment.
            :return: An action to open the view of the payment in the reconciliation widget.
        """
        self.ensure_one()

        return self.env['account.bank.statement.line']._action_open_bank_reconciliation_widget(
            extra_domain=[('id', 'in', self.reconciled_statement_line_ids.ids)],
            default_context={
                'create': False,
                'default_st_line_id': self.reconciled_statement_line_ids.ids[-1],
            },
            name=_("Matched Transactions")
        )

    def get_report_css(self):
        from odoo.tools import file_open
        try:
            with file_open('am_account_kit/static/src/css/voucher_style.css', 'r') as f:
                return f.read()
        except FileNotFoundError:
            return ""

    @api.model
    def create_batch_payment(self):
        batch = self.env['account.batch.payment'].create({
            'journal_id': self[0].journal_id.id,
            'payment_ids': [(4, payment.id, None) for payment in self],
            'payment_method_id': self[0].payment_method_id.id,
            'batch_type': self[0].payment_type,
        })

        return {
            "type": "ir.actions.act_window",
            "res_model": "account.batch.payment",
            "views": [[False, "form"]],
            "res_id": batch.id,
        }

    def button_open_batch_payment(self):
        self.ensure_one()
        return {
            'name': _("Batch Payment"),
            'type': 'ir.actions.act_window',
            'res_model': 'account.batch.payment',
            'context': {'create': False},
            'view_mode': 'form',
            'res_id': self.batch_payment_id.id,
        }
