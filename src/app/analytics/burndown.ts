import type { WeightGoal } from '../services/weight.service';
import { ChartPoint } from './chart.types';
import {
  Regression,
  linearRegression,
  solveForX,
  startOfLocalDay,
  valueAt,
} from './time-series';

/**
 * Which way the goal points. `cut` = target below start, `bulk` = target above.
 *
 * Every judgement in this file is expressed in terms of {@link directionSign} so a
 * single implementation serves both. Losing 2 lbs is progress on a cut and a
 * setback on a bulk — nothing here may assume "down is good".
 */
export type GoalDirection = 'cut' | 'bulk';

export interface BurndownStats {
  direction: GoalDirection;
  /** Latest weigh-in, or `null` with no data in range. */
  current: number | null;
  start: number;
  target: number;
  /** Signed toward the target: `> 0` still to go, `<= 0` goal reached. */
  remaining: number;
  /** `current - start`. Raw and unsigned — read it with `direction`. */
  totalChange: number;
  /** 0…1, clamped. `1` once the goal is reached. */
  progress: number;
  /** Change per week from the fit, or `null` without two distinct days. */
  ratePerWeek: number | null;
  /** Where the fit crosses the target, or `null` if it never does. */
  projectedDate: number | null;
  /** The plan's value today, or `null` outside the plan's date span. */
  idealToday: number | null;
  /** Signed so `> 0` always means ahead of plan, for cut and bulk alike. */
  deltaVsPlan: number | null;
  /** `null` when there isn't enough data to judge. */
  onTrack: boolean | null;
  goalReached: boolean;
  /** True once `targetDate` is in the past. */
  targetDatePassed: boolean;
}

/** `-1` for a cut, `+1` for a bulk. */
export function directionSign(direction: GoalDirection): -1 | 1 {
  return direction === 'cut' ? -1 : 1;
}

export function goalDirection(goal: WeightGoal): GoalDirection {
  return goal.targetLbs < goal.startLbs ? 'cut' : 'bulk';
}

/** The goal's start/target as epoch ms at local midnight, or `null` if malformed. */
function goalSpan(goal: WeightGoal): { from: number; to: number } | null {
  const from = parseGoalDate(goal.startDate);
  const to = parseGoalDate(goal.targetDate);
  if (from == null || to == null || to <= from) return null;
  return { from, to };
}

/**
 * Local `YYYY-MM-DD` → epoch ms at local midnight.
 *
 * Kept here rather than importing `parseDateId` from `week.service.ts` so this layer
 * stays free of Angular/Firestore imports; the two must agree on the local-day rule.
 */
function parseGoalDate(id: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  date.setHours(0, 0, 0, 0);
  return date.getMonth() === Number(m) - 1 && date.getDate() === Number(d)
    ? date.getTime()
    : null;
}

/**
 * The plan: a straight line from `(startDate, startLbs)` to `(targetDate, targetLbs)`.
 * This is the burndown's reference — the pace you'd need to hold to land on time.
 * Two points is enough; the chart interpolates.
 */
export function idealLine(goal: WeightGoal): ChartPoint[] {
  const span = goalSpan(goal);
  if (!span) return [];
  return [
    { x: span.from, y: goal.startLbs },
    { x: span.to, y: goal.targetLbs },
  ];
}

/** The plan's value at `ms`, or `null` outside its span (never extrapolated). */
export function idealAt(goal: WeightGoal, ms: number): number | null {
  const span = goalSpan(goal);
  if (!span) return null;
  if (ms < span.from || ms > span.to) return null;
  const t = (ms - span.from) / (span.to - span.from);
  return goal.startLbs + t * (goal.targetLbs - goal.startLbs);
}

/**
 * Where the current trend is heading: from the last observed point to wherever the
 * fit meets the target. Returns `null` when there's no fit, or when the trend never
 * reaches the target (flat, or moving away) — the caller shows "not on track"
 * rather than drawing a line to nowhere.
 *
 * The line is clipped at the target crossing, never drawn past it.
 */
export function projectionLine(
  points: readonly ChartPoint[],
  goal: WeightGoal,
  reg: Regression | null = linearRegression(points)
): ChartPoint[] | null {
  if (!reg || points.length === 0) return null;
  const crossing = solveForX(reg, goal.targetLbs);
  if (crossing == null) return null;

  const last = points[points.length - 1];
  if (crossing <= last.x) return null; // already there, or heading away

  return [
    { x: last.x, y: valueAt(reg, last.x) },
    { x: crossing, y: goal.targetLbs },
  ];
}

const WEEK_MS = 604_800_000;

/**
 * Every burndown readout, derived in one place so the chart, the stat tiles and any
 * future dashboard summary can never disagree.
 *
 * `points` must be day-bucketed and ascending. `trend` is the smoothed series — the
 * rate and projection are fitted to it, not to the raw weigh-ins, because day-to-day
 * body weight swings on water alone and fitting the noise produces a rate that
 * flips sign week to week.
 */
export function computeBurndown(
  points: readonly ChartPoint[],
  trend: readonly ChartPoint[],
  goal: WeightGoal,
  now: number
): BurndownStats {
  const direction = goalDirection(goal);
  const sign = directionSign(direction);
  const today = startOfLocalDay(now);

  const current = points.length ? points[points.length - 1].y : null;
  const start = goal.startLbs;
  const target = goal.targetLbs;

  // Signed toward the target so "how much is left" reads the same either way.
  const remaining = current == null ? (target - start) * sign : (target - current) * sign;
  const goalReached = current != null && remaining <= 0;

  const totalSpan = Math.abs(target - start);
  const done = current == null ? 0 : Math.abs(current - start);
  const progress = totalSpan === 0 ? (goalReached ? 1 : 0) : clamp01(done / totalSpan);

  const reg = linearRegression(trend.length >= 2 ? trend : points);
  const ratePerWeek = reg ? reg.slope * WEEK_MS : null;

  // Only project while the goal is still ahead — a crossing behind us is history.
  const crossing = reg && !goalReached ? solveForX(reg, target) : null;
  const projectedDate = crossing != null && crossing >= today ? crossing : null;

  const idealToday = idealAt(goal, today);
  // `(current - ideal) * sign` > 0 ⇔ ahead, for cut and bulk alike. On a cut
  // (sign -1) you're ahead when *below* plan; on a bulk (sign +1) when *above* it.
  // The multiply is what lets one expression serve both — don't "simplify" it away.
  const deltaVsPlan =
    current == null || idealToday == null ? null : (current - idealToday) * sign;

  const onTrack = goalReached
    ? true
    : deltaVsPlan != null
      ? deltaVsPlan >= 0
      : ratePerWeek != null
        ? Math.sign(ratePerWeek) === sign
        : null;

  const targetEnd = parseGoalDate(goal.targetDate);

  return {
    direction,
    current,
    start,
    target,
    remaining,
    totalChange: current == null ? 0 : current - start,
    progress: goalReached ? 1 : progress,
    ratePerWeek,
    projectedDate,
    idealToday,
    deltaVsPlan,
    onTrack,
    goalReached,
    targetDatePassed: targetEnd != null && targetEnd < today,
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
