import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useApiIsLoaded,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Crosshair,
  Loader2,
  MapPin,
  Search,
  Zap,
} from 'lucide-react';
import {
  FeederInterruption,
  isFeederRestored,
  isInfoFeeder,
  stripBrackets,
} from '../types';
import { getCardinalDirection } from '../utils/direction';
import { translateAmharicLocation } from '../utils/locationLanguage';

interface InterruptionMapViewProps {
  interruptions: FeederInterruption[];
  isDarkMode?: boolean;
}

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface CachedPlaceData {
  lat: number;
  lng: number;
  displayName: string;
  formattedAddress?: string;
  viewport?: ViewportBounds;
  cachedAt: number;
}

interface OutageZone {
  key: string;
  label: string;
  substation: string;
  regionGroup: 'Addis Ababa' | 'Sheger Region';
  direction: string;
  position: LatLngLiteral;
  radiusMeters: number;
  placeDisplayName?: string;
  formattedAddress?: string;
  items: FeederInterruption[];
}

type RegionFilter = 'all' | 'addis' | 'sheger';

const PLACE_CACHE_STORAGE_KEY = 'eeu_gmp_place_cache_v1';
// Stay strictly below Google Maps Platform's 30-day geospatial caching limit
const MAX_CACHE_AGE_MS = 25 * 24 * 60 * 60 * 1000;
const ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

const SUBSTATION_SEARCH_NAMES: Record<string, string> = {
  'ADDIS CENTER': 'Mexico Square, Addis Ababa',
  'ADDIS EAST': 'Megenagna, Addis Ababa',
  'ADDIS GEBYA': 'Addis Gebeya, Addis Ababa',
  'ADDIS NORTH': 'Arada Piazza, Addis Ababa',
  'ADDIS WEST': 'Kolfe Keranyo, Addis Ababa',
  'AKAKI': 'Akaki Kality, Addis Ababa',
  'ALEMBANK': 'Alem Bank, Addis Ababa',
  'ANFO': 'Anfo, Addis Ababa',
  'BOLE ARABSA': 'Bole Arabsa, Addis Ababa',
  'AYAT': 'Ayat, Addis Ababa',
  'BELLA': 'Ferensay Legasion, Addis Ababa',
  'BLACK LINE': 'Lideta, Addis Ababa',
  'CHAKA': 'Yeka Park, Addis Ababa',
  'COTEBE': 'Kotebe, Addis Ababa',
  'GEFERESA': 'Gefersa, Burayu, Ethiopia',
  'GELAN': 'Gelan, Sheger, Ethiopia',
  'GOFA': 'Gofa Mazoriya, Addis Ababa',
  'KALITI': 'Kality, Addis Ababa',
  'KLN': 'Kilinto, Addis Ababa',
  'KOYE': 'Koye Feche, Ethiopia',
  'LEGETAFO': 'Legetafo, Ethiopia',
  'MEKANISA': 'Mekanisa, Addis Ababa',
  'NIFAS SILK': 'Nifas Silk, Addis Ababa',
  'SEBETA': 'Sebeta, Ethiopia',
  'SHEGOLE': 'Shegole, Addis Ababa',
  'SULULTA': 'Sululta, Ethiopia',
  'WEREGENU': 'Gerji Bole, Addis Ababa',
};

const GENERIC_AREA_TOKENS = new Set([
  'bekefil',
  'mulu',
  'akababi',
  'akababiw',
  'akababiwoch',
  'ena',
  'gar',
  'wust',
  'jerba',
  'bestejerba',
  'fit',
  'lefit',
  'ategeb',
  'gon',
  'dres',
  'wede',
  'ke',
  'be',
  'le',
  'gibi',
  'gibu',
  'area',
  'around',
  'vicinity',
  'partial',
  'substation',
  'feeder',
  'line',
]);

