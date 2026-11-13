import React, { useId, useState } from 'react';

interface EEULogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
  textColor?: string;
  textPosition?: 'right' | 'bottom';
  textSize?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}

export default function EEULogo({
  className = '',
  size = 44,
  showText = false,
  textColor = 'text-gray-900 dark:text-white',
  textPosition = 'right',
  textSize = 'md',
  style
}: EEULogoProps) {
  // Brand Colors: 
  // Orange: #F48B20 / #f39c12
  // Green: #5FA354 / #22c55e
  const rawId = useId();
  const clipId = `eeu-circle-clip-${rawId.replace(/:/g, '')}`;
  const [animKey, setAnimKey] = useState(0);

  const handleReplay = () => {
    setAnimKey(prev => prev + 1);
  };

  const emblem = (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      onClick={!showText ? handleReplay : undefined}
      className={`shrink-0 select-none rounded-full cursor-pointer ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>

      {/* Outer Border (subtle background container) */}
      <circle cx="50" cy="50" r="48" fill="transparent" />
      
      {/* Mask to ensure everything stays perfectly circular */}
      <g key={animKey} clipPath={`url(#${clipId})`}>
        
        {/* Sky Background (Orange) */}
        <rect x="0" y="0" width="100" height="100" fill="#F48B20" />
        
        {/* Green Field (slanted, starting around y=31 on left up to y=15 on right) */}
        <path d="M-5 105 L105 105 L105 16 L-5 31 Z" fill="#5FA354" />
        
        {/* Center Utility Pole (White, rounded tip in orange sky) - rises from bottom on load */}
        <g className="eeu-pole-rise">
          <rect x="47.5" y="15" width="5" height="85" rx="2.5" fill="#FFFFFF" />
        </g>
        
        {/* 3 Slanted Metallic Distribution Lines (Base White) */}
        {/* Line 1 (Top Cable) */}
        <line x1="-5" y1="31" x2="105" y2="17" stroke="#FFFFFF" strokeWidth="2" />
        
        {/* Line 2 (Middle Cable) */}
        <line x1="-5" y1="48" x2="105" y2="34" stroke="#FFFFFF" strokeWidth="2" />
        
        {/* Line 3 (Bottom Cable) */}
        <line x1="-5" y1="65" x2="105" y2="51" stroke="#FFFFFF" strokeWidth="2" />

        {/* 3 Shining Golden Electric Moving Overlays (Right to Left, exactly 3 times after pole rises) */}
        <line x1="-5" y1="31" x2="105" y2="17" stroke="#FFD700" strokeWidth="2.8" strokeLinecap="round" className="eeu-golden-wire-1" />
        <line x1="-5" y1="48" x2="105" y2="34" stroke="#FFD700" strokeWidth="2.8" strokeLinecap="round" className="eeu-golden-wire-2" />
        <line x1="-5" y1="65" x2="105" y2="51" stroke="#FFD700" strokeWidth="2.8" strokeLinecap="round" className="eeu-golden-wire-3" />

        {/* Bright White-Gold Electric Core Pulses moving Right to Left */}
        <line x1="-5" y1="31" x2="105" y2="17" stroke="#FFFBEB" strokeWidth="1.5" strokeLinecap="round" className="eeu-white-pulse-1" />
        <line x1="-5" y1="48" x2="105" y2="34" stroke="#FFFBEB" strokeWidth="1.5" strokeLinecap="round" className="eeu-white-pulse-2" />
        <line x1="-5" y1="65" x2="105" y2="51" stroke="#FFFBEB" strokeWidth="1.5" strokeLinecap="round" className="eeu-white-pulse-3" />

        {/* --- Insulator Assemblies --- */}
        <g className="eeu-insulator-appear">
          {/* Insulator Assembly 1 (Top Line, Right of Pole) */}
          <path d="M52.5 28.5 L58 28.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
          <g transform="translate(58, 25.5)">
            <path d="M-3 0 h6 v-1.5 h-6 z" fill="#FFFFFF" />
            <path d="M-4.5 -3.5 h9 v-1.5 h-9 z" fill="#FFFFFF" />
            <path d="M-3.5 -5.5 h7 v-1.5 h-7 z" fill="#FFFFFF" />
            <path d="M-1.5 -7 h3 v-1 h-3 z" fill="#FFFFFF" />
          </g>

          {/* Insulator Assembly 2 (Middle Line, Left of Pole) */}
          <path d="M47.5 44 C42 44, 42 45, 42 47" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <g transform="translate(42, 47)">
            <path d="M-3 0 h6 v1.5 h-6 z" fill="#FFFFFF" />
            <path d="M-4.5 2 h9 v1.5 h-9 z" fill="#FFFFFF" />
            <path d="M-3.5 4 h7 v1.5 h-7 z" fill="#FFFFFF" />
            <path d="M-1.5 6.2 h3 v1 h-3 z" fill="#FFFFFF" />
          </g>

          {/* Insulator Assembly 3 (Bottom Line, Right of Pole) */}
          <path d="M52.5 61 C58 61, 58 62, 58 64" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <g transform="translate(58, 64)">
            <path d="M-3 0 h6 v1.5 h-6 z" fill="#FFFFFF" />
            <path d="M-4.5 2 h9 v1.5 h-9 z" fill="#FFFFFF" />
            <path d="M-3.5 4 h7 v1.5 h-7 z" fill="#FFFFFF" />
            <path d="M-1.5 6.2 h3 v1 h-3 z" fill="#FFFFFF" />
          </g>
        </g>
      </g>
    </svg>
  );

  if (!showText) {
    return emblem;
  }

  if (textPosition === 'right') {
    return (
      <div 
        onClick={handleReplay}
        className={`flex items-center gap-3 select-none text-left leading-tight cursor-pointer ${className}`}
        style={{ width: '200px', height: '74.75px', ...style }}
      >
        {emblem}
        <div>
          <div className="font-display font-medium text-[#F48B20] text-sm tracking-wide">
            የኢትዮጵያ ኤሌክትሪክ አገልግሎት
          </div>
          <div className="font-display font-bold text-[#5FA354] text-[11px] tracking-normal">
            Ethiopian Electric Utility
          </div>
        </div>
      </div>
    );
  }

  // Bottom alignment
  return (
    <div onClick={handleReplay} className="flex flex-col items-center text-center gap-2 select-none cursor-pointer">
      {emblem}
      <div className="leading-tight">
        <div className={`font-display font-semibold text-[#F48B20] tracking-wide ${
          textSize === 'sm' ? 'text-xs' : textSize === 'md' ? 'text-sm' : 'text-base'
        }`}>
          የኢትዮጵያ ኤሌክትሪክ አገልግሎት
        </div>
        <div className={`font-display font-black text-[#5FA354] tracking-normal mt-0.5 ${
          textSize === 'sm' ? 'text-[9px]' : textSize === 'md' ? 'text-[11px]' : 'text-xs'
        }`}>
          Ethiopian Electric Utility
        </div>
      </div>
    </div>
  );
}
