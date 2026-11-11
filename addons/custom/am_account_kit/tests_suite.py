# -*- coding: utf-8 -*-
"""
Test Suite for am_account_kit in Odoo 19:
1. Payment Channels & Partner Types
2. Approval Engine (amounts, thresholds, and group authorization)
3. Audit Log recording
4. PDF Voucher generation & Amount in words (AR/EN)
5. Batch Payments creation
"""

import odoo
from odoo.orm.registry import Registry
from odoo import api, SUPERUSER_ID


def run_tests():
    config_file = '/etc/odoo/odoo.conf'
    odoo.tools.config.parse_config(['-c', config_file, '-d', 'alomar_local'])
    registry = Registry('alomar_local')

    with registry.cursor() as cr:
        env = api.Environment(cr, SUPERUSER_ID, {})

        print("\n==========================================")
        print("  STARTING AM_ACCOUNT_KIT ODOO 19 VERIFICATION")
        print("==========================================\n")

        company = env.company
        bank_journal = env['account.journal'].search([('type', '=', 'bank'), ('company_id', '=', company.id)], limit=1)
        if not bank_journal:
            raise Exception("No bank journal found!")

        # ---------------------------------------------------------
        # TEST 1: Approval Rules & Amount Policy
        # ---------------------------------------------------------
        print("[TEST 1] Testing Approval Rules & Thresholds...")
        bank_journal.approval_policy = 'amount'

        rule = env['payment.approval.rule'].search([
            ('company_id', '=', company.id),
            ('journal_id', '=', bank_journal.id),
        ], limit=1)
        if not rule:
            rule = env['payment.approval.rule'].create({
                'name': 'High Value Payment Approval (> 5,000)',
                'company_id': company.id,
                'journal_id': bank_journal.id,
                'min_amount': 5000.0,
                'max_amount': 0.0,
                'approver_group_id': env.ref('account.group_account_manager').id,
            })
        else:
            rule.write({
                'min_amount': 5000.0,
                'max_amount': 0.0,
                'approver_group_id': env.ref('account.group_account_manager').id,
                'active': True,
            })

        # Test A: Small Payment (3,000) -> auto-approved
        small_payment = env['account.payment'].create({
            'payment_type': 'outbound',
            'partner_type': 'supplier',
            'partner_type_detail': 'vendor',
            'payment_channel': 'bank_transfer',
            'amount': 3000.0,
            'journal_id': bank_journal.id,
        })
        small_payment.action_send_for_approval()
        assert small_payment.state == 'approved', f"Expected small payment to be approved, got {small_payment.state}"
        print(f"  --> PASS: Payment under 5,000 auto-approved (State: {small_payment.state}).")

        # Test B: Large Payment (15,000) -> to_approve
        large_payment = env['account.payment'].create({
            'payment_type': 'outbound',
            'partner_type': 'supplier',
            'partner_type_detail': 'vendor',
            'payment_channel': 'card',
            'amount': 15000.0,
            'journal_id': bank_journal.id,
        })
        large_payment.action_send_for_approval()
        assert large_payment.state == 'to_approve', f"Expected large payment to be 'to_approve', got {large_payment.state}"
        print(f"  --> PASS: Payment of 15,000 moved to 'to_approve'.")

        # Test C: Approval action
        large_payment.action_approve()
        assert large_payment.state == 'approved', f"Expected large payment to become 'approved', got {large_payment.state}"
        print(f"  --> PASS: Manager successfully approved payment (State: {large_payment.state}).")

        # ---------------------------------------------------------
        # TEST 2: Audit Log & Rejection Wizard
        # ---------------------------------------------------------
        print("\n[TEST 2] Testing Audit Log & Reason Wizard...")
        logs = large_payment.approval_log_ids
        assert len(logs) >= 3, f"Expected at least 3 audit log entries, found {len(logs)}"
        actions = logs.mapped('action')
        print(f"  Audit Log Actions recorded: {actions}")
        assert 'create' in actions and 'send' in actions and 'approve' in actions
        print("  --> PASS: Audit log tracked lifecycle actions.")

        reject_payment = env['account.payment'].create({
            'payment_type': 'outbound',
            'partner_type': 'supplier',
            'partner_type_detail': 'vendor',
            'payment_channel': 'check',
            'amount': 8000.0,
            'journal_id': bank_journal.id,
        })
        reject_payment.action_send_for_approval()
        wizard = env['payment.reason.wizard'].with_context(active_id=reject_payment.id).create({
            'action_type': 'reject',
            'reason': 'Invoice attachment is missing signature',
        })
        wizard.action_confirm()
        assert reject_payment.state == 'rejected', f"Expected state 'rejected', got {reject_payment.state}"
        assert reject_payment.rejection_reason == 'Invoice attachment is missing signature'
        print(f"  --> PASS: Rejection wizard correctly set state to rejected with reason: '{reject_payment.rejection_reason}'.")

        # ---------------------------------------------------------
        # TEST 3: Amount in Words (AR / EN) & Voucher Report
        # ---------------------------------------------------------
        print("\n[TEST 3] Testing Amount in Words & Voucher PDF Generation...")
        assert bool(large_payment.amount_in_words), "Missing Arabic amount in words!"
        assert bool(large_payment.amount_in_words_en), "Missing English amount in words!"
        print(f"  Arabic:  {large_payment.amount_in_words}")
        print(f"  English: {large_payment.amount_in_words_en}")

        report_action = env.ref('am_account_kit.action_report_payment_voucher')
        pdf_content, _ = report_action._render_qweb_pdf('am_account_kit.action_report_payment_voucher', res_ids=large_payment.ids)
        assert pdf_content and len(pdf_content) > 1000, "PDF rendering failed or produced empty document!"
        print(f"  --> PASS: PDF Voucher rendered successfully ({len(pdf_content)} bytes).")

        # ---------------------------------------------------------
        # TEST 4: Batch Payments Creation
        # ---------------------------------------------------------
        print("\n[TEST 4] Testing Batch Payment Creation...")
        batch = env['account.batch.payment'].create({
            'journal_id': bank_journal.id,
            'batch_type': 'outbound',
            'payment_ids': [(6, 0, [small_payment.id, large_payment.id])],
        })
        assert batch.state == 'draft'
        assert len(batch.payment_ids) == 2
        print(f"  Batch Payment created: {batch.name or 'New'} with total {batch.amount} {batch.currency_id.name}")
        print("  --> PASS: Batch Payment created successfully.")

        # Rollback test data
        cr.rollback()
        print("\n==========================================")
        print("  ALL ODOO 19 TESTS PASSED SUCCESSFULLY! (100%)")
        print("==========================================\n")


if __name__ == '__main__':
    run_tests()
