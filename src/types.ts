export enum InterruptionType {
  EARTH_FAULT = 'Earth Fault',
  SHORT_CIRCUIT = 'Short Circuit',
  DIFFERENTIAL = 'Differential',
  OVER_CURRENT = 'Over Current',
  TOTAL_BLACKOUT = 'Total Blackout',
  PLANNED_INTERRUPTION = 'Planned Interruption',
  OPERATIONAL_INTERRUPTION = 'Operational Interruption',
  SHEDDING = 'Shedding',
  LDC = 'LDC'
}

export function normalizeInterruptionType(raw: unknown): InterruptionType {
  if (!raw || typeof raw !== 'string') return InterruptionType.EARTH_FAULT;
  const cleaned = raw.trim().toLowerCase().replace(/[\-_]/g, ' ');
  
  if (cleaned.includes('over current') || cleaned.includes('overcurrent') || cleaned === 'oc') {
    return InterruptionType.OVER_CURRENT;
  }
  if (cleaned === 'ldc' || cleaned === 'lcd' || cleaned.includes('load dispatch') || cleaned.includes('load control dispatch') || cleaned.startsWith('ldc') || cleaned.startsWith('lcd')) {
    return InterruptionType.LDC;
  }
  if (cleaned.includes('earth') || cleaned.includes('ground') || cleaned === 'ef') {
    return InterruptionType.EARTH_FAULT;
  }
  if (cleaned.includes('short') || cleaned === 'sc') {
    return InterruptionType.SHORT_CIRCUIT;
  }
  if (cleaned.includes('differential') || cleaned === 'diff') {
    return InterruptionType.DIFFERENTIAL;
  }
  if (cleaned.includes('blackout') || cleaned.includes('total')) {
    return InterruptionType.TOTAL_BLACKOUT;
  }
  if (cleaned.includes('plan')) {
    return InterruptionType.PLANNED_INTERRUPTION;
  }
  if (cleaned.includes('operation')) {
    return InterruptionType.OPERATIONAL_INTERRUPTION;
  }
  if (cleaned.includes('shedding')) {
    return InterruptionType.SHEDDING;
  }

  // Exact matching against enum values
  for (const val of Object.values(InterruptionType)) {
    if (val.toLowerCase() === cleaned) return val;
  }
  
  return InterruptionType.EARTH_FAULT;
}

export function isPlannedOrOperational(raw: unknown): boolean {
  const normalized = normalizeInterruptionType(raw);
  return normalized === InterruptionType.PLANNED_INTERRUPTION || normalized === InterruptionType.OPERATIONAL_INTERRUPTION;
}

export enum InterruptionStatus {
  ACTIVE = 'Active',
  UNDER_INVESTIGATION = 'Partially Connected',
  RESTORED = 'Restored'
}

export interface FeederInterruption {
  id: string;
  feederName: string;
  district: string;
  direction?: 'North' | 'East' | 'West' | 'South' | 'Sheger Region';
  type: InterruptionType;
  status: InterruptionStatus;
  startTime: string;
  estimatedRestorationTime: string;
  affectedArea: string;
  remark: string;
  lastUpdated: string;
}

export interface SystemStats {
  totalActive: number;
  earthFaultCount: number;
  shortCircuitCount: number;
  plannedCount: number;
  restoredTodayCount: number;
}

export interface TeamLeaderNote {
  id: string;
  content: string;
  author: string;
  timestamp: string;
  isUrgent: boolean;
}

export interface ContactItem {
  id: string;
  name: string;
  phone: string;
  category: 'head_regional' | 'sheger_city' | 'regional_hotline';
  locationInfo?: string;
  hotlineShortCode?: string;
}

export interface TeamLeaderUser {
  id: string;
  username: string;
  password: string;
  name: string;
  district?: string;
  mustChangePassword?: boolean;
  createdAt: string;
}

export type UserRole = 'admin' | 'team_leader' | 'agent';

export function stripBrackets(name: string | undefined): string {
  if (!name) return '';
  return name.replace(/\s*\(.*?\)/g, '').trim();
}

