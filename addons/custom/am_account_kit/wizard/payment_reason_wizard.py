# -*- coding: utf-8 -*-
from odoo import models, fields, _
from odoo.exceptions import UserError


class PaymentReasonWizard(models.TransientModel):
    _name = 'payment.reason.wizard'
    _description = 'Payment Rejection / Cancellation Reason Wizard'

    action_type = fields.Selection([
        ('reject', 'Reject'),
        ('cancel', 'Cancel'),
    ], string='Action Type', default='reject', required=True)

    reason = fields.Text(string='Reason', required=True)

    def action_confirm(self):
        self.ensure_one()
        active_id = self.env.context.get('active_id')
        if not active_id:
            return {'type': 'ir.actions.act_window_close'}

        payment = self.env['account.payment'].browse(active_id)

        if self.action_type == 'reject':
            if payment.state != 'to_approve':
                raise UserError(_("Only payments waiting for approval can be rejected."))
            payment.write({
                'state': 'rejected',
                'rejection_reason': self.reason,
            })
            payment._log_approval_action('reject', self.reason)
            payment.message_post(body=_("Payment rejected. Reason: %s", self.reason))

        elif self.action_type == 'cancel':
            if payment.state == 'canceled':
                raise UserError(_("This payment is already cancelled."))
            payment.action_cancel()
            payment.write({
                'cancellation_reason': self.reason,
            })
            payment._log_approval_action('cancel', self.reason)
            payment.message_post(body=_("Payment cancelled. Reason: %s", self.reason))

        return {'type': 'ir.actions.act_window_close'}

