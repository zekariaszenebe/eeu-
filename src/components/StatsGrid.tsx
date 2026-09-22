import React from 'react';
import { ShieldAlert, Zap, CalendarClock, Gauge, Server } from 'lucide-react';
import { FeederInterruption, InterruptionType, InterruptionStatus, normalizeInterruptionType } from '../types';
import { EarthFaultIcon } from './AgentView';

interface StatsGridProps {
  interruptions: FeederInterruption[];
}

export default function StatsGrid({ interruptions }: StatsGridProps) {
  // Compute metrics dynamically with normalized types
  const activeCount = interruptions.filter(i => i.status !== InterruptionStatus.RESTORED).length;
  
  const earthFaults = interruptions.filter(
    i => i.status !== InterruptionStatus.RESTORED && normalizeInterruptionType(i.type) === InterruptionType.EARTH_FAULT
  ).length;

  const shortCircuits = interruptions.filter(
    i => i.status !== InterruptionStatus.RESTORED && normalizeInterruptionType(i.type) === InterruptionType.SHORT_CIRCUIT
  ).length;

  const overCurrents = interruptions.filter(
    i => i.status !== InterruptionStatus.RESTORED && normalizeInterruptionType(i.type) === InterruptionType.OVER_CURRENT
  ).length;

  const ldcOutages = interruptions.filter(
    i => i.status !== InterruptionStatus.RESTORED && normalizeInterruptionType(i.type) === InterruptionType.LDC
  ).length;

  const planned = interruptions.filter(
    i => i.status !== InterruptionStatus.RESTORED && (normalizeInterruptionType(i.type) === InterruptionType.PLANNED_INTERRUPTION || normalizeInterruptionType(i.type) === InterruptionType.OPERATIONAL_INTERRUPTION)
  ).length;

  const statCards = [
    {
      id: "stat-total-active",
      title: "Active Outages",
      value: activeCount,
      textColor: "text-rose-600 dark:text-rose-400 font-bold",
      subtext: "Immediate dispatch team alerted",
      icon: ShieldAlert,
      iconBg: "bg-rose-50 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-900/40 shadow-xs",
      iconColor: "text-rose-600 dark:text-rose-400",
      indicator: "right now"
    },
    {
      id: "stat-earth-fault",
      title: "Earth & Short Circuit",
      value: earthFaults + shortCircuits,
      textColor: "text-amber-600 dark:text-amber-400 font-bold",
      subtext: `${earthFaults} Ground Fault · ${shortCircuits} Short Circuit`,
      icon: EarthFaultIcon,
      iconBg: "bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-900/40 shadow-xs",
      iconColor: "text-amber-600 dark:text-amber-400",
      indicator: "right now"
    },
    {
      id: "stat-overcurrent-ldc",
      title: "Over Current & LDC",
      value: overCurrents + ldcOutages,
      textColor: "text-teal-600 dark:text-teal-400 font-bold",
      subtext: `${overCurrents} Over Current · ${ldcOutages} LDC Directive`,
      icon: Gauge,
      iconBg: "bg-teal-50 dark:bg-teal-950/40 border border-teal-200/70 dark:border-teal-900/40 shadow-xs",
      iconColor: "text-teal-600 dark:text-teal-400",
      indicator: "right now"
    },
    {
      id: "stat-planned",
      title: "Planned & Operational",
      value: planned,
      textColor: "text-sky-600 dark:text-sky-400 font-bold",
      subtext: "Pre-notified clients & maintenance",
      icon: CalendarClock,
      iconBg: "bg-sky-50 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-900/40 shadow-xs",
      iconColor: "text-sky-600 dark:text-sky-400",
      indicator: "scheduled"
    }
  ];

  return (
    <div id="statistics-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {statCards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            id={card.id}
            key={card.id}
            className="p-5 rounded-2xl glass-card flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {card.title}
                </span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                  <Icon className={`w-4.5 h-4.5 ${card.iconColor}`} />
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-display font-semibold tracking-tight ${card.textColor}`}>
                  {card.value}
                </span>
                <span className="text-xs font-sans font-bold uppercase py-0.5 px-1.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300">
                  {card.indicator}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
