/**
 * HCT Color Lab
 * Created and maintained by Amsen.
 */
import {
    Hct,
    argbFromRgb,
    blueFromArgb,
    greenFromArgb,
    redFromArgb
} from "@material/material-color-utilities";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import "./styles.css";

const TONES = [96, 90, 81, 71, 60, 50, 40, 30, 20, 12];
const TOKEN_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const ADAPTIVE_TONE_PROFILES = {
    10: TONES,
    11: [96, 92, 88, 80, 70, 60, 50, 40, 30, 20, 8],
    12: [96, 94, 88, 80, 68, 58, 50, 40, 32, 24, 18, 8],
    13: [96, 94, 92, 88, 80, 68, 58, 50, 40, 32, 24, 18, 8],
    14: [96, 94, 92, 88, 80, 68, 58, 50, 40, 32, 24, 18, 14, 8],
    15: [96, 94, 92, 90, 88, 80, 68, 58, 50, 40, 32, 24, 18, 14, 8],
    16: [96, 94, 92, 90, 88, 80, 68, 58, 50, 40, 32, 24, 18, 14, 11, 8]
};
const INITIAL_SERIES = `#F1F3FF
#CFDDFF
#ACC7FF
#7EABFF
#488FFF
#0073ED
#005BBE
#004491
#002F67
#001739`;

const clamp = (value, min, max) =>
    Math.min(max, Math.max(min, Number(value) || 0));
const componentToHex = (value) =>
    Math.round(value).toString(16).padStart(2, "0");
const rgbToHex = ({ r, g, b }) =>
    `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`.toUpperCase();
const argbToRgb = (argb) => ({
    r: redFromArgb(argb),
    g: greenFromArgb(argb),
    b: blueFromArgb(argb)
});
const hexToRgb = (hex) => {
    const value = hex.replace("#", "");
    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16)
    };
};

function readableText(rgb) {
    const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 >
        0.179
        ? "#12130f"
        : "#ffffff";
}

function parseHexSeries(value) {
    const colors = [];
    const invalid = [];
    value
        .trim()
        .split(/[\s,;，；]+/)
        .filter(Boolean)
        .forEach((token) => {
            const clean = token.replace(/^#/, "");
            if (/^[0-9a-f]{3}$/i.test(clean)) {
                colors.push(
                    `#${clean
                        .split("")
                        .map((character) => character.repeat(2))
                        .join("")
                        .toUpperCase()}`
                );
            } else if (/^[0-9a-f]{6}$/i.test(clean)) {
                colors.push(`#${clean.toUpperCase()}`);
            } else {
                invalid.push(token);
            }
        });
    return { colors, invalid };
}

function resampleToneProfile(profile, count) {
    if (!count) return [];
    if (count === 1) return [profile[0]];
    return Array.from({ length: count }, (_, index) => {
        const position = (index * (profile.length - 1)) / (count - 1);
        const start = Math.floor(position);
        const end = Math.min(Math.ceil(position), profile.length - 1);
        return (
            profile[start] +
            (profile[end] - profile[start]) * (position - start)
        );
    });
}

function expectedTonesFor(count, adaptive = false) {
    if (!adaptive) return resampleToneProfile(TONES, count);
    if (ADAPTIVE_TONE_PROFILES[count]) return ADAPTIVE_TONE_PROFILES[count];
    return resampleToneProfile(
        count < 10 ? ADAPTIVE_TONE_PROFILES[10] : ADAPTIVE_TONE_PROFILES[16],
        count
    );
}

function buildToneSwatches(hct, targetChroma) {
    return TONES.map((targetTone, index) => {
        const realized = Hct.from(hct.hue, targetChroma, targetTone);
        const colorRgb = argbToRgb(realized.toInt());
        const grayRgb = argbToRgb(Hct.from(0, 0, targetTone).toInt());
        return {
            label: String(TOKEN_STEPS[index]),
            tone: targetTone,
            actualTone: realized.tone,
            rgb: colorRgb,
            hex: rgbToHex(colorRgb),
            grayRgb,
            grayHex: rgbToHex(grayRgb),
            realizedChroma: realized.chroma
        };
    });
}

function buildAnchoredTonePalette(hexes) {
    const anchors = hexes
        .slice(0, TONES.length)
        .map((source) => {
            const rgb = hexToRgb(source);
            return {
                source,
                rgb,
                hct: Hct.fromInt(argbFromRgb(rgb.r, rgb.g, rgb.b))
            };
        })
        .sort((a, b) => b.hct.tone - a.hct.tone);

    if (!anchors.length) return { anchors: [], swatches: [] };

    const memo = new Map();
    function assign(anchorIndex, minimumToneIndex) {
        if (anchorIndex === anchors.length) return { cost: 0, indices: [] };
        const key = `${anchorIndex}-${minimumToneIndex}`;
        if (memo.has(key)) return memo.get(key);
        const remaining = anchors.length - anchorIndex;
        let best = { cost: Infinity, indices: [] };
        for (
            let toneIndex = minimumToneIndex;
            toneIndex <= TONES.length - remaining;
            toneIndex += 1
        ) {
            const next = assign(anchorIndex + 1, toneIndex + 1);
            const cost =
                Math.abs(anchors[anchorIndex].hct.tone - TONES[toneIndex]) +
                next.cost;
            if (cost < best.cost)
                best = { cost, indices: [toneIndex, ...next.indices] };
        }
        memo.set(key, best);
        return best;
    }

    const assignment = assign(0, 0).indices;
    const placedAnchors = anchors.map((anchor, index) => ({
        ...anchor,
        toneIndex: assignment[index],
        targetTone: TONES[assignment[index]]
    }));
    const anchorAt = new Map(
        placedAnchors.map((anchor) => [anchor.toneIndex, anchor])
    );
    const interpolateHue = (start, end, progress) => {
        const delta = ((end - start + 540) % 360) - 180;
        return (start + delta * progress + 360) % 360;
    };

    const swatches = TONES.map((targetTone, toneIndex) => {
        const exactAnchor = anchorAt.get(toneIndex);
        let hue;
        let chroma;
        let sourceHex;

        if (exactAnchor) {
            hue = exactAnchor.hct.hue;
            chroma = exactAnchor.hct.chroma;
            sourceHex = exactAnchor.source;
        } else {
            const lighter = [...placedAnchors]
                .reverse()
                .find((anchor) => anchor.toneIndex < toneIndex);
            const darker = placedAnchors.find(
                (anchor) => anchor.toneIndex > toneIndex
            );
            const start = lighter || darker;
            const end = darker || lighter;
            if (start === end) {
                hue = start.hct.hue;
                chroma = start.hct.chroma;
            } else {
                const progress =
                    (targetTone - start.targetTone) /
                    (end.targetTone - start.targetTone);
                hue = interpolateHue(start.hct.hue, end.hct.hue, progress);
                chroma =
                    start.hct.chroma +
                    (end.hct.chroma - start.hct.chroma) * progress;
            }
        }

        const preserveSource =
            exactAnchor && Math.abs(exactAnchor.hct.tone - targetTone) <= 2;
        const realized = preserveSource
            ? exactAnchor.hct
            : Hct.from(hue, chroma, targetTone);
        const colorRgb = preserveSource
            ? exactAnchor.rgb
            : argbToRgb(realized.toInt());
        const grayRgb = argbToRgb(Hct.from(0, 0, targetTone).toInt());
        return {
            label: String(TOKEN_STEPS[toneIndex]),
            tone: targetTone,
            actualTone: realized.tone,
            rgb: colorRgb,
            hex: rgbToHex(colorRgb),
            grayRgb,
            grayHex: rgbToHex(grayRgb),
            realizedChroma: realized.chroma,
            isAnchor: Boolean(exactAnchor),
            sourceHex,
            sourceTone: exactAnchor?.hct.tone
        };
    });

    return { anchors: placedAnchors, swatches };
}

function CopyIcon({ className }) {
    return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8" y="8" width="11" height="11" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
    );
}

