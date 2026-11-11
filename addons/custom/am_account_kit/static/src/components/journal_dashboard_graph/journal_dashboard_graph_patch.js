/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { getColor, hexToRGBA, getCustomColor } from "@web/core/colors/colors";
import { JournalDashboardGraphField } from "@web/views/fields/journal_dashboard_graph/journal_dashboard_graph_field";

const BRIGHT_GRID_COLOR = "#d8dadd";
const BRIGHT_LABEL_COLOR = "#111827";

patch(JournalDashboardGraphField.prototype, {
    getLineChartConfig() {
        const labels = this.data[0].values.map((pt) => pt.x);
        const color10 = getColor(3, "bright", "odoo");
        const borderColor = this.data[0].is_sample_data ? hexToRGBA(color10, 0.1) : color10;
        const backgroundColor = this.data[0].is_sample_data
            ? hexToRGBA(color10, 0.05)
            : hexToRGBA(color10, 0.2);
        return {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        backgroundColor,
                        borderColor,
                        data: this.data[0].values,
                        fill: "start",
                        label: this.data[0].key,
                        borderWidth: 2,
                    },
                ],
            },
            options: {
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: !this.data[0].is_sample_data,
                        intersect: false,
                        position: "nearest",
                        caretSize: 0,
                    },
                },
                scales: {
                    y: {
                        display: false,
                    },
                    x: {
                        display: false,
                    },
                },
                maintainAspectRatio: false,
                elements: {
                    line: {
                        tension: 0.000001,
                    },
                },
            },
        };
    },

    getBarChartConfig() {
        const data = [];
        const labels = [];
        const backgroundColor = [];

        const color13 = getColor(2, "bright", "odoo"); // #DCD0D9 (past / Due)
        const color19 = getColor(1, "bright", "odoo"); // #A5D8D7 (future / Not Due)
        this.data[0].values.forEach((pt) => {
            data.push(pt.value);
            labels.push(pt.label);
            if (pt.type === "past") {
                backgroundColor.push(color13);
            } else if (pt.type === "future") {
                backgroundColor.push(color19);
            } else {
                backgroundColor.push(getCustomColor("bright", "#ebebeb", "#3C3E4B"));
            }
        });
        return {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        backgroundColor,
                        data,
                        fill: "start",
                        label: this.data[0].key,
                    },
                ],
            },
            options: {
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: !this.data[0].is_sample_data,
                        intersect: false,
                        position: "nearest",
                        caretSize: 0,
                    },
                },
                scales: {
                    y: {
                        display: false,
                    },
                    x: {
                        grid: {
                            color: BRIGHT_GRID_COLOR,
                        },
                        ticks: {
                            color: BRIGHT_LABEL_COLOR,
                        },
                        border: {
                            color: BRIGHT_GRID_COLOR,
                        },
                    },
                },
                maintainAspectRatio: false,
                elements: {
                    line: {
                        tension: 0.000001,
                    },
                },
            },
        };
    },
});

