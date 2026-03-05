import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { rosOptions, peOptions, icd10Codes, cptCodes, medicationDatabase } from "@/lib/clinical-data";
import type { DiagnosisCode, ProcedureCode, MedicationEntry, RosChecklist, PeChecklist } from "@/lib/clinical-data";
import { ClinicalAutocomplete, MedicationAutocomplete } from "@/components/clinical-autocomplete";
import { ClinicalChecklist } from "@/components/clinical-checklist";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import {
  FileText,
  AlertCircle,
  Pill,
  Activity,
  Stethoscope,
  Clock,
  ClipboardList,
  Loader2,
  Edit,
  Brain,
  X,
  Check,
  PenLine,
  Unlock,
  Trash2,
} from "lucide-react";
import type { Note, PatientEncounter } from "@shared/schema";
import type { UseFormReturn } from "react-hook-form";

export const encounterFormSchema = z.object({
  encounterType: z.string().default("office_visit"),
  chiefComplaint: z.string().optional(),
  hpiOnset: z.string().optional(),
  hpiLocation: z.string().optional(),
  hpiDuration: z.string().optional(),
  hpiCharacter: z.string().optional(),
  hpiAggravating: z.string().optional(),
  hpiRelieving: z.string().optional(),
  hpiTiming: z.string().optional(),
  hpiSeverity: z.string().optional(),
  hpiAssociatedSymptoms: z.string().optional(),
  hpiContext: z.string().optional(),
  hpiNarrative: z.string().optional(),
  rosConstitutional: z.string().optional(),
  rosEyes: z.string().optional(),
  rosEnt: z.string().optional(),
  rosCardiovascular: z.string().optional(),
  rosRespiratory: z.string().optional(),
  rosGastrointestinal: z.string().optional(),
  rosGenitourinary: z.string().optional(),
  rosMusculoskeletal: z.string().optional(),
  rosSkin: z.string().optional(),
  rosNeurological: z.string().optional(),
  rosPsychiatric: z.string().optional(),
  rosEndocrine: z.string().optional(),
  rosHematologic: z.string().optional(),
  rosAllergic: z.string().optional(),
  peGeneral: z.string().optional(),
  peVitals: z.string().optional(),
  peHead: z.string().optional(),
  peEyes: z.string().optional(),
  peEnt: z.string().optional(),
  peNeck: z.string().optional(),
  peChest: z.string().optional(),
  peLungs: z.string().optional(),
  peHeart: z.string().optional(),
  peAbdomen: z.string().optional(),
  peBack: z.string().optional(),
  peExtremities: z.string().optional(),
  peSkin: z.string().optional(),
  peNeurological: z.string().optional(),
  pePsychiatric: z.string().optional(),
  assessmentSummary: z.string().optional(),
  planSummary: z.string().optional(),
  rosChecklist: z.string().optional(),
  peChecklist: z.string().optional(),
  diagnosisCodes: z.string().optional(),
  procedureCodes: z.string().optional(),
  medications: z.string().optional(),
});

export type EncounterFormData = z.infer<typeof encounterFormSchema>;

interface EncounterDialogsProps {
  showEncounterDialog: boolean;
  setShowEncounterDialog: (open: boolean) => void;
  viewingEncounter: PatientEncounter | null;
  setViewingEncounter: (e: PatientEncounter | null) => void;
  editingEncounter: PatientEncounter | null;
  setEditingEncounter: (e: PatientEncounter | null) => void;
  encounterForm: UseFormReturn<EncounterFormData>;
  editEncounterForm: UseFormReturn<EncounterFormData>;
  createEncounterMutation: any;
  updateEncounterMutation: any;
  signEncounterMutation: any;
  deleteEncounterMutation: any;
  reopenEncounterMutation: any;
  cosignEncounterMutation: any;
  canCosign: boolean;
  patientNotes: Note[];
  rosChecklist: RosChecklist;
  setRosChecklist: (r: RosChecklist) => void;
  peChecklist: PeChecklist;
  setPeChecklist: (p: PeChecklist) => void;
  diagnosisCodes: DiagnosisCode[];
  setDiagnosisCodes: (d: DiagnosisCode[]) => void;
  procedureCodes: ProcedureCode[];
  setProcedureCodes: (p: ProcedureCode[]) => void;
  medications: MedicationEntry[];
  setMedications: (m: MedicationEntry[]) => void;
  formatDate: (date: Date | string | null | undefined) => string;
  formatDateTime: (date: Date | string | null | undefined) => string;
}

