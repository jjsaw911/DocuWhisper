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
  },
  
  // Additional Opioid Interactions
  {
    drug1: "oxycodone",
    drug2: "benzodiazepine",
    severity: "high",
    description: "Combined CNS/respiratory depression, increased overdose risk",
    recommendation: "FDA Black Box Warning. Avoid if possible. Use lowest doses if necessary."
  },
  {
    drug1: "hydrocodone",
    drug2: "alprazolam",
    severity: "high",
    description: "Combined CNS/respiratory depression risk",
    recommendation: "Avoid combination. Use alternative pain or anxiety management."
  },
  {
    drug1: "fentanyl",
    drug2: "lorazepam",
    severity: "high",
    description: "Severe respiratory depression risk",
    recommendation: "Contraindicated outside monitored settings."
  },
  {
    drug1: "morphine",
    drug2: "gabapentin",
    severity: "moderate",
    description: "Increased CNS depression and respiratory depression risk",
    recommendation: "Use with caution. Monitor for sedation."
  },
  {
    drug1: "tramadol",
    drug2: "gabapentin",
    severity: "moderate",
    description: "Increased sedation and seizure risk",
    recommendation: "Use with caution. Consider lower doses."
  },
  
  // GLP-1 Agonists (Ozempic, Mounjaro, etc.)
  {
    drug1: "semaglutide",
    drug2: "insulin",
    severity: "moderate",
    description: "Increased hypoglycemia risk",
    recommendation: "Reduce insulin dose by 20-30% when starting. Monitor closely."
  },
  {
    drug1: "tirzepatide",
    drug2: "sulfonylurea",
    severity: "moderate",
    description: "Increased hypoglycemia risk",
    recommendation: "Consider reducing sulfonylurea dose."
  },
  {
    drug1: "liraglutide",
    drug2: "warfarin",
    severity: "moderate",
    description: "GLP-1 may alter warfarin absorption",
    recommendation: "Monitor INR more frequently when starting or adjusting."
  },
  
  // DOACs (Direct Oral Anticoagulants)
  {
    drug1: "apixaban",
    drug2: "aspirin",
    severity: "moderate",
    description: "Increased bleeding risk",
    recommendation: "Avoid dual therapy unless clearly indicated. Monitor for bleeding."
  },
  {
    drug1: "rivaroxaban",
    drug2: "ibuprofen",
    severity: "moderate",
    description: "Increased bleeding risk with NSAIDs",
    recommendation: "Avoid NSAIDs. Use acetaminophen for pain."
  },
  {
    drug1: "dabigatran",
    drug2: "verapamil",
    severity: "moderate",
    description: "Verapamil increases dabigatran levels",
    recommendation: "Take dabigatran 2 hours before verapamil if combination needed."
  },
  {
    drug1: "apixaban",
    drug2: "ketoconazole",
    severity: "high",
    description: "Strong CYP3A4/P-gp inhibitors dramatically increase apixaban levels",
    recommendation: "Avoid combination or reduce apixaban dose by 50%."
  },
  
  // Antibiotics Additional
  {
    drug1: "levofloxacin",
    drug2: "prednisone",
    severity: "moderate",
    description: "Increased tendon rupture risk",
    recommendation: "Use alternative antibiotic if possible. Warn patient of tendon symptoms."
  },
  {
    drug1: "fluoroquinolone",
    drug2: "steroid",
    severity: "moderate",
    description: "Increased tendon rupture risk",
    recommendation: "Use alternative antibiotic class when possible."
  },
  {
    drug1: "clarithromycin",
    drug2: "simvastatin",
    severity: "high",
    description: "Dramatically increased statin levels and rhabdomyolysis risk",
    recommendation: "Hold statin during clarithromycin course."
  },
  {
    drug1: "erythromycin",
    drug2: "digoxin",
    severity: "moderate",
    description: "Erythromycin increases digoxin levels",
    recommendation: "Monitor digoxin levels. May need dose reduction."
  },
  
  // Antipsychotics
  {
    drug1: "quetiapine",
    drug2: "methadone",
    severity: "high",
    description: "Both prolong QT interval",
    recommendation: "Monitor ECG. Use alternative agents if possible."
  },
  {
    drug1: "haloperidol",
    drug2: "metoclopramide",
    severity: "moderate",
    description: "Additive extrapyramidal effects",
    recommendation: "Avoid combination. Increased movement disorder risk."
  },
  {
    drug1: "olanzapine",
    drug2: "benzodiazepine",
    severity: "high",
    description: "Severe hypotension and respiratory depression with IM olanzapine",
    recommendation: "Avoid IM olanzapine within 1 hour of benzodiazepine."
  },
  
  // ACE Inhibitors/ARBs
  {
    drug1: "lisinopril",
    drug2: "ibuprofen",
    severity: "moderate",
    description: "NSAIDs reduce ACE inhibitor effectiveness and increase kidney injury risk",
    recommendation: "Avoid chronic NSAID use. Monitor kidney function."
  },
  {
    drug1: "losartan",
    drug2: "potassium supplement",
    severity: "moderate",
    description: "Both can increase potassium levels",
    recommendation: "Monitor potassium levels. Avoid supplements unless deficient."
  },
  {
    drug1: "ace inhibitor",
    drug2: "arb",
    severity: "high",
    description: "Dual RAAS blockade increases kidney injury and hyperkalemia risk",
    recommendation: "Avoid combination. Use one agent only."
  },
  
  // Muscle Relaxants
  {
    drug1: "cyclobenzaprine",
    drug2: "tramadol",
    severity: "moderate",
    description: "Increased serotonin syndrome risk and CNS depression",
    recommendation: "Use with caution. Consider alternative muscle relaxant."
  },
  {
    drug1: "baclofen",
    drug2: "opioid",
    severity: "moderate",
    description: "Additive CNS depression",
    recommendation: "Use lowest effective doses. Monitor for sedation."
  },
  {
    drug1: "tizanidine",
    drug2: "fluvoxamine",
    severity: "high",
    description: "Fluvoxamine dramatically increases tizanidine levels",
    recommendation: "Contraindicated combination."
  },
  
  // SGLT2 Inhibitors
  {
    drug1: "empagliflozin",
    drug2: "diuretic",
    severity: "moderate",
    description: "Increased dehydration and hypotension risk",
    recommendation: "May need to reduce diuretic dose. Ensure adequate hydration."
  },
  {
    drug1: "canagliflozin",
    drug2: "insulin",
    severity: "moderate",
    description: "Increased hypoglycemia risk",
    recommendation: "May need to reduce insulin dose."
  },
  
  // PDE5 Inhibitors
  {
    drug1: "sildenafil",
    drug2: "nitrate",
    severity: "high",
    description: "Severe hypotension - potentially fatal",
    recommendation: "Contraindicated. Never combine."
  },
  {
    drug1: "tadalafil",
    drug2: "nitroglycerin",
    severity: "high",
    description: "Severe hypotension - potentially fatal",
    recommendation: "Contraindicated. Allow 48+ hours between doses."
  },
  {
    drug1: "sildenafil",
    drug2: "alpha blocker",
    severity: "moderate",
    description: "Risk of significant hypotension",
    recommendation: "Start with low sildenafil dose if on stable alpha blocker."
  },
  
  // Antiepileptics
  {
    drug1: "carbamazepine",
    drug2: "oral contraceptive",
    severity: "high",
    description: "Carbamazepine reduces contraceptive effectiveness",
    recommendation: "Use non-hormonal or higher-dose contraception."
  },
  {
    drug1: "valproate",
    drug2: "lamotrigine",
    severity: "moderate",
    description: "Valproate doubles lamotrigine levels",
    recommendation: "Use lower lamotrigine dose (half the usual)."
  },
  {
    drug1: "phenytoin",
    drug2: "warfarin",
    severity: "moderate",
    description: "Complex interaction - initial increase then decrease in warfarin effect",
    recommendation: "Monitor INR closely. May need warfarin adjustment."
  },
  
  // Common Brand Name Interactions
  {
    drug1: "eliquis",
    drug2: "aspirin",
    severity: "moderate",
    description: "Increased bleeding risk with dual antithrombotic therapy",
    recommendation: "Avoid unless clearly indicated. Monitor for bleeding."
  },
  {
    drug1: "xarelto",
    drug2: "advil",
    severity: "moderate",
    description: "Increased bleeding risk",
    recommendation: "Avoid NSAIDs. Use acetaminophen for pain."
  },
  {
    drug1: "norco",
    drug2: "xanax",
    severity: "high",
    description: "Combined CNS/respiratory depression",
    recommendation: "FDA Black Box Warning. Avoid if possible."
  },
  {
    drug1: "ozempic",
    drug2: "lantus",
    severity: "moderate",
    description: "Increased hypoglycemia risk",
    recommendation: "May need to reduce insulin dose when starting GLP-1."
  },
  {
    drug1: "mounjaro",
    drug2: "metformin",
    severity: "low",
    description: "GI side effects may be additive",
    recommendation: "Generally safe combination. Monitor for GI tolerability."
  }
];

