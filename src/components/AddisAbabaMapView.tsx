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
  compact?: boolean;
  /** Authentic Addis Ababa geographic boundary points projected into 800x720 SVG space */
  points: string;
  /** Visual centroid for label & outage badge */
  center: { x: number; y: number };
  /** Keywords (English + Amharic + feeder prefixes) for matching interruptions */
  keywords: string[];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

/**
 * Real Addis Ababa outer municipal boundary silhouette (800x720 projection).
 */
const ADDIS_CITY_OUTLINE =
  '84.7,340.7 93.4,358.8 178.5,377.8 183.6,404.3 179.2,411.1 185.7,421.2 199.6,422.6 215.4,415.5 222,440.5 241,464.1 274.5,468.9 311.1,512.1 328.3,514.6 326.6,532 339.3,533.6 340.1,541.4 330.1,567.9 341.3,568.1 336.5,602.9 356.9,609.9 362.2,627.2 397.6,621.1 403.2,612.2 407.4,627.5 417.9,632.8 413.7,656.7 420.7,670.9 445.9,668.8 462.1,676 494.4,658.3 506.3,666.3 505.2,654.4 522,655.5 519.3,631 533.8,588.5 521.3,567.7 523.2,562.7 542,556.1 560.3,563.8 614.7,556.7 624.8,580.9 629.1,578.6 628.8,561.6 646.9,525.9 635.3,510.5 651.4,472.3 601.7,435.4 595.3,424.7 604.6,413 631,421.2 634.4,427.5 694.1,431.9 690.2,423.5 703.6,411.6 701.1,400.5 686.9,390.8 687.8,383.4 697.6,383.6 714.8,337.4 709.6,300.3 715.3,281.1 711.7,252.4 691.3,201.3 660.4,158.2 658.9,119.2 641.8,78.9 598.1,78.9 585.5,92.3 522.8,97.1 477.2,81.1 449.1,106.8 447.5,100.9 441.6,104.5 429.9,96.1 413.3,54.8 397,44 382.8,44.1 344.1,65.3 318.9,71 293.2,73.7 268.6,68.9 192.6,104.2 191.2,163.9 165,185.7 163.8,198.9 152.4,215.3 154.1,251.7 149.8,256.1 115,251.7 113.2,257.9 113.9,271.5 131.9,294.6 134.2,312.7 127,332.4 84.7,340.7';

/**
 * Subtle simplified Addis Ababa geographic reference paths (Ring Road, major axes, Bole Airport runways).
 */
const ADDIS_RING_ROAD =
  '308.3,164.4 390.6,169.2 470.6,221.5 496.5,293 456.5,373.9 383.6,412 296.6,378.7 237.8,297.7 254.3,212 308.3,164.4';
const ADDIS_EAST_WEST_AXIS =
  '190.8,269.2 266,264.4 329.5,254.9 369.5,254.9 465.9,231.1 550.6,228.7 644.6,226.3';
const ADDIS_NORTH_SOUTH_AXIS =
  '367.1,100.1 355.4,178.7 348.3,200.1 369.5,254.9 381.2,354.9 385.9,457.2 418.9,576.3 449.4,654.8';
const BOLE_RUNWAY_1 = '418.9,335.8 498.8,326.3';
const BOLE_RUNWAY_2 = '423.6,345.3 503.5,335.8';

const MAP_LANDMARKS: Array<{ label: string; x: number; y: number }> = [
  { label: 'Entoto', x: 374.2, y: 83.5 },
  { label: 'Piassa', x: 348.3, y: 200.1 },
  { label: 'Merkato', x: 315.4, y: 204.9 },
  { label: 'Meskel Sq', x: 369.5, y: 254.9 },
  { label: 'Tor Hailoch', x: 266, y: 264.4 },
  { label: 'Megenagna', x: 465.9, y: 231.1 },
  { label: 'Ayat', x: 635.2, y: 228.7 },
  { label: 'Bole Airport', x: 458.8, y: 331.1 },
  { label: 'Saris', x: 381.2, y: 404.9 },
  { label: 'Kaliti', x: 393, y: 521.5 },
];

/**
 * Geographic boundaries of Addis Ababa's 11 sub-cities (simplified for clear, non-cluttered operational display).
 */
