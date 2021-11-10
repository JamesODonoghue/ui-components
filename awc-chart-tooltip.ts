import { CSSResultGroup, TemplateResult } from 'lit';
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { styles } from './awc-chart-tooltip.css.js';

@customElement('awc-chart-tooltip')
export class AwcChartTooltip extends LitElement {
    static get styles(): CSSResultGroup {
        return css`
            ${styles}
        `;
    }

    render(): TemplateResult {
        return html`
            <div class="tooltip">
                <slot></slot>
            </div>
        `;
    }
}
declare global {
    interface HTMLElementTagNameMap {
        'awc-chart-tooltip': AwcChartTooltip;
    }
}