function RangeField({ label, english, suffix, value, max, onChange }) {
    const progress = `${(value / max) * 100}%`;
    return (
        <label className="range-field">
            <span className="field-label">
                <span>{label}</span>
                <b>{english}</b>
            </span>
            <span className="range-row">
                <input
                    type="range"
                    min="0"
                    max={max}
                    step="1"
                    value={value}
                    style={{ "--range-progress": progress }}
                    onChange={(event) =>
                        onChange(clamp(event.target.value, 0, max))
                    }
                />
                <span className="number-shell">
                    <input
                        type="number"
                        min="0"
                        max={max}
                        value={value}
                        onChange={(event) =>
                            onChange(clamp(event.target.value, 0, max))
                        }
                    />
                    <i>{suffix}</i>
                </span>
            </span>
        </label>
    );
}

function ToneChart({
    swatches,
    showExpected,
    showActual,
    language,
    adaptiveExpected
}) {
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const isZh = language === "zh";
    if (!swatches.length)
        return (
            <p className="chart-empty">
                {isZh
                    ? "输入颜色后将在这里显示 T 值曲线。"
                    : "Enter colors to display the tone curve."}
            </p>
        );
    const width = 1000;
    const height = 280;
    const left = 48;
    const right = 22;
    const top = 16;
    const bottom = 38;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const expected = expectedTonesFor(swatches.length, adaptiveExpected);
    const actual = swatches.map(({ actualTone, tone }) => actualTone ?? tone);
    const xAt = (index) =>
        left +
        (swatches.length === 1
            ? chartWidth / 2
            : (index * chartWidth) / (swatches.length - 1));
    const yAt = (tone) =>
        top + ((100 - clamp(tone, 0, 100)) / 100) * chartHeight;
    const pathFor = (values) =>
        values
            .map(
                (value, index) =>
                    `${index ? "L" : "M"} ${xAt(index).toFixed(2)} ${yAt(value).toFixed(2)}`
            )
            .join(" ");
    function showTooltip(index, target) {
        const bounds = target.getBoundingClientRect();
        const below = bounds.top < 120;
        setHoveredPoint({
            index,
            left: clamp(
                bounds.left + bounds.width / 2,
                92,
                window.innerWidth - 92
            ),
            top: below ? bounds.bottom + 10 : bounds.top - 10,
            below
        });
    }

    const hovered =
        hoveredPoint === null
            ? null
            : {
                  ...hoveredPoint,
                  expected: expected[hoveredPoint.index],
                  actual: actual[hoveredPoint.index],
                  difference:
                      actual[hoveredPoint.index] - expected[hoveredPoint.index]
              };
    return (
        <div
            className="tone-chart-interactive"
            onPointerLeave={() => setHoveredPoint(null)}
        >
            <svg
                className="tone-chart-svg"
                viewBox={`0 0 ${width} ${height}`}
                aria-hidden="true"
            >
                {[100, 75, 50, 25, 0].map((tone) => (
                    <React.Fragment key={tone}>
                        <line
                            className="chart-grid"
                            x1={left}
                            y1={yAt(tone)}
                            x2={width - right}
                            y2={yAt(tone)}
                        />
                        <text
                            className="chart-axis-label"
                            x={left - 10}
                            y={yAt(tone) + 3}
                            textAnchor="end"
                        >
                            {tone}
                        </text>
                    </React.Fragment>
                ))}
                {showExpected && (
                    <path className="chart-expected" d={pathFor(expected)} />
                )}
                {showActual && (
                    <path className="chart-actual" d={pathFor(actual)} />
                )}
                {showActual &&
                    actual.map((tone, index) => (
                        <g
                            key={`${swatches[index].hex}-${index}`}
                            onPointerEnter={(event) =>
                                showTooltip(index, event.currentTarget)
                            }
                            onFocus={(event) =>
                                showTooltip(index, event.currentTarget)
                            }
                            onBlur={() => setHoveredPoint(null)}
                            tabIndex="0"
                        >
                            <circle
                                className="chart-point-hit"
                                cx={xAt(index)}
                                cy={yAt(tone)}
                                r="14"
                            />
                            <circle
                                className="chart-point"
                                cx={xAt(index)}
                                cy={yAt(tone)}
                                r="4"
                            />
                        </g>
                    ))}
                {swatches.map((swatch, index) => (
                    <text
                        key={`label-${swatch.hex}-${index}`}
                        className="chart-index-label"
                        x={xAt(index)}
                        y={height - 10}
                        textAnchor="middle"
                    >
                        {swatch.label}
                    </text>
                ))}
            </svg>
            {hovered &&
                createPortal(
                    <div
                        className={`chart-tooltip ${hovered.below ? "is-below" : ""}`}
                        style={{
                            left: `${hovered.left}px`,
                            top: `${hovered.top}px`
                        }}
                    >
                        <strong>
                            {isZh
                                ? `第 ${swatches[hovered.index].label} 阶`
                                : `Step ${swatches[hovered.index].label}`}
                        </strong>
                        <span>
                            <i>{isZh ? "预测值" : "Expected"}</i>
                            <b>T{hovered.expected.toFixed(1)}</b>
                        </span>
                        <span>
                            <i>{isZh ? "实际值" : "Actual"}</i>
                            <b>T{hovered.actual.toFixed(1)}</b>
                        </span>
                        <span>
                            <i>{isZh ? "差额" : "Difference"}</i>
                            <b>
                                {hovered.difference > 0 ? "+" : ""}
                                {hovered.difference.toFixed(1)}
                            </b>
                        </span>
                    </div>,
                    document.body
                )}
        </div>
    );
}

