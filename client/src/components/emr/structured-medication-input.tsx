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
import { Pill, Plus, Trash2, Edit, Check, X } from "lucide-react";

interface MedicationEntry {
  name: string;
  dose: string;
  frequency: string;
  route: "oral" | "topical" | "injection" | "inhalation" | "other";
  startDate: string;
  status: "active" | "discontinued" | "on_hold";
  prescriber: string;
}

interface StructuredMedicationInputProps {
  value: string;
  onChange: (value: string) => void;
}

const emptyEntry: MedicationEntry = {
  name: "",
  dose: "",
  frequency: "",
  route: "oral",
  startDate: "",
  status: "active",
  prescriber: "",
};

const statusBadgeClasses: Record<MedicationEntry["status"], string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  discontinued: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  on_hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

const statusLabels: Record<MedicationEntry["status"], string> = {
  active: "Active",
  discontinued: "Discontinued",
  on_hold: "On Hold",
};

const routeLabels: Record<MedicationEntry["route"], string> = {
  oral: "Oral",
  topical: "Topical",
  injection: "Injection",
  inhalation: "Inhalation",
  other: "Other",
};

function tryParseMedications(value: string): { entries: MedicationEntry[] | null; isLegacy: boolean } {
  if (!value || value.trim() === "") {
    return { entries: [], isLegacy: false };
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return { entries: parsed as MedicationEntry[], isLegacy: false };
    }
    return { entries: null, isLegacy: true };
  } catch {
    return { entries: null, isLegacy: true };
  }
}

function convertLegacyToStructured(text: string): MedicationEntry[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      dose: "",
      frequency: "",
      route: "oral" as const,
      startDate: "",
      status: "active" as const,
      prescriber: "",
    }));
}

export function StructuredMedicationInput({ value, onChange }: StructuredMedicationInputProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<MedicationEntry>({ ...emptyEntry });

  const { entries, isLegacy } = tryParseMedications(value);

  const updateEntries = (updated: MedicationEntry[]) => {
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
              <Pill className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Legacy plain-text format detected</span>
            </div>
            <p className="text-sm" data-testid="text-legacy-medications">{value}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleConvert}
              data-testid="button-convert-medications"
            >
              Convert to structured
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const medList = entries || [];

  const renderForm = (onSave: () => void, onCancel: () => void, testPrefix: string) => (
    <Card>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[180px]">
            <Input
              placeholder="Medication name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              data-testid={`input-${testPrefix}-name`}
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <Input
              placeholder="Dose (e.g., 500mg)"
              value={formData.dose}
              onChange={(e) => setFormData({ ...formData, dose: e.target.value })}
              data-testid={`input-${testPrefix}-dose`}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[140px]">
            <Input
              placeholder="Frequency (e.g., BID)"
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
              data-testid={`input-${testPrefix}-frequency`}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Select
              value={formData.route}
              onValueChange={(v) => setFormData({ ...formData, route: v as MedicationEntry["route"] })}
            >
              <SelectTrigger data-testid={`select-${testPrefix}-route`}>
                <SelectValue placeholder="Route" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oral">Oral</SelectItem>
                <SelectItem value="topical">Topical</SelectItem>
                <SelectItem value="injection">Injection</SelectItem>
                <SelectItem value="inhalation">Inhalation</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[140px]">
            <Input
              type="date"
              placeholder="Start date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              data-testid={`input-${testPrefix}-start-date`}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Select
              value={formData.status}
              onValueChange={(v) => setFormData({ ...formData, status: v as MedicationEntry["status"] })}
            >
              <SelectTrigger data-testid={`select-${testPrefix}-status`}>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="discontinued">Discontinued</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Input
          placeholder="Prescriber"
          value={formData.prescriber}
          onChange={(e) => setFormData({ ...formData, prescriber: e.target.value })}
          data-testid={`input-${testPrefix}-prescriber`}
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
      {medList.length === 0 && !showAddForm && (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground" data-testid="text-no-medications">
          <Pill className="h-4 w-4" />
          No medications recorded. Add one below.
        </div>
      )}

      {medList.map((med, index) => (
        <div key={index}>
          {editingIndex === index ? (
            renderForm(handleEditSave, handleEditCancel, `edit-medication-${index}`)
          ) : (
            <Card data-testid={`card-medication-${index}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" data-testid={`text-medication-name-${index}`}>
                        {med.name}
                      </span>
                      {med.dose && (
                        <span className="text-sm text-muted-foreground" data-testid={`text-medication-dose-${index}`}>
                          {med.dose}
                        </span>
                      )}
                      <Badge
                        variant="secondary"
                        className={`text-xs no-default-hover-elevate no-default-active-elevate ${statusBadgeClasses[med.status]}`}
                        data-testid={`badge-medication-status-${index}`}
                      >
                        {statusLabels[med.status]}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {med.frequency && (
                        <span data-testid={`text-medication-frequency-${index}`}>{med.frequency}</span>
                      )}
                      {med.frequency && med.route && <span>&middot;</span>}
                      {med.route && (
                        <span data-testid={`text-medication-route-${index}`}>{routeLabels[med.route]}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {med.startDate && (
                        <span data-testid={`text-medication-start-date-${index}`}>Started: {med.startDate}</span>
                      )}
                      {med.prescriber && (
                        <span data-testid={`text-medication-prescriber-${index}`}>Prescribed by: {med.prescriber}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0" style={{ visibility: "visible" }}>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEditStart(index)}
                      data-testid={`button-edit-medication-${index}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(index)}
                      data-testid={`button-delete-medication-${index}`}
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

      {showAddForm && renderForm(handleAdd, () => { setShowAddForm(false); setFormData({ ...emptyEntry }); }, "add-medication")}

      {!showAddForm && editingIndex === null && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          data-testid="button-add-medication"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Medication
        </Button>
      )}
    </div>
  );
}