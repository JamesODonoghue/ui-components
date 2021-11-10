import { TimeSeries } from '../awc-line-chart.js';

export const getFormattedTooltipDate = (date: Date): string =>
    date.toLocaleDateString('en', {
        month: 'short',
        year: 'numeric',
        day: '2-digit',
    });

export const generateSeries = (
    name = 'Series',
    monthOffset = 0
): TimeSeries => {
    const series: TimeSeries = {
        name,
        data: [],
    };
    let timestamp = new Date();
    if (monthOffset) timestamp.setMonth(timestamp.getMonth() + monthOffset);
    let close = Math.floor(Math.random() * 100);

    for (let i = 0; i < 24 * 12; i += 1) {
        series.data.push({
            timestamp,
            close,
        });

        const x = Math.floor(Math.random() * 2) === 0;
        close = x
            ? close + Math.floor(Math.random() * 5)
            : close - Math.floor(Math.random() * 5);

        timestamp = new Date(timestamp.setMonth(timestamp.getMonth() + 1));
    }
    return series;
};

export const getLinePath = ({ x, y }: { x: number; y: number }): string =>
    `L ${x} ${y}`;

export const getPath = (data: { x: number; y: number }[]): string =>
    data.reduce((acc, { x, y }, i) => {
        const partialPath = getLinePath({ x, y });
        return i === 0 ? `M ${x} ${y} ` : `${acc} ${partialPath} `;
    }, ``);

export const formatCurrency = (value: number): string =>
    new Intl.NumberFormat('en-us', {
        style: 'currency',
        currency: 'USD',
    }).format(value);

export const catmullRom2bezier = (
    points: { x: number; y: number }[]
): { x: number; y: number }[][] => {
    const result = [];
    for (let i = 0; i < points.length - 1; i += 1) {
        const p = [];
        p.push({
            x: points[Math.max(i - 1, 0)].x,
            y: points[Math.max(i - 1, 0)].y,
        });
        p.push({
            x: points[i].x,
            y: points[i].y,
        });
        p.push({
            x: points[i + 1].x,
            y: points[i + 1].y,
        });
        p.push({
            x: points[Math.min(i + 2, points.length - 1)].x,
            y: points[Math.min(i + 2, points.length - 1)].y,
        });
        // Catmull-Rom to Cubic Bezier conversion matrix
        //    0       1       0       0
        //  -1/6      1      1/6      0
        //    0      1/6      1     -1/6
        //    0       0       1       0
        const bp = [];
        bp.push({
            x: (-p[0].x + 6 * p[1].x + p[2].x) / 6,
            y: (-p[0].y + 6 * p[1].y + p[2].y) / 6,
        });
        bp.push({
            x: (p[1].x + 6 * p[2].x - p[3].x) / 6,
            y: (p[1].y + 6 * p[2].y - p[3].y) / 6,
        });
        bp.push({
            x: p[2].x,
            y: p[2].y,
        });
        result.push(bp);
    }

    return result;
};

export const makeCatmullPath = (points: { x: number; y: number }[]): string => {
    let result = `M ${points[0].x}, ${points[0].y}`;
    const catmull = catmullRom2bezier(points);
    for (let i = 0; i < catmull.length; i += 1) {
        result += `C ${catmull[i][0].x}, ${catmull[i][0].y} ${catmull[i][1].x}, ${catmull[i][1].y} ${catmull[i][2].x}, ${catmull[i][2].y}`;
    }

    return result;
};