function readPlaceCache(): Record<string, CachedPlaceData> {
  try {
    const raw = localStorage.getItem(PLACE_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CachedPlaceData>;
    const now = Date.now();
    const cleaned: Record<string, CachedPlaceData> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.lat === 'number' && typeof v.lng === 'number' && now - v.cachedAt < MAX_CACHE_AGE_MS) {
        cleaned[k] = v;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writePlaceCache(cache: Record<string, CachedPlaceData>) {
  try {
    localStorage.setItem(PLACE_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage quota errors
  }
}

function extractSubstationName(feederName: string): string {
  const clean = stripBrackets(feederName).split('|')[0].trim();
  const dashIdx = clean.indexOf(' - ');
  if (dashIdx > 0) {
    return clean.slice(0, dashIdx).trim().toUpperCase();
  }
  const spaceCodeMatch = clean.match(/^([A-Z.\s]+?)\s+[A-Z]{2,4}[-.\s]*\d+/i);
  if (spaceCodeMatch) {
    return spaceCodeMatch[1].trim().toUpperCase();
  }
  return clean.toUpperCase();
}

function extractMeaningfulLandmark(affectedArea: string): string {
  if (!affectedArea) return '';
  const translated = translateAmharicLocation(affectedArea);
  const segments = translated
    .split(/[,;|\n/]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    const tokens = seg
      .split(/\s+/)
      .filter((t) => t.length > 2 && !GENERIC_AREA_TOKENS.has(t.toLowerCase()));
    if (tokens.length > 0) {
      return tokens.slice(0, 4).join(' ');
    }
  }
  return '';
}

function isShegerInterruption(item: FeederInterruption): boolean {
  const direction = item.direction || getCardinalDirection(item.district, item.feederName);
  if (direction === 'Sheger Region') return true;
  const sub = extractSubstationName(item.feederName);
  return ['GEFERESA', 'GELAN', 'KOYE', 'LEGETAFO', 'SEBETA', 'SULULTA'].includes(sub);
}

function buildSearchQueries(item: FeederInterruption): {
  cacheKey: string;
  queries: string[];
  substation: string;
  label: string;
  isSheger: boolean;
} {
  const substation = extractSubstationName(item.feederName);
  const isSheger = isShegerInterruption(item);
  const regionSuffix = isSheger ? 'Sheger, Ethiopia' : 'Addis Ababa, Ethiopia';
  const landmark = extractMeaningfulLandmark(item.affectedArea);
  const mappedSubstation = SUBSTATION_SEARCH_NAMES[substation];

  const queries: string[] = [];
  if (landmark && landmark.toLowerCase() !== 'n/a') {
    queries.push(`${landmark}, ${regionSuffix}`);
  }
  if (mappedSubstation) {
    queries.push(mappedSubstation.includes('Ethiopia') ? mappedSubstation : `${mappedSubstation}, Ethiopia`);
  } else if (substation && substation !== 'INFO') {
    queries.push(`${substation}, ${regionSuffix}`);
  }
  queries.push(isSheger ? 'Burayu, Ethiopia' : 'Addis Ababa, Ethiopia');

  const label = landmark || mappedSubstation?.split(',')[0] || substation || stripBrackets(item.feederName);
  const cacheKey = `${substation}::${landmark || 'base'}::${isSheger ? 'sheger' : 'addis'}`.toLowerCase();

  return { cacheKey, queries: Array.from(new Set(queries)), substation, label, isSheger };
}

function computeCircleRadiusMeters(viewport?: ViewportBounds, count = 1): number {
  let baseRadius = 1750;
  if (viewport) {
    const latSpanMeters = Math.abs(viewport.north - viewport.south) * 111320;
    if (latSpanMeters > 300 && latSpanMeters < 18000) {
      baseRadius = Math.max(950, Math.min(3400, Math.round(latSpanMeters * 0.42)));
    }
  }
  return Math.min(4200, baseRadius + (count - 1) * 280);
}

function isQuotaError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toUpperCase();
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('OVERQUOTA') ||
    msg.includes('QUOTA') ||
    msg.includes('429')
  );
}

interface OutageOverlayLayerProps {
  zones: OutageZone[];
  addisAnchor: CachedPlaceData | null;
  shegerAnchor: CachedPlaceData | null;
  selectedZoneKey: string | null;
  onSelectZone: (zoneKey: string) => void;
}

function OutageOverlayLayer({
  zones,
  addisAnchor,
  shegerAnchor,
  selectedZoneKey,
  onSelectZone,
}: OutageOverlayLayerProps) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const [markerAnchors, setMarkerAnchors] = useState<Record<string, google.maps.marker.AdvancedMarkerElement>>({});

  const registerMarkerRef = useCallback(
    (key: string) => (el: google.maps.marker.AdvancedMarkerElement | null) => {
      setMarkerAnchors((prev) => {
        if (!el && !prev[key]) return prev;
        if (el && prev[key] === el) return prev;
        const next = { ...prev };
        if (el) {
          next[key] = el;
        } else {
          delete next[key];
        }
        return next;
      });
    },
    []
  );

  // Render subtle green coverage rings for Addis Ababa & Sheger + bold RED outage zone circles
  useEffect(() => {
    if (!map || !mapsLib) return;

    const circles: google.maps.Circle[] = [];
    const listeners: google.maps.MapsEventListener[] = [];

    if (addisAnchor) {
      circles.push(
        new mapsLib.Circle({
          map,
          center: { lat: addisAnchor.lat, lng: addisAnchor.lng },
          radius: 13500,
          strokeColor: '#078930',
          strokeOpacity: 0.45,
          strokeWeight: 1.5,
          fillColor: '#078930',
          fillOpacity: 0.03,
          clickable: false,
          zIndex: 1,
        })
      );
    }

    if (shegerAnchor) {
      circles.push(
        new mapsLib.Circle({
          map,
          center: { lat: shegerAnchor.lat, lng: shegerAnchor.lng },
          radius: 15500,
          strokeColor: '#0ea5e9',
          strokeOpacity: 0.4,
          strokeWeight: 1.5,
          fillColor: '#0ea5e9',
          fillOpacity: 0.03,
          clickable: false,
          zIndex: 1,
        })
      );
    }

    for (const zone of zones) {
      const isSelected = zone.key === selectedZoneKey;
      const circle = new mapsLib.Circle({
        map,
        center: zone.position,
        radius: zone.radiusMeters,
        strokeColor: isSelected ? '#7F1D1D' : '#DC2626',
        strokeOpacity: 0.95,
        strokeWeight: isSelected ? 3.5 : 2.5,
        fillColor: '#EF4444',
        fillOpacity: isSelected ? 0.42 : 0.28,
        clickable: true,
        zIndex: isSelected ? 20 : 10,
      });

      const clickListener = circle.addListener('click', () => {
        onSelectZone(zone.key);
      });
      circles.push(circle);
      listeners.push(clickListener);
    }

    return () => {
      listeners.forEach((l) => l.remove());
      circles.forEach((c) => c.setMap(null));
    };
  }, [map, mapsLib, zones, addisAnchor, shegerAnchor, selectedZoneKey, onSelectZone]);

  const selectedZone = useMemo(
    () => zones.find((z) => z.key === selectedZoneKey) || null,
    [zones, selectedZoneKey]
  );

  return (
    <>
      {zones.map((zone) => {
        const isSelected = zone.key === selectedZoneKey;
        return (
          <AdvancedMarker
            key={zone.key}
            ref={registerMarkerRef(zone.key)}
            position={zone.position}
            title={`${zone.label} (${zone.items.length} active interruption${zone.items.length > 1 ? 's' : ''})`}
            onClick={() => onSelectZone(zone.key)}
          >
            <Pin
              background={isSelected ? '#991B1B' : '#DC2626'}
              borderColor="#7F1D1D"
              glyphColor="#FFFFFF"
              scale={isSelected ? 1.25 : 1.05}
              glyphText={zone.items.length > 1 ? String(zone.items.length) : '!'}
            />
          </AdvancedMarker>
        );
      })}

      {selectedZone && markerAnchors[selectedZone.key] && (
        <InfoWindow
          anchor={markerAnchors[selectedZone.key]}
          maxWidth={340}
          onCloseClick={() => onSelectZone('')}
        >
          <div className="p-1 text-slate-900 space-y-2 font-sans max-w-[300px]">
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-1.5">
              <div>
                <div className="text-xs font-bold text-red-700 uppercase tracking-wide flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Active Interruption Area</span>
                </div>
                <h4 className="text-sm font-bold text-slate-950 mt-0.5 leading-snug">
                  {selectedZone.label}
                </h4>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-100 text-red-800 shrink-0 tabular-nums">
                {selectedZone.items.length} {selectedZone.items.length === 1 ? 'Feeder' : 'Feeders'}
              </span>
            </div>

            <div className="text-[11px] text-slate-600 flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">{selectedZone.regionGroup}</span>
              <span>{selectedZone.substation}</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {selectedZone.items.map((item) => {
                const translated = translateAmharicLocation(item.affectedArea);
                return (
                  <div
                    key={item.id}
                    className="p-2 rounded-lg bg-red-50/80 border border-red-200/80 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {stripBrackets(item.feederName).split('|')[0].trim()}
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-600 text-white shrink-0">
                        {item.status}
                      </span>
                    </div>
                    <div className="text-[11px] font-medium text-red-800">
                      {item.type}
                    </div>
                    {translated && translated !== 'N/A' && (
                      <div className="text-[11px] text-slate-700 leading-snug">
                        {translated}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 flex items-center gap-1 pt-0.5 tabular-nums">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>Started: {item.startTime}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function MapViewportController({
  addisAnchor,
  shegerAnchor,
  zones,
  focusTrigger,
  selectedZoneKey,
}: {
  addisAnchor: CachedPlaceData | null;
  shegerAnchor: CachedPlaceData | null;
  zones: OutageZone[];
  focusTrigger: { target: 'all' | 'addis' | 'sheger'; nonce: number };
  selectedZoneKey: string | null;
}) {
  const map = useMap();
  const coreLib = useMapsLibrary('core');

  useEffect(() => {
    if (!map || !selectedZoneKey) return;
    const zone = zones.find((z) => z.key === selectedZoneKey);
    if (zone) {
      map.panTo(zone.position);
      const currentZoom = map.getZoom() ?? 12;
      if (currentZoom < 13) {
        map.setZoom(13);
      }
    }
  }, [map, selectedZoneKey, zones]);

  useEffect(() => {
    if (!map || !coreLib || focusTrigger.nonce === 0) return;

    if (focusTrigger.target === 'addis' && addisAnchor) {
      map.panTo({ lat: addisAnchor.lat, lng: addisAnchor.lng });
      map.setZoom(12);
      return;
    }

    if (focusTrigger.target === 'sheger' && shegerAnchor) {
      map.panTo({ lat: shegerAnchor.lat, lng: shegerAnchor.lng });
      map.setZoom(11);
      return;
    }

    const bounds = new coreLib.LatLngBounds();
    let hasPoint = false;
    if (addisAnchor) {
      bounds.extend({ lat: addisAnchor.lat, lng: addisAnchor.lng });
      hasPoint = true;
    }
    if (shegerAnchor) {
      bounds.extend({ lat: shegerAnchor.lat, lng: shegerAnchor.lng });
      hasPoint = true;
    }
    for (const z of zones) {
      bounds.extend(z.position);
      hasPoint = true;
    }
    if (hasPoint) {
      map.fitBounds(bounds, 56);
    }
  }, [map, coreLib, focusTrigger, addisAnchor, shegerAnchor, zones]);

  return null;
}

function InterruptionMapWorkspace({ interruptions }: { interruptions: FeederInterruption[] }) {
  const isApiLoaded = useApiIsLoaded();
  const loadingStatus = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');

  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedZoneKey, setSelectedZoneKey] = useState<string | null>(null);
  const [focusTrigger, setFocusTrigger] = useState<{ target: 'all' | 'addis' | 'sheger'; nonce: number }>({
    target: 'all',
    nonce: 0,
  });

  const [placeCache, setPlaceCache] = useState<Record<string, CachedPlaceData>>(() => readPlaceCache());
  const placeCacheRef = useRef(placeCache);
  placeCacheRef.current = placeCache;

  const [isResolvingRegions, setIsResolvingRegions] = useState<boolean>(false);
  const [isResolvingOutages, setIsResolvingOutages] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const failedKeysRef = useRef<Set<string>>(new Set());

  const activeDisruptions = useMemo(
    () =>
      interruptions.filter(
        (item) => !isFeederRestored(item) && !isInfoFeeder(item.feederName)
      ),
    [interruptions]
  );

  const searchPlaceOnce = useCallback(
    async (queries: string[]): Promise<CachedPlaceData | null> => {
      if (!placesLib) return null;

      for (const query of queries) {
        try {
          const request = {
            textQuery: query,
            fields: ['displayName', 'location', 'formattedAddress', 'viewport'],
            language: 'en',
            region: 'ET',
            maxResultCount: 1,
            internalUsageAttributionIds: [ATTRIBUTION_ID],
          } as unknown as google.maps.places.SearchByTextRequest;

          const { places } = await placesLib.Place.searchByText(request);
          const first = places?.[0];
          if (first?.location) {
            const lat = first.location.lat();
            const lng = first.location.lng();
            let viewport: ViewportBounds | undefined;
            if (first.viewport) {
              const ne = first.viewport.getNorthEast();
              const sw = first.viewport.getSouthWest();
              viewport = {
                north: ne.lat(),
                south: sw.lat(),
                east: ne.lng(),
                west: sw.lng(),
              };
            }
            return {
              lat,
              lng,
              displayName: first.displayName || query,
              formattedAddress: first.formattedAddress || undefined,
              viewport,
              cachedAt: Date.now(),
            };
          }
        } catch (err) {
          if (isQuotaError(err)) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            throw err;
          }
        }
      }
      return null;
    },
    [placesLib]
  );

  // 1. Resolve regional anchors (Addis Ababa & Sheger) via Places API (New) and cache locally
  useEffect(() => {
    if (!placesLib) return;
    let cancelled = false;

    const ensureRegionalAnchors = async () => {
      const current = placeCacheRef.current;
      const needsAddis = !current['region::addis'];
      const needsSheger = !current['region::sheger'];
      if (!needsAddis && !needsSheger) return;

      setIsResolvingRegions(true);
      setResolveError(null);
      try {
        const updates: Record<string, CachedPlaceData> = {};
        if (needsAddis) {
          const res = await searchPlaceOnce(['Addis Ababa, Ethiopia']);
          if (res && !cancelled) updates['region::addis'] = res;
        }
        if (needsSheger) {
          const res = await searchPlaceOnce(['Sheger City, Ethiopia', 'Burayu, Ethiopia', 'Sebeta, Ethiopia']);
          if (res && !cancelled) updates['region::sheger'] = res;
        }
        if (!cancelled && Object.keys(updates).length > 0) {
          setPlaceCache((prev) => {
            const merged = { ...prev, ...updates };
            writePlaceCache(merged);
            return merged;
          });
        }
      } catch {
        if (!cancelled) {
          setResolveError('Unable to resolve regional map coverage right now. Please check API quota or connectivity.');
        }
      } finally {
        if (!cancelled) setIsResolvingRegions(false);
      }
    };

    void ensureRegionalAnchors();
    return () => {
      cancelled = true;
    };
  }, [placesLib, searchPlaceOnce]);

  // 2. Group active disruptions by area key and resolve any uncached coordinates via Places API (New)
  const groupedRequests = useMemo(() => {
    const groups: Record<
      string,
      {
        cacheKey: string;
        queries: string[];
        substation: string;
        label: string;
        isSheger: boolean;
        items: FeederInterruption[];
      }
    > = {};

    for (const item of activeDisruptions) {
      const info = buildSearchQueries(item);
      if (!groups[info.cacheKey]) {
        groups[info.cacheKey] = {
          ...info,
          items: [item],
        };
      } else {
        groups[info.cacheKey].items.push(item);
      }
    }
    return Object.values(groups);
  }, [activeDisruptions]);

  useEffect(() => {
    if (!placesLib || groupedRequests.length === 0) return;
    let cancelled = false;

    const missing = groupedRequests.filter(
      (g) => !placeCacheRef.current[g.cacheKey] && !failedKeysRef.current.has(g.cacheKey)
    );
    if (missing.length === 0) return;

    const resolveOutageZones = async () => {
      setIsResolvingOutages(true);
      try {
        for (const group of missing) {
          if (cancelled) break;
          const resolved = await searchPlaceOnce(group.queries);
          if (cancelled) break;

          if (resolved) {
            setPlaceCache((prev) => {
              const merged = { ...prev, [group.cacheKey]: resolved };
              writePlaceCache(merged);
              return merged;
            });
          } else {
            failedKeysRef.current.add(group.cacheKey);
          }
        }
      } catch {
        if (!cancelled) {
          setResolveError('Unable to resolve all interruption locations due to API quota or network limits.');
        }
      } finally {
        if (!cancelled) setIsResolvingOutages(false);
      }
    };

    void resolveOutageZones();
    return () => {
      cancelled = true;
    };
  }, [placesLib, groupedRequests, searchPlaceOnce]);

  const addisAnchor = placeCache['region::addis'] || null;
  const shegerAnchor = placeCache['region::sheger'] || null;

  const allOutageZones: OutageZone[] = useMemo(() => {
    const out: OutageZone[] = [];
    for (const group of groupedRequests) {
      const cached = placeCache[group.cacheKey];
      const fallback = group.isSheger ? shegerAnchor || addisAnchor : addisAnchor || shegerAnchor;
      const coord = cached || fallback;
      if (!coord) continue;

      out.push({
        key: group.cacheKey,
        label: group.label,
        substation: group.substation,
        regionGroup: group.isSheger ? 'Sheger Region' : 'Addis Ababa',
        direction: getCardinalDirection(group.items[0].district, group.items[0].feederName),
        position: { lat: coord.lat, lng: coord.lng },
        radiusMeters: computeCircleRadiusMeters(cached?.viewport, group.items.length),
        placeDisplayName: cached?.displayName,
        formattedAddress: cached?.formattedAddress,
        items: group.items,
      });
    }
    return out;
  }, [groupedRequests, placeCache, addisAnchor, shegerAnchor]);

  const filteredZones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allOutageZones.filter((zone) => {
      if (regionFilter === 'addis' && zone.regionGroup !== 'Addis Ababa') return false;
      if (regionFilter === 'sheger' && zone.regionGroup !== 'Sheger Region') return false;
      if (!q) return true;
      return (
        zone.label.toLowerCase().includes(q) ||
        zone.substation.toLowerCase().includes(q) ||
        zone.regionGroup.toLowerCase().includes(q) ||
        zone.items.some(
          (i) =>
            i.feederName.toLowerCase().includes(q) ||
            translateAmharicLocation(i.affectedArea).toLowerCase().includes(q)
        )
      );
    });
  }, [allOutageZones, regionFilter, searchQuery]);

  const addisCount = useMemo(
    () =>
      allOutageZones
        .filter((z) => z.regionGroup === 'Addis Ababa')
        .reduce((acc, z) => acc + z.items.length, 0),
    [allOutageZones]
  );

  const shegerCount = useMemo(
    () =>
      allOutageZones
        .filter((z) => z.regionGroup === 'Sheger Region')
        .reduce((acc, z) => acc + z.items.length, 0),
    [allOutageZones]
  );

  const initialCenter = useMemo<LatLngLiteral | null>(() => {
    if (addisAnchor) return { lat: addisAnchor.lat, lng: addisAnchor.lng };
    if (shegerAnchor) return { lat: shegerAnchor.lat, lng: shegerAnchor.lng };
    return null;
  }, [addisAnchor, shegerAnchor]);

  if (loadingStatus === APILoadingStatus.FAILED || loadingStatus === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center border border-red-200 dark:border-red-900/40">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Unable to Load Google Maps
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          Please verify that your Google Maps Platform API key is active and authorized for Maps JavaScript API and Places API (New).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Coverage Switcher, Legend & Counts */}
      <div className="glass-card rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-950 dark:text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-eeu-green" />
              <span>Addis Ababa &amp; Sheger Outage Map</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Active feeder interruptions automatically highlight affected areas in red.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRegionFilter('all');
              setSelectedZoneKey(null);
              setFocusTrigger((prev) => ({ target: 'all', nonce: prev.nonce + 1 }));
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer tabular-nums ${
              regionFilter === 'all'
                ? 'bg-eeu-green text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            All Coverage ({activeDisruptions.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setRegionFilter('addis');
              setSelectedZoneKey(null);
              setFocusTrigger((prev) => ({ target: 'addis', nonce: prev.nonce + 1 }));
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer tabular-nums ${
              regionFilter === 'addis'
                ? 'bg-eeu-green text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            Addis Ababa ({addisCount})
          </button>

          <button
            type="button"
            onClick={() => {
              setRegionFilter('sheger');
              setSelectedZoneKey(null);
              setFocusTrigger((prev) => ({ target: 'sheger', nonce: prev.nonce + 1 }));
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer tabular-nums ${
              regionFilter === 'sheger'
                ? 'bg-eeu-green text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            Sheger Region ({shegerCount})
          </button>

          <button
            type="button"
            onClick={() => setFocusTrigger((prev) => ({ target: regionFilter, nonce: prev.nonce + 1 }))}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-eeu-green transition-all flex items-center gap-1.5 cursor-pointer"
            title="Recenter map to selected coverage"
          >
            <Crosshair className="w-3.5 h-3.5 text-eeu-green" />
            <span>Recenter</span>
          </button>
        </div>
      </div>

      {/* Color Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-3.5 h-3.5 rounded-full bg-red-600/35 border-2 border-red-600 inline-block" />
            <span className="text-slate-800 dark:text-slate-200">Active Interruption Area (Red)</span>
          </div>
          <div className="flex items-center gap-2 font-medium">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-600/15 border border-emerald-600 inline-block" />
            <span>Addis Ababa Zone</span>
          </div>
          <div className="flex items-center gap-2 font-medium">
            <span className="w-3.5 h-3.5 rounded-full bg-sky-500/15 border border-sky-500 inline-block" />
            <span>Sheger Region Zone</span>
          </div>
        </div>

        {(isResolvingRegions || isResolvingOutages) && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-eeu-green">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Locating feeder areas...</span>
          </div>
        )}
      </div>

      {resolveError && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-300">
          {resolveError}
        </div>
      )}

      {/* Main Two-Column Map + Active Red Zones Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Map Canvas (Explicit height required per CF2) */}
        <div className="xl:col-span-8 glass-card rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800/80 relative h-[520px] lg:h-[620px]">
          {!isApiLoaded || !initialCenter ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950/70 text-slate-600 dark:text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin text-eeu-green" />
              <span className="text-xs font-semibold">
                Initializing Addis Ababa &amp; Sheger coverage map...
              </span>
            </div>
          ) : (
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultCenter={initialCenter}
              defaultZoom={11}
              gestureHandling="greedy"
              streetViewControl={false}
              mapTypeControl={true}
              fullscreenControl={true}
              internalUsageAttributionIds={[ATTRIBUTION_ID]}
              style={{ width: '100%', height: '100%' }}
              onClick={() => setSelectedZoneKey(null)}
            >
              <OutageOverlayLayer
                zones={filteredZones}
                addisAnchor={addisAnchor}
                shegerAnchor={shegerAnchor}
                selectedZoneKey={selectedZoneKey}
                onSelectZone={(key) => setSelectedZoneKey(key || null)}
              />
              <MapViewportController
                addisAnchor={addisAnchor}
                shegerAnchor={shegerAnchor}
                zones={filteredZones}
                focusTrigger={focusTrigger}
                selectedZoneKey={selectedZoneKey}
              />
            </GoogleMap>
          )}
        </div>

        {/* Active Red Zones List */}
        <div className="xl:col-span-4 glass-card rounded-2xl p-4 flex flex-col h-[520px] lg:h-[620px]">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
            <h3 className="text-sm font-bold text-slate-950 dark:text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-red-600" />
              <span>Red Interruption Zones</span>
            </h3>
            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 tabular-nums">
              {filteredZones.length} {filteredZones.length === 1 ? 'Area' : 'Areas'}
            </span>
          </div>

          {/* Filter Search */}
          <div className="relative mt-3 mb-3">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search area, substation, feeder..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl glass-input text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-eeu-green/40"
            />
          </div>

          {/* Zone List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredZones.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-eeu-green flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {activeDisruptions.length === 0
                    ? 'No Active Interruptions'
                    : 'No Matching Areas'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {activeDisruptions.length === 0
                    ? 'All Addis Ababa and Sheger feeders are currently operating normally. New interruptions will appear in red here.'
                    : 'Try clearing your search or switching region filters.'}
                </p>
              </div>
            ) : (
              filteredZones.map((zone) => {
                const isSelected = zone.key === selectedZoneKey;
                const firstItem = zone.items[0];
                const translatedAreas = translateAmharicLocation(firstItem.affectedArea);
                return (
                  <button
                    key={zone.key}
                    type="button"
                    onClick={() => setSelectedZoneKey(zone.key)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-red-50 dark:bg-red-950/35 border-red-400 dark:border-red-700 shadow-sm'
                        : 'bg-white/60 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-800/70 hover:border-red-300 dark:hover:border-red-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-950 dark:text-white truncate">
                            {zone.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {zone.regionGroup} • {zone.substation}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-600 text-white shrink-0 tabular-nums">
                        {zone.items.length}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 font-semibold">
                        {firstItem.type}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                        {stripBrackets(firstItem.feederName).split('|')[0].trim()}
                      </span>
                    </div>

                    {translatedAreas && translatedAreas !== 'N/A' && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2 leading-snug">
                        {translatedAreas}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InterruptionMapView({
  interruptions,
  isDarkMode,
}: InterruptionMapViewProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  if (!apiKey) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center border border-amber-200 dark:border-amber-900/40">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Google Maps API Key Required
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          Configure <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> in your environment to display the interactive Addis Ababa and Sheger interruption map.
        </p>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      language="en"
      region="ET"
      libraries={['places', 'marker', 'maps', 'core']}
    >
      <div data-theme={isDarkMode ? 'dark' : 'light'}>
        <InterruptionMapWorkspace interruptions={interruptions} />
      </div>
    </APIProvider>
  );
}