function ToneInsights({ swatches, language, adaptiveExpected }) {
    const isZh = language === "zh";
    if (!swatches.length) {
        return (
            <aside className="tone-insights">
                <p className="insight-kicker">
                    {isZh ? "分析结果" : "Analysis"}
                </p>
                <p className="insight-empty">
                    {isZh ? "等待色彩序列" : "Waiting for colors"}
                </p>
            </aside>
        );
    }

    const expected = expectedTonesFor(swatches.length, adaptiveExpected);
    const actual = swatches.map(({ actualTone, tone }) => actualTone ?? tone);
    const deviations = actual.map((value, index) => value - expected[index]);
    const averageDeviation =
        deviations.reduce((sum, value) => sum + Math.abs(value), 0) /
        deviations.length;
    const maxDeviation = Math.max(...deviations.map(Math.abs));
    const maxIndex = deviations.findIndex(
        (value) => Math.abs(value) === maxDeviation
    );
    const reversals = [];
    const compressed = [];
    const largeGaps = [];

    for (let index = 1; index < actual.length; index += 1) {
        const actualGap = actual[index - 1] - actual[index];
        const expectedGap = expected[index - 1] - expected[index];
        if (actualGap < -1) reversals.push(index);
        if (Math.abs(actualGap) < Math.max(2, Math.abs(expectedGap) * 0.35))
            compressed.push(index);
        if (actualGap > Math.max(18, Math.abs(expectedGap) * 1.8))
            largeGaps.push(index);
    }

    const issues = [];
    if (reversals.length)
        issues.push(
            isZh
                ? `${reversals.length} 处 T 值回升，色阶顺序可能不连贯。`
                : `${reversals.length} tone reversal(s) may disrupt the sequence.`
        );
    if (compressed.length)
        issues.push(
            isZh
                ? `${compressed.length} 组相邻明度过近，层级可能难以区分。`
                : `${compressed.length} adjacent pair(s) may be hard to distinguish.`
        );
    if (largeGaps.length)
        issues.push(
            isZh
                ? `${largeGaps.length} 处明度跨度偏大，可能出现视觉跳级。`
                : `${largeGaps.length} large tone gap(s) may cause visual jumps.`
        );
    if (maxDeviation > 8) {
        const direction =
            deviations[maxIndex] > 0
                ? isZh
                    ? "偏亮"
                    : "is too light by"
                : isZh
                  ? "偏暗"
                  : "is too dark by";
        issues.push(
            isZh
                ? `第 ${swatches[maxIndex].label} 阶${direction} T${maxDeviation.toFixed(1)}。`
                : `Step ${swatches[maxIndex].label} ${direction} T${maxDeviation.toFixed(1)}.`
        );
    }

    const stable = !issues.length && averageDeviation <= 4;
    return (
        <aside className="tone-insights">
            <p className="insight-kicker">{isZh ? "分析结果" : "Analysis"}</p>
            <div
                className={`insight-status ${stable ? "is-good" : "has-warning"}`}
            >
                <span className="status-dot" />
                <strong>
                    {stable
                        ? isZh
                            ? "趋势稳定"
                            : "Stable"
                        : isZh
                          ? "建议检查"
                          : "Review"}
                </strong>
            </div>
            <div className="insight-metric">
                <span>{isZh ? "平均偏差" : "Average deviation"}</span>
                <b>T{averageDeviation.toFixed(1)}</b>
            </div>
            {stable ? (
                <p className="insight-good">
                    {isZh
                        ? "实际明度与期望趋势基本一致，未发现明显跳级。"
                        : "Actual tones follow the expected trend with no obvious jumps."}
                </p>
            ) : (
                <ul className="insight-list">
                    {issues.slice(0, 3).map((issue) => (
                        <li key={issue}>{issue}</li>
                    ))}
                </ul>
            )}
        </aside>
    );
}

function Swatch({ swatch, isSeries, hideValues, onCopy, language }) {
    const {
        tone,
        rgb,
        grayRgb,
        hex,
        grayHex,
        label,
        hct,
        realizedChroma,
        isAnchor,
        sourceHex
    } = swatch;
    return (
        <div className="swatch-column">
            <div className="swatch-label" aria-hidden="true">
                <strong>{label}</strong>
                <span className="tone-meta">
                    <i>T</i>
                    <b>{tone.toFixed(isSeries ? 1 : 0)}</b>
                </span>
                {isSeries && (
                    <span className="swatch-hct-meta">
                        <span className="hct-pair">
                            <i>H</i>
                            <b>{hct.hue.toFixed(1)}</b>
                        </span>
                        <span className="hct-pair">
                            <i>C</i>
                            <b>{hct.chroma.toFixed(1)}</b>
                        </span>
                    </span>
                )}
                {isAnchor && (
                    <span
                        className="anchor-badge"
                        title={
                            language === "zh"
                                ? `输入锚点 ${sourceHex}`
                                : `Input anchor ${sourceHex}`
                        }
                    >
                        {sourceHex}
                    </span>
                )}
            </div>
            <button
                className="swatch"
                type="button"
                style={{
                    "--swatch": hex,
                    "--swatch-text": readableText(rgb),
                    "--gray": grayHex,
                    "--gray-text": readableText(grayRgb)
                }}
                onClick={() =>
                    onCopy(
                        hex,
                        language === "zh" ? `${hex} 已复制` : `${hex} copied`
                    )
                }
                aria-label={
                    language === "zh"
                        ? `复制 ${hex}，明度 T${tone.toFixed(isSeries ? 1 : 0)}`
                        : `Copy ${hex}, tone T${tone.toFixed(isSeries ? 1 : 0)}`
                }
                title={`${isSeries ? `H${hct.hue.toFixed(1)} C${hct.chroma.toFixed(1)} T${hct.tone.toFixed(1)}` : `实际彩度 C${realizedChroma.toFixed(1)}`} · 点击复制`}
            >
                {!hideValues && <CopyIcon className="swatch-copy" />}
                <span aria-hidden="true" />
                {!hideValues && (
                    <span className="swatch-info">
                        <span className="swatch-hex">{hex}</span>
                    </span>
                )}
            </button>
        </div>
    );
}

