export type Direction = 'North' | 'East' | 'West' | 'South' | 'Sheger Region';

export function getCardinalDirection(district: string, feederName?: string): Direction {
  const f = (feederName || '');
  
  // Try to parse from feeder name if it contains '|'
  if (f.includes('|')) {
    const parts = f.split('|').map(s => s.trim());
    if (parts.length >= 2) {
       const direction = parts[1];
       if (['North', 'East', 'West', 'South', 'Sheger Region'].includes(direction)) {
         return direction as Direction;
       }
    }
  }

  const d = district.toLowerCase();
  const fUpper = f.toUpperCase();

  // North list
  if (
    fUpper.includes('ADE-08') ||
    fUpper.includes('ADG-04') || fUpper.includes('ADG-3') ||
    fUpper.includes('ADN-01') || fUpper.includes('ADN-02') || fUpper.includes('ADN-03') || fUpper.includes('ADN-04') || fUpper.includes('ADN-06') ||
    fUpper.includes('ADW-02') ||
    fUpper.includes('BEL-01') || fUpper.includes('BEL-03') || fUpper.includes('BEL-05') || fUpper.includes('BEL-06') ||
    fUpper.includes('BLL-02') || fUpper.includes('BLL-14') ||
    fUpper.includes('SHG-01') || fUpper.includes('SHG-02') || fUpper.includes('SHG-05') || fUpper.includes('SHG-06') || fUpper.includes('SHG-07') || fUpper.includes('SHG-09') || fUpper.includes('SHG-10') ||
    fUpper.includes('SUL-01')
  ) {
    return 'North';
  }

  // Sheger list (remove central and add sheger, matches ፊንፊኔ ዙሪያ/ፊዙዲ)
  if (
    fUpper.includes('GEF-') || // GEF-01 to GEF-21
    fUpper.includes('LEG-12') ||
    fUpper.includes('SEB-II-') || // SEB-II-1 to SEB-II-15
    fUpper.includes('SHG-04') || fUpper.includes('SHG-8') ||
    fUpper.includes('SUL-02') || fUpper.includes('SUL-03') || fUpper.includes('SUL-04') || fUpper.includes('SUL-05') || fUpper.includes('SUL-06') ||
    d.includes('sheger') || d.includes('finfinne') || d.includes('ፊንፊኔ') || d.includes('ፊዙዲ')
  ) {
    return 'Sheger Region';
  }

  // West list
  if (
    f.includes('ADC-04') || f.includes('ADC-05') || f.includes('ADC-07') || f.includes('ADC-08') || f.includes('ADC-11') || f.includes('ADC-15') ||
    f.includes('ADE-10') ||
    f.includes('ADW-01') || f.includes('ADW-03') || f.includes('ADW-04') || f.includes('ADW-05') || f.includes('ADW-06') || f.includes('ADW-07') || f.includes('ADW-08') || f.includes('ADW-09') || f.includes('ADW-10') || f.includes('ADW-11') || f.includes('ADW-12') ||
    f.includes('ANF-03') ||
    f.includes('ALB-08') || f.includes('ALB-8') || f.includes('ALB-10') ||
    f.includes('BOL ARA-1') ||
    f.includes('BLL-01') || f.includes('BLL-03') || f.includes('BLL-06') || f.includes('BLL-07') || f.includes('BLL-09') || f.includes('BLL-10') || f.includes('BLL-11') || f.includes('BLL-12') || f.includes('BLL-4') ||
    f.includes('NIF-01') || f.includes('NIF-03') ||
    f.includes('SEB-I-01') || f.includes('SEB-I-02') || f.includes('SEB-I-03') || f.includes('SEB-I-04') || f.includes('SEB-I-05') || f.includes('SEB-I-06') || f.includes('SEB-I-07') || f.includes('SEB-I-08') || f.includes('SEB-I-09') || f.includes('SEB-I-10') || f.includes('SEB-I-11') || f.includes('SEB-I-12') ||
    f.includes('SHG-5') || f.includes('SHG-9') ||
    f.includes('ALEM BANK')
  ) {
    return 'West';
  }

  // South list
  if (
    f.includes('AKA.I-') ||
    f.includes('GEL-') ||
    f.includes('GIS-') ||
    f.includes('GOF-') ||
    f.includes('KAL-') ||
    f.includes('KOY-') ||
    f.includes('MEK-') ||
    f.includes('NIF-04') || f.includes('NIF-06') || f.includes('NIF-07') || f.includes('NIF-08') || f.includes('NIF-09') || f.includes('NIF-10') ||
    f.includes('SEB-I-13') || f.includes('SEB-I-14') || f.includes('SEB-I-15') ||
    d.includes('south')
  ) {
    return 'South';
  }

  // East list
  if (
    f.includes('ADE-01') || f.includes('ADE-02') || f.includes('ADE-03') || f.includes('ADE-04') || f.includes('ADE-05') || f.includes('ADE-07') || f.includes('ADE-09') || f.includes('ADE-11') || f.includes('ADE-12') ||
    f.includes('ARB-') ||
    f.includes('AYT-') ||
    f.includes('BEL-02') || f.includes('BEL-04') ||
    f.includes('BLM-') ||
    f.includes('COT-') || f.includes('CHK-1') ||
    f.includes('LEG-') ||
    f.includes('WER-') ||
    f.includes('COTEBE') ||
    d.includes('east')
  ) {
    return 'East';
  }

  // Fallbacks:
  if (d.includes('north') || f.includes('NORTH')) return 'North';
  if (d.includes('east') || f.includes('EAST')) return 'East';
  if (d.includes('west') || f.includes('WEST')) return 'West';
  if (d.includes('south') || f.includes('SOUTH')) return 'South';

  return 'Sheger Region'; 
}
