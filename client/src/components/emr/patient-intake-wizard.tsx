import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { User, Phone, Shield, Heart, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const patientIntakeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insurancePolicyNumber: z.string().optional(),
  allergies: z.string().optional(),
  medications: z.string().optional(),
  medicalHistory: z.string().optional(),
});

type PatientIntakeFormData = z.infer<typeof patientIntakeSchema>;

interface PatientIntakeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPatientCreated: (patient: any) => void;
  organizationId?: number | null;
}

const STEPS = [
  { label: "Demographics", icon: User },
  { label: "Contact", icon: Phone },
  { label: "Insurance", icon: Shield },
  { label: "Medical History", icon: Heart },
] as const;

export function PatientIntakeWizard({
  open,
  onOpenChange,
  onPatientCreated,
  organizationId,
}: PatientIntakeWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const { toast } = useToast();

  const form = useForm<PatientIntakeFormData>({
    resolver: zodResolver(patientIntakeSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gender: undefined,
      email: "",
      phone: "",
      address: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      insuranceProvider: "",
      insurancePolicyNumber: "",
      allergies: "",
      medications: "",
      medicalHistory: "",
    },
  });

  const createPatientMutation = useMutation({
    mutationFn: async (data: PatientIntakeFormData) => {
      const payload = organizationId ? { ...data, organizationId } : data;
      const response = await apiRequest("POST", "/api/emr/patients", payload);
      return response.json();
    },
    onSuccess: (patient) => {
      toast({
        title: "Patient created",
        description: "New patient record has been added successfully.",
      });
      onPatientCreated(patient);
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create patient",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setCurrentStep(0);
    form.reset();
    onOpenChange(false);
  };

  const isStep1Valid = () => {
    const firstName = form.watch("firstName");
    const lastName = form.watch("lastName");
    return firstName.trim().length > 0 && lastName.trim().length > 0;
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleCreate = () => {
    form.handleSubmit((data) => createPatientMutation.mutate(data))();
  };

  const isNextDisabled = currentStep === 0 && !isStep1Valid();

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); else onOpenChange(val); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Patient</DialogTitle>
          <DialogDescription>
            Complete the following steps to create a new patient record.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 mb-6" data-testid="steps-indicator">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            return (
              <div key={step.label} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1 gap-1">
                  <div
                    className={`flex items-center justify-center w-9 h-9 rounded-full border-2 transition-colors ${
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : isCompleted
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted-foreground/30 text-muted-foreground"
                    }`}
                    data-testid={`step-indicator-${index + 1}`}
                  >
                    <StepIcon className="h-4 w-4" />
                  </div>
                  <span
                    className={`text-xs font-medium text-center ${
                      isActive ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`h-0.5 w-full mt-[-1.25rem] mx-1 ${
                      isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
            {currentStep === 0 && (
              <div className="space-y-4" data-testid="step-demographics">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          First Name <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="John"
                            {...field}
                            data-testid="input-firstname"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Last Name <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Doe"
                            {...field}
                            data-testid="input-lastname"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of Birth</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            data-testid="input-dateofbirth"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-gender">
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                            <SelectItem value="prefer_not_to_say">
                              Prefer not to say
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-4" data-testid="step-contact">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="patient@example.com"
                          {...field}
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(555) 123-4567"
                          {...field}
                          data-testid="input-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="123 Main St, City, State ZIP"
                          {...field}
                          data-testid="input-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="emergencyContactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Emergency Contact</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Contact name"
                            {...field}
                            data-testid="input-emergencycontactname"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emergencyContactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Emergency Phone</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="(555) 987-6543"
                            {...field}
                            data-testid="input-emergencycontactphone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4" data-testid="step-insurance">
                <FormField
                  control={form.control}
                  name="insuranceProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Insurance Provider</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Blue Cross Blue Shield"
                          {...field}
                          data-testid="input-insuranceprovider"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="insurancePolicyNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Policy Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Policy or member ID"
                          {...field}
                          data-testid="input-insurancepolicynumber"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4" data-testid="step-medicalhistory">
                <FormField
                  control={form.control}
                  name="allergies"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allergies</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="List known allergies (e.g., Penicillin, Shellfish)"
                          className="resize-none"
                          rows={3}
                          {...field}
                          data-testid="input-allergies"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="medications"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Medications</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="List current medications and dosages"
                          className="resize-none"
                          rows={3}
                          {...field}
                          data-testid="input-medications"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="medicalHistory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Medical History</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Relevant medical history, past surgeries, chronic conditions"
                          className="resize-none"
                          rows={3}
                          {...field}
                          data-testid="input-medicalhistory"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0}
                data-testid="button-prev-step"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>

              <div className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {STEPS.length}
              </div>

              {currentStep < STEPS.length - 1 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={isNextDisabled}
                  data-testid="button-next-step"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleCreate}
                  disabled={createPatientMutation.isPending || !isStep1Valid()}
                  data-testid="button-create-patient"
                >
                  {createPatientMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Patient"
                  )}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}