function ImageColorPicker({
    language,
    history,
    onPick,
    onCopyHistory,
    onClearHistory
}) {
    const canvasRef = useRef(null);
    const inputRef = useRef(null);
    const [imageName, setImageName] = useState("");
    const [isReady, setIsReady] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const isZh = language === "zh";

    function loadFile(file) {
        if (!file?.type.startsWith("image/")) return;
        setImageName(file.name);
        setIsReady(false);
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) {
                URL.revokeObjectURL(objectUrl);
                return;
            }
            const maxDimension = 2400;
            const scale = Math.min(
                1,
                maxDimension / Math.max(image.naturalWidth, image.naturalHeight)
            );
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(
                1,
                Math.round(image.naturalHeight * scale)
            );
            const context = canvas.getContext("2d", {
                willReadFrequently: true
            });
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(objectUrl);
            setIsReady(true);
        };
        image.onerror = () => URL.revokeObjectURL(objectUrl);
        image.src = objectUrl;
    }

    function pickPixel(event) {
        if (!isReady) return;
        const canvas = canvasRef.current;
        const bounds = canvas.getBoundingClientRect();
        const x = Math.min(
            canvas.width - 1,
            Math.max(
                0,
                Math.floor(
                    ((event.clientX - bounds.left) / bounds.width) *
                        canvas.width
                )
            )
        );
        const y = Math.min(
            canvas.height - 1,
            Math.max(
                0,
                Math.floor(
                    ((event.clientY - bounds.top) / bounds.height) *
                        canvas.height
                )
            )
        );
        const [r, g, b] = canvas
            .getContext("2d", { willReadFrequently: true })
            .getImageData(x, y, 1, 1).data;
        onPick({ r, g, b });
    }

    return (
        <div className="image-picker-fields">
            <div
                className={`image-dropzone ${isDragging ? "is-dragging" : ""} ${isReady ? "has-image" : ""}`}
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    loadFile(event.dataTransfer.files[0]);
                }}
            >
                <canvas
                    ref={canvasRef}
                    className="picker-canvas"
                    onClick={pickPixel}
                    hidden={!isReady}
                />
                {!isReady && (
                    <div className="dropzone-empty">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 16.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10.5M8 10l2.5 2.5L14 9l6 7.5" />
                            <circle cx="8" cy="8" r="1" />
                            <path d="M12 20v-5M9.5 17.5 12 15l2.5 2.5" />
                        </svg>
                        <strong>
                            {isZh
                                ? "选择一张图片开始取色"
                                : "Choose an image to start"}
                        </strong>
                        <span>
                            {isZh
                                ? "图片仅在当前浏览器处理，不会上传"
                                : "Processed locally — never uploaded"}
                        </span>
                    </div>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                        loadFile(event.target.files[0]);
                        event.target.value = "";
                    }}
                />
            </div>
            <div className="picker-toolbar">
                <button
                    className="upload-button"
                    type="button"
                    onClick={() => inputRef.current?.click()}
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 16V4M8 8l4-4 4 4M4 20h16" />
                    </svg>
                    {isReady
                        ? isZh
                            ? "更换图片"
                            : "Change image"
                        : isZh
                          ? "选择图片"
                          : "Choose image"}
                </button>
                <span className="local-file-name">
                    {imageName ||
                        (isZh
                            ? "支持 JPG、PNG、WebP 等格式"
                            : "JPG, PNG, WebP and more")}
                </span>
            </div>
            <div className="picker-history-heading">
                <div>
                    <span>{isZh ? "取色历史" : "Color history"}</span>
                    <b>{history.length}</b>
                </div>
                <div className="history-actions">
                    {history.length > 0 && (
                        <button type="button" onClick={onClearHistory}>
                            {isZh ? "清空" : "Clear"}
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={!history.length}
                        onClick={onCopyHistory}
                    >
                        <CopyIcon />
                        {isZh ? "复制历史" : "Copy history"}
                    </button>
                </div>
            </div>
            <div className="color-history">
                {history.length ? (
                    history.map((hex, index) => (
                        <button
                            key={`${hex}-${index}`}
                            type="button"
                            onClick={() => onPick(hexToRgb(hex), false)}
                            title={hex}
                        >
                            <i style={{ background: hex }} />
                            <span>{hex}</span>
                            <small>{String(index + 1).padStart(2, "0")}</small>
                        </button>
                    ))
                ) : (
                    <p>
                        {isZh
                            ? "点击图片中的颜色后，将按从新到老排列。"
                            : "Click the image to collect colors, newest first."}
                    </p>
                )}
            </div>
        </div>
    );
}

