import { createContext, useContext } from "react";

interface ThemeContextType {
  activeBU: {
    colors: {
      primary: string;
      secondary: string;
      accent: string;
    };
  } | null;
}

const ThemeContext = createContext<ThemeContextType>({
  activeBU: {
    colors: {
      primary: "14 78% 56%",
      secondary: "0 0% 56%",
      accent: "0 0% 7%",
    },
  },
});

export function useTheme() {
  return useContext(ThemeContext);
}
