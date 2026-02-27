import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={`relative inline-flex items-center h-8 w-[60px] rounded-full
                  transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2
                  ${isDark
                    ? 'bg-border focus:ring-ring focus:ring-offset-background'
                    : 'bg-primary-soft focus:ring-ring focus:ring-offset-background'
                  } ${className}`}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label="Toggle theme"
    >
      {/* Track icons */}
      <span className={`absolute left-1.5 text-xs transition-opacity duration-300 ${isDark ? 'opacity-0' : 'opacity-100'}`}>
        ☀️
      </span>
      <span className={`absolute right-1.5 text-xs transition-opacity duration-300 ${isDark ? 'opacity-100' : 'opacity-0'}`}>
        🌙
      </span>

      {/* Sliding knob */}
      <span
        className={`inline-block h-6 w-6 rounded-full shadow-md transform transition-all duration-300 ease-in-out
                    ${isDark
                      ? 'translate-x-[30px] bg-surface ring-1 ring-ring/30'
                      : 'translate-x-[3px] bg-surface ring-1 ring-ring/20'
                    }`}
      />
    </button>
  );
}
