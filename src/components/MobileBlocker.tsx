import React, { useState, useEffect } from 'react';
import { Monitor } from 'lucide-react';

export const MobileBlocker = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // Blocking below 1024px to ensure tablet/mobile users get the message
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!isMobile) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center p-6 text-center">
      <Monitor className="w-16 h-16 text-eeu-green mb-4" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Desktop Experience Required</h2>
      <p className="text-gray-600 max-w-sm">This dashboard is optimized for large screens to manage electrical infrastructure effectively. Please access this application on a desktop or laptop device.</p>
    </div>
  );
};