const brandToGeneric: Record<string, string> = {
  "tylenol": "acetaminophen",
  "advil": "ibuprofen", "motrin": "ibuprofen",
  "aleve": "naproxen",
  "celebrex": "celecoxib",
  "mobic": "meloxicam",
  "voltaren": "diclofenac",
  "toradol": "ketorolac",
  "indocin": "indomethacin",
  "ultram": "tramadol",
  "vicodin": "hydrocodone", "norco": "hydrocodone",
  "oxycontin": "oxycodone", "percocet": "oxycodone",
  "dilaudid": "hydromorphone",
  "demerol": "meperidine",
  "suboxone": "buprenorphine",
  "augmentin": "amoxicillin-clavulanate",
  "zithromax": "azithromycin", "zpak": "azithromycin", "z-pak": "azithromycin",
  "cipro": "ciprofloxacin",
  "levaquin": "levofloxacin",
  "flagyl": "metronidazole",
  "cleocin": "clindamycin",
  "bactrim": "sulfamethoxazole",
  "keflex": "cephalexin",
  "rocephin": "ceftriaxone",
  "macrobid": "nitrofurantoin",
  "biaxin": "clarithromycin",
  "cozaar": "losartan",
  "diovan": "valsartan",
  "norvasc": "amlodipine",
  "cardizem": "diltiazem",
  "lopressor": "metoprolol", "toprol": "metoprolol",
  "tenormin": "atenolol",
  "coreg": "carvedilol",
  "lasix": "furosemide",
  "bumex": "bumetanide",
  "aldactone": "spironolactone",
  "lanoxin": "digoxin",
  "pacerone": "amiodarone",
  "coumadin": "warfarin",
  "eliquis": "apixaban",
  "xarelto": "rivaroxaban",
  "pradaxa": "dabigatran",
  "savaysa": "edoxaban",
  "lovenox": "enoxaparin",
  "plavix": "clopidogrel",
  "brilinta": "ticagrelor",
  "effient": "prasugrel",
  "lipitor": "atorvastatin",
  "zocor": "simvastatin",
  "crestor": "rosuvastatin",
  "zetia": "ezetimibe",
  "tricor": "fenofibrate",
  "lopid": "gemfibrozil",
  "glucophage": "metformin",
  "glucotrol": "glipizide",
  "amaryl": "glimepiride",
  "januvia": "sitagliptin",
  "tradjenta": "linagliptin",
  "jardiance": "empagliflozin",
  "farxiga": "dapagliflozin",
  "invokana": "canagliflozin",
  "victoza": "liraglutide",
  "ozempic": "semaglutide", "wegovy": "semaglutide", "rybelsus": "semaglutide",
  "trulicity": "dulaglutide",
  "mounjaro": "tirzepatide",
  "byetta": "exenatide",
  "actos": "pioglitazone",
  "zoloft": "sertraline",
  "lexapro": "escitalopram",
  "prozac": "fluoxetine",
  "celexa": "citalopram",
  "paxil": "paroxetine",
  "cymbalta": "duloxetine",
  "effexor": "venlafaxine",
  "pristiq": "desvenlafaxine",
  "wellbutrin": "bupropion",
  "remeron": "mirtazapine",
  "desyrel": "trazodone",
  "elavil": "amitriptyline",
  "pamelor": "nortriptyline",
  "seroquel": "quetiapine",
  "abilify": "aripiprazole",
  "risperdal": "risperidone",
  "zyprexa": "olanzapine",
  "geodon": "ziprasidone",
  "latuda": "lurasidone",
  "haldol": "haloperidol",
  "xanax": "alprazolam",
  "klonopin": "clonazepam",
  "valium": "diazepam",
  "ativan": "lorazepam",
  "ambien": "zolpidem",
  "lunesta": "eszopiclone",
  "sonata": "zaleplon",
  "neurontin": "gabapentin",
  "lyrica": "pregabalin",
  "dilantin": "phenytoin",
  "keppra": "levetiracetam",
  "tegretol": "carbamazepine",
  "depakote": "valproic acid",
  "lamictal": "lamotrigine",
  "topamax": "topiramate",
  "trileptal": "oxcarbazepine",
  "vimpat": "lacosamide",
  "zonegran": "zonisamide",
  "synthroid": "levothyroxine", "levoxyl": "levothyroxine", "tirosint": "levothyroxine",
  "cytomel": "liothyronine",
  "flexeril": "cyclobenzaprine",
  "robaxin": "methocarbamol",
  "zanaflex": "tizanidine",
  "soma": "carisoprodol",
  "skelaxin": "metaxalone",
  "zyloprim": "allopurinol",
  "uloric": "febuxostat",
  "colcrys": "colchicine",
  "trexall": "methotrexate",
  "plaquenil": "hydroxychloroquine",
  "arava": "leflunomide",
  "humira": "adalimumab",
  "enbrel": "etanercept",
  "fosamax": "alendronate",
  "actonel": "risedronate",
  "boniva": "ibandronate",
  "reclast": "zoledronic acid",
  "prolia": "denosumab",
  "forteo": "teriparatide",
  "flomax": "tamsulosin",
  "uroxatral": "alfuzosin",
  "rapaflo": "silodosin",
  "cardura": "doxazosin",
  "proscar": "finasteride", "propecia": "finasteride",
  "avodart": "dutasteride",
  "ditropan": "oxybutynin",
  "detrol": "tolterodine",
  "vesicare": "solifenacin",
  "myrbetriq": "mirabegron",
  "viagra": "sildenafil",
  "cialis": "tadalafil",
  "levitra": "vardenafil",
  "premarin": "estrogen",
  "provera": "medroxyprogesterone", "depo-provera": "medroxyprogesterone",
  "androgel": "testosterone",
  "evista": "raloxifene",
  "femara": "letrozole",
  "arimidex": "anastrozole",
  "benadryl": "diphenhydramine",
  "zyrtec": "cetirizine",
  "claritin": "loratadine",
  "allegra": "fexofenadine",
  "xyzal": "levocetirizine",
  "clarinex": "desloratadine",
  "sudafed": "pseudoephedrine",
  "epipen": "epinephrine",
  "nasonex": "mometasone",
  "flonase": "fluticasone",
  "nasacort": "triamcinolone",
  "xalatan": "latanoprost",
  "prilosec": "omeprazole",
  "nexium": "esomeprazole",
  "prevacid": "lansoprazole",
  "protonix": "pantoprazole",
  "aciphex": "rabeprazole",
  "pepcid": "famotidine",
  "zantac": "ranitidine",
  "reglan": "metoclopramide",
  "zofran": "ondansetron",
  "phenergan": "promethazine",
  "compazine": "prochlorperazine",
  "imodium": "loperamide",
  "bentyl": "dicyclomine",
  "linzess": "linaclotide",
  "xifaxan": "rifaximin",
  "advair": "fluticasone-salmeterol",
  "symbicort": "budesonide-formoterol",
  "breo": "fluticasone-vilanterol",
  "spiriva": "tiotropium",
  "singulair": "montelukast",
  "proventil": "albuterol", "ventolin": "albuterol", "proair": "albuterol",
  "combivent": "ipratropium-albuterol",
  "atrovent": "ipratropium",
  "adderall": "amphetamine",
  "ritalin": "methylphenidate", "concerta": "methylphenidate",
  "vyvanse": "lisdexamfetamine",
  "strattera": "atomoxetine",
};

