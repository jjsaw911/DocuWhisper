import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Plus, Trash2, Edit, Check, X } from "lucide-react";

interface AllergyEntry {
  name: string;
  type: "drug" | "food" | "environmental" | "other";
  severity: "mild" | "moderate" | "severe";
  reaction: string;
}

interface StructuredAllergyInputProps {
  value: string;
  onChange: (value: string) => void;
}

const emptyEntry: AllergyEntry = {
  name: "",
  type: "drug",
  severity: "mild",
  reaction: "",
};

const typeBadgeClasses: Record<AllergyEntry["type"], string> = {
  drug: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  food: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  environmental: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const severityBadgeClasses: Record<AllergyEntry["severity"], string> = {
  mild: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  moderate: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  severe: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function tryParseAllergies(value: string): { entries: AllergyEntry[] | null; isLegacy: boolean } {
  if (!value || value.trim() === "") {
    return { entries: [], isLegacy: false };
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return { entries: parsed as AllergyEntry[], isLegacy: false };
    }
    return { entries: null, isLegacy: true };
  } catch {
    return { entries: null, isLegacy: true };
  }
}

function convertLegacyToStructured(text: string): AllergyEntry[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      type: "other" as const,
      severity: "moderate" as const,
      reaction: "",
    }));
}

export function StructuredAllergyInput({ value, onChange }: StructuredAllergyInputProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<AllergyEntry>({ ...emptyEntry });

  const { entries, isLegacy } = tryParseAllergies(value);

  const updateEntries = (updated: AllergyEntry[]) => {
    onChange(JSON.stringify(updated));
  };

  const handleConvert = () => {
    const structured = convertLegacyToStructured(value);
    updateEntries(structured);
  };

  const handleAdd = () => {
    if (!formData.name.trim()) return;
    const current = entries || [];
    updateEntries([...current, { ...formData }]);
    setFormData({ ...emptyEntry });
    setShowAddForm(false);
  };

  const handleDelete = (index: number) => {
    if (!entries) return;
    const updated = entries.filter((_, i) => i !== index);
    updateEntries(updated);
  };

  const handleEditStart = (index: number) => {
    if (!entries) return;
    setEditingIndex(index);
    setFormData({ ...entries[index] });
  };

  const handleEditSave = () => {
    if (editingIndex === null || !entries || !formData.name.trim()) return;
    const updated = [...entries];
    updated[editingIndex] = { ...formData };
    updateEntries(updated);
    setEditingIndex(null);
    setFormData({ ...emptyEntry });
  };

  const handleEditCancel = () => {
    setEditingIndex(null);
    setFormData({ ...emptyEntry });
  };

  if (isLegacy) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Legacy plain-text format detected</span>
            </div>
            <p className="text-sm" data-testid="text-legacy-allergies">{value}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleConvert}
              data-testid="button-convert-allergies"
            >
              Convert to structured
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const allergyList = entries || [];

  const renderForm = (onSave: () => void, onCancel: () => void, testPrefix: string) => (
    <Card>
      <CardContent className="p-4 flex flex-col gap-3">
        <Input
          placeholder="Allergy name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          data-testid={`input-${testPrefix}-name`}
        />
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[140px]">
            <Select
              value={formData.type}
              onValueChange={(v) => setFormData({ ...formData, type: v as AllergyEntry["type"] })}
            >
              <SelectTrigger data-testid={`select-${testPrefix}-type`}>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="drug">Drug</SelectItem>
                <SelectItem value="food">Food</SelectItem>
                <SelectItem value="environmental">Environmental</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <Select
              value={formData.severity}
              onValueChange={(v) => setFormData({ ...formData, severity: v as AllergyEntry["severity"] })}
            >
              <SelectTrigger data-testid={`select-${testPrefix}-severity`}>
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mild">Mild</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="severe">Severe</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Textarea
          placeholder="Reaction description"
          value={formData.reaction}
          onChange={(e) => setFormData({ ...formData, reaction: e.target.value })}
          data-testid={`input-${testPrefix}-reaction`}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onSave} data-testid={`button-${testPrefix}-save`}>
            <Check className="h-4 w-4 mr-1" />
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} data-testid={`button-${testPrefix}-cancel`}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-3">
      {allergyList.length === 0 && !showAddForm && (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground" data-testid="text-no-allergies">
          <AlertCircle className="h-4 w-4" />
          No allergies recorded. Add one below.
        </div>
      )}

      {allergyList.map((allergy, index) => (
        <div key={index}>
          {editingIndex === index ? (
            renderForm(handleEditSave, handleEditCancel, `edit-allergy-${index}`)
          ) : (
            <Card data-testid={`card-allergy-${index}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" data-testid={`text-allergy-name-${index}`}>
                        {allergy.name}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`text-xs no-default-hover-elevate no-default-active-elevate ${typeBadgeClasses[allergy.type]}`}
                        data-testid={`badge-allergy-type-${index}`}
                      >
                        {allergy.type}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`text-xs no-default-hover-elevate no-default-active-elevate ${severityBadgeClasses[allergy.severity]}`}
                        data-testid={`badge-allergy-severity-${index}`}
                      >
                        {allergy.severity}
                      </Badge>
                    </div>
                    {allergy.reaction && (
                      <span className="text-sm text-muted-foreground" data-testid={`text-allergy-reaction-${index}`}>
                        {allergy.reaction}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0" style={{ visibility: "visible" }}>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEditStart(index)}
                      data-testid={`button-edit-allergy-${index}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(index)}
                      data-testid={`button-delete-allergy-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ))}

      {showAddForm && renderForm(handleAdd, () => { setShowAddForm(false); setFormData({ ...emptyEntry }); }, "add-allergy")}

      {!showAddForm && editingIndex === null && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          data-testid="button-add-allergy"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Allergy
        </Button>
      )}
    </div>
  );
}