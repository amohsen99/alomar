# -*- coding: utf-8 -*-
{
    'name': 'Alomar Enterprise Accounting Dashboard & Bank Matching',
    'version': '19.0.1.0.0',
    'category': 'Accounting/Accounting',
    'sequence': 30,
    'summary': 'Enterprise Accounting Dashboard and Bank Matching / Reconciliation UI for Odoo 18',
    'icon': '/account/static/description/icon.png',
    'author': 'Alomar',
    'license': 'LGPL-3',
    'depends': [
        'account',
        'base_accounting_kit',
    ],
    'data': [
        'data/ir_cron.xml',
        'data/account_batch_payment_data.xml',

        'security/ir.model.access.csv',
        'security/account_accountant_security.xml',

        'views/account_account_views.xml',
        'views/account_fiscal_year_view.xml',
        'views/account_journal_dashboard_views.xml',
        'views/account_move_views.xml',
        'views/report_payment_voucher.xml',
        'views/account_payment_views.xml',
        'views/account_batch_payment_views.xml',
        'views/account_reconcile_views.xml',
        'views/account_reconcile_model_views.xml',
        'views/account_accountant_menuitems.xml',
        'views/res_config_settings_views.xml',
        'views/bank_rec_widget_views.xml',
        'views/report_invoice.xml',

        'wizard/account_change_lock_date.xml',
        'wizard/account_auto_reconcile_wizard.xml',
        'wizard/account_reconcile_wizard.xml',
        'wizard/reconcile_model_wizard.xml',
        'wizard/payment_reason_wizard.xml',
        'wizard/batch_error_views.xml',
    ],
    'installable': True,
    'application': False,
    'post_init_hook': '_am_account_kit_post_init',
    'uninstall_hook': 'uninstall_hook',
    'assets': {
        'web.assets_backend': [
            'am_account_kit/static/src/components/**/*',
            'am_account_kit/static/src/**/*.xml',
            'am_account_kit/static/src/scss/enterprise_accounting.scss',
        ],
        'web.report_assets_common': [
            'am_account_kit/static/src/scss/report_batch_payment.scss',
        ],
    },
}

