import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutocompleteItem {
  code?: string;
  name?: string;
  description?: string;
  category?: string;
  [key: string]: string | boolean | number | string[] | undefined;
}

interface ClinicalAutocompleteProps<T extends AutocompleteItem> {
  items: T[];
  selectedItems: T[];
  onSelect: (item: T) => void;
  onRemove: (index: number) => void;
  placeholder?: string;
  searchFields?: (keyof T)[];
  displayField?: keyof T;
  secondaryField?: keyof T;
  categoryField?: keyof T;
  maxItems?: number;
  className?: string;
  renderItem?: (item: T) => React.ReactNode;
  renderSelected?: (item: T, index: number) => React.ReactNode;
  testIdPrefix?: string;
}

export function ClinicalAutocomplete<T extends AutocompleteItem>({
  items,
  selectedItems,
  onSelect,
  onRemove,
  placeholder = "Search...",
  searchFields = ["code", "name", "description"] as (keyof T)[],
  displayField = "name" as keyof T,
  secondaryField = "description" as keyof T,
  categoryField,
  maxItems,
  className,
  renderItem,
  renderSelected,
  testIdPrefix = "autocomplete",
}: ClinicalAutocompleteProps<T>) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredItems = items.filter((item) => {
    if (!searchTerm) return false;
    const term = searchTerm.toLowerCase();
    return searchFields.some((field) => {
      const value = item[field];
      if (typeof value === "string") {
        return value.toLowerCase().includes(term);
      }
      return false;
    });
  }).slice(0, 50);

  const handleSelect = useCallback((item: T) => {
    if (maxItems && selectedItems.length >= maxItems) return;
    const isDuplicate = selectedItems.some((selected) => {
      if (item.code && selected.code) return item.code === selected.code;
      if (item.name && selected.name) return item.name === selected.name;
      return false;
    });
    if (!isDuplicate) {
      onSelect(item);
    }
    setSearchTerm("");
    setIsOpen(false);
    setHighlightedIndex(0);
  }, [maxItems, selectedItems, onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" && searchTerm) {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < filteredItems.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredItems[highlightedIndex]) {
          handleSelect(filteredItems[highlightedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  }, [isOpen, filteredItems, highlightedIndex, handleSelect, searchTerm]);

  useEffect(() => {
    if (searchTerm && filteredItems.length > 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
    setHighlightedIndex(0);
  }, [searchTerm, filteredItems.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const groupedItems = categoryField
    ? filteredItems.reduce((acc, item) => {
        const category = (item[categoryField] as string) || "Other";
        if (!acc[category]) acc[category] = [];
        acc[category].push(item);
        return acc;
      }, {} as Record<string, T[]>)
    : { "": filteredItems };

  return (
    <div className={cn("relative", className)}>
      <div className="flex flex-wrap gap-1 mb-2">
        {selectedItems.map((item, index) => (
          renderSelected ? (
            renderSelected(item, index)
          ) : (
            <Badge
              key={index}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
              data-testid={`${testIdPrefix}-selected-${index}`}
            >
              <span className="font-medium">{item.code || String(item[displayField])}</span>
              {item.code && item[secondaryField] && (
                <span className="text-muted-foreground max-w-[200px] truncate">
                  - {String(item[secondaryField]).slice(0, 40)}...
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-4 w-4 hover:bg-destructive/20"
                onClick={() => onRemove(index)}
                data-testid={`${testIdPrefix}-remove-${index}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => searchTerm && filteredItems.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="pl-9"
          data-testid={`${testIdPrefix}-input`}
        />
      </div>

      {isOpen && filteredItems.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-popover border rounded-md shadow-lg"
          data-testid={`${testIdPrefix}-dropdown`}
        >
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div key={category}>
              {category && categoryField && (
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                  {category}
                </div>
              )}
              {categoryItems.map((item, idx) => {
                const globalIndex = filteredItems.indexOf(item);
                const isHighlighted = globalIndex === highlightedIndex;
                const isSelected = selectedItems.some((selected) => {
                  if (item.code && selected.code) return item.code === selected.code;
                  if (item.name && selected.name) return item.name === selected.name;
                  return false;
                });

                return (
                  <div
                    key={`${category}-${idx}`}
                    className={cn(
                      "px-3 py-2 cursor-pointer flex items-center justify-between gap-2",
                      isHighlighted && "bg-accent",
                      isSelected && "opacity-50"
                    )}
                    onClick={() => !isSelected && handleSelect(item)}
                    data-testid={`${testIdPrefix}-option-${globalIndex}`}
                  >
                    {renderItem ? (
                      renderItem(item)
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {item.code && (
                            <span className="font-mono text-sm font-medium text-primary">
                              {item.code}
                            </span>
                          )}
                          {!item.code && item[displayField] && (
                            <span className="font-medium">
                              {String(item[displayField])}
                            </span>
                          )}
                        </div>
                        {item[secondaryField] && (
                          <div className="text-sm text-muted-foreground truncate">
                            {String(item[secondaryField])}
                          </div>
                        )}
                      </div>
                    )}
                    {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {maxItems && selectedItems.length >= maxItems && (
        <p className="text-xs text-muted-foreground mt-1">
          Maximum {maxItems} items allowed
        </p>
      )}
    </div>
  );
}

interface MedicationAutocompleteProps {
  medications: {
    name: string;
    category: string;
    commonDoses: string[];
    frequencies: string[];
    class: string;
  }[];
  selectedMedications: {
    name: string;
    dose: string;
    frequency: string;
    duration?: string;
    instructions?: string;
    refills?: number;
    dispenseQuantity?: number;
  }[];
  onAdd: (medication: {
    name: string;
    dose: string;
    frequency: string;
    duration?: string;
    instructions?: string;
  }) => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, medication: {
    name: string;
    dose: string;
    frequency: string;
    duration?: string;
    instructions?: string;
  }) => void;
}

export function MedicationAutocomplete({
  medications,
  selectedMedications,
  onAdd,
  onRemove,
  onUpdate,
}: MedicationAutocompleteProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedMed, setSelectedMed] = useState<typeof medications[0] | null>(null);
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [instructions, setInstructions] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredMeds = medications.filter((med) => {
    if (!searchTerm) return false;
    const term = searchTerm.toLowerCase();
    return (
      med.name.toLowerCase().includes(term) ||
      med.category.toLowerCase().includes(term) ||
      med.class.toLowerCase().includes(term)
    );
  }).slice(0, 30);

  const handleSelectMed = (med: typeof medications[0]) => {
    setSelectedMed(med);
    setSearchTerm(med.name);
    setDose(med.commonDoses[0] || "");
    setFrequency(med.frequencies[0] || "Daily");
    setIsOpen(false);
  };

  const handleAdd = () => {
    if (!selectedMed || !dose) return;
    onAdd({
      name: selectedMed.name,
      dose,
      frequency,
      duration: duration || undefined,
      instructions: instructions || undefined,
    });
    setSelectedMed(null);
    setSearchTerm("");
    setDose("");
    setFrequency("");
    setDuration("");
    setInstructions("");
  };

  useEffect(() => {
    if (searchTerm && !selectedMed && filteredMeds.length > 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
    setHighlightedIndex(0);
  }, [searchTerm, selectedMed, filteredMeds.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const groupedMeds = filteredMeds.reduce((acc, med) => {
    if (!acc[med.category]) acc[med.category] = [];
    acc[med.category].push(med);
    return acc;
  }, {} as Record<string, typeof medications>);

  return (
    <div className="space-y-3">
      {selectedMedications.length > 0 && (
        <div className="space-y-2">
          {selectedMedications.map((med, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-md"
              data-testid={`medication-selected-${index}`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{med.name}</div>
                <div className="text-sm text-muted-foreground">
                  {med.dose} {med.frequency}
                  {med.duration && ` x ${med.duration}`}
                </div>
                {med.instructions && (
                  <div className="text-xs text-muted-foreground italic">
                    {med.instructions}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemove(index)}
                data-testid={`medication-remove-${index}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 p-3 border rounded-md bg-background">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (selectedMed && e.target.value !== selectedMed.name) {
                setSelectedMed(null);
              }
            }}
            placeholder="Search medications..."
            className="pl-9"
            data-testid="medication-search-input"
          />
          
          {isOpen && filteredMeds.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-popover border rounded-md shadow-lg"
              data-testid="medication-dropdown"
            >
              {Object.entries(groupedMeds).map(([category, meds]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                    {category}
                  </div>
                  {meds.map((med, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 cursor-pointer hover:bg-accent"
                      onClick={() => handleSelectMed(med)}
                      data-testid={`medication-option-${med.name.replace(/\s+/g, '-')}`}
                    >
                      <div className="font-medium">{med.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {med.class} • {med.commonDoses.join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedMed && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Dose</label>
              <select
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                data-testid="medication-dose-select"
              >
                {selectedMed.commonDoses.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
                <option value="custom">Custom...</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                data-testid="medication-frequency-select"
              >
                {selectedMed.frequencies.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
                <option value="Daily">Daily</option>
                <option value="BID">BID</option>
                <option value="TID">TID</option>
                <option value="QID">QID</option>
                <option value="Q4H">Q4H</option>
                <option value="Q6H">Q6H</option>
                <option value="Q8H">Q8H</option>
                <option value="Q12H">Q12H</option>
                <option value="QHS">QHS (at bedtime)</option>
                <option value="PRN">PRN</option>
                <option value="Weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Duration</label>
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g., 7 days, 2 weeks"
                className="h-9"
                data-testid="medication-duration-input"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Instructions</label>
              <Input
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., Take with food"
                className="h-9"
                data-testid="medication-instructions-input"
              />
            </div>
          </div>
        )}

        {selectedMed && (
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            disabled={!dose}
            className="w-full"
            data-testid="medication-add-button"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Medication
          </Button>
        )}
      </div>
    </div>
  );
}