function App() {
    const [mode, setMode] = useState("hct");
    const [hue, setHue] = useState(265);
    const [chroma, setChroma] = useState(72);
    const [tone, setTone] = useState(48);
    const [rgb, setRgb] = useState({ r: 79, g: 100, b: 233 });
    const [hexDraft, setHexDraft] = useState("4F64E9");
    const [rgbSeriesInput, setRgbSeriesInput] = useState("#4F64E9");
    const [seriesInput, setSeriesInput] = useState(INITIAL_SERIES);
    const [colorHistory, setColorHistory] = useState([]);
    const [hideValues, setHideValues] = useState(false);
    const [lightnessCheck, setLightnessCheck] = useState(false);
    const [showAnalysis, setShowAnalysis] = useState(true);
    const [showExpectedLine, setShowExpectedLine] = useState(true);
    const [showActualLine, setShowActualLine] = useState(true);
    const [toast, setToast] = useState("");
    const [theme, setTheme] = useState(
        () =>
            localStorage.getItem("hct-theme") ||
            (matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light")
    );
    const [language, setLanguage] = useState(
        () => localStorage.getItem("hct-language") || "zh"
    );
    const isZh = language === "zh";
    const tr = (chinese, english) => (isZh ? chinese : english);

    const parsedSeries = useMemo(
        () => parseHexSeries(seriesInput),
        [seriesInput]
    );
    const parsedRgbSeries = useMemo(
        () => parseHexSeries(rgbSeriesInput),
        [rgbSeriesInput]
    );
    const baseHct = useMemo(
        () =>
            mode === "hct"
                ? Hct.from(hue, chroma, tone)
                : Hct.fromInt(argbFromRgb(rgb.r, rgb.g, rgb.b)),
        [mode, hue, chroma, tone, rgb]
    );
    const baseRgb = useMemo(
        () => (mode === "rgb" ? rgb : argbToRgb(baseHct.toInt())),
        [mode, rgb, baseHct]
    );
    const anchoredPalette = useMemo(
        () => buildAnchoredTonePalette(parsedRgbSeries.colors),
        [parsedRgbSeries]
    );

    const swatches = useMemo(() => {
        if (mode === "series") {
            return parsedSeries.colors.map((hex, index) => {
                const colorRgb = hexToRgb(hex);
                const hct = Hct.fromInt(
                    argbFromRgb(colorRgb.r, colorRgb.g, colorRgb.b)
                );
                const grayRgb = argbToRgb(Hct.from(0, 0, hct.tone).toInt());
                return {
                    label: String(index + 1).padStart(2, "0"),
                    tone: hct.tone,
                    actualTone: hct.tone,
                    rgb: colorRgb,
                    hex,
                    grayRgb,
                    grayHex: rgbToHex(grayRgb),
                    hct
                };
            });
        }
        if (mode === "rgb") return anchoredPalette.swatches;
        return buildToneSwatches(
            baseHct,
            mode === "hct" ? chroma : baseHct.chroma
        );
    }, [mode, parsedSeries, chroma, baseHct, anchoredPalette]);

    const preview =
        mode === "series"
            ? swatches[0]
            : { hex: rgbToHex(baseRgb), rgb: baseRgb, hct: baseHct };
    const seriesGradient = useMemo(
        () =>
            parsedSeries.colors.length
                ? `linear-gradient(120deg, ${parsedSeries.colors.join(", ")})`
                : "none",
        [parsedSeries.colors]
    );
    const previewValue =
        mode === "series" && parsedSeries.colors.length > 1
            ? `${parsedSeries.colors[0]} → ${parsedSeries.colors.at(-1)}`
            : preview?.hex || tr("等待输入", "Waiting");
    const content = {
        hct: [
            tr("输入 HCT", "HCT input"),
            tr("定义品牌主色", "Define brand color"),
            "RGB / HEX",
            tr("HCT 来源", "HCT source"),
            tr(
                "固定当前 HCT 色相与目标彩度，仅改变感知明度。",
                "Keep hue and target chroma fixed while varying perceptual tone."
            )
        ],
        rgb: [
            tr("输入 RGB / HEX", "RGB / HEX input"),
            tr("用 HEX 锚点生成系列", "Generate from HEX anchors"),
            "HCT",
            tr("HEX 锚点来源", "HEX anchor source"),
            tr(
                "将指定 HEX 匹配到最近的目标 T 档位，并在锚点之间补齐一套 10 阶色彩系列。",
                "Snap HEX anchors to the nearest target tones and fill one 10-step series between them."
            )
        ],
        series: [
            tr("批量输入 HEX", "Batch HEX input"),
            tr("转换有序色彩序列", "Convert ordered sequence"),
            tr("序列概览", "Sequence overview"),
            tr("HEX 序列来源", "HEX sequence source"),
            tr(
                "逐个转换输入颜色为 HCT，并严格保留原始排列顺序。",
                "Convert each input to HCT while preserving its original order."
            )
        ],
        picker: [
            tr("本地图片取色", "Local image picker"),
            tr("从图片提取颜色", "Pick colors from image"),
            tr("取色结果", "Picked color"),
            tr("图片取色来源", "Image picker source"),
            tr(
                "使用当前选中颜色生成 10 阶 HCT 色彩系列。",
                "Generate a 10-step HCT series from the currently selected color."
            )
        ]
    }[mode];

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("hct-theme", theme);
    }, [theme]);
    useEffect(() => {
        document.documentElement.lang = isZh ? "zh-CN" : "en";
        localStorage.setItem("hct-language", language);
    }, [language, isZh]);
    useEffect(() => {
        setHexDraft(rgbToHex(rgb).slice(1));
    }, [rgb]);

    async function copyText(text, message = tr("已复制", "Copied")) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            textarea.remove();
        }
        setToast(message);
        window.setTimeout(() => setToast(""), 1800);
    }

    function setPrimaryRgb(nextRgb) {
        setRgb(nextRgb);
        setRgbSeriesInput((current) => {
            const remaining = parseHexSeries(current).colors.slice(1);
            return [rgbToHex(nextRgb), ...remaining].join("\n");
        });
    }

    function updateRgbSeries(value) {
        setRgbSeriesInput(value);
        const first = parseHexSeries(value).colors[0];
        if (first) setRgb(hexToRgb(first));
    }

    function pickImageColor(nextRgb, addToHistory = true) {
        setRgb(nextRgb);
        if (addToHistory) {
            const hex = rgbToHex(nextRgb);
            setColorHistory((current) =>
                [hex, ...current.filter((color) => color !== hex)].slice(0, 50)
            );
        }
    }

    function setHex(value) {
        const clean = value.replace(/[^0-9a-f]/gi, "").slice(0, 6);
        setHexDraft(clean.toUpperCase());
        if (clean.length === 6) setPrimaryRgb(hexToRgb(`#${clean}`));
    }

    function randomize() {
        if (mode === "hct") {
            setHue(Math.round(Math.random() * 360));
            setChroma(Math.round(40 + Math.random() * 50));
            setTone(Math.round(40 + Math.random() * 25));
        } else if (mode === "rgb") {
            setPrimaryRgb({
                r: Math.round(Math.random() * 255),
                g: Math.round(Math.random() * 255),
                b: Math.round(Math.random() * 255)
            });
        } else if (mode === "series") {
            setSeriesInput(
                Array.from({ length: 8 }, () =>
                    `#${componentToHex(Math.random() * 255)}${componentToHex(Math.random() * 255)}${componentToHex(Math.random() * 255)}`.toUpperCase()
                ).join("\n")
            );
        }
    }

    function copyResult() {
        if (mode === "series") {
            copyText(
                swatches
                    .map(
                        ({ hex, hct }) =>
                            `${hex} → hct(${hct.hue.toFixed(1)}, ${hct.chroma.toFixed(1)}, ${hct.tone.toFixed(1)})`
                    )
                    .join("\n"),
                tr("HCT 序列已复制", "HCT sequence copied")
            );
        } else if (mode === "hct") {
            copyText(
                `${rgbToHex(baseRgb)} · rgb(${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b})`,
                tr("转换结果已复制", "Result copied")
            );
        } else if (mode === "rgb") {
            copyText(
                anchoredPalette.anchors
                    .map(
                        ({ source, hct, targetTone }) =>
                            `${source} · T${hct.tone.toFixed(1)} → T${targetTone}`
                    )
                    .join("\n"),
                tr("HCT 结果已复制", "HCT results copied")
            );
        } else {
            copyText(
                `${rgbToHex(rgb)} → hct(${baseHct.hue.toFixed(1)}, ${baseHct.chroma.toFixed(1)}, ${baseHct.tone.toFixed(1)})`,
                tr("取色结果已复制", "Picked color copied")
            );
        }
    }

    function copyCssVariables() {
        const variables = swatches.map(
            ({ label, hex }) =>
                `  --${mode === "series" ? "series" : "brand"}-${label}: ${hex};`
        );
        copyText(
            [":root {", ...variables, "}"].join("\n"),
            tr("CSS 变量已复制", "CSS variables copied")
        );
    }

    const hexValue = rgbToHex(rgb).slice(1);
    const mapped = mode === "hct" && Math.abs(baseHct.chroma - chroma) > 1;

    return (
        <>
            <div className="ambient ambient-one" />
            <div className="ambient ambient-two" />
            <header className="site-header">
                <div className="header-brand-group">
                    <a
                        className="brand"
                        href="/"
                        aria-label={tr(
                            "HCT Color Lab 首页",
                            "HCT Color Lab home"
                        )}
                    >
                        <span className="brand-mark" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </span>
                        <span>HCT Color Lab</span>
                    </a>
                    <div className="hct-info">
                        <button
                            className="info-trigger"
                            type="button"
                            aria-label={tr(
                                "了解什么是 HCT",
                                "Learn what HCT is"
                            )}
                            aria-describedby="hct-info-tooltip"
                        >
                            i
                        </button>
                        <div
                            className="info-tooltip"
                            id="hct-info-tooltip"
                            role="tooltip"
                        >
                            <strong>
                                {tr("什么是 HCT？", "What is HCT?")}
                            </strong>
                            <p>
                                {tr(
                                    "HCT 以色相 Hue、彩度 Chroma 和明度 Tone 描述颜色，基于 CAM16 与 L*，适合生成视觉层级更稳定的色彩系列。",
                                    "HCT describes color with Hue, Chroma, and Tone. Built on CAM16 and L*, it helps create tonal palettes with more consistent visual steps."
                                )}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="header-actions">
                    <button
                        className="theme-toggle language-toggle"
                        type="button"
                        onClick={() => setLanguage(isZh ? "en" : "zh")}
                        aria-label={tr("切换为英文", "Switch to Chinese")}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
                        </svg>
                        <span>{isZh ? "EN" : "中文"}</span>
                    </button>
                    <button
                        className="theme-toggle"
                        type="button"
                        onClick={() =>
                            setTheme(theme === "dark" ? "light" : "dark")
                        }
                        aria-label={tr("切换深浅色模式", "Toggle color theme")}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="12" cy="12" r="3.5" />
                            <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2" />
                        </svg>
                        <span>
                            {theme === "dark"
                                ? tr("浅色", "Light")
                                : tr("深色", "Dark")}
                        </span>
                    </button>
                </div>
            </header>

            <main>
                <section className="hero">
                    <p className="eyebrow">Perceptual color toolkit</p>
                    <h1>
                        HCT{" "}
                        <span
                            className={`hero-color ${
                                mode === "series" &&
                                parsedSeries.colors.length > 1
                                    ? "is-gradient"
                                    : ""
                            }`}
                            style={
                                mode === "series" &&
                                parsedSeries.colors.length > 1
                                    ? { backgroundImage: seriesGradient }
                                    : {
                                          color:
                                              preview?.hex || "var(--accent)"
                                      }
                            }
                        >
                            Color
                        </span>{" "}
                        Lab
                    </h1>
                    <p className="hero-copy">
                        {tr(
                            "在 HCT 与 RGB 之间精准转换，并生成、检查和分析感知均匀的品牌色彩系列。",
                            "Convert between HCT and RGB, then generate, inspect, and analyze perceptually consistent color systems."
                        )}
                    </p>
                </section>

                <section
                    className="workbench"
                    aria-label={tr(
                        "颜色转换工作台",
                        "Color conversion workbench"
                    )}
                >
                    <div
                        className="mode-switch"
                        role="tablist"
                        aria-label={tr("转换方向", "Conversion direction")}
                    >
                        {[
                            ["hct", "HCT", "RGB"],
                            ["rgb", "RGB", "HCT"],
                            ["series", tr("HEX 序列", "HEX series"), "HCT"],
                            ["picker", tr("图片取色", "Image picker"), ""]
                        ].map(([value, from, to]) => (
                            <button
                                key={value}
                                className={`mode-button ${mode === value ? "is-active" : ""}`}
                                type="button"
                                role="tab"
                                aria-selected={mode === value}
                                onClick={() => setMode(value)}
                            >
                                {from}
                                {to && (
                                    <>
                                        <span>→</span>
                                        {to}
                                    </>
                                )}
                            </button>
                        ))}
                    </div>
                    <div className="converter-grid">
                        <div className="input-panel">
                            <div className="panel-heading">
                                <div>
                                    <p className="section-kicker">
                                        {content[0]}
                                    </p>
                                    <h2>{content[1]}</h2>
                                </div>
                                {mode === "picker" ? (
                                    <span className="local-only-badge">
                                        {tr("仅本地处理", "Local only")}
                                    </span>
                                ) : (
                                    <button
                                        className="random-button"
                                        type="button"
                                        onClick={randomize}
                                    >
                                        <svg viewBox="0 0 24 24">
                                            <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                                        </svg>
                                        {tr("随机", "Random")}
                                    </button>
                                )}
                            </div>

                            {mode === "hct" && (
                                <div className="hct-fields">
                                    <RangeField
                                        label={tr("色相", "Hue")}
                                        english="Hue"
                                        suffix="°"
                                        value={hue}
                                        max={360}
                                        onChange={setHue}
                                    />
                                    <RangeField
                                        label={tr("彩度", "Chroma")}
                                        english="Chroma"
                                        suffix="C"
                                        value={chroma}
                                        max={120}
                                        onChange={setChroma}
                                    />
                                    <RangeField
                                        label={tr("明度", "Tone")}
                                        english="Tone"
                                        suffix="T"
                                        value={tone}
                                        max={100}
                                        onChange={setTone}
                                    />
                                </div>
                            )}

                            {mode === "rgb" && (
                                <div className="rgb-fields">
                                    <label className="hex-field">
                                        <span className="field-label">
                                            <span>
                                                {tr("颜色值", "Color value")}
                                            </span>
                                            <b>HEX</b>
                                        </span>
                                        <span className="hex-row">
                                            <input
                                                type="color"
                                                value={`#${hexValue}`}
                                                aria-label={tr(
                                                    "选择颜色",
                                                    "Choose color"
                                                )}
                                                onChange={(event) =>
                                                    setPrimaryRgb(
                                                        hexToRgb(
                                                            event.target.value
                                                        )
                                                    )
                                                }
                                            />
                                            <span className="hex-input-shell">
                                                <span>#</span>
                                                <input
                                                    type="text"
                                                    value={hexDraft}
                                                    inputMode="text"
                                                    autoComplete="off"
                                                    spellCheck="false"
                                                    onChange={(event) =>
                                                        setHex(
                                                            event.target.value
                                                        )
                                                    }
                                                />
                                            </span>
                                        </span>
                                    </label>
                                    <div className="rgb-number-grid">
                                        {["r", "g", "b"].map((channel) => (
                                            <label key={channel}>
                                                <span>
                                                    {channel.toUpperCase()}
                                                </span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="255"
                                                    value={rgb[channel]}
                                                    onChange={(event) =>
                                                        setPrimaryRgb({
                                                            ...rgb,
                                                            [channel]:
                                                                Math.round(
                                                                    clamp(
                                                                        event
                                                                            .target
                                                                            .value,
                                                                        0,
                                                                        255
                                                                    )
                                                                )
                                                        })
                                                    }
                                                />
                                            </label>
                                        ))}
                                    </div>
                                    <label className="series-field rgb-series-field">
                                        <span className="field-label">
                                            <span>
                                                {tr(
                                                    "指定色板锚点",
                                                    "Palette anchor HEX values"
                                                )}
                                            </span>
                                            <b>
                                                {tr("最多 10 个", "Up to 10")}
                                            </b>
                                        </span>
                                        <textarea
                                            rows="4"
                                            spellCheck="false"
                                            value={rgbSeriesInput}
                                            onChange={(event) =>
                                                updateRgbSeries(
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>
                                    <div className="series-input-meta">
                                        <span className="field-error">
                                            {parsedRgbSeries.invalid.length
                                                ? `${tr("无法识别", "Invalid")}: ${parsedRgbSeries.invalid.slice(0, 3).join("、")}`
                                                : ""}
                                        </span>
                                        <span>
                                            {tr(
                                                `${anchoredPalette.anchors.length} 个锚点`,
                                                `${anchoredPalette.anchors.length} anchors`
                                            )}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {mode === "series" && (
                                <div className="series-fields">
                                    <label className="series-field">
                                        <span className="field-label">
                                            <span>
                                                {tr(
                                                    "HEX 色彩序列",
                                                    "HEX color sequence"
                                                )}
                                            </span>
                                            <b>One or more colors</b>
                                        </span>
                                        <textarea
                                            rows="7"
                                            spellCheck="false"
                                            value={seriesInput}
                                            onChange={(event) =>
                                                setSeriesInput(
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>
                                    <div className="series-input-meta">
                                        <span className="field-error">
                                            {parsedSeries.invalid.length
                                                ? `${tr("无法识别", "Invalid")}: ${parsedSeries.invalid.slice(0, 3).join("、")}`
                                                : ""}
                                        </span>
                                        <span>
                                            {tr(
                                                `已识别 ${parsedSeries.colors.length} 个颜色`,
                                                `${parsedSeries.colors.length} colors found`
                                            )}
                                        </span>
                                    </div>
                                    <p className="series-hint">
                                        {tr(
                                            "支持换行、空格、逗号或分号分隔，顺序与输入保持一致。",
                                            "Separate values with lines, spaces, commas, or semicolons. Input order is preserved."
                                        )}
                                    </p>
                                </div>
                            )}

                            {mode === "picker" && (
                                <ImageColorPicker
                                    language={language}
                                    history={colorHistory}
                                    onPick={pickImageColor}
                                    onCopyHistory={() =>
                                        copyText(
                                            colorHistory.join(","),
                                            tr(
                                                "取色历史已复制",
                                                "Color history copied"
                                            )
                                        )
                                    }
                                    onClearHistory={() => setColorHistory([])}
                                />
                            )}
                        </div>

                        <div className="result-panel">
                            <div
                                className={`color-preview ${mode === "series" && parsedSeries.colors.length ? "is-gradient" : ""}`}
                                style={{
                                    backgroundColor:
                                        preview?.hex || "var(--surface-subtle)",
                                    color:
                                        mode === "series" &&
                                        parsedSeries.colors.length
                                            ? "#fff"
                                            : preview
                                              ? readableText(preview.rgb)
                                              : "var(--muted)",
                                    "--preview-gradient": seriesGradient
                                }}
                            >
                                <div className="preview-topline">
                                    <span>
                                        {tr("当前颜色", "Current color")}
                                    </span>
                                    <span className="gamut-badge">
                                        {mode === "series"
                                            ? `${swatches.length} colors`
                                            : mode === "picker"
                                              ? "LOCAL"
                                              : mapped
                                                ? "sRGB · mapped"
                                                : "sRGB"}
                                    </span>
                                </div>
                                <div
                                    className={`preview-value ${mode === "series" && parsedSeries.colors.length > 1 ? "is-sequence" : ""}`}
                                >
                                    {previewValue}
                                </div>
                            </div>
                            <div className="result-details">
                                <div className="result-heading">
                                    <div>
                                        <p className="section-kicker">
                                            {tr(
                                                "转换结果",
                                                "Conversion result"
                                            )}
                                        </p>
                                        <h2>{content[2]}</h2>
                                    </div>
                                    <button
                                        className="copy-button"
                                        type="button"
                                        onClick={copyResult}
                                    >
                                        <CopyIcon />
                                        {tr("复制", "Copy")}
                                    </button>
                                </div>
                                <dl className="value-list">
                                    {mode === "hct" && (
                                        <>
                                            <div>
                                                <dt>HEX</dt>
                                                <dd>{preview.hex}</dd>
                                            </div>
                                            <div>
                                                <dt>RGB</dt>
                                                <dd>
                                                    rgb({baseRgb.r}, {baseRgb.g}
                                                    , {baseRgb.b})
                                                </dd>
                                            </div>
                                            <div>
                                                <dt>
                                                    {tr(
                                                        "实际 HCT",
                                                        "ACTUAL HCT"
                                                    )}
                                                </dt>
                                                <dd>
                                                    hct({baseHct.hue.toFixed(1)}
                                                    ,{" "}
                                                    {baseHct.chroma.toFixed(1)},{" "}
                                                    {baseHct.tone.toFixed(1)})
                                                </dd>
                                            </div>
                                        </>
                                    )}
                                    {mode === "rgb" && (
                                        <>
                                            <div>
                                                <dt>{tr("锚点", "ANCHORS")}</dt>
                                                <dd>
                                                    {
                                                        anchoredPalette.anchors
                                                            .length
                                                    }
                                                </dd>
                                            </div>
                                            <div>
                                                <dt>
                                                    {tr(
                                                        "首个匹配",
                                                        "FIRST SNAP"
                                                    )}
                                                </dt>
                                                <dd>
                                                    {anchoredPalette.anchors[0]
                                                        ? `T${anchoredPalette.anchors[0].hct.tone.toFixed(1)} → T${anchoredPalette.anchors[0].targetTone}`
                                                        : "—"}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt>HUE</dt>
                                                <dd>
                                                    {baseHct.hue.toFixed(1)}°
                                                </dd>
                                            </div>
                                            <div>
                                                <dt>CHROMA</dt>
                                                <dd>
                                                    {baseHct.chroma.toFixed(1)}
                                                </dd>
                                            </div>
                                        </>
                                    )}
                                    {mode === "series" &&
                                        (swatches.length ? (
                                            <>
                                                <div>
                                                    <dt>
                                                        {tr("数量", "COUNT")}
                                                    </dt>
                                                    <dd>
                                                        {tr(
                                                            `${swatches.length} 个颜色`,
                                                            `${swatches.length} colors`
                                                        )}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt>
                                                        {tr(
                                                            "首个 HCT",
                                                            "FIRST HCT"
                                                        )}
                                                    </dt>
                                                    <dd>
                                                        hct(
                                                        {swatches[0].hct.hue.toFixed(
                                                            1
                                                        )}
                                                        ,{" "}
                                                        {swatches[0].hct.chroma.toFixed(
                                                            1
                                                        )}
                                                        ,{" "}
                                                        {swatches[0].hct.tone.toFixed(
                                                            1
                                                        )}
                                                        )
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt>
                                                        {tr("顺序", "ORDER")}
                                                    </dt>
                                                    <dd>
                                                        {tr(
                                                            "与 HEX 输入保持一致",
                                                            "Matches HEX input"
                                                        )}
                                                    </dd>
                                                </div>
                                            </>
                                        ) : (
                                            <div>
                                                <dt>{tr("状态", "STATUS")}</dt>
                                                <dd>
                                                    {tr(
                                                        "请输入至少一个有效 HEX 色值",
                                                        "Enter at least one valid HEX value"
                                                    )}
                                                </dd>
                                            </div>
                                        ))}
                                    {mode === "picker" && (
                                        <>
                                            <div>
                                                <dt>HEX</dt>
                                                <dd>{rgbToHex(rgb)}</dd>
                                            </div>
                                            <div>
                                                <dt>HUE</dt>
                                                <dd>
                                                    {baseHct.hue.toFixed(1)}°
                                                </dd>
                                            </div>
                                            <div>
                                                <dt>CHROMA</dt>
                                                <dd>
                                                    {baseHct.chroma.toFixed(1)}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt>TONE</dt>
                                                <dd>
                                                    T{baseHct.tone.toFixed(1)}
                                                </dd>
                                            </div>
                                        </>
                                    )}
                                </dl>
                                {mapped && (
                                    <p className="gamut-note">
                                        <span>i</span>
                                        {tr(
                                            "极高彩度在部分明度下会自动映射至 sRGB 色域内。",
                                            "High chroma may be mapped into the sRGB gamut at some tones."
                                        )}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="palette-section">
                    <div className="palette-heading">
                        <div>
                            <p className="section-kicker">
                                Tonal palette · {swatches.length} steps{" "}
                                <span className="source-badge">
                                    {content[3]}
                                </span>
                            </p>
                            <h2>{tr("品牌色彩系列", "Brand color system")}</h2>
                            <p>{content[4]}</p>
                        </div>
                        <div className="palette-actions">
                            <button
                                className="option-button"
                                type="button"
                                aria-pressed={hideValues}
                                onClick={() => setHideValues(!hideValues)}
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                                    <circle cx="12" cy="12" r="2.5" />
                                    {hideValues && <path d="m4 4 16 16" />}
                                </svg>
                                <span>
                                    {hideValues
                                        ? tr("显示色值", "Show values")
                                        : tr("隐藏色值", "Hide values")}
                                </span>
                            </button>
                            <button
                                className="option-button"
                                type="button"
                                aria-pressed={lightnessCheck}
                                onClick={() =>
                                    setLightnessCheck(!lightnessCheck)
                                }
                            >
                                <span className="split-icon" />
                                <span>
                                    {lightnessCheck
                                        ? tr("关闭检查", "Stop check")
                                        : tr("明度检查", "Tone check")}
                                </span>
                            </button>
                            <button
                                className="option-button"
                                type="button"
                                aria-pressed={showAnalysis}
                                onClick={() => setShowAnalysis(!showAnalysis)}
                            >
                                <svg viewBox="0 0 24 24">
                                    <path d="M4 18 9 11l4 3 7-9M4 21h16" />
                                </svg>
                                <span>
                                    {showAnalysis
                                        ? tr("关闭分析", "Hide analysis")
                                        : tr("T 值分析", "Tone analysis")}
                                </span>
                            </button>
                            <button
                                className="export-button"
                                type="button"
                                onClick={copyCssVariables}
                            >
                                <svg viewBox="0 0 24 24">
                                    <path d="M12 3v12M7 10l5 5 5-5M5 20h14" />
                                </svg>
                                {tr("复制 CSS 变量", "Copy CSS variables")}
                            </button>
                        </div>
                    </div>
                    <div
                        className={`palette ${mode === "series" ? "is-series" : ""} ${mode === "rgb" ? "has-anchors" : ""} ${lightnessCheck ? "is-lightness-check" : ""} ${hideValues ? "hide-values" : ""}`}
                        style={{
                            "--series-columns": Math.min(
                                swatches.length || 1,
                                16
                            )
                        }}
                        aria-live="polite"
                    >
                        {swatches.map((swatch, index) => (
                            <Swatch
                                key={`${swatch.hex}-${index}`}
                                swatch={swatch}
                                isSeries={mode === "series"}
                                hideValues={hideValues}
                                onCopy={copyText}
                                language={language}
                            />
                        ))}
                    </div>
                    <div className="palette-scale">
                        <span>{tr("更浅", "Lighter")} · Light</span>
                        <span>{tr("更深", "Darker")} · Dark</span>
                    </div>
                    {showAnalysis && (
                        <div className="tone-analysis">
                            <div className="analysis-content">
                                <div className="chart-area">
                                    <div className="analysis-heading">
                                        <div>
                                            <p className="section-kicker">
                                                Tone curve
                                                {mode === "rgb"
                                                    ? ` · ${anchoredPalette.anchors.length} anchors`
                                                    : ""}
                                            </p>
                                            <h3>
                                                {tr(
                                                    "T 值趋势分析",
                                                    "Tone trend analysis"
                                                )}
                                            </h3>
                                        </div>
                                        <div className="chart-legend">
                                            <button
                                                className={`legend-item ${showExpectedLine ? "" : "is-hidden"}`}
                                                type="button"
                                                aria-pressed={showExpectedLine}
                                                onClick={() =>
                                                    setShowExpectedLine(
                                                        !showExpectedLine
                                                    )
                                                }
                                            >
                                                <i className="legend-line expected" />
                                                {tr(
                                                    "期望 T 值",
                                                    "Expected tone"
                                                )}
                                            </button>
                                            <button
                                                className={`legend-item ${showActualLine ? "" : "is-hidden"}`}
                                                type="button"
                                                aria-pressed={showActualLine}
                                                onClick={() =>
                                                    setShowActualLine(
                                                        !showActualLine
                                                    )
                                                }
                                            >
                                                <i className="legend-line actual" />
                                                {tr("实际 T 值", "Actual tone")}
                                            </button>
                                        </div>
                                    </div>
                                    <div
                                        className="chart-shell"
                                        role="img"
                                        aria-label={tr(
                                            "期望与实际 T 值曲线比较",
                                            "Expected and actual tone comparison"
                                        )}
                                    >
                                        <ToneChart
                                            swatches={swatches}
                                            showExpected={showExpectedLine}
                                            showActual={showActualLine}
                                            language={language}
                                            adaptiveExpected={mode === "series"}
                                        />
                                    </div>
                                </div>
                                <ToneInsights
                                    swatches={swatches}
                                    language={language}
                                    adaptiveExpected={mode === "series"}
                                />
                            </div>
                        </div>
                    )}
                </section>
            </main>

            <footer>
                <div className="footer-brand">
                    <span>HCT Color Lab</span>
                    <small>by Amsen</small>
                </div>
                <div className="footer-meta">
                    <p>Built with React · CAM16 · sRGB safe</p>
                    <nav aria-label={tr("项目链接", "Project links")}>
                        <a
                            href="https://github.com/material-foundation/material-color-utilities"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Material Color Utilities ↗
                        </a>
                        <a
                            href="https://github.com/DimLoong/HCT-Color-Lab"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Project GitHub ↗
                        </a>
                    </nav>
                </div>
            </footer>
            <div className={`toast ${toast ? "is-visible" : ""}`} role="status">
                <svg viewBox="0 0 24 24">
                    <path d="m5 12 4 4L19 6" />
                </svg>
                <span>{toast}</span>
            </div>
        </>
    );
}

createRoot(document.getElementById("root")).render(<App />);
