import React, { useMemo, useRef, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  MapPin,
  Clock,
  Zap,
  Wrench,
  X,
  Compass,
} from 'lucide-react';
import {
  FeederInterruption,
  InterruptionStatus,
  isFeederRestored,
  isInfoFeeder,
  isPlannedOrOperational,
  normalizeInterruptionStatus,
  stripBrackets,
} from '../types';

interface AddisAbabaMapViewProps {
  interruptions: FeederInterruption[];
  isDarkMode?: boolean;
}

type MapFilterMode = 'all' | 'faults' | 'planned';

interface SubCityZone {
  id: string;
  name: string;
  amharicName: string;
  eeuDirection: 'North' | 'East' | 'West' | 'South' | 'Central';
  landmarks: string;
  /** SVG polygon points in 800x640 Addis Ababa schematic coordinate space */
  points: string;
  /** Label / marker anchor point */
  center: { x: number; y: number };
  /** Keywords (English + Amharic + feeder prefixes) for matching interruptions */
  keywords: string[];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

/**
 * Simplified schematic geometry of Addis Ababa's 11 sub-cities.
 * Designed strictly for Addis Ababa (excluding Sheger/surrounding towns),
 * intentionally non-street-detailed for rapid operator scanning.
 */
const ADDIS_SUB_CITIES: SubCityZone[] = [
  {
    id: 'gullele',
    name: 'Gullele',
    amharicName: 'ጉለሌ',
    eeuDirection: 'North',
    landmarks: 'Addisu Gebeya, Shiro Meda, Winget, Pastor, Entoto',
    points: '175,92 315,62 410,98 395,210 315,245 225,220 165,165',
    center: { x: 288, y: 158 },
    keywords: [
      'gullele', 'gulele', 'ጉለሌ', 'addisu gebeya', 'addis gebya', 'adg-',
      'shiro meda', 'ሽሮ ሜዳ', 'entoto', 'እንጦቶ', 'kechene', 'ቀጨኔ',
      'winget', 'ዊንጌት', 'pasteur', 'pastor', 'ፓስተር', 'paulos', 'ጳውሎስ',
      'askko', 'asko', 'አስኮ', 'rufale', 'ሩፋኤል', 'semen mazegaja', 'ሰሜን ማዘጋጃ',
      'dil ber', 'ድል በር', 'sheger park', 'guskuam', 'ጉስቋም', 'menen', 'መነን',
    ],
  },
  {
    id: 'yeka',
    name: 'Yeka',
    amharicName: 'የካ',
    eeuDirection: 'East',
    landmarks: 'Ferensay, Bella, Kotebe, Signal, Megenagna, Kara',
    points: '410,98 555,82 628,155 595,265 485,275 435,235 395,210',
    center: { x: 512, y: 184 },
    keywords: [
      'yeka', 'የካ', 'ferensay', 'ፈረንሳይ', 'bella', 'bel-', 'ቤላ',
      'kotebe', 'cotebe', 'cot-', 'ኮተቤ', 'signal', 'ሲግናል', 'megenagna', 'መገናኛ',
      'kara', 'ካራ', 'wosen', 'ወሰን', 'lam beret', 'ላም በረት', 'shola', 'ሾላ',
      'kebena', 'ቀበና', 'aware', 'አዋሬ', 'balderas', 'ባልደራስ', 'minilik', 'ሚኒሊክ',
      'chaka', 'chk-', 'dinberwa', 'ድንበሯ', 'british embassy', 'salite mihret', 'ሳሊተ ምህረት',
    ],
  },
  {
    id: 'lemi-kura',
    name: 'Lemi Kura',
    amharicName: 'ለሚ ኩራ',
    eeuDirection: 'East',
    landmarks: 'CMC, Ayat, Meri, Summit, Bole Arabsa, Figa',
    points: '595,265 628,155 745,205 752,330 665,372 585,340',
    center: { x: 672, y: 274 },
    keywords: [
      'lemi kura', 'lemikura', 'ለሚ ኩራ', 'ለሚኩራ', 'cmc', 'ሲኤምሲ', 'ሲኤም ሲ',
      'ayat', 'ayt-', 'አያት', 'meri', 'መሪ', 'summit', 'ሰሚት', 'arabsa', 'arb-',
      'አራብሳ', 'beshale', 'በሻሌ', 'figa', 'ፊጋ', 'jakros', 'ጃክሮስ', 'civil service',
      'ሲቪል ሰርቪስ', 'gurd shola', 'ጉርድ ሾላ', 'ict park', 'አይ ሲ ቲ',
    ],
  },
  {
    id: 'arada',
    name: 'Arada',
    amharicName: 'አራዳ',
    eeuDirection: 'North',
    landmarks: 'Piassa, Arat Kilo, Sidist Kilo, Janmeda, Dejach Wube',
    points: '315,245 395,210 435,235 425,295 362,302 325,282',
    center: { x: 378, y: 262 },
    keywords: [
      'arada', 'አራዳ', 'piassa', 'piasa', 'ፒያሳ', 'ፒያሣ', '4 kilo', '4ኪሎ', 'arat kilo',
      '5 kilo', '5ኪሎ', '6 kilo', '6ኪሎ', 'sidist kilo', 'janmeda', 'ጃንሜዳ',
      'dejach wube', 'ደጃች ውቤ', 'afincho ber', 'አፍንጮ በር', 'churchill', 'ቸርቸል',
      'adwa', 'አድዋ', 'yohannes', 'ዮሀንስ', 'ras desta', 'ራስ ደስታ', 'abune petros',
      'adn-', 'addis north', 'tourist hotel', 'ገንፍሌ',
    ],
  },
  {
    id: 'addis-ketema',
    name: 'Addis Ketema',
    amharicName: 'አዲስ ከተማ',
    eeuDirection: 'West',
    landmarks: 'Merkato, Autobus Tera, Mesalemiya, Abinet, Sebategna',
    points: '225,220 315,245 325,282 292,315 222,295 212,252',
    center: { x: 274, y: 272 },
    keywords: [
      'addis ketema', 'አዲስ ከተማ', 'merkato', 'mercato', 'መርካቶ', 'autobus tera',
      'አውቶብስ ተራ', 'ehil berenda', 'እህል በረንዳ', 'mesalemiya', 'መሳለሚያ', 'ማሰለሚያ',
      'abinet', 'አብነት', 'sebategna', 'ሰባተኛ', 'amanuel', 'አማኑኤል', 'አማኔኤል',
      'kuas meda', 'ኳስ ሜዳ', 'anwar', 'አንዋር', 'gojam berenda', 'ጎጃም በረንዳ',
      'abebe bikila', 'አበበ ቢቂላ', 'addisu michael', 'አዲሱ ሚካኤል',
    ],
  },
  {
    id: 'kolfe-keranio',
    name: 'Kolfe Keranio',
    amharicName: 'ኮልፌ ቀራኒዮ',
    eeuDirection: 'West',
    landmarks: '18 Mazoria, Bethel, Ayer Tena, Alem Bank, Tor Hailoch, Weyra',
    points: '65,245 165,165 225,220 212,252 222,295 255,345 198,425 102,402 58,325',
    center: { x: 156, y: 312 },
    keywords: [
      'kolfe', 'keranio', 'keraniyo', 'ኮልፌ', 'ቀራንዮ', 'ቀራኒዮ', '18 mazoria', '18 ማደያ',
      'ኮልፌ 18', 'bethel', 'betel', 'ቤተል', 'ayer tena', 'ayertena', 'አየር ጤና',
      'alem bank', 'alembank', 'alb-', 'አለም ባንክ', 'ዓለም ባንክ', 'anfo', 'anf-', 'አንፎ',
      'weyra', 'ወይራ', 'zenebework', 'ዘነበወርቅ', 'augusta', 'አውጉስታ', 'አጉስታ',
      'tor hailoch', 'torhailoch', 'ጦርሀይሎች', 'ጦር ሀይሎች', 'lomi meda', 'ሎሚ ሜዳ',
      'filipos', 'ፊሊፖስ', 'adw-', 'addis west', 'karl', 'yeshi debele', 'የሺ ደበሌ',
    ],
  },
  {
    id: 'lideta',
    name: 'Lideta',
    amharicName: 'ልደታ',
    eeuDirection: 'Central',
    landmarks: 'Lideta, Mexico, Balcha Hospital, Teklehaimanot, Coca',
    points: '222,295 292,315 325,282 362,302 356,352 290,374 255,345',
    center: { x: 298, y: 332 },
    keywords: [
      'lideta', 'ልደታ', 'mexico', 'meksico', 'ሜክሲኮ', 'balcha', 'ባልቻ',
      'teklehaimanot', 'teklehaymanot', 'ተክለሀይማኖት', 'ተክለሃይማኖት', 'ተ/ኃይማኖት',
      'tikur anbessa', 'black line', 'bll-', 'ጥቁር አንበሳ', 'coca', 'ኮካ',
      'senga tera', 'ሰንጋ ተራ', 'geja', 'ጌጃ', 'tegba', 'ተግባረድ', 'mechare', 'መቻሬ',
      'african union', 'አፍሪካ ሕብረት', 'adc-11', 'biherawi', 'ብሔራዊ',
    ],
  },
  {
    id: 'kirkos',
    name: 'Kirkos',
    amharicName: 'ቂርቆስ',
    eeuDirection: 'Central',
    landmarks: 'Meskel Sq, Legehar, Kazanchis, Urael, Olympia, Wolo Sefer, Gotera',
    points: '362,302 425,295 485,275 495,355 435,402 356,385 356,352',
    center: { x: 422, y: 342 },
    keywords: [
      'kirkos', 'kikos', 'ቂርቆስ', 'cherkos', 'ጨርቆስ', 'meskel', 'መስቀል',
      'legehar', 'ለገሐር', 'ለገሀር', 'kazanchis', 'kasanchis', 'ካሳንቺስ', 'ካዛንቺስ',
      'urael', 'ኡራኤል', 'olympia', 'ኦሎምፒያ', 'wolo sefer', 'ወሎ ሰፈር', 'denbel', 'ደንበል',
      'flamingo', 'ፍላሚንጎ', 'gotera', 'ጎተራ', 'estifanos', 'እስጢፋኖስ', 'ghion', 'ጊዮን',
      'hilton', 'sheraton', 'ሸራትን', 'eca', 'ኢሲኤ', 'bambis', 'kera', 'ቄራ',
      'addis center', 'adc-', 'bulgaria', 'ቡልጋሪያ', '22', 'atlas', 'አትላስ',
    ],
  },
  {
    id: 'bole',
    name: 'Bole',
    amharicName: 'ቦሌ',
    eeuDirection: 'East',
    landmarks: 'Bole Medhanialem, Atlas, Rwanda, Goro, Bulbula, Airport, 24',
    points: '485,275 595,265 585,340 665,372 645,455 515,445 435,402 495,355',
    center: { x: 556, y: 368 },
    keywords: [
      'bole', 'ቦሌ', 'medhanialem', 'መድሀኒአለም', 'rwanda', 'ሩዋንዳ', 'goro', 'ጎሮ',
      'bulbula', 'ቡልቡላ', 'airport', 'አየር መንገድ', 'hayahulet', 'chichinia', 'ቺቺኒያ',
      'ade-', 'addis east', 'gerji', 'ገርጂ', 'bole michael', 'ቦሌ ሚካኤል',
      '24', 'millennium', 'jackros', 'shewa dabo', 'ethio china', 'bolemichael',
    ],
  },
  {
    id: 'nifas-silk',
    name: 'Nifas Silk-Lafto',
    amharicName: 'ንፋስ ስልክ ላፍቶ',
    eeuDirection: 'South',
    landmarks: 'Sar Bet, Mekanisa, Gofa, Jemo, Lebu, Lafto, Hana Mariam',
    points: '198,425 255,345 290,374 356,352 356,385 435,402 410,498 275,525 182,482',
    center: { x: 306, y: 446 },
    keywords: [
      'nifas silk', 'nefas silk', 'lafto', 'ንፋስ ስልክ', 'ላፍቶ', 'sar bet', 'sarbet', 'ሳር ቤት', 'ሳርቤት',
      'mekanisa', 'መካኒሳ', 'gofa', 'gof-', 'ጎፋ', 'jemo', 'ጀሞ', 'lebu', 'ለቡ',
      'hana mariam', 'ሃና ማርያም', 'ሀና ማርያም', 'bisrate gabriel', 'ብስራተ ገብርኤል',
      'german square', 'ጀርመን አደባባይ', 'mebrat hail', 'መብራት ሀይል', 'karl square',
      'abo mazoria', 'sefereselam', 'ertale', 'south region', 'global hotel',
    ],
  },
  {
    id: 'akaki-kality',
    name: 'Akaki-Kality',
    amharicName: 'አቃቂ ቃሊቲ',
    eeuDirection: 'South',
    landmarks: 'Saris, Kaliti, Akaki, Tulu Dimtu, Kilinto, Koye Feche',
    points: '435,402 515,445 645,455 628,552 475,588 385,542 410,498',
    center: { x: 508, y: 498 },
    keywords: [
      'akaki', 'aka.', 'አቃቂ', 'kality', 'kaliti', 'ቃሊቲ', 'saris', 'ሳሪስ',
      'tulu dimtu', 'ቱሉ ዲምቱ', 'kilinto', 'ቂሊንጦ', 'koye', 'ኮዬ', 'gelan', 'gel-', 'ገላን',
      'korke', 'ቆርኬ', 'crown', 'ክራውን', 'abo', 'kality prison', 'worku sefer',
      'saris abo', 'akaki kality', 'akaki-kality', 'coffee city', 'ኮፊ ሲቲ',
    ],
  },
];

const SHEGER_EXCLUSION_KEYWORDS = [
  'burayu', 'ቡራዩ', 'geferesa', 'gef-', 'ገፈርሳ', 'tatek', 'ታጠቅ',
  'sululta', 'ሱሉልታ', 'legatafo', 'legetafo', 'ለገጣፎ', 'ለገዳዲ',
  'bishoftu', 'ቢሾፍቱ', 'dukem', 'ዱከም', 'holeta', 'ሆለታ',
  'sandafa', 'sendafa', 'ሰንዳፋ', 'alemgena', 'alem gena', 'አለምገና',
  'welete', 'ወለቴ', 'sebeta', 'ሰበታ', 'menagesha', 'መናገሻ',
];

function isShegerOutage(item: FeederInterruption): boolean {
  if (item.direction === 'Sheger Region') return true;
  const haystack = `${item.feederName || ''} ${item.affectedArea || ''} ${item.district || ''}`.toLowerCase();
  if (haystack.includes('bole arabsa') || haystack.includes('arb-') || haystack.includes('blm-')) {
    return false;
  }
  return SHEGER_EXCLUSION_KEYWORDS.some((kw) => haystack.includes(kw));
}

function matchSubCityForOutage(item: FeederInterruption): SubCityZone | null {
  if (isShegerOutage(item)) return null;

  const feederLower = (item.feederName || '').toLowerCase();
  const areaLower = (item.affectedArea || '').toLowerCase();
  const combined = `${feederLower} ${areaLower}`;

  // Score each sub-city by keyword matches
  let bestZone: SubCityZone | null = null;
  let bestScore = 0;

  for (const zone of ADDIS_SUB_CITIES) {
    let score = 0;
    for (const kw of zone.keywords) {
      if (areaLower.includes(kw)) score += 3;
      if (feederLower.includes(kw)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestZone = zone;
    }
  }

  if (bestZone && bestScore > 0) return bestZone;

  // Fallback by direction inside Addis Ababa
  if (item.direction === 'North') return ADDIS_SUB_CITIES.find((z) => z.id === 'arada') || null;
  if (item.direction === 'East') return ADDIS_SUB_CITIES.find((z) => z.id === 'bole') || null;
  if (item.direction === 'West') return ADDIS_SUB_CITIES.find((z) => z.id === 'kolfe-keranio') || null;
  if (item.direction === 'South') return ADDIS_SUB_CITIES.find((z) => z.id === 'nifas-silk') || null;

  // Check if direction keyword appears in feeder suffix (`| East`)
  if (combined.includes('| north')) return ADDIS_SUB_CITIES.find((z) => z.id === 'arada') || null;
  if (combined.includes('| east')) return ADDIS_SUB_CITIES.find((z) => z.id === 'bole') || null;
  if (combined.includes('| west')) return ADDIS_SUB_CITIES.find((z) => z.id === 'kolfe-keranio') || null;
  if (combined.includes('| south')) return ADDIS_SUB_CITIES.find((z) => z.id === 'nifas-silk') || null;

  return ADDIS_SUB_CITIES.find((z) => z.id === 'kirkos') || null;
}

export default function AddisAbabaMapView({
  interruptions,
  isDarkMode = false,
}: AddisAbabaMapViewProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);

  const [selectedZoneId, setSelectedZoneId] = useState<string>('kirkos');
  const [filterMode, setFilterMode] = useState<MapFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Clamp pan bounds relative to current zoom so Addis Ababa stays centered in view
  const clampPan = (nextX: number, nextY: number, currentZoom: number) => {
    if (currentZoom <= 1) return { x: 0, y: 0 };
    const maxOffsetX = ((currentZoom - 1) * 320);
    const maxOffsetY = ((currentZoom - 1) * 260);
    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, nextX)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, nextY)),
    };
  };

  const handleZoomChange = (nextZoomRaw: number) => {
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(nextZoomRaw.toFixed(1))));
    setZoom(nextZoom);
    setPan((prev) => clampPan(prev.x, prev.y, nextZoom));
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    handleZoomChange(zoom + delta);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    // Ignore drags starting on buttons
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan(clampPan(dragStartRef.current.panX + dx, dragStartRef.current.panY + dy, zoom));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Filter live Addis Ababa interruptions (excluding restored & INFO & non-Addis Sheger)
  const { addisDisruptions, shegerExcludedCount } = useMemo(() => {
    const nonRestored = interruptions.filter(
      (item) => !isFeederRestored(item) && !isInfoFeeder(item.feederName)
    );
    let shegerCount = 0;
    const addisList: FeederInterruption[] = [];

    for (const item of nonRestored) {
      if (isShegerOutage(item)) {
        shegerCount += 1;
        continue;
      }
      if (filterMode === 'faults' && isPlannedOrOperational(item.type)) continue;
      if (filterMode === 'planned' && !isPlannedOrOperational(item.type)) continue;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${item.feederName} ${item.affectedArea} ${item.type} ${item.district}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }

      addisList.push(item);
    }

    return { addisDisruptions: addisList, shegerExcludedCount: shegerCount };
  }, [interruptions, filterMode, searchQuery]);

  // Group Addis disruptions per sub-city
  const zoneOutagesMap = useMemo(() => {
    const map = new Map<string, FeederInterruption[]>();
    for (const zone of ADDIS_SUB_CITIES) {
      map.set(zone.id, []);
    }
    for (const item of addisDisruptions) {
      const matched = matchSubCityForOutage(item);
      if (matched) {
        map.get(matched.id)!.push(item);
      }
    }
    return map;
  }, [addisDisruptions]);

  // Search-matching sub-cities even if they have 0 outages
  const searchMatchingZoneIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return new Set<string>();
    const set = new Set<string>();
    for (const z of ADDIS_SUB_CITIES) {
      if (
        z.name.toLowerCase().includes(q) ||
        z.amharicName.includes(q) ||
        z.landmarks.toLowerCase().includes(q) ||
        z.keywords.some((kw) => kw.includes(q))
      ) {
        set.add(z.id);
      }
    }
    return set;
  }, [searchQuery]);

  const selectedZone = useMemo(
    () => ADDIS_SUB_CITIES.find((z) => z.id === selectedZoneId) || ADDIS_SUB_CITIES[0],
    [selectedZoneId]
  );

  const selectedZoneOutages = zoneOutagesMap.get(selectedZone.id) || [];

  const totalFaults = addisDisruptions.filter((i) => !isPlannedOrOperational(i.type)).length;
  const totalPlanned = addisDisruptions.filter((i) => isPlannedOrOperational(i.type)).length;

  const getZoneColors = (zoneId: string, isSelected: boolean) => {
    const list = zoneOutagesMap.get(zoneId) || [];
    const hasActiveFault = list.some((i) => !isPlannedOrOperational(i.type));
    const hasPlanned = list.some((i) => isPlannedOrOperational(i.type));
    const isSearchHit = searchMatchingZoneIds.has(zoneId);

    if (hasActiveFault) {
      return {
        fill: isDarkMode
          ? isSelected ? 'rgba(239, 68, 68, 0.34)' : 'rgba(239, 68, 68, 0.20)'
          : isSelected ? 'rgba(239, 68, 68, 0.24)' : 'rgba(239, 68, 68, 0.13)',
        stroke: isSelected ? '#ef4444' : isDarkMode ? '#f87171' : '#dc2626',
        badgeBg: '#dc2626',
      };
    }
    if (hasPlanned) {
      return {
        fill: isDarkMode
          ? isSelected ? 'rgba(244, 139, 32, 0.32)' : 'rgba(244, 139, 32, 0.18)'
          : isSelected ? 'rgba(244, 139, 32, 0.24)' : 'rgba(244, 139, 32, 0.14)',
        stroke: isSelected ? '#F48B20' : isDarkMode ? '#fb923c' : '#d97706',
        badgeBg: '#d97706',
      };
    }
    if (isSearchHit) {
      return {
        fill: isDarkMode ? 'rgba(95, 163, 84, 0.28)' : 'rgba(95, 163, 84, 0.20)',
        stroke: '#5FA354',
        badgeBg: '#5FA354',
      };
    }
    return {
      fill: isDarkMode
        ? isSelected ? 'rgba(95, 163, 84, 0.22)' : 'rgba(30, 41, 59, 0.72)'
        : isSelected ? 'rgba(95, 163, 84, 0.16)' : 'rgba(248, 250, 252, 0.92)',
      stroke: isSelected
        ? '#5FA354'
        : isDarkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.55)',
      badgeBg: '#5FA354',
    };
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="glass-card p-4 border border-gray-200/70 dark:border-gray-800/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="text-left">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#5FA354] shrink-0" />
            <h2 className="text-base sm:text-lg font-display font-bold text-gray-900 dark:text-white tracking-tight">
              Addis Ababa Outage Schematic Map
            </h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>Addis Ababa 11 Sub-Cities</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {addisDisruptions.length} active/planned {addisDisruptions.length === 1 ? 'feeder' : 'feeders'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
              {totalFaults} fault{totalFaults === 1 ? '' : 's'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
              {totalPlanned} planned
            </span>
            {shegerExcludedCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{shegerExcludedCount} Sheger excluded</span>
              </>
            )}
          </p>
        </div>

        {/* Filter & Search Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-initial min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find sub-city, area, feeder..."
              aria-label="Search Addis Ababa map"
              className="w-full sm:w-56 pl-8 pr-7 py-2 text-xs rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5FA354]/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear map search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-900/80 rounded-lg border border-gray-200/70 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('faults')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                filterMode === 'faults'
                  ? 'bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Faults
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('planned')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                filterMode === 'planned'
                  ? 'bg-white dark:bg-gray-800 text-[#F48B20] shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Planned
            </button>
          </div>
        </div>
      </div>

      {/* Main Split View: Map Canvas + Selected Sub-City Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Schematic Map Canvas */}
        <div className="xl:col-span-8 glass-card border border-gray-200/70 dark:border-gray-800/80 overflow-hidden flex flex-col">
          {/* Map Controls Bar */}
          <div className="px-4 py-2.5 border-b border-gray-200/60 dark:border-gray-800/80 flex items-center justify-between gap-3 bg-gray-50/60 dark:bg-gray-900/40">
            <div className="flex items-center gap-4 text-[11px] text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-red-500/70 border border-red-600 inline-block" />
                Active Fault
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#F48B20]/70 border border-[#d97706] inline-block" />
                Planned / Operational
              </span>
              <span className="hidden sm:flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 dark:bg-slate-700 border border-slate-400 inline-block" />
                Normal
              </span>
            </div>

            {/* Strict 1x - 3x Zoom Controls */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono tabular-nums text-gray-500 dark:text-gray-400 mr-1">
                {zoom.toFixed(1)}× / 3.0×
              </span>
              <button
                type="button"
                onClick={() => handleZoomChange(zoom - ZOOM_STEP)}
                disabled={zoom <= MIN_ZOOM}
                aria-label="Zoom out"
                title="Zoom Out"
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleZoomChange(zoom + ZOOM_STEP)}
                disabled={zoom >= MAX_ZOOM}
                aria-label="Zoom in (max 3x)"
                title="Zoom In (Max 3×)"
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleResetView}
                disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
                aria-label="Reset map zoom"
                title="Reset View (1×)"
                className="min-w-[36px] min-h-[36px] px-2.5 flex items-center justify-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </div>
          </div>

          {/* Interactive SVG Map Viewport */}
          <div
            ref={mapViewportRef}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`relative w-full h-[460px] sm:h-[540px] overflow-hidden select-none touch-none ${
              isDarkMode ? 'bg-slate-950/90' : 'bg-slate-50/90'
            } ${zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
          >
            <div
              className="w-full h-full flex items-center justify-center transition-transform duration-150 ease-out"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            >
              <svg
                viewBox="0 0 800 640"
                className="w-full h-full max-w-full max-h-full"
                role="img"
                aria-label="Addis Ababa simplified 11 sub-city schematic map"
              >
                {/* Minimal Addis Ababa schematic background grid & ring-road arc */}
                <defs>
                  <pattern
                    id="addis-grid"
                    width="40"
                    height="40"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 40 0 L 0 0 0 40"
                      fill="none"
                      stroke={isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(148,163,184,0.14)'}
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="800" height="640" fill="url(#addis-grid)" />

                {/* Subtle outer ring-road schematic oval */}
                <ellipse
                  cx="395"
                  cy="335"
                  rx="245"
                  ry="188"
                  fill="none"
                  stroke={isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.16)'}
                  strokeWidth="1.5"
                  strokeDasharray="6 6"
                />

                {/* Compass Labels (N/E/W/S) */}
                <text x="400" y="34" textAnchor="middle" fontSize="11" fontWeight="700" fill={isDarkMode ? '#64748b' : '#94a3b8'}>
                  NORTH · Entoto / Gullele
                </text>
                <text x="400" y="622" textAnchor="middle" fontSize="11" fontWeight="700" fill={isDarkMode ? '#64748b' : '#94a3b8'}>
                  SOUTH · Akaki-Kality
                </text>
                <text x="26" y="335" textAnchor="middle" fontSize="11" fontWeight="700" transform="rotate(-90 26 335)" fill={isDarkMode ? '#64748b' : '#94a3b8'}>
                  WEST
                </text>
                <text x="774" y="335" textAnchor="middle" fontSize="11" fontWeight="700" transform="rotate(90 774 335)" fill={isDarkMode ? '#64748b' : '#94a3b8'}>
                  EAST
                </text>

                {/* 11 Sub-City Polygons */}
                {ADDIS_SUB_CITIES.map((zone) => {
                  const isSelected = zone.id === selectedZoneId;
                  const zoneOutages = zoneOutagesMap.get(zone.id) || [];
                  const colors = getZoneColors(zone.id, isSelected);
                  const count = zoneOutages.length;

                  return (
                    <g
                      key={zone.id}
                      onClick={() => setSelectedZoneId(zone.id)}
                      className="cursor-pointer group"
                    >
                      <polygon
                        points={zone.points}
                        fill={colors.fill}
                        stroke={colors.stroke}
                        strokeWidth={isSelected ? 2.5 : 1.3}
                        strokeLinejoin="round"
                        className="transition-colors duration-150"
                      />

                      {/* Sub-city name */}
                      <text
                        x={zone.center.x}
                        y={count > 0 ? zone.center.y - 10 : zone.center.y - 2}
                        textAnchor="middle"
                        fontSize={zone.id === 'arada' || zone.id === 'lideta' || zone.id === 'addis-ketema' ? '10.5' : '12'}
                        fontWeight="700"
                        fill={isDarkMode ? '#f1f5f9' : '#0f172a'}
                        className="pointer-events-none"
                      >
                        {zone.name}
                      </text>
                      <text
                        x={zone.center.x}
                        y={count > 0 ? zone.center.y + 3 : zone.center.y + 12}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="500"
                        fill={isDarkMode ? '#94a3b8' : '#64748b'}
                        className="pointer-events-none"
                      >
                        {zone.amharicName}
                      </text>

                      {/* Outage Count Indicator (only when > 0) */}
                      {count > 0 && (
                        <g transform={`translate(${zone.center.x}, ${zone.center.y + 21})`} className="pointer-events-none">
                          <circle r="11" fill={colors.badgeBg} />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize="11"
                            fontWeight="800"
                            fill="#ffffff"
                          >
                            {count}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {zoom > 1 && (
              <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md text-[11px] bg-white/85 dark:bg-gray-900/85 text-gray-600 dark:text-gray-300 border border-gray-200/70 dark:border-gray-800 pointer-events-none">
                Drag map to pan
              </div>
            )}
          </div>
        </div>

        {/* Selected Sub-City Inspector Panel */}
        <div className="xl:col-span-4 glass-card border border-gray-200/70 dark:border-gray-800/80 flex flex-col max-h-[600px]">
          <div className="p-4 border-b border-gray-200/60 dark:border-gray-800/80 text-left">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-semibold text-[#5FA354]">
                  Addis Ababa · {selectedZone.eeuDirection} Sector
                </span>
                <h3 className="text-lg font-display font-bold text-gray-900 dark:text-white leading-tight mt-0.5">
                  {selectedZone.name}{' '}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                    ({selectedZone.amharicName})
                  </span>
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums font-bold text-gray-700 dark:text-gray-200">
                {selectedZoneOutages.length} {selectedZoneOutages.length === 1 ? 'outage' : 'outages'}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              Key areas: {selectedZone.landmarks}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-left">
            {selectedZoneOutages.length === 0 ? (
              <div className="py-10 text-center space-y-1.5">
                <MapPin className="w-7 h-7 text-[#5FA354]/70 mx-auto" />
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  No matching interruptions in {selectedZone.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                  Select another highlighted sub-city on the schematic map to inspect affected feeders.
                </p>
              </div>
            ) : (
              selectedZoneOutages.map((item) => {
                const isPlanned = isPlannedOrOperational(item.type);
                const status = normalizeInterruptionStatus(item.status);
                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-white/80 dark:bg-gray-900/70 border border-gray-200/80 dark:border-gray-800 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isPlanned ? (
                          <Wrench className="w-3.5 h-3.5 text-[#F48B20] shrink-0" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <span className="text-xs font-bold text-gray-900 dark:text-white truncate">
                          {stripBrackets(item.feederName)}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-semibold shrink-0 ${
                          status === InterruptionStatus.UNDER_INVESTIGATION
                            ? 'text-amber-600 dark:text-amber-400'
                            : isPlanned
                            ? 'text-[#F48B20]'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {status === InterruptionStatus.UNDER_INVESTIGATION ? 'Partial' : item.type}
                      </span>
                    </div>

                    {item.affectedArea && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                        {item.affectedArea}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400 font-mono tabular-nums pt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Start: {item.startTime || '—'}
                      </span>
                      <span>ETR: {item.estimatedRestorationTime || '—'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