function normalizeDrugName(name: string): string {
  const lower = name.toLowerCase().trim();
  return brandToGeneric[lower] || lower;
}

// Extract medications from text
export function extractMedications(text: string): string[] {
  const commonDrugs = [
    // Analgesics & NSAIDs
    "acetaminophen", "tylenol", "aspirin", "ibuprofen", "advil", "motrin", "naproxen", "aleve",
    "celecoxib", "celebrex", "meloxicam", "mobic", "diclofenac", "voltaren", "ketorolac", "toradol",
    "indomethacin", "indocin", "piroxicam",
    
    // Opioids
    "tramadol", "ultram", "hydrocodone", "vicodin", "norco", "oxycodone", "oxycontin", "percocet",
    "morphine", "fentanyl", "codeine", "methadone", "buprenorphine", "suboxone", "tapentadol",
    "opioid", "hydromorphone", "dilaudid", "meperidine", "demerol",
    
    // Antibiotics
    "amoxicillin", "augmentin", "azithromycin", "zithromax", "zpak", "z-pak", "ciprofloxacin", "cipro",
    "levofloxacin", "levaquin", "doxycycline", "metronidazole", "flagyl", "clindamycin", "cleocin",
    "sulfamethoxazole", "bactrim", "trimethoprim", "cephalexin", "keflex", "ceftriaxone", "rocephin",
    "amoxicillin-clavulanate", "nitrofurantoin", "macrobid", "clarithromycin", "biaxin", "penicillin",
    "vancomycin", "gentamicin", "tetracycline", "erythromycin",
    
    // Cardiovascular - Antihypertensives
    "lisinopril", "enalapril", "ramipril", "benazepril", "losartan", "cozaar", "valsartan", "diovan",
    "irbesartan", "olmesartan", "amlodipine", "norvasc", "nifedipine", "diltiazem", "cardizem",
    "verapamil", "metoprolol", "lopressor", "toprol", "atenolol", "tenormin", "carvedilol", "coreg",
    "propranolol", "bisoprolol", "nebivolol", "labetalol", "clonidine", "hydralazine",
    "hydrochlorothiazide", "hctz", "chlorthalidone", "furosemide", "lasix", "bumetanide", "bumex",
    "torsemide", "spironolactone", "aldactone", "eplerenone", "triamterene",
    
    // Cardiovascular - Other
    "digoxin", "lanoxin", "amiodarone", "pacerone", "sotalol", "flecainide", "dronedarone",
    "warfarin", "coumadin", "apixaban", "eliquis", "rivaroxaban", "xarelto", "dabigatran", "pradaxa",
    "edoxaban", "savaysa", "heparin", "enoxaparin", "lovenox", "clopidogrel", "plavix",
    "ticagrelor", "brilinta", "prasugrel", "effient", "isosorbide", "nitroglycerin", "ranolazine",
    
    // Statins & Cholesterol
    "atorvastatin", "lipitor", "simvastatin", "zocor", "rosuvastatin", "crestor", "pravastatin",
    "lovastatin", "fluvastatin", "pitavastatin", "ezetimibe", "zetia", "fenofibrate", "tricor",
    "gemfibrozil", "lopid", "niacin", "omega-3", "fish oil",
    
    // Diabetes
    "metformin", "glucophage", "glipizide", "glucotrol", "glyburide", "glimepiride", "amaryl",
    "sitagliptin", "januvia", "linagliptin", "tradjenta", "saxagliptin", "alogliptin",
    "empagliflozin", "jardiance", "dapagliflozin", "farxiga", "canagliflozin", "invokana",
    "liraglutide", "victoza", "semaglutide", "ozempic", "wegovy", "rybelsus", "dulaglutide", "trulicity",
    "tirzepatide", "mounjaro", "exenatide", "byetta", "pioglitazone", "actos",
    "insulin", "lantus", "levemir", "tresiba", "humalog", "novolog", "basaglar", "toujeo",
    
    // Respiratory
    "albuterol", "proair", "ventolin", "proventil", "levalbuterol", "ipratropium", "atrovent",
    "tiotropium", "spiriva", "fluticasone", "flovent", "budesonide", "pulmicort", "symbicort",
    "advair", "breo", "salmeterol", "formoterol", "montelukast", "singulair", "prednisone",
    "prednisolone", "methylprednisolone", "medrol", "dexamethasone", "theophylline",
    
    // Gastrointestinal
    "omeprazole", "prilosec", "esomeprazole", "nexium", "lansoprazole", "prevacid",
    "pantoprazole", "protonix", "rabeprazole", "famotidine", "pepcid", "ranitidine", "zantac",
    "sucralfate", "carafate", "ondansetron", "zofran", "promethazine", "phenergan", "metoclopramide",
    "reglan", "dicyclomine", "bentyl", "hyoscyamine", "loperamide", "imodium", "bismuth", "pepto",
    
    // Mental Health - Antidepressants
    "fluoxetine", "prozac", "sertraline", "zoloft", "escitalopram", "lexapro", "citalopram", "celexa",
    "paroxetine", "paxil", "fluvoxamine", "venlafaxine", "effexor", "duloxetine", "cymbalta",
    "desvenlafaxine", "pristiq", "bupropion", "wellbutrin", "mirtazapine", "remeron",
    "trazodone", "desyrel", "nortriptyline", "pamelor", "amitriptyline", "elavil", "doxepin",
    "vortioxetine", "trintellix", "vilazodone", "viibryd",
    
    // Mental Health - Anxiolytics & Sedatives
    "lorazepam", "ativan", "alprazolam", "xanax", "diazepam", "valium", "clonazepam", "klonopin",
    "temazepam", "restoril", "triazolam", "halcion", "buspirone", "buspar", "hydroxyzine", "vistaril",
    "zolpidem", "ambien", "eszopiclone", "lunesta", "zaleplon", "sonata", "suvorexant", "belsomra",
    "ramelteon", "rozerem", "melatonin",
    
    // Mental Health - Antipsychotics
    "quetiapine", "seroquel", "risperidone", "risperdal", "olanzapine", "zyprexa", "aripiprazole", "abilify",
    "ziprasidone", "geodon", "haloperidol", "haldol", "lurasidone", "latuda", "paliperidone", "invega",
    "clozapine", "clozaril", "cariprazine", "vraylar", "brexpiprazole", "rexulti",
    
    // Mental Health - Mood Stabilizers & ADHD
    "lithium", "lamotrigine", "lamictal", "valproate", "depakote", "carbamazepine", "tegretol",
    "oxcarbazepine", "trileptal", "topiramate", "topamax",
    "methylphenidate", "ritalin", "concerta", "adderall", "amphetamine", "dextroamphetamine", "vyvanse",
    "lisdexamfetamine", "atomoxetine", "strattera", "guanfacine", "intuniv",
    
    // Seizure Medications
    "levetiracetam", "keppra", "phenytoin", "dilantin", "gabapentin", "neurontin", "pregabalin", "lyrica",
    "phenobarbital", "primidone", "zonisamide", "zonegran", "lacosamide", "vimpat",
    
    // Thyroid
    "levothyroxine", "synthroid", "levoxyl", "tirosint", "liothyronine", "cytomel", "methimazole",
    "propylthiouracil", "ptu",
    
    // Muscle Relaxants
    "cyclobenzaprine", "flexeril", "methocarbamol", "robaxin", "tizanidine", "zanaflex",
    "baclofen", "carisoprodol", "soma", "metaxalone", "skelaxin", "orphenadrine",
    
    // Gout & Rheumatology
    "allopurinol", "zyloprim", "febuxostat", "uloric", "colchicine", "colcrys", "probenecid",
    "methotrexate", "trexall", "hydroxychloroquine", "plaquenil", "sulfasalazine",
    "leflunomide", "arava", "adalimumab", "humira", "etanercept", "enbrel",
    
    // Osteoporosis
    "alendronate", "fosamax", "risedronate", "actonel", "ibandronate", "boniva",
    "zoledronic acid", "reclast", "denosumab", "prolia", "teriparatide", "forteo",
    "calcium", "vitamin d", "calcitriol",
    
    // Urological
    "tamsulosin", "flomax", "alfuzosin", "uroxatral", "silodosin", "rapaflo", "doxazosin", "cardura",
    "finasteride", "proscar", "propecia", "dutasteride", "avodart", "oxybutynin", "ditropan",
    "tolterodine", "detrol", "solifenacin", "vesicare", "mirabegron", "myrbetriq",
    "sildenafil", "viagra", "tadalafil", "cialis", "vardenafil", "levitra",
    
    // Hormones & Contraceptives
    "estrogen", "estradiol", "premarin", "progesterone", "medroxyprogesterone", "provera", "depo-provera",
    "norethindrone", "testosterone", "androgel", "raloxifene", "evista", "tamoxifen",
    "letrozole", "femara", "anastrozole", "arimidex",
    
    // Allergy & Immunology
    "diphenhydramine", "benadryl", "cetirizine", "zyrtec", "loratadine", "claritin", "fexofenadine",
    "allegra", "levocetirizine", "xyzal", "desloratadine", "clarinex", "pseudoephedrine", "sudafed",
    "phenylephrine", "epinephrine", "epipen", "prednisone", "dexamethasone",
    
    // Topicals & Eye Drops
    "latanoprost", "xalatan", "timolol", "brimonidine", "dorzolamide", "travoprost",
    "mometasone", "nasonex", "fluticasone", "flonase", "triamcinolone", "nasacort",
    
    // Contrast & Other
    "contrast", "gadolinium", "iodine", "radiocontrast", "potassium", "magnesium", "iron", "ferrous",
    "multivitamin", "folic acid", "b12", "vitamin b", "zinc", "selenium"
  ];
  
  const lowerText = text.toLowerCase();
  const found: string[] = [];
  
  for (const drug of commonDrugs) {
    const regex = new RegExp(`\\b${drug}\\b`, 'i');
    if (regex.test(lowerText)) {
      const normalized = normalizeDrugName(drug);
      if (!found.includes(normalized)) {
        found.push(normalized);
      }
    }
  }
  
  return found;
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