export default function EncounterDialogs({
  showEncounterDialog,
  setShowEncounterDialog,
  viewingEncounter,
  setViewingEncounter,
  editingEncounter,
  setEditingEncounter,
  encounterForm,
  editEncounterForm,
  createEncounterMutation,
  updateEncounterMutation,
  signEncounterMutation,
  deleteEncounterMutation,
  reopenEncounterMutation,
  cosignEncounterMutation,
  canCosign,
  patientNotes,
  rosChecklist,
  setRosChecklist,
  peChecklist,
  setPeChecklist,
  diagnosisCodes,
  setDiagnosisCodes,
  procedureCodes,
  setProcedureCodes,
  medications,
  setMedications,
  formatDate,
  formatDateTime,
}: EncounterDialogsProps) {
  const { toast } = useToast();

  return (
    <>
      {/* New Encounter Dialog */}
      <Dialog open={showEncounterDialog} onOpenChange={setShowEncounterDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              New Clinical Encounter
            </DialogTitle>
            <DialogDescription>
              Document HPI, Review of Systems, and Physical Examination
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 pr-2">
            <Form {...encounterForm}>
              <form className="space-y-6 pb-4">
                {/* Encounter Type */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Encounter Type</h3>
                  </div>
                  <FormField
                    control={encounterForm.control}
                    name="encounterType"
                    render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-encounter-type">
                              <SelectValue placeholder="Select encounter type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="office_visit">Office Visit</SelectItem>
                            <SelectItem value="telehealth">Telehealth</SelectItem>
                            <SelectItem value="phone">Phone Consultation</SelectItem>
                            <SelectItem value="follow_up">Follow Up</SelectItem>
                            <SelectItem value="urgent">Urgent Care</SelectItem>
                            <SelectItem value="annual_physical">Annual Physical</SelectItem>
                            <SelectItem value="procedure">Procedure</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* Chief Complaint */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold">Chief Complaint</h3>
                    </div>
                    {patientNotes.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const apSection = document.querySelector('[data-testid="select-import-soap"]');
                          if (apSection) {
                            apSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        data-testid="button-import-soap-shortcut"
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Import from SOAP Note
                      </Button>
                    )}
                  </div>
                  <FormField
                    control={encounterForm.control}
                    name="chiefComplaint"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Patient's primary reason for visit..."
                            className="min-h-[80px]"
                            data-testid="input-chief-complaint"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* HPI Section */}
                <Accordion type="single" collapsible defaultValue="hpi">
                  <AccordionItem value="hpi">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-semibold">History of Present Illness (HPI)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={encounterForm.control}
                          name="hpiOnset"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Onset</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="When did symptoms start?" data-testid="input-hpi-onset" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiLocation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Location</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Where is the problem?" data-testid="input-hpi-location" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiDuration"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Duration</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="How long has this been going on?" data-testid="input-hpi-duration" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiCharacter"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Character/Quality</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Describe the symptom quality" data-testid="input-hpi-character" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiAggravating"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Aggravating Factors</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="What makes it worse?" data-testid="input-hpi-aggravating" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiRelieving"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Relieving Factors</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="What makes it better?" data-testid="input-hpi-relieving" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiTiming"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Timing</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="When does it occur?" data-testid="input-hpi-timing" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiSeverity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Severity (1-10)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Rate 1-10" data-testid="input-hpi-severity" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={encounterForm.control}
                        name="hpiAssociatedSymptoms"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Associated Symptoms</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Other symptoms present..." data-testid="input-hpi-associated" className="min-h-[60px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={encounterForm.control}
                        name="hpiContext"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Context</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Social/environmental context..." data-testid="input-hpi-context" className="min-h-[60px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={encounterForm.control}
                        name="hpiNarrative"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Narrative HPI</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Free-text HPI narrative..." data-testid="input-hpi-narrative" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* ROS Section */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="ros">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        <span className="font-semibold">Review of Systems (ROS)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={encounterForm.control}
                          name="rosConstitutional"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Constitutional</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Fever, weight loss, fatigue..." data-testid="input-ros-constitutional" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosEyes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Eyes</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Vision changes, pain..." data-testid="input-ros-eyes" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosEnt"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ENT</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Ears, nose, throat..." data-testid="input-ros-ent" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosCardiovascular"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cardiovascular</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Chest pain, palpitations..." data-testid="input-ros-cv" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosRespiratory"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Respiratory</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Cough, shortness of breath..." data-testid="input-ros-resp" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosGastrointestinal"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Gastrointestinal</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Nausea, abdominal pain..." data-testid="input-ros-gi" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosGenitourinary"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Genitourinary</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Urinary symptoms..." data-testid="input-ros-gu" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosMusculoskeletal"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Musculoskeletal</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Joint pain, stiffness..." data-testid="input-ros-msk" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosSkin"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Skin</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Rashes, lesions..." data-testid="input-ros-skin" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosNeurological"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Neurological</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Headache, numbness..." data-testid="input-ros-neuro" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosPsychiatric"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Psychiatric</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Anxiety, depression..." data-testid="input-ros-psych" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosEndocrine"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Endocrine</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Thyroid, diabetes..." data-testid="input-ros-endo" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosHematologic"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Hematologic/Lymphatic</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Bruising, bleeding..." data-testid="input-ros-heme" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosAllergic"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Allergic/Immunologic</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Allergies, immune issues..." data-testid="input-ros-allergy" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Physical Exam Section */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="pe">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Stethoscope className="h-4 w-4 text-primary" />
                        <span className="font-semibold">Physical Examination</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={encounterForm.control}
                          name="peGeneral"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>General Appearance</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Alert, well-appearing..." data-testid="input-pe-general" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peVitals"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Vital Signs Summary</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="BP, HR, RR, Temp..." data-testid="input-pe-vitals" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peHead"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Head</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Normocephalic, atraumatic..." data-testid="input-pe-head" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peEyes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Eyes</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="PERRLA, EOM intact..." data-testid="input-pe-eyes" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peEnt"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ENT</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="TMs clear, pharynx normal..." data-testid="input-pe-ent" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peNeck"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Neck</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Supple, no LAD..." data-testid="input-pe-neck" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peChest"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Chest/Breast</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="No deformity..." data-testid="input-pe-chest" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peLungs"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Lungs</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="CTAB, no wheezes/rales..." data-testid="input-pe-lungs" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peHeart"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Heart</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="RRR, no murmurs..." data-testid="input-pe-heart" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peAbdomen"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Abdomen</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Soft, non-tender..." data-testid="input-pe-abdomen" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peBack"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Back</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="No CVA tenderness..." data-testid="input-pe-back" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peExtremities"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Extremities</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="No edema, pulses intact..." data-testid="input-pe-extremities" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peSkin"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Skin</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Warm, dry, no rashes..." data-testid="input-pe-skin" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peNeurological"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Neurological</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="A&O x3, CN II-XII intact..." data-testid="input-pe-neuro" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="pePsychiatric"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Psychiatric</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Mood/affect appropriate..." data-testid="input-pe-psych" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <Separator />

                {/* ROS Checkboxes */}
                <ClinicalChecklist
                  title="Review of Systems (Checkboxes)"
                  icon={<ClipboardList className="h-4 w-4 text-primary" />}
                  sections={rosOptions}
                  checklist={rosChecklist}
                  onChecklistChange={setRosChecklist}
                  testIdPrefix="ros-checklist"
                />

                <Separator />

                {/* PE Checkboxes */}
                <ClinicalChecklist
                  title="Physical Exam (Checkboxes)"
                  icon={<Stethoscope className="h-4 w-4 text-primary" />}
                  sections={peOptions}
                  checklist={peChecklist}
                  onChecklistChange={setPeChecklist}
                  testIdPrefix="pe-checklist"
                />

                <Separator />

                {/* Diagnosis Codes (ICD-10) */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Diagnosis Codes (ICD-10)</h3>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {diagnosisCodes.map((dx, index) => (
                      <Badge
                        key={index}
                        variant={dx.isPrimary ? "default" : "secondary"}
                        className="flex items-center gap-1 pr-1 cursor-pointer"
                        onClick={() => {
                          const updated = diagnosisCodes.map((d, i) => ({
                            ...d,
                            isPrimary: i === index
                          }));
                          setDiagnosisCodes(updated);
                        }}
                        data-testid={`icd10-selected-${index}`}
                      >
                        <span className="font-mono font-medium">{dx.code}</span>
                        <span className="max-w-[180px] truncate">- {dx.description}</span>
                        {dx.isPrimary && <span className="text-xs ml-1">(Primary)</span>}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 ml-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDiagnosisCodes(diagnosisCodes.filter((_, i) => i !== index));
                          }}
                          data-testid={`icd10-remove-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                  <ClinicalAutocomplete
                    items={icd10Codes}
                    selectedItems={diagnosisCodes.map(d => ({ code: d.code, description: d.description }))}
                    onSelect={(item) => setDiagnosisCodes([...diagnosisCodes, { ...item, isPrimary: diagnosisCodes.length === 0 }])}
                    onRemove={(index) => setDiagnosisCodes(diagnosisCodes.filter((_, i) => i !== index))}
                    placeholder="Search ICD-10 codes..."
                    searchFields={["code", "description"]}
                    displayField="description"
                    secondaryField="description"
                    testIdPrefix="icd10"
                  />
                  {diagnosisCodes.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Click on a diagnosis to mark it as primary. First added is primary by default.
                    </p>
                  )}
                </div>

                <Separator />

                {/* Procedure Codes (CPT) */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Procedure Codes (CPT)</h3>
                  </div>
                  <ClinicalAutocomplete
                    items={cptCodes}
                    selectedItems={procedureCodes}
                    onSelect={(item) => setProcedureCodes([...procedureCodes, item])}
                    onRemove={(index) => setProcedureCodes(procedureCodes.filter((_, i) => i !== index))}
                    placeholder="Search CPT codes..."
                    searchFields={["code", "description"]}
                    displayField="description"
                    secondaryField="description"
                    testIdPrefix="cpt"
                  />
                </div>

                <Separator />

                {/* Medications */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Medications</h3>
                  </div>
                  <MedicationAutocomplete
                    medications={medicationDatabase}
                    selectedMedications={medications}
                    onAdd={(med) => setMedications([...medications, med])}
                    onRemove={(index) => setMedications(medications.filter((_, i) => i !== index))}
                    onUpdate={(index, med) => {
                      const updated = [...medications];
                      updated[index] = med;
                      setMedications(updated);
                    }}
                  />
                </div>

                <Separator />

                {/* Assessment & Plan */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="ap">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <PenLine className="h-4 w-4" />
                        <span className="font-semibold">Assessment & Plan</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      {/* Pull from SOAP Note */}
                      {patientNotes.length > 0 && (
                        <div className="p-3 border rounded-md bg-muted/30">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-4 w-4" />
                            <span className="text-sm font-medium">Pull from SOAP Note (Scribe)</span>
                          </div>
                          <Select 
                            onValueChange={(noteId) => {
                              const note = patientNotes.find(n => n.id.toString() === noteId);
                              if (note) {
                                if (note.title) {
                                  encounterForm.setValue('chiefComplaint', note.title);
                                }
                                if (note.subjective) {
                                  encounterForm.setValue('hpiNarrative', note.subjective);
                                }
                                if (note.assessment) {
                                  encounterForm.setValue('assessmentSummary', note.assessment);
                                }
                                if (note.plan) {
                                  encounterForm.setValue('planSummary', note.plan);
                                }
                                if (note.icdCodes) {
                                  try {
                                    const parsed = JSON.parse(note.icdCodes);
                                    if (Array.isArray(parsed)) {
                                      setDiagnosisCodes(parsed);
                                    }
                                  } catch {
                                  }
                                }
                                toast({
                                  title: "Imported from SOAP Note",
                                  description: "Chief Complaint, HPI, Assessment, Plan, and ICD codes imported",
                                });
                              }
                            }}
                          >
                            <SelectTrigger data-testid="select-import-soap">
                              <SelectValue placeholder="Select a SOAP note to import from..." />
                            </SelectTrigger>
                            <SelectContent>
                              {patientNotes.map((note) => (
                                <SelectItem key={note.id} value={note.id.toString()} data-testid={`select-import-soap-option-${note.id}`}>
                                  {note.title || "Untitled"} - {new Date(note.createdAt).toLocaleDateString()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-2">
                            This will import Chief Complaint, HPI, Assessment, Plan, and ICD codes from the selected scribe note.
                          </p>
                        </div>
                      )}
                      <FormField
                        control={encounterForm.control}
                        name="assessmentSummary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Assessment Summary</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Clinical impression, diagnosis..." data-testid="input-assessment" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={encounterForm.control}
                        name="planSummary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Plan Summary</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Treatment plan, follow-up..." data-testid="input-plan" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </form>
            </Form>
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setShowEncounterDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={encounterForm.handleSubmit((data) => createEncounterMutation.mutate(data))}
              disabled={createEncounterMutation.isPending}
              data-testid="button-save-encounter"
            >
              {createEncounterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Encounter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Encounter Dialog */}
      <Dialog open={!!viewingEncounter} onOpenChange={(open) => !open && setViewingEncounter(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              Clinical Encounter - {viewingEncounter && formatDate(viewingEncounter.encounterDate)}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 flex-wrap">
              <Badge variant={viewingEncounter?.status === "signed" ? "default" : viewingEncounter?.status === "pending_cosign" ? "outline" : "secondary"}>
                {viewingEncounter?.status === "signed" ? "Signed" : viewingEncounter?.status === "pending_cosign" ? "Awaiting Co-sign" : viewingEncounter?.status === "completed" ? "Completed" : "In Progress"}
              </Badge>
              <Badge variant="outline">{viewingEncounter?.encounterType?.replace("_", " ") || "Office Visit"}</Badge>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 pr-2">
            {viewingEncounter && (
              <div className="space-y-6 pb-4">
                {/* Chief Complaint */}
                {viewingEncounter.chiefComplaint && (
                  <div className="space-y-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      Chief Complaint
                    </h3>
                    <p className="text-sm bg-muted p-3 rounded-md">{viewingEncounter.chiefComplaint}</p>
                  </div>
                )}

                {/* HPI */}
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    History of Present Illness
                  </h3>
                  <div className="bg-muted p-4 rounded-md space-y-3">
                    {viewingEncounter.hpiNarrative && (
                      <div>
                        <span className="font-medium text-sm">Narrative: </span>
                        <span className="text-sm">{viewingEncounter.hpiNarrative}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {viewingEncounter.hpiOnset && (
                        <div><span className="font-medium">Onset:</span> {viewingEncounter.hpiOnset}</div>
                      )}
                      {viewingEncounter.hpiLocation && (
                        <div><span className="font-medium">Location:</span> {viewingEncounter.hpiLocation}</div>
                      )}
                      {viewingEncounter.hpiDuration && (
                        <div><span className="font-medium">Duration:</span> {viewingEncounter.hpiDuration}</div>
                      )}
                      {viewingEncounter.hpiCharacter && (
                        <div><span className="font-medium">Character:</span> {viewingEncounter.hpiCharacter}</div>
                      )}
                      {viewingEncounter.hpiAggravating && (
                        <div><span className="font-medium">Aggravating:</span> {viewingEncounter.hpiAggravating}</div>
                      )}
                      {viewingEncounter.hpiRelieving && (
                        <div><span className="font-medium">Relieving:</span> {viewingEncounter.hpiRelieving}</div>
                      )}
                      {viewingEncounter.hpiTiming && (
                        <div><span className="font-medium">Timing:</span> {viewingEncounter.hpiTiming}</div>
                      )}
                      {viewingEncounter.hpiSeverity && (
                        <div><span className="font-medium">Severity:</span> {viewingEncounter.hpiSeverity}</div>
                      )}
                    </div>
                    {viewingEncounter.hpiAssociatedSymptoms && (
                      <div className="text-sm">
                        <span className="font-medium">Associated Symptoms:</span> {viewingEncounter.hpiAssociatedSymptoms}
                      </div>
                    )}
                    {viewingEncounter.hpiContext && (
                      <div className="text-sm">
                        <span className="font-medium">Context:</span> {viewingEncounter.hpiContext}
                      </div>
                    )}
                    {!viewingEncounter.hpiNarrative && !viewingEncounter.hpiOnset && (
                      <p className="text-sm text-muted-foreground">No HPI documented</p>
                    )}
                  </div>
                </div>

                {/* ROS - Display both checklist and text data */}
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Review of Systems
                  </h3>
                  <div className="bg-muted p-4 rounded-md space-y-3">
                    {/* ROS Checklist Data */}
                    {viewingEncounter.rosChecklist && (() => {
                      try {
                        const checklist: RosChecklist = typeof viewingEncounter.rosChecklist === 'string' 
                          ? JSON.parse(viewingEncounter.rosChecklist) 
                          : viewingEncounter.rosChecklist;
                        const sections = Object.entries(checklist).filter(([_, items]) => items && items.length > 0);
                        if (sections.length === 0) {
                          return <p className="text-sm text-muted-foreground">No ROS documented</p>;
                        }
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {sections.map(([key, items]) => {
                              const sectionConfig = rosOptions[key as keyof typeof rosOptions];
                              if (!sectionConfig) return null;
                              const isNormal = items.includes('_normal');
                              const findings = items.filter((id: string) => id !== '_normal');
                              const findingLabels = findings.map((id: string) => {
                                const option = sectionConfig.options.find(o => o.id === id);
                                return option?.label || id;
                              });
                              return (
                                <div key={key} className="text-sm">
                                  <span className="font-medium">{sectionConfig.label}: </span>
                                  {isNormal ? (
                                    <span className="text-green-600 dark:text-green-400">{sectionConfig.normal}</span>
                                  ) : findingLabels.length > 0 ? (
                                    <span className="text-amber-600 dark:text-amber-400">Positive for {findingLabels.join(', ')}</span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        );
                      } catch { return <p className="text-sm text-muted-foreground">No ROS documented</p>; }
                    })()}
                    {/* Fallback to text-based ROS fields */}
                    {!viewingEncounter.rosChecklist && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        {viewingEncounter.rosConstitutional && (
                          <div><span className="font-medium">Constitutional:</span> {viewingEncounter.rosConstitutional}</div>
                        )}
                        {viewingEncounter.rosCardiovascular && (
                          <div><span className="font-medium">Cardiovascular:</span> {viewingEncounter.rosCardiovascular}</div>
                        )}
                        {viewingEncounter.rosRespiratory && (
                          <div><span className="font-medium">Respiratory:</span> {viewingEncounter.rosRespiratory}</div>
                        )}
                        {viewingEncounter.rosGastrointestinal && (
                          <div><span className="font-medium">GI:</span> {viewingEncounter.rosGastrointestinal}</div>
                        )}
                        {!viewingEncounter.rosConstitutional && !viewingEncounter.rosCardiovascular && (
                          <p className="text-muted-foreground">No ROS documented</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Physical Exam - Display both checklist and text data */}
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Stethoscope className="h-4 w-4" />
                    Physical Examination
                  </h3>
                  <div className="bg-muted p-4 rounded-md space-y-3">
                    {/* PE Checklist Data */}
                    {viewingEncounter.peChecklist && (() => {
                      try {
                        const checklist: PeChecklist = typeof viewingEncounter.peChecklist === 'string' 
                          ? JSON.parse(viewingEncounter.peChecklist) 
                          : viewingEncounter.peChecklist;
                        const sections = Object.entries(checklist).filter(([_, items]) => items && items.length > 0);
                        if (sections.length === 0) {
                          return <p className="text-sm text-muted-foreground">No physical exam documented</p>;
                        }
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {sections.map(([key, items]) => {
                              const sectionConfig = peOptions[key as keyof typeof peOptions];
                              if (!sectionConfig) return null;
                              const isNormal = items.includes('_normal');
                              const findings = items.filter((id: string) => id !== '_normal');
                              const findingLabels = findings.map((id: string) => {
                                const option = sectionConfig.options.find(o => o.id === id);
                                return option?.label || id;
                              });
                              return (
                                <div key={key} className="text-sm">
                                  <span className="font-medium">{sectionConfig.label}: </span>
                                  {isNormal ? (
                                    <span className="text-green-600 dark:text-green-400">{sectionConfig.normal}</span>
                                  ) : findingLabels.length > 0 ? (
                                    <span>{findingLabels.join(', ')}</span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        );
                      } catch { return <p className="text-sm text-muted-foreground">No physical exam documented</p>; }
                    })()}
                    {/* Fallback to text-based PE fields */}
                    {!viewingEncounter.peChecklist && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        {viewingEncounter.peGeneral && (
                          <div><span className="font-medium">General:</span> {viewingEncounter.peGeneral}</div>
                        )}
                        {viewingEncounter.peHeart && (
                          <div><span className="font-medium">Heart:</span> {viewingEncounter.peHeart}</div>
                        )}
                        {viewingEncounter.peLungs && (
                          <div><span className="font-medium">Lungs:</span> {viewingEncounter.peLungs}</div>
                        )}
                        {viewingEncounter.peAbdomen && (
                          <div><span className="font-medium">Abdomen:</span> {viewingEncounter.peAbdomen}</div>
                        )}
                        {!viewingEncounter.peGeneral && !viewingEncounter.peHeart && (
                          <p className="text-muted-foreground">No physical exam documented</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Diagnosis Codes (ICD-10) */}
                {viewingEncounter.diagnosisCodes && (() => {
                  try {
                    const codes: DiagnosisCode[] = typeof viewingEncounter.diagnosisCodes === 'string' 
                      ? JSON.parse(viewingEncounter.diagnosisCodes) 
                      : viewingEncounter.diagnosisCodes;
                    if (!codes || codes.length === 0) return null;
                    return (
                      <div className="space-y-2">
                        <h3 className="font-semibold flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Diagnosis Codes (ICD-10)
                        </h3>
                        <div className="bg-muted p-4 rounded-md">
                          <div className="flex flex-wrap gap-2">
                            {codes.map((dx, index) => (
                              <Badge 
                                key={index} 
                                variant={dx.isPrimary ? "default" : "secondary"}
                                className="text-sm py-1"
                              >
                                <span className="font-mono font-medium">{dx.code}</span>
                                <span className="ml-1">- {dx.description}</span>
                                {dx.isPrimary && <span className="ml-1 text-xs">(Primary)</span>}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  } catch { return null; }
                })()}

                {/* Procedure Codes (CPT) */}
                {viewingEncounter.procedureCodes && (() => {
                  try {
                    const codes: ProcedureCode[] = typeof viewingEncounter.procedureCodes === 'string' 
                      ? JSON.parse(viewingEncounter.procedureCodes) 
                      : viewingEncounter.procedureCodes;
                    if (!codes || codes.length === 0) return null;
                    return (
                      <div className="space-y-2">
                        <h3 className="font-semibold flex items-center gap-2">
                          <ClipboardList className="h-4 w-4" />
                          Procedure Codes (CPT)
                        </h3>
                        <div className="bg-muted p-4 rounded-md">
                          <div className="flex flex-wrap gap-2">
                            {codes.map((proc, index) => (
                              <Badge key={index} variant="outline" className="text-sm py-1">
                                <span className="font-mono font-medium">{proc.code}</span>
                                <span className="ml-1">- {proc.description}</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  } catch { return null; }
                })()}

                {/* Medications */}
                {viewingEncounter.medications && (() => {
                  try {
                    const meds: MedicationEntry[] = typeof viewingEncounter.medications === 'string' 
                      ? JSON.parse(viewingEncounter.medications) 
                      : viewingEncounter.medications;
                    if (!meds || meds.length === 0) return null;
                    return (
                      <div className="space-y-2">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Pill className="h-4 w-4" />
                          Medications Prescribed
                        </h3>
                        <div className="bg-muted p-4 rounded-md">
                          <div className="space-y-3">
                            {meds.map((med, index) => (
                              <div key={index} className="border-b last:border-0 pb-2 last:pb-0">
                                <div className="font-medium">{med.name}</div>
                                <div className="text-sm text-muted-foreground grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                                  {med.dose && <span>Dose: {med.dose}</span>}
                                  {med.frequency && <span>Frequency: {med.frequency}</span>}
                                  {med.duration && <span>Duration: {med.duration}</span>}
                                  {med.dispenseQuantity && <span>Qty: {med.dispenseQuantity}</span>}
                                </div>
                                {med.instructions && (
                                  <div className="text-sm mt-1">Instructions: {med.instructions}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  } catch { return null; }
                })()}

                {/* Assessment & Plan */}
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-primary" />
                    Assessment & Plan
                  </h3>
                  <div className="bg-muted p-4 rounded-md space-y-3">
                    {viewingEncounter.assessmentSummary && (
                      <div>
                        <span className="font-medium text-sm">Assessment: </span>
                        <span className="text-sm">{viewingEncounter.assessmentSummary}</span>
                      </div>
                    )}
                    {viewingEncounter.planSummary && (
                      <div>
                        <span className="font-medium text-sm">Plan: </span>
                        <span className="text-sm">{viewingEncounter.planSummary}</span>
                      </div>
                    )}
                    {!viewingEncounter.assessmentSummary && !viewingEncounter.planSummary && (
                      <p className="text-sm text-muted-foreground">No assessment/plan documented</p>
                    )}
                  </div>
                </div>

                {/* Signature info */}
                {viewingEncounter.signedAt && (
                  <div className="text-sm text-muted-foreground border-t pt-4">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      Signed on {formatDateTime(viewingEncounter.signedAt)} by {viewingEncounter.signedBy}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="pt-4 border-t gap-2 flex-wrap">
            {viewingEncounter && viewingEncounter.status !== "signed" && (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Encounter?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this clinical encounter. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => viewingEncounter && deleteEncounterMutation.mutate(viewingEncounter.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button 
                  variant="outline"
                  onClick={() => {
                    if (viewingEncounter) {
                      setEditingEncounter(viewingEncounter);
                      setViewingEncounter(null);
                    }
                  }}
                  data-testid="button-open-edit-encounter"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Open to Edit
                </Button>
                <Button 
                  onClick={() => viewingEncounter && signEncounterMutation.mutate(viewingEncounter.id)}
                  disabled={signEncounterMutation.isPending}
                  data-testid="button-sign-encounter"
                >
                  {signEncounterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <PenLine className="h-4 w-4 mr-2" />
                  Sign & Finalize
                </Button>
              </>
            )}
            {viewingEncounter && viewingEncounter.status === "signed" && (
              <Button 
                variant="outline" 
                onClick={() => viewingEncounter && reopenEncounterMutation.mutate(viewingEncounter.id)}
                disabled={reopenEncounterMutation.isPending}
              >
                {reopenEncounterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Unlock className="h-4 w-4 mr-2" />
                Reopen for Editing
              </Button>
            )}
            {viewingEncounter && viewingEncounter.status === "pending_cosign" && canCosign && (
              <Button 
                onClick={() => viewingEncounter && cosignEncounterMutation.mutate(viewingEncounter.id)}
                disabled={cosignEncounterMutation.isPending}
                data-testid="button-cosign-encounter"
              >
                {cosignEncounterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <PenLine className="h-4 w-4 mr-2" />
                Co-sign & Finalize
              </Button>
            )}
            {viewingEncounter && viewingEncounter.status === "pending_cosign" && !canCosign && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Clock className="h-4 w-4" />
                Awaiting physician co-signature
              </div>
            )}
            <Button variant="outline" onClick={() => setViewingEncounter(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Encounter Dialog */}
      <Dialog open={!!editingEncounter} onOpenChange={(open) => !open && setEditingEncounter(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-primary" />
              Edit Clinical Encounter - {editingEncounter && formatDate(editingEncounter.encounterDate)}
            </DialogTitle>
            <DialogDescription>
              Update encounter documentation
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 pr-2">
            <Form {...editEncounterForm}>
              <form className="space-y-6 pb-4">
                {/* Encounter Type */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Encounter Type</h3>
                  </div>
                  <FormField
                    control={editEncounterForm.control}
                    name="encounterType"
                    render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="edit-select-encounter-type">
                              <SelectValue placeholder="Select encounter type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="office_visit">Office Visit</SelectItem>
                            <SelectItem value="telehealth">Telehealth</SelectItem>
                            <SelectItem value="phone">Phone Consultation</SelectItem>
                            <SelectItem value="follow_up">Follow Up</SelectItem>
                            <SelectItem value="urgent">Urgent Care</SelectItem>
                            <SelectItem value="annual_physical">Annual Physical</SelectItem>
                            <SelectItem value="procedure">Procedure</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* Chief Complaint */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Chief Complaint</h3>
                  </div>
                  <FormField
                    control={editEncounterForm.control}
                    name="chiefComplaint"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea {...field} placeholder="Patient's primary complaint..." data-testid="edit-input-chief-complaint" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* HPI */}
                <Accordion type="single" collapsible defaultValue="hpi" className="w-full">
                  <AccordionItem value="hpi">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-semibold">History of Present Illness (HPI)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <FormField
                        control={editEncounterForm.control}
                        name="hpiNarrative"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Narrative</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Free text description of the patient's history..." data-testid="edit-input-hpi-narrative" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={editEncounterForm.control}
                          name="hpiOnset"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Onset</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="When did it start?" data-testid="edit-input-hpi-onset" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={editEncounterForm.control}
                          name="hpiLocation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Location</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Where is the symptom?" data-testid="edit-input-hpi-location" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={editEncounterForm.control}
                          name="hpiDuration"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Duration</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="How long does it last?" data-testid="edit-input-hpi-duration" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={editEncounterForm.control}
                          name="hpiSeverity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Severity</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="How severe? (1-10)" data-testid="edit-input-hpi-severity" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <Separator />

                {/* Assessment & Plan */}
                <Accordion type="single" collapsible defaultValue="assessment" className="w-full">
                  <AccordionItem value="assessment">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        <span className="font-semibold">Assessment & Plan</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      {/* Pull from SOAP Note */}
                      {patientNotes.length > 0 && (
                        <div className="p-3 border rounded-md bg-muted/30">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-4 w-4" />
                            <span className="text-sm font-medium">Pull from SOAP Note (Scribe)</span>
                          </div>
                          <Select 
                            onValueChange={(noteId) => {
                              const note = patientNotes.find(n => n.id.toString() === noteId);
                              if (note) {
                                if (note.assessment) {
                                  editEncounterForm.setValue('assessmentSummary', note.assessment);
                                }
                                if (note.plan) {
                                  editEncounterForm.setValue('planSummary', note.plan);
                                }
                                toast({
                                  title: "Imported from SOAP Note",
                                  description: `Assessment and Plan pulled from "${note.title || 'Untitled'}"`,
                                });
                              }
                            }}
                          >
                            <SelectTrigger data-testid="edit-select-import-soap">
                              <SelectValue placeholder="Select a SOAP note to import from..." />
                            </SelectTrigger>
                            <SelectContent>
                              {patientNotes.map((note) => (
                                <SelectItem key={note.id} value={note.id.toString()} data-testid={`edit-select-import-soap-option-${note.id}`}>
                                  {note.title || "Untitled"} - {new Date(note.createdAt).toLocaleDateString()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-2">
                            This will import the Assessment and Plan sections from the selected scribe note.
                          </p>
                        </div>
                      )}
                      <FormField
                        control={editEncounterForm.control}
                        name="assessmentSummary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Assessment Summary</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Clinical impression, diagnosis..." data-testid="edit-input-assessment" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editEncounterForm.control}
                        name="planSummary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Plan Summary</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Treatment plan, follow-up..." data-testid="edit-input-plan" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </form>
            </Form>
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setEditingEncounter(null)}>
              Cancel
            </Button>
            <Button 
              onClick={editEncounterForm.handleSubmit((data) => {
                if (editingEncounter) {
                  updateEncounterMutation.mutate({ id: editingEncounter.id, data });
                }
              })}
              disabled={updateEncounterMutation.isPending}
              data-testid="button-save-edit-encounter"
            >
              {updateEncounterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
