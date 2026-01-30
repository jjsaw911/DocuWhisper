// Medical terminology database for autocomplete
// Organized by category for efficient lookup

export const medicalTerms = {
  // Common symptoms
  symptoms: [
    "abdominal pain", "acute onset", "anxiety", "appetite loss", "arthralgia",
    "back pain", "blurred vision", "bradycardia", "breathing difficulty",
    "chest pain", "chills", "chronic fatigue", "confusion", "constipation", "cough",
    "dehydration", "diarrhea", "dizziness", "dyspnea", "dysuria",
    "edema", "epistaxis", "fatigue", "fever", "flushing",
    "headache", "hearing loss", "heartburn", "hematuria", "hemoptysis", "hypertension",
    "insomnia", "irritability", "itching", "jaundice", "joint pain", "joint stiffness",
    "lethargy", "loss of consciousness", "malaise", "memory loss", "muscle weakness",
    "nausea", "neck stiffness", "numbness", "orthopnea", "palpitations", "paresthesia",
    "photophobia", "polyuria", "pruritus", "rash", "shortness of breath", "sore throat",
    "syncope", "tachycardia", "tachypnea", "tinnitus", "tremor", "urinary frequency",
    "vertigo", "vomiting", "weakness", "weight gain", "weight loss", "wheezing"
  ],

  // Physical exam findings
  examFindings: [
    "afebrile", "alert and oriented", "bilateral breath sounds", "blood pressure elevated",
    "bowel sounds normal", "bradycardic", "cardiac murmur", "clear to auscultation",
    "conjunctivae clear", "crepitus", "decreased breath sounds", "diminished reflexes",
    "distended abdomen", "edematous", "erythematous", "guarding", "heart rate regular",
    "hepatomegaly", "jugular venous distension", "lymphadenopathy", "moist mucous membranes",
    "no acute distress", "no cervical lymphadenopathy", "no clubbing", "no cyanosis",
    "no edema", "no murmurs", "no rales", "no rebound tenderness", "no wheezes",
    "normal gait", "normal heart sounds", "normocephalic", "oriented x3", "pale conjunctivae",
    "pitting edema", "point tenderness", "positive Babinski", "pupils equal and reactive",
    "regular rhythm", "respirations unlabored", "soft abdomen", "splenomegaly",
    "supple neck", "tachycardic", "tender to palpation", "tympanic membranes clear",
    "well-nourished", "within normal limits"
  ],

  // Diagnoses / Conditions
  diagnoses: [
    "acute bronchitis", "acute coronary syndrome", "acute kidney injury", "acute pancreatitis",
    "allergic rhinitis", "anemia", "angina pectoris", "anxiety disorder", "asthma",
    "atrial fibrillation", "benign prostatic hyperplasia", "bipolar disorder",
    "bronchitis", "cardiomyopathy", "cellulitis", "cerebrovascular accident",
    "chronic kidney disease", "chronic obstructive pulmonary disease", "cirrhosis",
    "community-acquired pneumonia", "congestive heart failure", "COPD exacerbation",
    "coronary artery disease", "deep vein thrombosis", "dehydration", "dementia",
    "depression", "diabetes mellitus type 1", "diabetes mellitus type 2", "diabetic ketoacidosis",
    "diverticulitis", "dyslipidemia", "essential hypertension", "fibromyalgia",
    "gastritis", "gastroesophageal reflux disease", "GERD", "gout", "heart failure",
    "hepatitis", "hyperlipidemia", "hypertension", "hyperthyroidism", "hypothyroidism",
    "influenza", "iron deficiency anemia", "major depressive disorder", "migraine",
    "myocardial infarction", "obesity", "osteoarthritis", "osteoporosis",
    "otitis media", "peripheral artery disease", "peripheral neuropathy", "pharyngitis",
    "pneumonia", "pulmonary embolism", "rheumatoid arthritis", "seizure disorder",
    "sepsis", "sinusitis", "stroke", "thyroid nodule", "transient ischemic attack",
    "type 2 diabetes", "urinary tract infection", "UTI", "viral syndrome"
  ],

  // Medications (common)
  medications: [
    "acetaminophen", "albuterol", "amlodipine", "amoxicillin", "aspirin", "atenolol",
    "atorvastatin", "azithromycin", "carvedilol", "cephalexin", "ciprofloxacin",
    "clopidogrel", "diazepam", "digoxin", "diltiazem", "doxycycline",
    "enalapril", "escitalopram", "fluoxetine", "furosemide", "gabapentin",
    "hydrochlorothiazide", "ibuprofen", "insulin", "levothyroxine", "lisinopril",
    "lorazepam", "losartan", "metformin", "metoprolol", "naproxen",
    "omeprazole", "ondansetron", "pantoprazole", "prednisone", "propranolol",
    "rosuvastatin", "sertraline", "simvastatin", "tramadol", "trazodone",
    "warfarin", "zolpidem"
  ],

  // Lab tests and procedures
  labsProcedures: [
    "basic metabolic panel", "BMP", "CBC", "chest X-ray", "complete blood count",
    "comprehensive metabolic panel", "CMP", "CT scan", "echocardiogram", "ECG",
    "electrocardiogram", "EKG", "hemoglobin A1c", "HbA1c", "lipid panel",
    "liver function tests", "LFTs", "MRI", "PT/INR", "pulmonary function test",
    "renal function panel", "thyroid panel", "TSH", "UA", "ultrasound",
    "urinalysis", "urine culture", "venous doppler", "X-ray"
  ],

  // Treatment actions
  treatments: [
    "admit to hospital", "antibiotic therapy", "blood transfusion", "close monitoring",
    "continue current medications", "dietary modifications", "discharge home",
    "electrocardiogram", "follow up in", "hydration", "IV fluids", "lab work",
    "lifestyle modifications", "medication adjustment", "monitor closely",
    "physical therapy", "refer to specialist", "rest and hydration",
    "return if symptoms worsen", "smoking cessation", "start medication",
    "surgical consultation", "weight management"
  ],

  // Anatomical terms
  anatomy: [
    "abdomen", "ankle", "aorta", "appendix", "bladder", "brain", "bronchi",
    "carotid artery", "cervical spine", "chest", "colon", "coronary arteries",
    "diaphragm", "duodenum", "elbow", "esophagus", "femur", "gallbladder",
    "heart", "hip", "intestines", "kidney", "knee", "larynx", "liver",
    "lumbar spine", "lungs", "lymph nodes", "pancreas", "pelvis", "pericardium",
    "pharynx", "pleura", "prostate", "rectum", "shoulder", "small intestine",
    "spleen", "stomach", "thorax", "thyroid", "trachea", "ureter", "urethra",
    "uterus", "vertebrae", "wrist"
  ]
};

