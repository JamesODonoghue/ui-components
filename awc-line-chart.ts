import {
    css,
    html,
    LitElement,
    svg,
    SVGTemplateResult,
    TemplateResult,
    CSSResultGroup,
} from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { guard } from 'lit/directives/guard.js';
import { ref, createRef, Ref } from 'lit/directives/ref.js';
import { flip } from '@lit-labs/motion';
import { pointer } from 'd3-selection';
import { ScaleLinear, scaleLinear, ScaleTime, scaleTime } from 'd3-scale';
import { bisector, extent } from 'd3-array';
import { ILegendItem } from '@awc/awc-legend';
import { styles } from './awc-line-chart.css.js';
import { GridLines, XAxes } from './common/common.js';
import {
    getFormattedTooltipDate,
    getPath,
    makeCatmullPath,
} from './utils/utils.js';

import './awc-chart-tooltip.js';
import '@awc/awc-legend';

export interface TimeSeriesItem {
    timestamp: Date | string;
    close: number;
}

export interface ChartColor {
    var: string;
    fallback: string;
}
export interface TimeSeries {
    data: TimeSeriesItem[];
    name: string;
    hoveredItem?: TimeSeriesItem;
    color?: ChartColor;
}

export type LegendFormatter = (value: number) => string;

const bisect = bisector<TimeSeriesItem, Date>(
    ({ timestamp }) => new Date(timestamp)
).right;

@customElement('awc-line-chart')
export class AwcLineChart extends LitElement {
    private paddingTop = 48;
    private paddingLeft = 48;
    private paddingBottom = 48;
    private paddingRight = 48;
    private tickSize = 4;
    private tooltipRef: Ref = createRef<HTMLElement>();
    private svgRef: Ref = createRef<SVGSVGElement>();
    @state() private mouseLineX = 0;
    @state() private mouseLine: Ref = createRef<HTMLElement>();
    @state() private scaleX!: ScaleTime<number, number, never>;
    @state() private scaleY!: ScaleLinear<number, number, never>;
    @state() private seriesMap: Map<string, TimeSeries> = new Map();

    @property({ type: Number }) viewBoxWidth = 1024;
    @property({ type: Number }) viewBoxHeight = 480;
    @property({ type: Boolean }) pathAnimate = false;
    @property({ type: Boolean }) pathSmoothing = false;
    @property({ type: Array }) series: TimeSeries[] = [];
    @property() legendFormatter: LegendFormatter = (value: number) =>
        value.toString();

    static get styles(): CSSResultGroup {
        return css`
            ${styles}
        `;
    }

    connectedCallback(): void {
        super.connectedCallback();
        if (!this.isSeriesPopulated()) {
            return;
        }
        this.initScaleX();
        this.initScaleY();
        this.initSeriesMap();
        this.initResizeHandler();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        window.removeEventListener('resize', this.handleResize);
    }

    firstUpdated(
        _changedProperties: Map<string | number | symbol, unknown>
    ): void {
        super.firstUpdated(_changedProperties);
        if (!this.isSeriesPopulated() || !this.svgRef.value) {
            return;
        }

        const { width } = this.svgRef.value.getBoundingClientRect() as DOMRect;
        this.viewBoxWidth = width;
    }

    willUpdate(
        _changedProperties: Map<string | number | symbol, unknown>
    ): void {
        if (!this.isSeriesPopulated()) {
            return;
        }
        if (_changedProperties.has('viewBoxWidth')) {
            this.initScaleX();
        }

        if (_changedProperties.has('viewBoxHeight')) {
            this.initScaleY();
        }

        if (
            _changedProperties.has('series') ||
            _changedProperties.has('pathSmoothing') ||
            _changedProperties.has('pathAnimate')
        ) {
            this.initScaleX();
            this.initScaleY();
            this.initSeriesMap();
        }
    }

    private isSeriesPopulated() {
        return this.series?.length;
    }

