# -*- coding: utf-8 -*-
from odoo import models, fields


class PaymentApprovalRule(models.Model):
    """Approval rules for account.payment based on amount and journal."""
    _name = 'payment.approval.rule'
    _description = 'Payment Approval Rule'
    _order = 'sequence, id'

    name = fields.Char(string='Rule Name', required=True)
    sequence = fields.Integer(string='Sequence', default=10)
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        required=True,
        default=lambda self: self.env.company,
    )
    journal_id = fields.Many2one(
        'account.journal',
        string='Journal',
        domain="[('company_id', '=', company_id), ('type', 'in', ('bank', 'cash'))]",
    )
    min_amount = fields.Monetary(
        string='Minimum Amount',
        currency_field='currency_id',
        default=0.0,
    )
    max_amount = fields.Monetary(
        string='Maximum Amount',
        currency_field='currency_id',
        default=0.0,
    )
    currency_id = fields.Many2one(
        'res.currency',
        string='Currency',
        default=lambda self: self.env.company.currency_id,
    )
    approver_group_id = fields.Many2one(
        'res.groups',
        string='Approver Group',
        default=lambda self: self.env.ref('account.group_account_manager', raise_if_not_found=False),
    )
    active = fields.Boolean(default=True)


class PaymentApprovalLog(models.Model):
    """Immutable audit log of all approval and state transition actions on account.payment."""
    _name = 'payment.approval.log'
    _description = 'Payment Approval Log'
    _order = 'date desc, id desc'
    _rec_name = 'payment_id'

    payment_id = fields.Many2one(
        'account.payment',
        string='Payment',
        required=True,
        ondelete='cascade',
        readonly=True,
        index=True,
    )
    company_id = fields.Many2one(
        'res.company',
        related='payment_id.company_id',
        store=True,
        readonly=True,
    )
    user_id = fields.Many2one(
        'res.users',
        string='User',
        required=True,
        default=lambda self: self.env.user,
        readonly=True,
    )
    action = fields.Selection([
        ('create', 'Created'),
        ('send', 'Sent for Approval'),
        ('approve', 'Approved'),
        ('reject', 'Rejected'),
        ('post', 'Posted'),
        ('cancel', 'Cancelled'),
        ('reset', 'Reset to Draft'),
    ], string='Action', required=True, readonly=True)
    reason = fields.Text(string='Comments / Reason', readonly=True)
    date = fields.Datetime(string='Date & Time', default=fields.Datetime.now, readonly=True)

