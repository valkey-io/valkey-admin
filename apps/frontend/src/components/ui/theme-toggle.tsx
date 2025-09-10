import React from "react";
import { useDarkModeContext } from "@/contexts/DarkModeContext";
import { Moon, Sun } from "lucide-react";

const ThemeToggle: React.FC = () => {
  const { isDark, toggleDarkMode } = useDarkModeContext();

  const handleClick = (mode: "dark" | "light") => {
    if ((mode === "dark" && !isDark) || (mode === "light" && isDark)) {
      toggleDarkMode();
    }
  };

  return (
    <div className="inline-flex rounded border border-gray-400 overflow-hidden text-sm font-medium mt-2">
      <button
        onClick={() => handleClick("dark")}
        className={`flex items-center gap-1 px-3 py-1 transition-colors ${
          isDark
            ? "bg-tw-primary text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        }`}
      >
        Dark
        <Moon size={18}/>
      </button>

      <button
        onClick={() => handleClick("light")}
        className={`flex items-center gap-1 px-3 py-1 transition-colors ${
          !isDark
            ? "bg-tw-primary text-white"
            : "bg-tw-dark-primary text-white hover:bg-gray-700"
        }`}
      >
        Light
        <Sun size={18} />
      </button>
    </div>
  );
};

export default ThemeToggle;