const ADDIS_SUB_CITIES: SubCityZone[] = [
  {
    id: 'gullele',
    name: 'Gullele',
    amharicName: 'ጉለሌ',
    eeuDirection: 'North',
    landmarks: 'Addisu Gebeya, Shiro Meda, Winget, Pastor, Entoto',
    points:
      '250.2,77.3 249.4,77.3 268.6,68.9 293.2,73.7 316.2,71.3 318.9,71 344.1,65.3 354,59.2 368.9,49.5 382.8,44.1 397,44 400.3,46.2 413.3,54.8 423.9,80.5 427.3,88.5 424,81.7 406.2,99.6 390.9,100.8 382.6,111.3 379.1,122.3 388.1,141 384.4,154.4 390.9,166.2 373.2,175.4 363.8,174.9 344.2,168.6 342.8,149.1 319.3,153.5 312.8,166.6 298.3,169 266.5,146.3 259.5,148.8 254.6,110.1 242.3,86.3',
    center: { x: 334, y: 112 },
    keywords: [
      'gullele', 'gulele', 'ጉለሌ', 'addisu gebeya', 'addis gebya', 'adg-',
      'shiro meda', 'ሽሮ ሜዳ', 'entoto', 'እንጦቶ', 'kechene', 'ቀጨኔ',
      'winget', 'ዊንጌት', 'pasteur', 'pastor', 'ፓስተር', 'paulos', 'ጳውሎስ',
      'askko', 'asko', 'አስኮ', 'rufale', 'ሩፋኤል', 'semen mazegaja', 'ሰሜን ማዘጋጃ',
      'dil ber', 'ድል በር', 'sheger park', 'guskuam', 'ጉስቋም', 'menen', 'መነን',
      'shegole', 'shg-', 'ሸጎሌ', 'sansusi', 'ሳንሱሲ', 'awolia', 'አወልያ',
      'birchiko', 'ብርጭቆ', 'enkulal fabrika', 'እንቁላል ፋብሪካ', 'doro tera', 'ዶሮ ተራ',
      'lazarist', 'ላዛሪስት', 'space science', 'ስፔስ ሳይንስ', 'atena tera', 'አጠና ተራ',
    ],
  },
  {
    id: 'yeka',
    name: 'Yeka',
    amharicName: 'የካ',
    eeuDirection: 'East',
    landmarks: 'Ferensay, Bella, Kotebe, Signal, Megenagna, Kara',
    points:
      '373.2,175.4 390.9,166.2 384.4,154.4 388.1,141 379.1,122.1 390.4,101.1 406.2,99.6 424,81.7 427.3,88.5 429.9,96.1 431.3,97.7 433.4,98.9 434.9,99.3 441.6,104.5 447.5,100.9 449.1,106.8 477.2,81.1 496.1,87.3 504.3,90.3 523.7,231 465.1,232.4 407.4,249.8 414.9,240.8 407.9,235 399.8,237.3 395.6,229.8 382.2,224.7 395.7,217.8 393.4,211.8 393.7,211.9 397.7,213 403.4,214.6 412.7,209.5 411.3,187.6 401.9,188.6',
    center: { x: 454, y: 168 },
    keywords: [
      'yeka', 'የካ', 'ferensay', 'ፈረንሳይ', 'gurara', 'ጉራራ', 'bella', 'bel-', 'ቤላ',
      'kotebe', 'cotebe', 'cot-', 'ኮተቤ', 'signal', 'ሲግናል', 'megenagna', 'መገናኛ',
      'kara', 'ካራ', 'wosen', 'ወሰን', 'lam beret', 'ላም በረት', 'shola', 'ሾላ',
      'kebena', 'ቀበና', 'aware', 'አዋሬ', 'balderas', 'ባልደራስ', 'minilik', 'ሚኒሊክ',
      'chaka', 'chk-', 'dinberwa', 'ድንበሯ', 'british embassy', 'salite mihret', 'ሳሊተ ምህረት',
      'lem hotel', 'ለም ሆቴል', 'yeka michael', 'የካ ሚካኤል', 'enderase', 'እንደራሴ',
      'misrak', 'ምስራቅ', 'ararat', 'አራራት', 'wondirad', 'ወንዲራድ',
    ],
  },
  {
    id: 'lemi-kura',
    name: 'Lemi Kura',
    amharicName: 'ለሚ ኩራ',
    eeuDirection: 'East',
    landmarks: 'CMC, Ayat, Meri, Summit, Bole Arabsa, Figa',
    points:
      '504.3,90.3 522.8,97.1 585.5,92.3 598.1,78.9 625,75.6 641.8,78.9 658.9,119.2 660.4,158.2 692.4,207.7 711.7,252.4 711.4,257.9 715.3,281.1 712.7,286.2 710.4,292.6 709.6,300.3 714.8,337.4 709.4,350.3 704.2,364.2 697.6,383.6 694,383.8 687.8,383.4 687.8,383.5 688.1,387.7 686.9,390.8 701.1,400.5 701.5,402 703.6,411.6 690.2,423.5 694.1,431.9 634.4,427.5 631,421.2 623.4,418.7 613.5,415.5 604.6,413 595.3,424.7 582.6,424.9 578.9,424.5 553.5,412.6 549.5,417.1 523.7,231',
    center: { x: 616, y: 266 },
    keywords: [
      'lemi kura', 'lemikura', 'ለሚ ኩራ', 'ለሚኩራ', 'cmc', 'ሲኤምሲ', 'ሲኤም ሲ',
      'ayat', 'ayt-', 'አያት', 'meri', 'መሪ', 'summit', 'ሰሚት', 'arabsa', 'arb-', 'blm-',
      'አራብሳ', 'beshale', 'በሻሌ', 'figa', 'ፊጋ', 'jakros', 'ጃክሮስ', 'civil service',
      'ሲቪል ሰርቪስ', 'gurd shola', 'ጉርድ ሾላ', 'ict park', 'አይ ሲ ቲ', 'abado', 'አባዶ',
      'tafo', 'ጣፎ', 'mekedonia', 'መቄዶንያ', 'sunshine', 'ሰንሻይን', 'diaspora', 'ዲያስፓራ',
      'fiyel bet', 'ፍየል ቤት', 'ፊየል ቤት', 'meri loke', 'መሪ ሉቄ', 'goro selassie', 'ጎሮ ስላሴ',
    ],
  },
  {
    id: 'arada',
    name: 'Arada',
    amharicName: 'አራዳ',
    eeuDirection: 'North',
    landmarks: 'Piassa, Arat Kilo, Sidist Kilo, Janmeda, Dejach Wube',
    compact: true,
    points:
      '333.2,206.1 341.5,211.8 354.8,236.9 364.2,215 367.5,226.1 379.8,225.3 395.7,217.8 393.4,211.8 393.7,211.9 397.7,213 403.4,214.6 415,204.8 411.3,187.6 401.9,188.6 344.3,168.7 342.8,149.1 319.1,153.6 309.6,167.5 317.7,192.7 321.9,196.8 326,193.6',
    center: { x: 358, y: 193 },
    keywords: [
      'arada', 'አራዳ', 'piassa', 'piasa', 'ፒያሳ', 'ፒያሣ', '4 kilo', '4ኪሎ', 'arat kilo',
      '5 kilo', '5ኪሎ', '6 kilo', '6ኪሎ', 'sidist kilo', 'janmeda', 'ጃንሜዳ',
      'dejach wube', 'ደጃች ውቤ', 'afincho ber', 'አፍንጮ በር', 'churchill', 'ቸርቸል',
      'adwa', 'አድዋ', 'yohannes', 'ዮሀንስ', 'ras desta', 'ራስ ደስታ', 'abune petros',
      'adn-', 'addis north', 'tourist hotel', 'ቱሪስት ሆቴል', 'ገንፍሌ', 'yekatit 12', 'የካቲት 12',
      'parliament', 'ፓርላማ', 'cathedral', 'ካቴድራል', 'taytu', 'ጣይቱ', 'giorgis', 'ጊዮርጊስ',
    ],
  },
  {
    id: 'addis-ketema',
    name: 'Addis Ketema',
    amharicName: 'አዲስ ከተማ',
    eeuDirection: 'West',
    landmarks: 'Merkato, Autobus Tera, Mesalemiya, Abinet, Sebategna',
    compact: true,
    points:
      '265.2,146.3 271.6,160.9 260.9,209.6 268.7,211.1 271.8,229.2 286.6,236.5 289.8,223.3 309.2,225.1 333.2,206.1 326,193.6 321.9,196.8 317.7,192.7 309.6,167.5 294.2,168.2',
    center: { x: 292, y: 196 },
    keywords: [
      'addis ketema', 'አዲስ ከተማ', 'merkato', 'mercato', 'መርካቶ', 'autobus tera',
      'አውቶብስ ተራ', 'ehil berenda', 'እህል በረንዳ', 'mesalemiya', 'መሳለሚያ', 'ማሰለሚያ',
      'abinet', 'አብነት', 'sebategna', 'ሰባተኛ', 'amanuel', 'አማኑኤል', 'አማኔኤል',
      'kuas meda', 'ኳስ ሜዳ', 'anwar', 'አንዋር', 'gojam berenda', 'ጎጃም በረንዳ',
      'abebe bikila', 'አበበ ቢቂላ', 'addisu michael', 'አዲሱ ሚካኤል',
      'habte giorgis', 'ሀብተ ጎርጊስ', 'chid tera', 'ጭድ ተራ', 'bikil tera', 'ብቅል ተራ',
    ],
  },
  {
    id: 'kolfe-keranio',
    name: 'Kolfe Keranio',
    amharicName: 'ኮልፌ ቀራኒዮ',
    eeuDirection: 'West',
    landmarks: '18 Mazoria, Bethel, Ayer Tena, Alem Bank, Tor Hailoch, Weyra',
    points:
      '265.2,146.3 271.6,160.9 260.9,209.6 268.7,211.1 271.2,226.6 247,232.4 260.1,245.9 251.2,253.3 252,262.3 262,271.1 257.7,277.2 260.1,285.5 253.2,289.1 257.3,295.5 270.4,298.9 262.3,304.9 262.5,318.3 255.7,320.1 266.1,328 258.6,344.7 246.2,349.8 240.5,343 228.2,355.4 222.5,358 216.6,358 212.1,358.6 201.4,384.7 183.4,394 180.9,382.8 178.5,377.8 93.4,358.8 84.7,340.7 85.4,340.1 127,332.4 134.2,312.7 131.9,294.6 113.9,271.5 113.2,257.9 115,251.7 149.8,256.1 154.1,251.7 150.8,237.9 152.4,215.3 163.8,198.9 165,185.7 174.8,175 191.2,163.9 191.1,119.9 192.6,104.2 251.9,76.7 242.3,86.3 254.7,110.4 255.6,140.8 260.2,149.3',
    center: { x: 196, y: 262 },
    keywords: [
      'kolfe', 'keranio', 'keraniyo', 'ኮልፌ', 'ቀራንዮ', 'ቀራኒዮ', '18 mazoria', '18 ማደያ',
      'ኮልፌ 18', 'bethel', 'betel', 'ቤተል', 'ayer tena', 'ayertena', 'አየር ጤና',
      'alem bank', 'alembank', 'alb-', 'አለም ባንክ', 'ዓለም ባንክ', 'anfo', 'anf-', 'አንፎ',
      'weyra', 'ወይራ', 'zenebework', 'ዘነበወርቅ', 'augusta', 'አውጉስታ', 'አጉስታ',
      'tor hailoch', 'torhailoch', 'ጦርሀይሎች', 'ጦር ሀይሎች', 'lomi meda', 'ሎሚ ሜዳ',
      'filipos', 'ፊሊፖስ', 'adw-', 'addis west', 'karl', 'yeshi debele', 'የሺ ደበሌ',
      'silte sefer', 'ስልጤ ሰፈር', 'weybela', 'ወይብላ', 'kara kore', 'ካራቆ', 'repi', 'ረጲ', 'tezina', 'ተዘንአ',
    ],
  },
  {
    id: 'lideta',
    name: 'Lideta',
    amharicName: 'ልደታ',
    eeuDirection: 'Central',
    landmarks: 'Lideta, Mexico, Balcha Hospital, Teklehaimanot, Coca',
    compact: true,
    points:
      '266.6,295.2 270.6,278.6 291.1,280.9 316,291.8 330.4,254.2 348.8,238 353.5,237.6 354.2,237.4 356.5,237.2 335.8,206.6 309.2,225.1 289.8,223.3 286.6,236.5 269.8,226.9 247,232.4 260.1,245.9 251.2,253.3 252,262.3 262,271.1 257.7,277.2 260.1,285.5 253.2,289.1 257.6,295.6',
    center: { x: 299, y: 251 },
    keywords: [
      'lideta', 'ልደታ', 'mexico', 'meksico', 'ሜክሲኮ', 'balcha', 'ባልቻ',
      'teklehaimanot', 'teklehaymanot', 'ተክለሀይማኖት', 'ተክለሃይማኖት', 'ተ/ኃይማኖት',
      'tikur anbessa', 'black line', 'bll-', 'ጥቁር አንበሳ', 'coca', 'ኮካ',
      'senga tera', 'ሰንጋ ተራ', 'geja', 'ጌጃ', 'tegba', 'ተግባረድ', 'mechare', 'መቻሬ',
      'african union', 'አፍሪካ ሕብረት', 'adc-11', 'biherawi', 'ብሔራዊ',
      'gola', 'ጎላ', 'wabe shebele', 'ዋቢ ሽበሌ', 'tobacco', 'ትንባሆ', 'bgi', 'ቢጂ ኤ',
    ],
  },
  {
    id: 'kirkos',
    name: 'Kirkos',
    amharicName: 'ቂርቆስ',
    eeuDirection: 'Central',
    landmarks: 'Meskel Sq, Legehar, Kazanchis, Urael, Olympia, Wolo Sefer, Gotera',
    compact: true,
    points:
      '382.2,224.7 367.5,226.1 364.2,215 354.1,231.1 356.5,237.2 354.2,237.4 353.5,237.6 348.8,238 330.4,254.2 316,291.8 337.2,311.9 379.9,329.7 382.8,321.4 389.5,321.6 408.9,297.8 399.6,278.4 402.5,267.7 408.3,265.1 401.7,252.8 414.9,240.8 407.9,235 399.8,237.3 395.6,229.8',
    center: { x: 367, y: 275 },
    keywords: [
      'kirkos', 'kikos', 'ቂርቆስ', 'cherkos', 'ጨርቆስ', 'meskel', 'መስቀል',
      'legehar', 'ለገሐር', 'ለገሀር', 'kazanchis', 'kasanchis', 'ካሳንቺስ', 'ካዛንቺስ',
      'urael', 'ኡራኤል', 'olympia', 'ኦሎምፒያ', 'wolo sefer', 'ወሎ ሰፈር', 'denbel', 'ደንበል',
      'flamingo', 'ፍላሚንጎ', 'gotera', 'ጎተራ', 'estifanos', 'እስጢፋኖስ', 'ghion', 'ጊዮን',
      'hilton', 'ሂልተን', 'sheraton', 'ሸራትን', 'eca', 'ኢሲኤ', 'bambis', 'ባምቢስ',
      'kera', 'ቄራ', 'addis center', 'adc-', 'bulgaria', 'ቡልጋሪያ', '22', 'atlas', 'አትላስ',
      'genet hotel', 'ገነት ሆቴል', 'global', 'ግሎባል', 'riche', 'ሪቼ', 'meskel flower', 'መስቀል ፍላውር',
      'ramada', 'ራማዳ', 'nif-01', 'nif-03', 'nif-04', 'nif-06', 'nif-07',
    ],
  },
  {
    id: 'bole',
    name: 'Bole',
    amharicName: 'ቦሌ',
    eeuDirection: 'East',
    landmarks: 'Bole Medhanialem, Atlas, Rwanda, Goro, Bulbula, Airport, 24',
    points:
      '549.5,417.1 510.7,426.9 502.6,422 502.2,412.6 470.9,409.5 465.9,402.8 455.7,413.5 438.4,422.2 431.3,420.8 415.3,433.9 408.8,431.7 394.8,408 397,395.1 408.4,381.4 407.7,370.3 391.6,365.8 392.9,343.9 377,335 382.8,321.4 389.5,321.6 408.9,297.8 399.6,278.4 402.5,267.7 408.3,265.1 401.7,252.8 465.1,232.4 523.7,231',
    center: { x: 468, y: 318 },
    keywords: [
      'bole', 'ቦሌ', 'medhanialem', 'መድሀኒአለም', 'rwanda', 'ሩዋንዳ', 'goro', 'ጎሮ',
      'bulbula', 'ቡልቡላ', 'airport', 'አየር መንገድ', 'hayahulet', 'chichinia', 'ቺቺኒያ',
      'ade-', 'addis east', 'gerji', 'ገርጂ', 'bole michael', 'ቦሌ ሚካኤል',
      '24', 'millennium', 'ሚሊኒየም', 'shewa dabo', 'ethio china', 'bolemichael',
      'weregenu', 'wer-', 'imperial', 'ኢምፔሪያል', 'skylight', 'ስካይ ላይት',
      'century mall', 'ሴንቸሪ ሞል', 'korea hospital', 'ኮሪያ ሆስፒታል', 'anbessa garage', 'አንበሳ ጋራጅ',
      'unity university', 'ዮኒቲ ዩኒቨርስቲ', 'aviation', 'አቬሽን', 'washington hospital', 'ዋሽንግተን ሆስፒታል',
      'gorgorios', 'ጎርጎሪዎስ', 'nif-09', 'yere', 'የረር',
    ],
  },
  {
    id: 'nifas-silk',
    name: 'Nifas Silk-Lafto',
    amharicName: 'ንፋስ ስልክ ላፍቶ',
    eeuDirection: 'South',
    landmarks: 'Sar Bet, Mekanisa, Gofa, Jemo, Lebu, Lafto, Hana Mariam',
    points:
      '380.5,329.6 377.3,335.5 392.9,343.9 391.6,365.8 407.2,369.4 408.4,381.4 405.1,388.2 387.9,373 376.1,374.2 375.4,390.1 365.7,397.4 367.4,410.5 359.7,428.1 364.1,430.2 357.4,437.9 360.9,443.1 356.3,453.1 345.5,458.7 345.8,468.7 335.9,488.5 338.6,496.7 328.8,514.6 311.1,512.1 274.5,468.9 241,464.1 222,440.5 219.5,433.2 216.8,418 215.4,415.5 188.6,423.2 185.7,421.2 182.3,416.6 179.2,411.1 183.6,404.3 183.5,400.5 183.4,394 201.4,384.7 212.1,358.6 216.6,358 222.5,358 228.2,355.4 240.5,343 246.2,349.8 258.6,344.7 266.1,328 255.7,320.1 262.5,318.3 262.3,304.9 270.4,298.9 266.6,295.2 270.6,278.6 308.5,287 337.2,311.9',
    center: { x: 298, y: 396 },
    keywords: [
      'nifas silk', 'nefas silk', 'lafto', 'ንፋስ ስልክ', 'ላፍቶ', 'sar bet', 'sarbet', 'ሳር ቤት', 'ሳርቤት',
      'mekanisa', 'mek-', 'መካኒሳ', 'gofa', 'gof-', 'ጎፋ', 'jemo', 'ጀሞ', 'lebu', 'ለቡ',
      'hana mariam', 'ሃና ማርያም', 'ሀና ማርያም', 'bisrate gabriel', 'ብስራተ ገብርኤል',
      'german square', 'ጀርመን አደባባይ', 'mebrat hail', 'መብራት ሀይል', 'karl square', 'ካርል',
      'abo mazoria', 'sefereselam', 'ertale', 'south region', 'varnero', 'ቫርኔሮ',
      'garment', 'ጋርመንት', 'kore', 'ቆሬ', 'bihere tsige', 'ብሔረ ጽጌ', 'buna board', 'ቡና ቦርድ', 'nif-08',
    ],
  },
  {
    id: 'akaki-kality',
    name: 'Akaki-Kality',
    amharicName: 'አቃቂ ቃሊቲ',
    eeuDirection: 'South',
    landmarks: 'Saris, Kaliti, Akaki, Tulu Dimtu, Kilinto, Koye Feche',
    points:
      '595.3,424.7 582.6,424.9 578.9,424.5 553.5,412.6 548.5,417.9 533,418.6 527,425.4 510.7,426.9 502.6,422 502.2,412.6 470.9,409.5 465.9,402.8 455.7,413.5 438.4,422.2 431.3,420.8 415.3,433.9 404.8,427.6 404.9,419.1 394.8,408 397,395.1 405.1,388.2 387.9,373 376.1,374.2 375.4,390.1 365.7,397.4 367.4,410.5 359.7,428.1 364.1,430.2 357.4,437.9 360.9,443.1 356.3,453.1 345.5,458.7 345.8,468.7 335.9,488.5 338.6,496.7 328.3,514.6 326.6,532 339.3,533.6 337.2,538.1 338.3,539.3 340.1,541.4 332.3,556.8 330.4,562.7 330.1,567.9 341.3,568.1 335.8,588.5 336.5,602.9 356.9,609.9 356.5,619 362.2,627.2 374.2,626.3 397.6,621.1 399.1,618.3 403.2,612.2 407.4,627.5 413.9,628.7 417.9,632.8 413.9,652 413.7,656.7 421.6,671.2 445.9,668.8 452.9,671.4 457.5,673.7 462.1,676 494.4,658.3 506.3,666.3 505.1,654.5 505.2,654.4 522,655.5 519.3,631 533.8,588.5 533.8,588.5 528,578.5 521.3,567.7 521.3,565.8 522.3,564.5 523.2,562.7 542,556.1 544.9,556.8 560.3,563.8 575.3,563.4 589.2,559.2 601.9,554.8 614.7,556.7 624.8,580.9 629.1,578.6 628.8,561.6 637.3,543.7 646.9,525.9 635.3,510.5 651.4,472.3 601.7,435.4',
    center: { x: 478, y: 526 },
    keywords: [
      'akaki', 'aka.', 'አቃቂ', 'kality', 'kaliti', 'kal ', 'kal-', 'ቃሊቲ', 'saris', 'ሳሪስ',
      'tulu dimtu', 'ቱሉ ዲምቱ', 'kilinto', 'kln-', 'ቂሊንጦ', 'koye', 'koy-', 'ኮዬ', 'gelan', 'gel-', 'ገላን',
      'korke', 'ቆርኬ', 'crown', 'ክራውን', 'abo', 'kality prison', 'worku sefer', 'ወርቁ ሰፈር',
      'saris abo', 'ሳሪስ አቦ', 'akaki kality', 'akaki-kality', 'coffee city', 'ኮፊ ሲቲ',
      '93 mazoria', '93 ማዞሪያ', 'fafa', 'ፋፋ', 'cheralia', 'ቼራሊያ', 'aastu', 'nif-10',
      'beijing hospital', 'ቤጂንግ ሆስፒታል', 'salo', 'ሳሎ', 'cadisco', 'ካዲስኮ',
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

const AREA_ANCHORS: Array<{ keywords: string[]; zoneId: string; x: number; y: number }> = [
  // Gullele
  { keywords: ['entoto', 'እንጦቶ', 'lazarist', 'ላዛሪስት', 'space science', 'ስፔስ ሳይንስ'], zoneId: 'gullele', x: 362.4, y: 107.3 },
  { keywords: ['shiro meda', 'ሽሮ ሜዳ', 'guskuam', 'ጉስቋም'], zoneId: 'gullele', x: 369.5, y: 126.3 },
  { keywords: ['addisu gebeya', 'addis gebya', 'adg-', 'semen mazegaja', 'ሰሜን ማዘጋጃ', 'rufale', 'ሩፋኤል'], zoneId: 'gullele', x: 324.8, y: 147.7 },
  { keywords: ['kechene', 'ቀጨኔ'], zoneId: 'gullele', x: 353, y: 152.5 },
  { keywords: ['asko', 'አስኮ', 'sansusi', 'ሳንሱሲ', 'birchiko', 'ብርጭቆ', 'awolia', 'አወልያ'], zoneId: 'gullele', x: 235.4, y: 147.7 },
  { keywords: ['winget', 'ዊንጌት', 'atena tera', 'አጠና ተራ'], zoneId: 'gullele', x: 263.7, y: 154.9 },
  { keywords: ['shegole', 'shg-', 'ሸጎሌ'], zoneId: 'gullele', x: 268.4, y: 164.4 },
  { keywords: ['pastor', 'pasteur', 'ፓስተር', 'paulos', 'ጳውሎስ', 'enkulal fabrika', 'እንቁላል ፋብሪካ'], zoneId: 'gullele', x: 294.2, y: 169.2 },

  // Yeka
  { keywords: ['ferensay', 'ፈረንሳይ', 'gurara', 'ጉራራ'], zoneId: 'yeka', x: 411.8, y: 150.1 },
  { keywords: ['bella', 'bel-', 'ቤላ', 'minilik', 'ሚኒሊክ'], zoneId: 'yeka', x: 428.3, y: 173.9 },
  { keywords: ['kara', 'ካራ'], zoneId: 'yeka', x: 531.7, y: 164.4 },
  { keywords: ['kotebe', 'cotebe', 'cot-', 'ኮተቤ', 'wosen', 'ወሰን', 'lam beret', 'ላም በረት', 'wondirad', 'ወንዲራድ'], zoneId: 'yeka', x: 503.5, y: 195.4 },
  { keywords: ['yeka michael', 'የካ ሚካኤል', 'dinberwa', 'ድንበሯ'], zoneId: 'yeka', x: 449.4, y: 204.9 },
  { keywords: ['aware', 'አዋሬ', 'kebena', 'ቀበና'], zoneId: 'yeka', x: 404.8, y: 209.6 },
  { keywords: ['signal', 'ሲግናል', 'balderas', 'ባልደራስ', 'enderase', 'እንደራሴ'], zoneId: 'yeka', x: 423.6, y: 216.8 },
  { keywords: ['megenagna', 'መገናኛ', 'shola', 'ሾላ', 'lem hotel', 'ለም ሆቴል'], zoneId: 'yeka', x: 465.9, y: 231.1 },

  // Lemi Kura
  { keywords: ['abado', 'አባዶ', 'yeka abado', 'የካ አባዶ'], zoneId: 'lemi-kura', x: 560, y: 145.4 },
  { keywords: ['ayat 49', 'አያት 49', 'tafo', 'ጣፎ', 'mekedonia', 'መቄዶንያ'], zoneId: 'lemi-kura', x: 668.1, y: 216.8 },
  { keywords: ['ayat', 'ayt-', 'አያት'], zoneId: 'lemi-kura', x: 635.2, y: 228.7 },
  { keywords: ['cmc', 'ሲኤምሲ', 'ሲኤም ሲ', 'civil service', 'ሲቪል ሰርቪስ', 'sunshine', 'ሰንሻይን'], zoneId: 'lemi-kura', x: 560, y: 228.7 },
  { keywords: ['meri', 'መሪ', 'meri loke', 'መሪ ሉቄ'], zoneId: 'lemi-kura', x: 607, y: 250.1 },
  { keywords: ['figa', 'ፊጋ', 'gurd shola', 'ጉርድ ሾላ', 'jakros', 'ጃክሮስ'], zoneId: 'lemi-kura', x: 536, y: 264.2 },
  { keywords: ['summit', 'ሰሚት', 'fiyel bet', 'ፍየል ቤት', 'ፊየል ቤት'], zoneId: 'lemi-kura', x: 590.5, y: 288.2 },
  { keywords: ['arabsa', 'arb-', 'blm-', 'አራብሳ', 'beshale', 'በሻሌ', 'ict park', 'አይ ሲ ቲ', 'diaspora', 'ዲያስፓራ'], zoneId: 'lemi-kura', x: 661.1, y: 345.3 },

  // Arada
  { keywords: ['6 kilo', '6ኪሎ', 'sidist kilo', 'menen', 'መነን', 'afincho ber', 'አፍንጮ በር', 'yekatit 12', 'የካቲት 12'], zoneId: 'arada', x: 369.5, y: 173.9 },
  { keywords: ['piassa', 'piasa', 'ፒያሳ', 'ፒያሣ', 'dejach wube', 'ደጃች ውቤ', 'churchill', 'ቸርቸል', 'giorgis', 'ጊዮርጊስ', 'adwa', 'አድዋ'], zoneId: 'arada', x: 348.3, y: 200.1 },
  { keywords: ['4 kilo', '4ኪሎ', 'arat kilo', '5 kilo', '5ኪሎ', 'janmeda', 'ጃንሜዳ', 'parliament', 'ፓርላማ', 'tourist hotel', 'ቱሪስት ሆቴል'], zoneId: 'arada', x: 374.2, y: 200.1 },

  // Addis Ketema
  { keywords: ['autobus tera', 'አውቶብስ ተራ', 'mesalemiya', 'መሳለሚያ', 'ማሰለሚያ', 'amanuel', 'አማኑኤል', 'ehil berenda', 'እህል በረንዳ', 'abebe bikila', 'አበበ ቢቂላ'], zoneId: 'addis-ketema', x: 298.9, y: 197.7 },
  { keywords: ['merkato', 'mercato', 'መርካቶ', 'abinet', 'አብነት', 'sebategna', 'ሰባተኛ', 'anwar', 'አንዋር', 'gojam berenda', 'ጎጃም በረንዳ'], zoneId: 'addis-ketema', x: 315.4, y: 204.9 },

  // Kolfe Keranio
  { keywords: ['kolfe', 'ኮልፌ', '18 mazoria', '18 ማደያ', 'ኮልፌ 18', 'lomi meda', 'ሎሚ ሜዳ', 'filipos', 'ፊሊፖስ'], zoneId: 'kolfe-keranio', x: 237.8, y: 221.5 },
  { keywords: ['weyra', 'ወይራ', 'augusta', 'አውጉስታ', 'አጉስታ', 'tezina', 'ተዘንአ'], zoneId: 'kolfe-keranio', x: 221.3, y: 252.5 },
  { keywords: ['tor hailoch', 'torhailoch', 'ጦርሀይሎች', 'ጦር ሀይሎች', 'karl', 'ካርል'], zoneId: 'kolfe-keranio', x: 266, y: 264.4 },
  { keywords: ['bethel', 'betel', 'ቤተል', 'keranio', 'ቀራንዮ', 'ቀራኒዮ', 'yeshi debele', 'የሺ ደበሌ'], zoneId: 'kolfe-keranio', x: 211.9, y: 273.9 },
  { keywords: ['alem bank', 'alembank', 'alb-', 'አለም ባንክ', 'ዓለም ባንክ', 'anfo', 'anf-', 'አንፎ', 'silte sefer', 'ስልጤ ሰፈር', 'weybela', 'ወይብላ'], zoneId: 'kolfe-keranio', x: 193.1, y: 304.9 },
  { keywords: ['ayer tena', 'ayertena', 'አየር ጤና', 'zenebework', 'ዘነበወርቅ', 'kara kore', 'ካራቆ', 'repi', 'ረጲ'], zoneId: 'kolfe-keranio', x: 228.4, y: 319.2 },

  // Lideta
  { keywords: ['teklehaimanot', 'teklehaymanot', 'ተክለሀይማኖት', 'ተክለሃይማኖት', 'ተ/ኃይማኖት', 'tikur anbessa', 'ጥቁር አንበሳ', 'gola', 'ጎላ', 'wabe shebele', 'ዋቢ ሽበሌ'], zoneId: 'lideta', x: 331.9, y: 223.9 },
  { keywords: ['senga tera', 'ሰንጋ ተራ', 'geja', 'ጌጃ'], zoneId: 'lideta', x: 331.9, y: 235.8 },
  { keywords: ['lideta', 'ልደታ', 'balcha', 'ባልቻ', 'coca', 'ኮካ', 'mechare', 'መቻሬ'], zoneId: 'lideta', x: 306, y: 247.7 },
  { keywords: ['mexico', 'meksico', 'ሜክሲኮ', 'tegbared', 'ተግባረድ', 'bgi', 'ቢጂ ኤ'], zoneId: 'lideta', x: 329.5, y: 254.9 },
  { keywords: ['african union', 'አፍሪካ ሕብረት', 'tobacco', 'ትንባሆ'], zoneId: 'lideta', x: 322.4, y: 281.1 },

  // Kirkos
  { keywords: ['kazanchis', 'kasanchis', 'ካሳንቺስ', 'ካዛንቺስ', 'hilton', 'ሂልተን', 'eca', 'ኢሲኤ'], zoneId: 'kirkos', x: 385.9, y: 240.6 },
  { keywords: ['22', 'urael', 'ኡራኤል', 'atlas', 'አትላስ', 'bambis', 'ባምቢስ'], zoneId: 'kirkos', x: 400.1, y: 254.9 },
  { keywords: ['meskel', 'መስቀል', 'legehar', 'ለገሐር', 'ለገሀር', 'estifanos', 'እስጢፋኖስ', 'ghion', 'ጊዮን'], zoneId: 'kirkos', x: 369.5, y: 254.9 },
  { keywords: ['cherkos', 'ጨርቆስ', 'ቂርቆስ', 'kirkos', 'olympia', 'ኦሎምፒያ', 'flamingo', 'ፍላሚንጎ', 'denbel', 'ደንበል'], zoneId: 'kirkos', x: 378.9, y: 273.9 },
  { keywords: ['wolo sefer', 'ወሎ ሰፈር', 'ramada', 'ራማዳ', 'meskel flower', 'መስቀል ፍላውር'], zoneId: 'kirkos', x: 383.6, y: 285.8 },
  { keywords: ['gotera', 'ጎተራ', 'kera', 'ቄራ', 'bulgaria', 'ቡልጋሪያ', 'genet hotel', 'ገነት ሆቴል', 'global', 'ግሎባል', 'riche', 'ሪቼ'], zoneId: 'kirkos', x: 367.1, y: 316.8 },

  // Bole
  { keywords: ['weregenu', 'wer-', 'imperial', 'ኢምፔሪያል', 'anbessa garage', 'አንበሳ ጋራጅ', 'korea hospital', 'ኮሪያ ሆስፒታል'], zoneId: 'bole', x: 470.6, y: 259.6 },
  { keywords: ['24', 'chichinia', 'ቺቺኒያ', 'atlas', 'አትላስ'], zoneId: 'bole', x: 435.3, y: 266.8 },
  { keywords: ['gerji', 'ገርጂ', 'unity university', 'ዮኒቲ ዩኒቨርስቲ', 'century mall', 'ሴንቸሪ ሞል'], zoneId: 'bole', x: 491.8, y: 276.3 },
  { keywords: ['bole', 'ቦሌ', 'medhanialem', 'መድሀኒአለም', 'rwanda', 'ሩዋንዳ', 'millennium', 'ሚሊኒየም', 'skylight', 'ስካይ ላይት', 'airport', 'አየር መንገድ'], zoneId: 'bole', x: 440, y: 290.6 },
  { keywords: ['goro', 'ጎሮ', 'yere', 'የረር'], zoneId: 'bole', x: 522.3, y: 314.4 },
  { keywords: ['bole michael', 'ቦሌ ሚካኤል', 'washington hospital', 'ዋሽንግተን ሆስፒታል', 'gorgorios', 'ጎርጎሪዎስ'], zoneId: 'bole', x: 418.9, y: 326.3 },
  { keywords: ['bulbula', 'ቡልቡላ'], zoneId: 'bole', x: 435.3, y: 373.9 },

  // Nifas Silk-Lafto
  { keywords: ['sar bet', 'sarbet', 'ሳር ቤት', 'ሳርቤት', 'bisrate gabriel', 'ብስራተ ገብርኤል'], zoneId: 'nifas-silk', x: 313, y: 295.4 },
  { keywords: ['mekanisa', 'mek-', 'መካኒሳ', 'german square', 'ጀርመን አደባባይ', 'kore', 'ቆሬ'], zoneId: 'nifas-silk', x: 291.9, y: 328.7 },
  { keywords: ['gofa', 'gof-', 'ጎፋ', 'buna board', 'ቡና ቦርድ'], zoneId: 'nifas-silk', x: 336.6, y: 345.3 },
  { keywords: ['jemo 1', 'ጀሞ 1', 'varnero', 'ቫርኔሮ'], zoneId: 'nifas-silk', x: 273.1, y: 362 },
  { keywords: ['jemo 2', 'ጀሞ 2', 'jemo 3', 'ጀሞ 3'], zoneId: 'nifas-silk', x: 240.1, y: 402.5 },
  { keywords: ['jemo', 'ጀሞ'], zoneId: 'nifas-silk', x: 256.6, y: 378.7 },
  { keywords: ['lafto', 'ላፍቶ', 'mebrat hail', 'መብራት ሀይል', 'bihere tsige', 'ብሔረ ጽጌ'], zoneId: 'nifas-silk', x: 338.9, y: 385.8 },
  { keywords: ['lebu', 'ለቡ'], zoneId: 'nifas-silk', x: 298.9, y: 395.3 },
  { keywords: ['garment', 'ጋርመንት', 'hana mariam', 'ሃና ማርያም', 'ሀና ማርያም'], zoneId: 'nifas-silk', x: 291.9, y: 426.3 },

  // Akaki-Kality
  { keywords: ['saris', 'ሳሪስ', 'fafa', 'ፋፋ'], zoneId: 'akaki-kality', x: 381.2, y: 404.9 },
  { keywords: ['saris abo', 'ሳሪስ አቦ', 'worku sefer', 'ወርቁ ሰፈር', '93 mazoria', '93 ማዞሪያ', 'cadisco', 'ካዲስኮ'], zoneId: 'akaki-kality', x: 395.3, y: 433.4 },
  { keywords: ['kilinto', 'kln-', 'ቂሊንጦ', 'aastu', 'ሳይንስ እና ቴክኖሎጂ'], zoneId: 'akaki-kality', x: 480, y: 504.9 },
  { keywords: ['kaliti', 'kality', 'kal ', 'kal-', 'ቃሊቲ', 'cheralia', 'ቼራሊያ', 'crown', 'ክራውን', 'kality prison', 'ቃሊቲ ማረሚያ'], zoneId: 'akaki-kality', x: 393, y: 521.5 },
  { keywords: ['koye', 'koy-', 'ኮዬ'], zoneId: 'akaki-kality', x: 545.8, y: 543 },
  { keywords: ['tulu dimtu', 'ቱሉ ዲምቱ'], zoneId: 'akaki-kality', x: 501.2, y: 550.1 },
  { keywords: ['akaki', 'aka.', 'አቃቂ', 'coffee city', 'ኮፊ ሲቲ', 'beijing hospital', 'ቤጂንግ ሆስፒታል'], zoneId: 'akaki-kality', x: 428.3, y: 595.3 },
  { keywords: ['gelan', 'gel-', 'ገላን', 'salo', 'ሳሎ'], zoneId: 'akaki-kality', x: 527, y: 623.9 },
];

function resolveOutageAnchor(item: FeederInterruption, zone: SubCityZone): { x: number; y: number } {
  const areaLower = (item.affectedArea || '').toLowerCase();
  const feederLower = (item.feederName || '').toLowerCase();

  let bestAnchor: { x: number; y: number } | null = null;
  let bestScore = 0;

  for (const anchor of AREA_ANCHORS) {
    if (anchor.zoneId !== zone.id) continue;
    let score = 0;
    for (const kw of anchor.keywords) {
      if (areaLower.includes(kw)) score += 3;
      if (feederLower.includes(kw)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAnchor = { x: anchor.x, y: anchor.y };
    }
  }

  return bestAnchor || { x: zone.center.x, y: zone.center.y };
}

function matchSubCityForOutage(item: FeederInterruption): SubCityZone | null {
  if (isShegerOutage(item)) return null;

  const feederLower = (item.feederName || '').toLowerCase();
  const areaLower = (item.affectedArea || '').toLowerCase();
  const combined = `${feederLower} ${areaLower}`;

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

  if (item.direction === 'North') return ADDIS_SUB_CITIES.find((z) => z.id === 'arada') || null;
  if (item.direction === 'East') return ADDIS_SUB_CITIES.find((z) => z.id === 'bole') || null;
  if (item.direction === 'West') return ADDIS_SUB_CITIES.find((z) => z.id === 'kolfe-keranio') || null;
  if (item.direction === 'South') return ADDIS_SUB_CITIES.find((z) => z.id === 'nifas-silk') || null;

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
  const [selectedOutageId, setSelectedOutageId] = useState<string | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<MapFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const clampPan = (nextX: number, nextY: number, currentZoom: number) => {
    if (currentZoom <= 1) return { x: 0, y: 0 };
    const maxOffsetX = (currentZoom - 1) * 320;
    const maxOffsetY = (currentZoom - 1) * 290;
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

  const outageDots = useMemo(() => {
    const slotCounts = new Map<string, number>();
    const dots: Array<{
      item: FeederInterruption;
      zone: SubCityZone;
      x: number;
      y: number;
      isPlanned: boolean;
    }> = [];

    for (const item of addisDisruptions) {
      const zone = matchSubCityForOutage(item);
      if (!zone) continue;
      const base = resolveOutageAnchor(item, zone);
      const slotKey = `${base.x},${base.y}`;
      const idx = slotCounts.get(slotKey) || 0;
      slotCounts.set(slotKey, idx + 1);

      // Spread multiple outages at the same anchor slightly so every dot stays clickable
      let x = base.x;
      let y = base.y;
      if (idx > 0) {
        const angle = (idx * 2.39996); // golden angle spread
        const radius = 8 + Math.min(idx, 6) * 2.2;
        x = Number((base.x + Math.cos(angle) * radius).toFixed(1));
        y = Number((base.y + Math.sin(angle) * radius).toFixed(1));
      }

      dots.push({
        item,
        zone,
        x,
        y,
        isPlanned: isPlannedOrOperational(item.type),
      });
    }

    return dots;
  }, [addisDisruptions]);

  const getZoneColors = (zoneId: string, isSelected: boolean, isHovered: boolean) => {
    const isSearchHit = searchMatchingZoneIds.has(zoneId);

    if (isSearchHit) {
      return {
        fill: isDarkMode ? 'rgba(95, 163, 84, 0.24)' : 'rgba(95, 163, 84, 0.16)',
        stroke: '#5FA354',
      };
    }

    return {
      fill: isDarkMode
        ? isSelected ? 'rgba(95, 163, 84, 0.18)' : isHovered ? 'rgba(51, 65, 85, 0.85)' : 'rgba(30, 41, 59, 0.78)'
        : isSelected ? 'rgba(95, 163, 84, 0.14)' : isHovered ? 'rgba(241, 245, 249, 0.98)' : 'rgba(248, 250, 252, 0.94)',
      stroke: isSelected
        ? '#5FA354'
        : isDarkMode ? 'rgba(148, 163, 184, 0.34)' : 'rgba(100, 116, 139, 0.48)',
    };
  };

  // Render unselected zones first and selected zone last so its highlight border never clips under neighbors
  const orderedZones = useMemo(() => {
    return [...ADDIS_SUB_CITIES].sort((a, b) => {
      if (a.id === selectedZoneId) return 1;
      if (b.id === selectedZoneId) return -1;
      return 0;
    });
  }, [selectedZoneId]);

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="glass-card p-4 border border-gray-200/70 dark:border-gray-800/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="text-left">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#5FA354] shrink-0" />
            <h2 className="text-base sm:text-lg font-display font-bold text-gray-900 dark:text-white tracking-tight">
              Addis Ababa Outage Map
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
            <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
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
                  ? 'bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Planned
            </button>
          </div>
        </div>
      </div>

      {/* Main Split View: Realistic Addis Ababa Map + Selected Sub-City Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Map Canvas */}
        <div className="xl:col-span-8 glass-card border border-gray-200/70 dark:border-gray-800/80 overflow-hidden flex flex-col">
          {/* Map Controls Bar */}
          <div className="px-4 py-2.5 border-b border-gray-200/60 dark:border-gray-800/80 flex items-center justify-between gap-3 bg-gray-50/60 dark:bg-gray-900/40">
            <div className="flex items-center gap-4 text-[11px] text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-500/25 inline-block" />
                Active Fault
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/25 inline-block" />
                Planned / Operational
              </span>
              <span className="hidden sm:flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 dark:bg-slate-700 border border-slate-400 inline-block" />
                Sub-City
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
            className={`relative w-full h-[490px] sm:h-[580px] overflow-hidden select-none touch-none ${
              isDarkMode ? 'bg-slate-950/95' : 'bg-slate-100/80'
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
                viewBox="0 0 800 720"
                className="w-full h-full max-w-full max-h-full"
                role="img"
                aria-label="Realistic geographic map of Addis Ababa 11 sub-cities"
              >
                <defs>
                  <pattern
                    id="addis-geo-grid"
                    width="40"
                    height="40"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 40 0 L 0 0 0 40"
                      fill="none"
                      stroke={isDarkMode ? 'rgba(148,163,184,0.05)' : 'rgba(148,163,184,0.16)'}
                      strokeWidth="1"
                    />
                  </pattern>
                  <filter id="addis-city-shadow" x="-5%" y="-5%" width="110%" height="110%">
                    <feDropShadow
                      dx="0"
                      dy="4"
                      stdDeviation="7"
                      floodColor={isDarkMode ? '#000000' : '#0f172a'}
                      floodOpacity={isDarkMode ? '0.45' : '0.10'}
                    />
                  </filter>
                </defs>

                <rect width="800" height="720" fill="url(#addis-geo-grid)" />

                {/* Subtle North Compass Indicator */}
                <g transform="translate(744, 48)" opacity="0.65">
                  <circle
                    r="16"
                    fill={isDarkMode ? 'rgba(15,23,42,0.7)' : 'rgba(255,255,255,0.85)'}
                    stroke={isDarkMode ? '#334155' : '#cbd5e1'}
                    strokeWidth="1"
                  />
                  <polygon points="0,-10 3.5,2 0,-0.5 -3.5,2" fill="#5FA354" />
                  <text
                    y="10"
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="700"
                    fill={isDarkMode ? '#94a3b8' : '#475569'}
                  >
                    N
                  </text>
                </g>

                {/* Outer Addis Ababa Municipal Silhouette */}
                <polygon
                  points={ADDIS_CITY_OUTLINE}
                  fill={isDarkMode ? '#0f172a' : '#ffffff'}
                  stroke={isDarkMode ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.45)'}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  filter="url(#addis-city-shadow)"
                />

                {/* 11 Authentic Sub-City Polygons */}
                {orderedZones.map((zone) => {
                  const isSelected = zone.id === selectedZoneId;
                  const isHovered = zone.id === hoveredZoneId;
                  const colors = getZoneColors(zone.id, isSelected, isHovered);

                  return (
                    <polygon
                      key={zone.id}
                      points={zone.points}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={isSelected ? 2.4 : isHovered ? 1.8 : 1.15}
                      strokeLinejoin="round"
                      onClick={() => {
                        setSelectedZoneId(zone.id);
                        setSelectedOutageId(null);
                      }}
                      onMouseEnter={() => setHoveredZoneId(zone.id)}
                      onMouseLeave={() => setHoveredZoneId((prev) => (prev === zone.id ? null : prev))}
                      className="cursor-pointer transition-colors duration-150"
                    />
                  );
                })}

                {/* Minimal Geographic Context Layer (Non-detailed: Ring Road, Main Axes, Bole Airport Runways) */}
                <g className="pointer-events-none" opacity={isDarkMode ? 0.42 : 0.48}>
                  <polyline
                    points={ADDIS_RING_ROAD}
                    fill="none"
                    stroke={isDarkMode ? '#94a3b8' : '#64748b'}
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={ADDIS_EAST_WEST_AXIS}
                    fill="none"
                    stroke={isDarkMode ? '#64748b' : '#94a3b8'}
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                  <polyline
                    points={ADDIS_NORTH_SOUTH_AXIS}
                    fill="none"
                    stroke={isDarkMode ? '#64748b' : '#94a3b8'}
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                  {/* Bole International Airport runways */}
                  <polyline
                    points={BOLE_RUNWAY_1}
                    fill="none"
                    stroke={isDarkMode ? '#cbd5e1' : '#475569'}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <polyline
                    points={BOLE_RUNWAY_2}
                    fill="none"
                    stroke={isDarkMode ? '#cbd5e1' : '#475569'}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </g>

                {/* Landmark Dots (names reveal progressively as user zooms in up to 3x) */}
                <g className="pointer-events-none">
                  {MAP_LANDMARKS.map((lm) => (
                    <g key={lm.label} transform={`translate(${lm.x}, ${lm.y})`}>
                      <circle
                        r={zoom >= 1.8 ? 2.3 : 1.8}
                        fill={isDarkMode ? '#94a3b8' : '#475569'}
                        opacity={zoom >= 1.8 ? 0.75 : 0.45}
                      />
                      {zoom >= 1.8 && (
                        <text
                          y="-5"
                          textAnchor="middle"
                          fontSize={7.5}
                          fontWeight="600"
                          fill={isDarkMode ? '#cbd5e1' : '#334155'}
                          opacity="0.88"
                        >
                          {lm.label}
                        </text>
                      )}
                    </g>
                  ))}
                </g>

                {/* Sub-City Labels (cleanly positioned without red polygon fill) */}
                {ADDIS_SUB_CITIES.map((zone) => {
                  const titleSize = zone.compact ? 9.5 : 12;
                  const amSize = zone.compact ? 8 : 9.5;

                  return (
                    <g key={`label-${zone.id}`} className="pointer-events-none">
                      <text
                        x={zone.center.x}
                        y={zone.center.y - 2}
                        textAnchor="middle"
                        fontSize={titleSize}
                        fontWeight="700"
                        fill={isDarkMode ? '#f8fafc' : '#0f172a'}
                        stroke={isDarkMode ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.88)'}
                        strokeWidth="2.5"
                        paintOrder="stroke"
                      >
                        {zone.name}
                      </text>
                      <text
                        x={zone.center.x}
                        y={zone.center.y + 10}
                        textAnchor="middle"
                        fontSize={amSize}
                        fontWeight="500"
                        fill={isDarkMode ? '#cbd5e1' : '#475569'}
                        stroke={isDarkMode ? 'rgba(15,23,42,0.82)' : 'rgba(255,255,255,0.82)'}
                        strokeWidth="2"
                        paintOrder="stroke"
                      >
                        {zone.amharicName}
                      </text>
                    </g>
                  );
                })}

                {/* Interruption Red (Fault) / Green (Planned & Operational) Dot Markers */}
                {outageDots.map(({ item, zone, x, y, isPlanned }) => {
                  const dotColor = isPlanned ? '#22c55e' : '#ef4444';
                  const haloColor = isPlanned ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)';
                  const isDotSelected = selectedOutageId === item.id;
                  const scaleFactor = 1 / Math.sqrt(zoom);
                  const dotRadius = (isDotSelected ? 6.8 : 5.2) * scaleFactor;
                  const haloRadius = (isDotSelected ? 12.5 : 10) * scaleFactor;

                  return (
                    <g
                      key={`dot-${item.id}`}
                      transform={`translate(${x}, ${y})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedZoneId(zone.id);
                        setSelectedOutageId(item.id);
                      }}
                      className="cursor-pointer"
                    >
                      <title>{`${stripBrackets(item.feederName)} (${zone.name}) — ${item.type}`}</title>
                      <circle r={haloRadius} fill={haloColor} />
                      <circle
                        r={dotRadius}
                        fill={dotColor}
                        stroke={isDarkMode ? '#0f172a' : '#ffffff'}
                        strokeWidth={1.8 * scaleFactor}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>

            {zoom > 1 && (
              <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md text-[11px] bg-white/90 dark:bg-gray-900/90 text-gray-600 dark:text-gray-300 border border-gray-200/70 dark:border-gray-800 pointer-events-none">
                Drag map to pan
              </div>
            )}
          </div>
        </div>

        {/* Selected Sub-City Inspector Panel */}
        <div className="xl:col-span-4 glass-card border border-gray-200/70 dark:border-gray-800/80 flex flex-col max-h-[630px]">
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
                  Select another sub-city on the Addis Ababa map to inspect affected feeders.
                </p>
              </div>
            ) : (
              selectedZoneOutages.map((item) => {
                const isPlanned = isPlannedOrOperational(item.type);
                const status = normalizeInterruptionStatus(item.status);
                const isFocused = selectedOutageId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedOutageId(item.id)}
                    className={`p-3 rounded-xl bg-white/80 dark:bg-gray-900/70 border space-y-1.5 cursor-pointer transition-colors ${
                      isFocused
                        ? isPlanned
                          ? 'border-emerald-500/80 ring-1 ring-emerald-500/30'
                          : 'border-red-500/80 ring-1 ring-red-500/30'
                        : 'border-gray-200/80 dark:border-gray-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isPlanned ? (
                          <Wrench className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
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
                            ? 'text-emerald-600 dark:text-emerald-400'
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