    private initResizeHandler() {
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    private handleResize() {
        if (!this.svgRef.value) {
            return;
        }
        const { width } = this.svgRef.value.getBoundingClientRect() as DOMRect;
        this.viewBoxWidth = width;
    }

    private initSeriesMap() {
        this.seriesMap = new Map(
            this.series.map(key => [
                key.name,
                { ...key, hoveredItem: key.data[key.data.length - 1] },
            ])
        );
    }

    private initScaleX() {
        const extentX = extent(
            this.getFlatSeries().data,
            item => new Date(item.timestamp)
        );

        this.scaleX = scaleTime()
            .domain(extentX as [Date, Date])
            .range([this.paddingLeft, this.viewBoxWidth - this.paddingRight]);
    }

    private initScaleY() {
        const extentY = extent(this.getFlatSeries().data, item => item.close);

        this.scaleY = scaleLinear()
            .domain(extentY as [number, number])
            .nice()
            .range([this.viewBoxHeight - this.paddingTop, this.paddingBottom]);
    }

    private getFlatSeries() {
        return this.series.reduce((acc, val) => ({
            data: acc.data.concat(val.data),
            name: 'total',
        }));
    }

    private get minX() {
        const earliestDates = this.series.map(
            el => +new Date(el.data[0].timestamp)
        );

        const minDate = Math.min(...earliestDates);
        return this.scaleX(new Date(minDate));
    }

    private get maxX() {
        const latestDates = this.series.map(
            el => +new Date(el.data[el.data.length - 1].timestamp)
        );

        const maxDate = Math.max(...latestDates);
        return this.scaleX(new Date(maxDate));
    }

    private get maxY() {
        return this.viewBoxHeight - this.paddingBottom;
    }

    private get minY() {
        return this.paddingBottom;
    }

    private get xTicks() {
        return this.viewBoxWidth / 180;
    }

    private get yTicks() {
        return this.viewBoxHeight / 64;
    }

    private getAreaPath() {
        return `
            ${this.getPath()}
            L ${this.maxX} ${this.maxY}
            L ${this.minX} ${this.maxY}
            L ${this.minX} ${this.minY}
        `;
    }

    private getTooltipDate() {
        for (const [, { data }] of this.seriesMap) {
            const hoveredDate = this.scaleX.invert(this.mouseLineX);
            const hoveredIndex = bisect(data, hoveredDate);
            const hoveredItem = data[hoveredIndex];
            if (hoveredIndex && hoveredItem) {
                const date = new Date(hoveredItem.timestamp as string);
                const formattedDate = getFormattedTooltipDate(date);
                return formattedDate;
            }
        }
        return undefined;
    }

    private getPath(data = this.series[0].data): string {
        const rawSeries = this.getRawXandYFromScale(data);

        if (this.pathSmoothing) {
            return makeCatmullPath(rawSeries);
        }

        return getPath(rawSeries);
    }

    private getRawXandYFromScale(data: TimeSeriesItem[]) {
        return data.map(({ close, timestamp }) => ({
            x: this.scaleX(new Date(timestamp)),
            y: this.scaleY(close),
        }));
    }

    private renderSeriesPath(
        { data }: TimeSeries,
        index: number
    ): SVGTemplateResult {
        return svg` <g class="path color-${index}">
            <path
                data-testid="chart-path"
                d=${guard([this.scaleX, this.series], () => this.getPath(data))}
                ${flip({ disabled: !this.pathAnimate })}
            ></path>
        </g>`;
    }

    private renderSeriesPaths(): SVGTemplateResult[] {
        return this.series.map((item, index) =>
            this.renderSeriesPath(item, index)
        );
    }

    private renderLegend() {
        return html`
            <awc-legend
                showValues
                circle
                .data=${this.series.map(this.renderLegendItem.bind(this))}
            ></awc-legend>
        `;
    }

    private renderLegendItem({ name }: TimeSeries): ILegendItem {
        const { close } = this.getHoveredItemFromMap({ name });
        return {
            name,
            value: this.legendFormatter(close),
        };
    }

    private getHoveredItemFromMap({ name }: { name: string }) {
        const { hoveredItem } = this.seriesMap.get(name) as TimeSeries;
        return hoveredItem as TimeSeriesItem;
    }

    private renderXTicks() {
        return svg`
            <g class="ticks x" data-testid="chart-ticks-x">
                ${this.scaleX
                    .ticks(this.xTicks)
                    .map(this.renderXTick.bind(this))}
            </g>
        `;
    }

    private renderXTick(date: Date) {
        return svg`
            <g>
                <text
                    data-testid="chart-tick-x"
                    text-anchor="middle"
                    x=${this.scaleX(date)}
                    y=${this.viewBoxHeight - this.paddingBottom / 2}
                    >${this.scaleX.tickFormat()(date)}</text
                >
                <line
                    class="tick-line"
                    x1=${this.scaleX(date)}
                    y1=${this.maxY}
                    x2=${this.scaleX(date)}
                    y2=${this.maxY + this.tickSize}
                ></line>
            </g>
        `;
    }

    private renderYTicks() {
        return svg`
            <g class="ticks y" data-testid="chart-ticks-y">
                ${this.scaleY
                    .ticks(this.yTicks)
                    .map(this.renderYTick.bind(this))}
            </g>
        `;
    }

    private renderYTick(tick: number) {
        return svg`
            <g>
                <text x="0" y=${this.scaleY(tick)} data-testid="chart-tick-y"
                    >${tick}</text
                >
            </g>
        `;
    }

    private renderGridLines() {
        const { minX, maxX, scaleY } = this;
        return GridLines({ minX, maxX, scaleY });
    }

    private renderAxes() {
        const { minX, maxX, maxY } = this;
        return XAxes({ minX, maxX, maxY });
    }

    private renderMarker({ name }: TimeSeries, index = 0) {
        return svg`
            <g class="marker marker-${index}" data-testid="chart-marker">
                <circle
                    r="6"
                    cx=${this.getMarkerX(name)}
                    cy=${this.getMarkerY(name)}
                ></circle>
            </g>
        `;
    }

    private getMarkerX(name: string) {
        const { timestamp } = this.getHoveredItemFromMap({ name });
        return this.scaleX(new Date(timestamp));
    }

    private getMarkerY(name: string) {
        const { close } = this.getHoveredItemFromMap({ name });
        return this.scaleY(close);
    }

    private renderMarkers() {
        return svg`
            ${this.series.map(this.renderMarker.bind(this))}
        `;
    }

    private renderTooltip() {
        return html`
            <div
                ${ref(this.tooltipRef)}
                data-testid="chart-tooltip"
                class="tooltip-container"
                ?hidden=${!(this.mouseLineX > 0)}
                style="top: ${this.paddingTop}px; left: ${this.mouseLineX}px;"
            >
                <awc-chart-tooltip>
                    <div class="tooltip__date">${this.getTooltipDate()}</div>
                </awc-chart-tooltip>
            </div>
        `;
    }

    private renderMouseLine() {
        if (!this.mouseLineX) {
            return svg``;
        }

        return svg`
            <g class="mouse-line" data-testid="chart-mouse-line">
                <line
                    x1=${this.mouseLineX}
                    y1=${this.paddingTop}
                    x2=${this.mouseLineX}
                    y2=${this.maxY}
                    ${ref(this.mouseLine)}
                ></line>
            </g>
        `;
    }

    private renderArea() {
        if (this.series.length !== 1) {
            return svg``;
        }

        return svg`
            <defs
                ><linearGradient data-testid="chart-area-gradient" id="grad" x1="0%" x2="0%" y1="0%" y2="100%"
                    ><stop
                        offset="0%"
                        stop-color="var(--color-chart-base-100, #307fe2)"
                        stop-opacity="0.38"
                    ></stop
                    ><stop
                        offset="90%"
                        stop-color="var(--color-chart-base-100, #307fe2)"
                        stop-opacity="0"
                    ></stop></linearGradient
            ></defs>
            <path
                data-testid="chart-area-path"
                d=${this.getAreaPath()}
                fill="url(#grad)"
                stroke="none"
                ${flip({ disabled: !this.pathAnimate })}
            ></path>
        `;
    }

    private handleMouseLeave() {
        this.resetHoverState();
    }

    private handleMouseMove(e: MouseEvent) {
        const [hoveredX] = pointer(e);
        if (this.isHoveredXWithinSvgBounds(hoveredX)) {
            this.setHoveredItemInSeriesMap(hoveredX);
        } else {
            this.resetHoverState();
        }
    }

    private isHoveredXWithinSvgBounds(hoveredX: number) {
        return hoveredX > this.minX && hoveredX < this.maxX;
    }

    private setHoveredItemInSeriesMap(hoveredX: number) {
        this.mouseLineX = hoveredX;

        this.seriesMap.forEach((series, seriesKey) => {
            const hoveredItem = this.getHoveredItemFromSeries(series, hoveredX);
            this.seriesMap.set(seriesKey, { ...series, hoveredItem });
        });
    }

    private getHoveredItemFromSeries(series: TimeSeries, hoveredX: number) {
        const { data } = series;
        const hoveredDate = this.scaleX.invert(hoveredX);
        const hoveredIndex = Math.min(
            bisect(data, hoveredDate),
            data.length - 1
        );

        const hoveredItem = data[hoveredIndex];
        return hoveredItem;
    }

    private resetHoverState() {
        this.mouseLineX = 0;
        this.initSeriesMap();
    }

    render(): TemplateResult {
        return this.isSeriesPopulated()
            ? html`
                  ${this.renderLegend()} ${svg` <svg
                      data-testid="chart-svg"
                      class="container__svg"
                      height=${this.viewBoxHeight}
                      @mousemove=${this.handleMouseMove}
                      @mouseleave=${this.handleMouseLeave}
                      ${ref(this.svgRef)}
                  >
                    ${this.renderAxes()}
                    ${this.renderGridLines()}
                    ${this.renderMouseLine()}
                    ${this.renderSeriesPaths()}
                    ${this.renderYTicks()}
                    ${this.renderXTicks()} ${this.renderArea()}
                    ${this.renderMarkers()}
                  </svg>`} ${this.renderTooltip()}
              `
            : html``;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'awc-line-chart': AwcLineChart;
    }
}
