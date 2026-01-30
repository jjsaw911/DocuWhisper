// Drug interaction database and detection system
// Contains common drug-drug interactions with severity levels

export type InteractionSeverity = "high" | "moderate" | "low";

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: InteractionSeverity;
  description: string;
  recommendation: string;
}

// Common drug-drug interactions database
export const drugInteractions: DrugInteraction[] = [
  // Anticoagulants
  {
    drug1: "warfarin",
    drug2: "aspirin",
    severity: "high",
    description: "Increased risk of bleeding when combined",
    recommendation: "Monitor closely for signs of bleeding. Consider alternative if possible."
  },
  {
    drug1: "warfarin",
    drug2: "ibuprofen",
    severity: "high",
    description: "NSAIDs increase bleeding risk with warfarin",
    recommendation: "Avoid combination. Use acetaminophen for pain instead."
  },
  {
    drug1: "warfarin",
    drug2: "naproxen",
    severity: "high",
    description: "NSAIDs increase bleeding risk with warfarin",
    recommendation: "Avoid combination. Use acetaminophen for pain instead."
  },
  {
    drug1: "warfarin",
    drug2: "fluoxetine",
    severity: "moderate",
    description: "SSRIs may increase warfarin effect and bleeding risk",
    recommendation: "Monitor INR more frequently when starting or stopping."
  },
  {
    drug1: "warfarin",
    drug2: "sertraline",
    severity: "moderate",
    description: "SSRIs may increase warfarin effect and bleeding risk",
    recommendation: "Monitor INR more frequently when starting or stopping."
  },
  
  // Cardiovascular
  {
    drug1: "lisinopril",
    drug2: "potassium",
    severity: "high",
    description: "ACE inhibitors with potassium can cause hyperkalemia",
    recommendation: "Monitor potassium levels closely. Avoid potassium supplements unless necessary."
  },
  {
    drug1: "lisinopril",
    drug2: "spironolactone",
    severity: "high",
    description: "Both drugs increase potassium levels",
    recommendation: "Monitor potassium levels closely. May need dose adjustment."
  },
  {
    drug1: "metoprolol",
    drug2: "verapamil",
    severity: "high",
    description: "Combined use can cause severe bradycardia and heart block",
    recommendation: "Avoid combination or use with extreme caution under monitoring."
  },
  {
    drug1: "metoprolol",
    drug2: "diltiazem",
    severity: "high",
    description: "Combined use can cause severe bradycardia",
    recommendation: "Use with caution. Monitor heart rate closely."
  },
  {
    drug1: "digoxin",
    drug2: "amiodarone",
    severity: "high",
    description: "Amiodarone increases digoxin levels significantly",
    recommendation: "Reduce digoxin dose by 50% when adding amiodarone."
  },
  {
    drug1: "digoxin",
    drug2: "verapamil",
    severity: "moderate",
    description: "Verapamil increases digoxin levels",
    recommendation: "Monitor digoxin levels and reduce dose if needed."
  },
  
  // Statins
  {
    drug1: "simvastatin",
    drug2: "amiodarone",
    severity: "high",
    description: "Increased risk of myopathy and rhabdomyolysis",
    recommendation: "Limit simvastatin to 10mg/day or use alternative statin."
  },
  {
    drug1: "simvastatin",
    drug2: "diltiazem",
    severity: "moderate",
    description: "Increased statin levels and myopathy risk",
    recommendation: "Limit simvastatin to 10mg/day."
  },
  {
    drug1: "atorvastatin",
    drug2: "clarithromycin",
    severity: "moderate",
    description: "Increased statin levels and myopathy risk",
    recommendation: "Consider temporarily stopping statin during antibiotic course."
  },
  
  // CNS/Sedatives
  {
    drug1: "lorazepam",
    drug2: "opioid",
    severity: "high",
    description: "Combined CNS depression, respiratory depression risk",
    recommendation: "Avoid combination if possible. Use lowest effective doses."
  },
  {
    drug1: "diazepam",
    drug2: "tramadol",
    severity: "high",
    description: "Increased sedation and respiratory depression risk",
    recommendation: "Avoid combination. Monitor closely if must be used together."
  },
  {
    drug1: "zolpidem",
    drug2: "lorazepam",
    severity: "moderate",
    description: "Additive CNS depression effects",
    recommendation: "Avoid concurrent use. Use one agent for sleep."
  },
  
  // Diabetes
  {
    drug1: "metformin",
    drug2: "contrast dye",
    severity: "high",
    description: "Risk of lactic acidosis with iodinated contrast",
    recommendation: "Hold metformin 48 hours before and after contrast procedures."
  },
  {
    drug1: "insulin",
    drug2: "beta-blocker",
    severity: "moderate",
    description: "Beta-blockers can mask hypoglycemia symptoms",
    recommendation: "Monitor blood glucose more frequently. Educate patient."
  },
  
  // Antibiotics
  {
    drug1: "ciprofloxacin",
    drug2: "tizanidine",
    severity: "high",
    description: "Ciprofloxacin dramatically increases tizanidine levels",
    recommendation: "Contraindicated combination. Use alternative antibiotic."
  },
  {
    drug1: "metronidazole",
    drug2: "alcohol",
    severity: "high",
    description: "Disulfiram-like reaction with alcohol",
    recommendation: "Avoid all alcohol during treatment and 3 days after."
  },
  {
    drug1: "azithromycin",
    drug2: "amiodarone",
    severity: "moderate",
    description: "Both can prolong QT interval",
    recommendation: "Monitor ECG. Consider alternative antibiotic."
  },
  
  // SSRIs/Antidepressants
  {
    drug1: "fluoxetine",
    drug2: "tramadol",
    severity: "high",
    description: "Risk of serotonin syndrome",
    recommendation: "Avoid combination. Use alternative pain medication."
  },
  {
    drug1: "sertraline",
    drug2: "tramadol",
    severity: "high",
    description: "Risk of serotonin syndrome",
    recommendation: "Avoid combination. Use alternative pain medication."
  },
  {
    drug1: "fluoxetine",
    drug2: "MAO inhibitor",
    severity: "high",
    description: "Severe serotonin syndrome risk",
    recommendation: "Contraindicated. Allow 5-week washout between drugs."
  },
  
  // Thyroid
  {
    drug1: "levothyroxine",
    drug2: "calcium",
    severity: "moderate",
    description: "Calcium reduces levothyroxine absorption",
    recommendation: "Separate administration by at least 4 hours."
  },
  {
    drug1: "levothyroxine",
    drug2: "omeprazole",
    severity: "moderate",
    description: "PPIs may reduce levothyroxine absorption",
    recommendation: "Monitor TSH. May need dose adjustment."
  }
];

