# -*- coding: utf-8 -*-
from odoo import models, fields


class ResCompany(models.Model):
    _inherit = "res.company"

    trade_license_number = fields.Char(
        string="Trade License Number",
        help="Commercial registration or trade license number for Alomar company.",
    )
    tax_card_number = fields.Char(
        string="Tax Card Number",
        help="Tax registration identification number.",
    )
