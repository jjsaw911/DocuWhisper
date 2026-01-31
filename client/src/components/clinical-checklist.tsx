import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Check, RotateCcw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistOption {
  id: string;
  label: string;
}

interface ChecklistSection {
  label: string;
  normal: string;
  options: ChecklistOption[];
}

interface ClinicalChecklistProps {
  title: string;
  icon?: React.ReactNode;
  sections: Record<string, ChecklistSection>;
  checklist: Record<string, string[]>;
  onChecklistChange: (checklist: Record<string, string[]>) => void;
  testIdPrefix: string;
}

export function ClinicalChecklist({
  title,
  icon,
  sections,
  checklist,
  onChecklistChange,
  testIdPrefix,
}: ClinicalChecklistProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const handleCheckboxChange = (sectionKey: string, optionId: string, checked: boolean) => {
    const currentSection = checklist[sectionKey] || [];
    let newSection: string[];
    
    if (checked) {
      newSection = [...currentSection, optionId];
    } else {
      newSection = currentSection.filter((id) => id !== optionId);
    }

    const newChecklist = { ...checklist };
    if (newSection.length > 0) {
      newChecklist[sectionKey] = newSection;
    } else {
      delete newChecklist[sectionKey];
    }
    
    onChecklistChange(newChecklist);
  };

  const markSectionNormal = (sectionKey: string) => {
    const newChecklist = { ...checklist };
    newChecklist[sectionKey] = ["normal"];
    onChecklistChange(newChecklist);
  };

  const clearSection = (sectionKey: string) => {
    const newChecklist = { ...checklist };
    delete newChecklist[sectionKey];
    onChecklistChange(newChecklist);
  };

  const markAllNormal = () => {
    const newChecklist: Record<string, string[]> = {};
    Object.keys(sections).forEach((key) => {
      newChecklist[key] = ["normal"];
    });
    onChecklistChange(newChecklist);
  };

  const clearAll = () => {
    onChecklistChange({});
  };

  const getSectionSummary = (sectionKey: string): string => {
    const section = sections[sectionKey];
    const selected = checklist[sectionKey] || [];
    
    if (selected.length === 0) return "";
    if (selected.includes("normal")) return section.normal;
    
    const labels = selected
      .map((id) => section.options.find((opt) => opt.id === id)?.label)
      .filter(Boolean);
    return labels.join(", ");
  };

  const getSectionStatus = (sectionKey: string): "normal" | "abnormal" | "empty" => {
    const selected = checklist[sectionKey] || [];
    if (selected.length === 0) return "empty";
    if (selected.includes("normal")) return "normal";
    return "abnormal";
  };

  const filledCount = Object.keys(checklist).length;
  const totalCount = Object.keys(sections).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold">{title}</h3>
          <Badge variant="secondary" className="text-xs">
            {filledCount}/{totalCount} documented
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={markAllNormal}
            data-testid={`${testIdPrefix}-mark-all-normal`}
          >
            <Check className="h-3 w-3 mr-1" />
            All Normal
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            data-testid={`${testIdPrefix}-clear-all`}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      <Accordion type="multiple" value={expandedSections} onValueChange={setExpandedSections}>
        {Object.entries(sections).map(([sectionKey, section]) => {
          const status = getSectionStatus(sectionKey);
          const summary = getSectionSummary(sectionKey);
          const isNormal = checklist[sectionKey]?.includes("normal");
          
          return (
            <AccordionItem key={sectionKey} value={sectionKey} className="border rounded-md mb-2 px-3">
              <AccordionTrigger className="py-2 hover:no-underline">
                <div className="flex items-center gap-2 flex-1 text-left">
                  <span className={cn(
                    "font-medium",
                    status === "normal" && "text-green-600 dark:text-green-400",
                    status === "abnormal" && "text-amber-600 dark:text-amber-400"
                  )}>
                    {section.label}
                  </span>
                  {status !== "empty" && (
                    <Badge
                      variant={status === "normal" ? "default" : "secondary"}
                      className={cn(
                        "text-xs",
                        status === "normal" && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                        status === "abnormal" && "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                      )}
                    >
                      {status === "normal" ? "Normal" : "Findings"}
                    </Badge>
                  )}
                  {summary && status === "abnormal" && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {summary}
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={isNormal ? "default" : "outline"}
                      size="sm"
                      onClick={() => markSectionNormal(sectionKey)}
                      data-testid={`${testIdPrefix}-${sectionKey}-normal`}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Mark as Normal
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => clearSection(sectionKey)}
                      data-testid={`${testIdPrefix}-${sectionKey}-clear`}
                    >
                      Clear
                    </Button>
                  </div>
                  
                  {isNormal && (
                    <p className="text-sm text-green-600 dark:text-green-400 italic">
                      {section.normal}
                    </p>
                  )}
                  
                  {!isNormal && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {section.options.map((option) => {
                        const isChecked = (checklist[sectionKey] || []).includes(option.id);
                        return (
                          <label
                            key={option.id}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors hover-elevate overflow-visible",
                              isChecked
                                ? "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800"
                                : "border border-transparent"
                            )}
                            data-testid={`${testIdPrefix}-${sectionKey}-${option.id}`}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) =>
                                handleCheckboxChange(sectionKey, option.id, checked === true)
                              }
                            />
                            <span className={cn(
                              "text-sm",
                              isChecked && "font-medium text-amber-700 dark:text-amber-300"
                            )}>
                              {option.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

interface ChecklistSummaryProps {
  title: string;
  sections: Record<string, ChecklistSection>;
  checklist: Record<string, string[]>;
}

export function ChecklistSummary({ title, sections, checklist }: ChecklistSummaryProps) {
  if (Object.keys(checklist).length === 0) {
    return <p className="text-sm text-muted-foreground">Not documented</p>;
  }

  return (
    <div className="space-y-1">
      {Object.entries(checklist).map(([sectionKey, selected]) => {
        const section = sections[sectionKey];
        if (!section) return null;
        
        const isNormal = selected.includes("normal");
        const labels = isNormal
          ? section.normal
          : selected
              .map((id) => section.options.find((opt) => opt.id === id)?.label)
              .filter(Boolean)
              .join(", ");

        return (
          <div key={sectionKey} className="text-sm">
            <span className="font-medium">{section.label}:</span>{" "}
            <span className={cn(
              isNormal ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
            )}>
              {labels}
            </span>
          </div>
        );
      })}
    </div>
  );
}