// Normalize drug name for matching
function normalizeDrugName(name: string): string {
  return name.toLowerCase().trim();
}

// Extract medications from text
export function extractMedications(text: string): string[] {
  const commonDrugs = [
    "acetaminophen", "albuterol", "amlodipine", "amiodarone", "amoxicillin", 
    "aspirin", "atenolol", "atorvastatin", "azithromycin", "calcium",
    "carvedilol", "cephalexin", "ciprofloxacin", "clarithromycin", "clopidogrel",
    "contrast", "diazepam", "digoxin", "diltiazem", "doxycycline",
    "enalapril", "escitalopram", "fluoxetine", "furosemide", "gabapentin",
    "hydrochlorothiazide", "ibuprofen", "insulin", "levothyroxine", "lisinopril",
    "lorazepam", "losartan", "metformin", "metoprolol", "metronidazole",
    "naproxen", "omeprazole", "ondansetron", "opioid", "pantoprazole", 
    "potassium", "prednisone", "propranolol", "rosuvastatin", "sertraline", 
    "simvastatin", "spironolactone", "tizanidine", "tramadol", "trazodone",
    "verapamil", "warfarin", "zolpidem"
  ];
  
  const lowerText = text.toLowerCase();
  const found: string[] = [];
  
  for (const drug of commonDrugs) {
    // Match whole word
    const regex = new RegExp(`\\b${drug}\\b`, 'i');
    if (regex.test(lowerText)) {
      found.push(drug);
    }
  }
  
  return Array.from(new Set(found));
}

// Check for interactions between a list of medications
export function checkInteractions(medications: string[]): DrugInteraction[] {
  const normalizedMeds = medications.map(normalizeDrugName);
  const foundInteractions: DrugInteraction[] = [];
  
  // Check each pair of medications
  for (let i = 0; i < normalizedMeds.length; i++) {
    for (let j = i + 1; j < normalizedMeds.length; j++) {
      const med1 = normalizedMeds[i];
      const med2 = normalizedMeds[j];
      
      for (const interaction of drugInteractions) {
        const drug1Lower = normalizeDrugName(interaction.drug1);
        const drug2Lower = normalizeDrugName(interaction.drug2);
        
        // Check if this pair matches the interaction
        if ((med1.includes(drug1Lower) || drug1Lower.includes(med1)) &&
            (med2.includes(drug2Lower) || drug2Lower.includes(med2))) {
          foundInteractions.push(interaction);
        } else if ((med1.includes(drug2Lower) || drug2Lower.includes(med1)) &&
                   (med2.includes(drug1Lower) || drug1Lower.includes(med2))) {
          foundInteractions.push(interaction);
        }
      }
    }
  }
  
  return foundInteractions;
}

// Analyze text for drug interactions
export function analyzeTextForInteractions(text: string): {
  medications: string[];
  interactions: DrugInteraction[];
} {
  const medications = extractMedications(text);
  const interactions = checkInteractions(medications);
  
  return { medications, interactions };
}