// Flatten all terms for general search
export const allMedicalTerms: string[] = [
  ...medicalTerms.symptoms,
  ...medicalTerms.examFindings,
  ...medicalTerms.diagnoses,
  ...medicalTerms.medications,
  ...medicalTerms.labsProcedures,
  ...medicalTerms.treatments,
  ...medicalTerms.anatomy
];

// Search function for autocomplete
export function searchMedicalTerms(query: string, limit: number = 10): string[] {
  if (!query || query.length < 2) return [];
  
  const lowerQuery = query.toLowerCase();
  const results: { term: string; score: number }[] = [];
  
  for (const term of allMedicalTerms) {
    const lowerTerm = term.toLowerCase();
    
    // Exact match at start gets highest score
    if (lowerTerm.startsWith(lowerQuery)) {
      results.push({ term, score: 100 - term.length });
    }
    // Word boundary match
    else if (lowerTerm.includes(" " + lowerQuery)) {
      results.push({ term, score: 50 - term.length });
    }
    // Contains match
    else if (lowerTerm.includes(lowerQuery)) {
      results.push({ term, score: 25 - term.length });
    }
  }
  
  // Sort by score (descending) and return top results
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map(r => r.term);
}

// Get terms by category
export function getTermsByCategory(category: keyof typeof medicalTerms): string[] {
  return medicalTerms[category] || [];
}
