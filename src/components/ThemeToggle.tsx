import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  className?: string;
  variant?: 'icon' | 'dropdown' | 'pill';
}

export default function ThemeToggle({ className = '', variant = 'dropdown' }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (variant === 'icon') {
    return (
      <button
        onClick={toggleTheme}
        className={`p-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shadow-xs cursor-pointer flex items-center justify-center ${className}`}
        title={`Current theme: ${theme}. Click to change.`}
      >
        {resolvedTheme === 'dark' ? (
          <Moon className="w-4 h-4 text-amber-400" />
        ) : (
          <Sun className="w-4 h-4 text-amber-500" />
        )}
      </button>
    );
  }

  if (variant === 'pill') {
    return (
      <div className={`flex items-center p-1 bg-gray-100 dark:bg-gray-900 rounded-full border border-gray-200 dark:border-gray-800 ${className}`}>
        <button
          onClick={() => setTheme('light')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            theme === 'light'
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Sun className="w-3.5 h-3.5 text-amber-500" />
          <span>Light</span>
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            theme === 'dark'
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Moon className="w-3.5 h-3.5 text-amber-400" />
          <span>Dark</span>
        </button>
        <button
          onClick={() => setTheme('system')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            theme === 'system'
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Monitor className="w-3.5 h-3.5 text-eeu-green" />
          <span>System</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shadow-xs cursor-pointer text-xs font-semibold"
        title="Theme settings"
      >
        {theme === 'dark' ? (
          <Moon className="w-4 h-4 text-amber-400" />
        ) : theme === 'light' ? (
          <Sun className="w-4 h-4 text-amber-500" />
        ) : (
          <Monitor className="w-4 h-4 text-eeu-green" />
        )}
        <span className="capitalize">{theme}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-36 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
          <button
            onClick={() => { setTheme('light'); setIsOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left hover:bg-gray-100 dark:hover:bg-gray-800/80 ${
              theme === 'light' ? 'text-eeu-green font-bold' : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              <span>Light</span>
            </div>
            {theme === 'light' && <Check className="w-3.5 h-3.5 text-eeu-green" />}
          </button>

          <button
            onClick={() => { setTheme('dark'); setIsOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left hover:bg-gray-100 dark:hover:bg-gray-800/80 ${
              theme === 'dark' ? 'text-eeu-green font-bold' : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-amber-400" />
              <span>Dark</span>
            </div>
            {theme === 'dark' && <Check className="w-3.5 h-3.5 text-eeu-green" />}
          </button>

          <button
            onClick={() => { setTheme('system'); setIsOpen(false); }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left hover:bg-gray-100 dark:hover:bg-gray-800/80 ${
              theme === 'system' ? 'text-eeu-green font-bold' : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-eeu-green" />
              <span>System</span>
            </div>
            {theme === 'system' && <Check className="w-3.5 h-3.5 text-eeu-green" />}
          </button>
        </div>
      )}
    </div>
  );
}
