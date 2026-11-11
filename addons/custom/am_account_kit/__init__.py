# -*- coding: utf-8 -*-

from . import models
from . import wizard

from odoo import Command


def _am_account_kit_post_init(env):
    for company in env['res.company'].search([('chart_template', '!=', False)], order="parent_path"):
        ChartTemplate = env['account.chart.template'].with_company(company)
        ChartTemplate._load_data({
            'res.company': ChartTemplate._get_am_account_kit_res_company(company.chart_template),
        })


def uninstall_hook(env):
    group_basic = env.ref('account.group_account_basic', raise_if_not_found=False)
    group_manager = env.ref('account.group_account_manager', raise_if_not_found=False)
    if group_basic and group_manager:
        group_basic.write({
            'users': [Command.clear()],
            'category_id': env.ref("base.module_category_hidden").id,
        })
        group_manager.write({
            'implied_ids': [Command.unlink(group_basic.id)],
        })

