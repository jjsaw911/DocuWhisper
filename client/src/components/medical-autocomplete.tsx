import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { searchMedicalTerms } from "@/lib/medical-terms";
import { cn } from "@/lib/utils";

interface MedicalAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  disabled?: boolean;
  "data-testid"?: string;
}

export function MedicalAutocomplete({
  value,
  onChange,
  placeholder,
  className,
  rows = 4,
  disabled = false,
  "data-testid": dataTestId,
}: MedicalAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Extract the current word being typed
  const getCurrentWord = useCallback((text: string, position: number): { word: string; start: number; end: number } => {
    const beforeCursor = text.slice(0, position);
    const afterCursor = text.slice(position);
    
    // Find word boundaries
    const wordStartMatch = beforeCursor.match(/[\w-]*$/);
    const wordEndMatch = afterCursor.match(/^[\w-]*/);
    
    const start = wordStartMatch ? position - wordStartMatch[0].length : position;
    const end = wordEndMatch ? position + wordEndMatch[0].length : position;
    const word = text.slice(start, end);
    
    return { word, start, end };
  }, []);

  // Handle text change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newPosition = e.target.selectionStart || 0;
    
    onChange(newValue);
    setCursorPosition(newPosition);
    
    // Get current word and search for suggestions
    const { word } = getCurrentWord(newValue, newPosition);
    
    if (word.length >= 2) {
      const results = searchMedicalTerms(word, 8);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSelectedIndex(0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Handle suggestion selection
  const selectSuggestion = useCallback((suggestion: string) => {
    const { start, end } = getCurrentWord(value, cursorPosition);
    const newValue = value.slice(0, start) + suggestion + value.slice(end);
    const newCursorPosition = start + suggestion.length;
    
    onChange(newValue);
    setCursorPosition(newCursorPosition);
    setShowSuggestions(false);
    setSuggestions([]);
    
    // Focus and set cursor position
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCursorPosition;
          textareaRef.current.selectionEnd = newCursorPosition;
        }
      }, 0);
    }
  }, [value, cursorPosition, getCurrentWord, onChange]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case "Tab":
      case "Enter":
        if (showSuggestions && suggestions[selectedIndex]) {
          e.preventDefault();
          selectSuggestion(suggestions[selectedIndex]);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        break;
    }
  };

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (suggestionsRef.current && showSuggestions) {
      const selectedElement = suggestionsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, showSuggestions]);

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        rows={rows}
        disabled={disabled}
        data-testid={dataTestId}
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
          data-testid="autocomplete-suggestions"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              className={cn(
                "px-3 py-2 cursor-pointer text-sm",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover-elevate"
              )}
              onClick={() => selectSuggestion(suggestion)}
              data-testid={`suggestion-${index}`}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
