import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
type Theme = 'system' | 'light' | 'dark';
const ThemeContext = createContext({ theme: 'system' as Theme, dark: false, setTheme: (_theme: Theme) => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => { try { const saved = localStorage.getItem('warehouse-theme'); return saved === 'light' || saved === 'dark' ? saved : 'system'; } catch { return 'system'; } });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const dark = theme === 'dark' || theme === 'system' && systemDark;
  useEffect(() => { const query = window.matchMedia?.('(prefers-color-scheme: dark)'); const changed = (e: MediaQueryListEvent) => setSystemDark(e.matches); query?.addEventListener('change', changed); return () => query?.removeEventListener('change', changed); }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; try { localStorage.setItem('warehouse-theme', theme); } catch { /* Browser storage can be unavailable. */ } }, [theme, dark]);
  return <ThemeContext.Provider value={{ theme, dark, setTheme }}>{children}</ThemeContext.Provider>;
}
export function ThemeToggle() { const { dark, setTheme } = useContext(ThemeContext); return <button type="button" className="ui-icon-button shrink-0" aria-label={dark ? 'Use light theme' : 'Use dark theme'} title={dark ? 'Use light theme' : 'Use dark theme'} onClick={() => setTheme(dark ? 'light' : 'dark')}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>; }
