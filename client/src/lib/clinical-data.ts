// Clinical data for encounter forms - ROS, Physical Exam, ICD-10, CPT, Medications

// Review of Systems (ROS) Checkbox Options
export const rosOptions = {
  constitutional: {
    label: "Constitutional",
    normal: "No fever, chills, fatigue, or weight changes",
    options: [
      { id: "fever", label: "Fever" },
      { id: "chills", label: "Chills" },
      { id: "fatigue", label: "Fatigue" },
      { id: "weight_loss", label: "Weight Loss" },
      { id: "weight_gain", label: "Weight Gain" },
      { id: "night_sweats", label: "Night Sweats" },
      { id: "malaise", label: "Malaise" },
      { id: "decreased_appetite", label: "Decreased Appetite" },
    ],
  },
  eyes: {
    label: "Eyes",
    normal: "No vision changes, pain, or discharge",
    options: [
      { id: "vision_changes", label: "Vision Changes" },
      { id: "eye_pain", label: "Eye Pain" },
      { id: "redness", label: "Redness" },
      { id: "discharge", label: "Discharge" },
      { id: "itching", label: "Itching" },
      { id: "double_vision", label: "Double Vision" },
      { id: "dry_eyes", label: "Dry Eyes" },
      { id: "tearing", label: "Excessive Tearing" },
    ],
  },
  ent: {
    label: "ENT",
    normal: "No ear pain, hearing loss, nasal congestion, or sore throat",
    options: [
      { id: "ear_pain", label: "Ear Pain" },
      { id: "hearing_loss", label: "Hearing Loss" },
      { id: "tinnitus", label: "Tinnitus" },
      { id: "nasal_congestion", label: "Nasal Congestion" },
      { id: "sore_throat", label: "Sore Throat" },
      { id: "hoarseness", label: "Hoarseness" },
      { id: "difficulty_swallowing", label: "Difficulty Swallowing" },
      { id: "sinus_pressure", label: "Sinus Pressure" },
      { id: "nosebleeds", label: "Nosebleeds" },
      { id: "postnasal_drip", label: "Postnasal Drip" },
    ],
  },
  cardiovascular: {
    label: "Cardiovascular",
    normal: "No chest pain, palpitations, or edema",
    options: [
      { id: "chest_pain", label: "Chest Pain" },
      { id: "palpitations", label: "Palpitations" },
      { id: "shortness_of_breath", label: "Dyspnea on Exertion" },
      { id: "orthopnea", label: "Orthopnea" },
      { id: "pnd", label: "PND" },
      { id: "leg_swelling", label: "Leg Swelling" },
      { id: "claudication", label: "Claudication" },
      { id: "syncope", label: "Syncope" },
    ],
  },
  respiratory: {
    label: "Respiratory",
    normal: "No cough, shortness of breath, or wheezing",
    options: [
      { id: "cough", label: "Cough" },
      { id: "productive_cough", label: "Productive Cough" },
      { id: "hemoptysis", label: "Hemoptysis" },
      { id: "shortness_of_breath", label: "Shortness of Breath" },
      { id: "wheezing", label: "Wheezing" },
      { id: "chest_tightness", label: "Chest Tightness" },
      { id: "sleep_apnea", label: "Sleep Apnea" },
      { id: "snoring", label: "Snoring" },
    ],
  },
  gastrointestinal: {
    label: "Gastrointestinal",
    normal: "No nausea, vomiting, diarrhea, or abdominal pain",
    options: [
      { id: "nausea", label: "Nausea" },
      { id: "vomiting", label: "Vomiting" },
      { id: "diarrhea", label: "Diarrhea" },
      { id: "constipation", label: "Constipation" },
      { id: "abdominal_pain", label: "Abdominal Pain" },
      { id: "heartburn", label: "Heartburn/GERD" },
      { id: "blood_in_stool", label: "Blood in Stool" },
      { id: "melena", label: "Melena" },
      { id: "dysphagia", label: "Dysphagia" },
      { id: "bloating", label: "Bloating" },
    ],
  },
  genitourinary: {
    label: "Genitourinary",
    normal: "No dysuria, frequency, or hematuria",
    options: [
      { id: "dysuria", label: "Dysuria" },
      { id: "frequency", label: "Urinary Frequency" },
      { id: "urgency", label: "Urinary Urgency" },
      { id: "hematuria", label: "Hematuria" },
      { id: "incontinence", label: "Incontinence" },
      { id: "nocturia", label: "Nocturia" },
      { id: "flank_pain", label: "Flank Pain" },
      { id: "discharge", label: "Urethral Discharge" },
    ],
  },
  musculoskeletal: {
    label: "Musculoskeletal",
    normal: "No joint pain, swelling, or stiffness",
    options: [
      { id: "joint_pain", label: "Joint Pain" },
      { id: "joint_swelling", label: "Joint Swelling" },
      { id: "stiffness", label: "Stiffness" },
      { id: "back_pain", label: "Back Pain" },
      { id: "neck_pain", label: "Neck Pain" },
      { id: "muscle_weakness", label: "Muscle Weakness" },
      { id: "muscle_cramps", label: "Muscle Cramps" },
      { id: "limited_mobility", label: "Limited Mobility" },
    ],
  },
  skin: {
    label: "Skin",
    normal: "No rash, itching, or skin changes",
    options: [
      { id: "rash", label: "Rash" },
      { id: "itching", label: "Itching" },
      { id: "dry_skin", label: "Dry Skin" },
      { id: "skin_lesions", label: "Skin Lesions" },
      { id: "bruising", label: "Easy Bruising" },
      { id: "hair_loss", label: "Hair Loss" },
      { id: "nail_changes", label: "Nail Changes" },
      { id: "wound_healing", label: "Poor Wound Healing" },
    ],
  },
  neurological: {
    label: "Neurological",
    normal: "No headache, dizziness, numbness, or weakness",
    options: [
      { id: "headache", label: "Headache" },
      { id: "dizziness", label: "Dizziness" },
      { id: "vertigo", label: "Vertigo" },
      { id: "numbness", label: "Numbness" },
      { id: "tingling", label: "Tingling" },
      { id: "weakness", label: "Weakness" },
      { id: "tremor", label: "Tremor" },
      { id: "seizures", label: "Seizures" },
      { id: "memory_loss", label: "Memory Loss" },
      { id: "gait_changes", label: "Gait Changes" },
    ],
  },
  psychiatric: {
    label: "Psychiatric",
    normal: "No anxiety, depression, or sleep disturbance",
    options: [
      { id: "anxiety", label: "Anxiety" },
      { id: "depression", label: "Depression" },
      { id: "insomnia", label: "Insomnia" },
      { id: "mood_changes", label: "Mood Changes" },
      { id: "irritability", label: "Irritability" },
      { id: "memory_problems", label: "Memory Problems" },
      { id: "concentration", label: "Poor Concentration" },
      { id: "suicidal_ideation", label: "Suicidal Ideation" },
    ],
  },
  endocrine: {
    label: "Endocrine",
    normal: "No heat/cold intolerance, polyuria, or polydipsia",
    options: [
      { id: "heat_intolerance", label: "Heat Intolerance" },
      { id: "cold_intolerance", label: "Cold Intolerance" },
      { id: "polydipsia", label: "Polydipsia" },
      { id: "polyuria", label: "Polyuria" },
      { id: "polyphagia", label: "Polyphagia" },
      { id: "fatigue", label: "Fatigue" },
      { id: "hair_changes", label: "Hair Changes" },
      { id: "sweating_changes", label: "Sweating Changes" },
    ],
  },
  hematologic: {
    label: "Hematologic/Lymphatic",
    normal: "No easy bleeding, bruising, or lymphadenopathy",
    options: [
      { id: "easy_bleeding", label: "Easy Bleeding" },
      { id: "easy_bruising", label: "Easy Bruising" },
      { id: "lymphadenopathy", label: "Swollen Lymph Nodes" },
      { id: "blood_clots", label: "History of Blood Clots" },
      { id: "transfusions", label: "Prior Transfusions" },
    ],
  },
  allergic: {
    label: "Allergic/Immunologic",
    normal: "No seasonal allergies or recurrent infections",
    options: [
      { id: "seasonal_allergies", label: "Seasonal Allergies" },
      { id: "hives", label: "Hives" },
      { id: "recurrent_infections", label: "Recurrent Infections" },
      { id: "immunodeficiency", label: "Immunodeficiency" },
      { id: "autoimmune", label: "Autoimmune Symptoms" },
    ],
  },
};

// Physical Exam Checkbox Options
export const peOptions = {
  general: {
    label: "General",
    normal: "Well-appearing, alert, oriented, in no acute distress",
    options: [
      { id: "well_appearing", label: "Well Appearing" },
      { id: "ill_appearing", label: "Ill Appearing" },
      { id: "alert", label: "Alert" },
      { id: "oriented", label: "Oriented x3" },
      { id: "no_acute_distress", label: "No Acute Distress" },
      { id: "in_distress", label: "In Distress" },
      { id: "cooperative", label: "Cooperative" },
      { id: "anxious", label: "Appears Anxious" },
    ],
  },
  head: {
    label: "Head",
    normal: "Normocephalic, atraumatic",
    options: [
      { id: "normocephalic", label: "Normocephalic" },
      { id: "atraumatic", label: "Atraumatic" },
      { id: "tenderness", label: "Tenderness" },
      { id: "lesions", label: "Lesions" },
      { id: "masses", label: "Masses" },
    ],
  },
  eyes: {
    label: "Eyes",
    normal: "PERRLA, EOM intact, conjunctivae clear",
    options: [
      { id: "perrla", label: "PERRLA" },
      { id: "eom_intact", label: "EOM Intact" },
      { id: "conjunctivae_clear", label: "Conjunctivae Clear" },
      { id: "sclera_anicteric", label: "Sclera Anicteric" },
      { id: "fundoscopic_normal", label: "Fundoscopic Normal" },
      { id: "discharge", label: "Discharge Present" },
      { id: "erythema", label: "Erythema" },
    ],
  },
  ent: {
    label: "ENT",
    normal: "TMs clear, oropharynx without erythema or exudate",
    options: [
      { id: "tms_clear", label: "TMs Clear" },
      { id: "tms_bulging", label: "TMs Bulging" },
      { id: "tms_erythematous", label: "TMs Erythematous" },
      { id: "hearing_intact", label: "Hearing Intact" },
      { id: "oropharynx_clear", label: "Oropharynx Clear" },
      { id: "pharyngeal_erythema", label: "Pharyngeal Erythema" },
      { id: "tonsillar_exudate", label: "Tonsillar Exudate" },
      { id: "nasal_mucosa_normal", label: "Nasal Mucosa Normal" },
      { id: "nasal_congestion", label: "Nasal Congestion" },
    ],
  },
  neck: {
    label: "Neck",
    normal: "Supple, no lymphadenopathy, no thyromegaly",
    options: [
      { id: "supple", label: "Supple" },
      { id: "no_lymphadenopathy", label: "No Lymphadenopathy" },
      { id: "lymphadenopathy", label: "Lymphadenopathy" },
      { id: "no_thyromegaly", label: "No Thyromegaly" },
      { id: "thyromegaly", label: "Thyromegaly" },
      { id: "no_jvd", label: "No JVD" },
      { id: "jvd_present", label: "JVD Present" },
      { id: "carotid_bruits", label: "Carotid Bruits" },
    ],
  },
  chest: {
    label: "Chest/Breast",
    normal: "Chest wall non-tender, no masses",
    options: [
      { id: "non_tender", label: "Non-tender" },
      { id: "tenderness", label: "Tenderness" },
      { id: "no_masses", label: "No Masses" },
      { id: "masses_present", label: "Masses Present" },
      { id: "symmetric", label: "Symmetric" },
    ],
  },
  lungs: {
    label: "Lungs",
    normal: "Clear to auscultation bilaterally, no wheezes/rales/rhonchi",
    options: [
      { id: "cta_bilateral", label: "CTA Bilaterally" },
      { id: "diminished_breath_sounds", label: "Diminished Breath Sounds" },
      { id: "wheezes", label: "Wheezes" },
      { id: "rales", label: "Rales/Crackles" },
      { id: "rhonchi", label: "Rhonchi" },
      { id: "stridor", label: "Stridor" },
      { id: "good_air_movement", label: "Good Air Movement" },
      { id: "prolonged_expiration", label: "Prolonged Expiration" },
    ],
  },
  heart: {
    label: "Heart",
    normal: "RRR, no murmurs/rubs/gallops",
    options: [
      { id: "rrr", label: "RRR" },
      { id: "irregular_rhythm", label: "Irregular Rhythm" },
      { id: "no_murmur", label: "No Murmur" },
      { id: "systolic_murmur", label: "Systolic Murmur" },
      { id: "diastolic_murmur", label: "Diastolic Murmur" },
      { id: "no_rub", label: "No Rub" },
      { id: "rub_present", label: "Rub Present" },
      { id: "no_gallop", label: "No Gallop" },
      { id: "s3_gallop", label: "S3 Gallop" },
      { id: "s4_gallop", label: "S4 Gallop" },
    ],
  },
  abdomen: {
    label: "Abdomen",
    normal: "Soft, non-tender, non-distended, normal bowel sounds",
    options: [
      { id: "soft", label: "Soft" },
      { id: "non_tender", label: "Non-tender" },
      { id: "tenderness_present", label: "Tenderness Present" },
      { id: "non_distended", label: "Non-distended" },
      { id: "distended", label: "Distended" },
      { id: "normal_bs", label: "Normal Bowel Sounds" },
      { id: "hyperactive_bs", label: "Hyperactive BS" },
      { id: "hypoactive_bs", label: "Hypoactive BS" },
      { id: "no_hsm", label: "No HSM" },
      { id: "hepatomegaly", label: "Hepatomegaly" },
      { id: "splenomegaly", label: "Splenomegaly" },
      { id: "guarding", label: "Guarding" },
      { id: "rebound", label: "Rebound Tenderness" },
      { id: "no_masses", label: "No Masses" },
    ],
  },
  back: {
    label: "Back",
    normal: "No CVA tenderness, no spinal tenderness",
    options: [
      { id: "no_cva_tenderness", label: "No CVA Tenderness" },
      { id: "cva_tenderness", label: "CVA Tenderness" },
      { id: "no_spinal_tenderness", label: "No Spinal Tenderness" },
      { id: "spinal_tenderness", label: "Spinal Tenderness" },
      { id: "normal_rom", label: "Normal ROM" },
      { id: "limited_rom", label: "Limited ROM" },
      { id: "paraspinal_tenderness", label: "Paraspinal Tenderness" },
    ],
  },
  extremities: {
    label: "Extremities",
    normal: "No cyanosis, clubbing, or edema, pulses 2+ bilaterally",
    options: [
      { id: "no_cyanosis", label: "No Cyanosis" },
      { id: "cyanosis", label: "Cyanosis" },
      { id: "no_clubbing", label: "No Clubbing" },
      { id: "clubbing", label: "Clubbing" },
      { id: "no_edema", label: "No Edema" },
      { id: "edema_present", label: "Edema Present" },
      { id: "pulses_normal", label: "Pulses 2+ Bilaterally" },
      { id: "diminished_pulses", label: "Diminished Pulses" },
      { id: "full_rom", label: "Full ROM" },
      { id: "limited_rom", label: "Limited ROM" },
      { id: "joint_swelling", label: "Joint Swelling" },
      { id: "joint_tenderness", label: "Joint Tenderness" },
    ],
  },
  skin: {
    label: "Skin",
    normal: "Warm, dry, intact, no rashes or lesions",
    options: [
      { id: "warm", label: "Warm" },
      { id: "cool", label: "Cool" },
      { id: "dry", label: "Dry" },
      { id: "moist", label: "Moist/Diaphoretic" },
      { id: "intact", label: "Intact" },
      { id: "no_rashes", label: "No Rashes" },
      { id: "rash_present", label: "Rash Present" },
      { id: "no_lesions", label: "No Lesions" },
      { id: "lesions_present", label: "Lesions Present" },
      { id: "normal_turgor", label: "Normal Turgor" },
      { id: "poor_turgor", label: "Poor Turgor" },
    ],
  },
  neurological: {
    label: "Neurological",
    normal: "A&Ox3, CN II-XII intact, strength 5/5, sensation intact",
    options: [
      { id: "alert_oriented", label: "A&Ox3" },
      { id: "cn_intact", label: "CN II-XII Intact" },
      { id: "strength_normal", label: "Strength 5/5" },
      { id: "decreased_strength", label: "Decreased Strength" },
      { id: "sensation_intact", label: "Sensation Intact" },
      { id: "decreased_sensation", label: "Decreased Sensation" },
      { id: "dtrs_normal", label: "DTRs Normal" },
      { id: "hyperreflexia", label: "Hyperreflexia" },
      { id: "hyporeflexia", label: "Hyporeflexia" },
      { id: "gait_normal", label: "Gait Normal" },
      { id: "gait_abnormal", label: "Gait Abnormal" },
      { id: "romberg_negative", label: "Romberg Negative" },
      { id: "cerebellar_intact", label: "Cerebellar Intact" },
    ],
  },
  psychiatric: {
    label: "Psychiatric",
    normal: "Appropriate mood and affect, normal thought process",
    options: [
      { id: "appropriate_mood", label: "Appropriate Mood" },
      { id: "appropriate_affect", label: "Appropriate Affect" },
      { id: "flat_affect", label: "Flat Affect" },
      { id: "anxious_affect", label: "Anxious Affect" },
      { id: "depressed_affect", label: "Depressed Affect" },
      { id: "normal_thought", label: "Normal Thought Process" },
      { id: "good_insight", label: "Good Insight" },
      { id: "good_judgment", label: "Good Judgment" },
    ],
  },
};

// Common ICD-10 Diagnosis Codes (Primary Care focused)
export const icd10Codes = [
  // Respiratory
  { code: "J06.9", description: "Acute upper respiratory infection, unspecified" },
  { code: "J02.9", description: "Acute pharyngitis, unspecified" },
  { code: "J01.90", description: "Acute sinusitis, unspecified" },
  { code: "J00", description: "Acute nasopharyngitis (common cold)" },
  { code: "J20.9", description: "Acute bronchitis, unspecified" },
  { code: "J18.9", description: "Pneumonia, unspecified organism" },
  { code: "J45.909", description: "Unspecified asthma, uncomplicated" },
  { code: "J45.20", description: "Mild intermittent asthma, uncomplicated" },
  { code: "J44.9", description: "COPD, unspecified" },
  { code: "R05.9", description: "Cough, unspecified" },
  
  // Cardiovascular
  { code: "I10", description: "Essential (primary) hypertension" },
  { code: "I25.10", description: "Atherosclerotic heart disease of native coronary artery" },
  { code: "I50.9", description: "Heart failure, unspecified" },
  { code: "I48.91", description: "Atrial fibrillation, unspecified" },
  { code: "R00.0", description: "Tachycardia, unspecified" },
  { code: "R00.2", description: "Palpitations" },
  { code: "I73.9", description: "Peripheral vascular disease, unspecified" },
  
  // Endocrine/Metabolic
  { code: "E11.9", description: "Type 2 diabetes mellitus without complications" },
  { code: "E11.65", description: "Type 2 diabetes mellitus with hyperglycemia" },
  { code: "E10.9", description: "Type 1 diabetes mellitus without complications" },
  { code: "E78.00", description: "Pure hypercholesterolemia, unspecified" },
  { code: "E78.5", description: "Hyperlipidemia, unspecified" },
  { code: "E03.9", description: "Hypothyroidism, unspecified" },
  { code: "E05.90", description: "Thyrotoxicosis, unspecified" },
  { code: "E66.9", description: "Obesity, unspecified" },
  { code: "E66.01", description: "Morbid (severe) obesity due to excess calories" },
  
  // Gastrointestinal
  { code: "K21.0", description: "GERD with esophagitis" },
  { code: "K21.9", description: "GERD without esophagitis" },
  { code: "K30", description: "Functional dyspepsia" },
  { code: "K59.00", description: "Constipation, unspecified" },
  { code: "K52.9", description: "Noninfective gastroenteritis and colitis, unspecified" },
  { code: "A09", description: "Infectious gastroenteritis and colitis, unspecified" },
  { code: "K58.9", description: "Irritable bowel syndrome without diarrhea" },
  
  // Musculoskeletal
  { code: "M54.5", description: "Low back pain" },
  { code: "M54.2", description: "Cervicalgia (neck pain)" },
  { code: "M25.50", description: "Pain in unspecified joint" },
  { code: "M79.3", description: "Panniculitis, unspecified" },
  { code: "M79.1", description: "Myalgia" },
  { code: "M17.9", description: "Osteoarthritis of knee, unspecified" },
  { code: "M19.90", description: "Unspecified osteoarthritis, unspecified site" },
  { code: "M81.0", description: "Age-related osteoporosis without current fracture" },
  
  // Neurological
  { code: "G43.909", description: "Migraine, unspecified, not intractable" },
  { code: "G44.209", description: "Tension-type headache, unspecified" },
  { code: "R51.9", description: "Headache, unspecified" },
  { code: "R42", description: "Dizziness and giddiness" },
  { code: "G47.00", description: "Insomnia, unspecified" },
  { code: "G47.33", description: "Obstructive sleep apnea" },
  
  // Psychiatric
  { code: "F32.9", description: "Major depressive disorder, single episode, unspecified" },
  { code: "F33.0", description: "Major depressive disorder, recurrent, mild" },
  { code: "F41.1", description: "Generalized anxiety disorder" },
  { code: "F41.9", description: "Anxiety disorder, unspecified" },
  { code: "F43.10", description: "PTSD, unspecified" },
  { code: "F90.9", description: "ADHD, unspecified type" },
  
  // Genitourinary
  { code: "N39.0", description: "Urinary tract infection, site not specified" },
  { code: "N30.00", description: "Acute cystitis without hematuria" },
  { code: "N40.0", description: "Benign prostatic hyperplasia without LUTS" },
  { code: "N95.1", description: "Menopausal and female climacteric states" },
  
  // Skin
  { code: "L30.9", description: "Dermatitis, unspecified" },
  { code: "L20.9", description: "Atopic dermatitis, unspecified" },
  { code: "L70.0", description: "Acne vulgaris" },
  { code: "B35.1", description: "Tinea unguium (nail fungus)" },
  { code: "L03.90", description: "Cellulitis, unspecified" },
  
  // Infectious
  { code: "B34.9", description: "Viral infection, unspecified" },
  { code: "A69.20", description: "Lyme disease, unspecified" },
  { code: "U07.1", description: "COVID-19" },
  { code: "B00.9", description: "Herpesviral infection, unspecified" },
  
  // General/Symptoms
  { code: "R53.83", description: "Other fatigue" },
  { code: "R50.9", description: "Fever, unspecified" },
  { code: "R63.4", description: "Abnormal weight loss" },
  { code: "R63.5", description: "Abnormal weight gain" },
  { code: "Z00.00", description: "Encounter for general adult medical examination" },
  { code: "Z23", description: "Encounter for immunization" },
  { code: "Z01.818", description: "Encounter for other preprocedural examination" },
];

// Common CPT Procedure Codes (Office-based)
export const cptCodes = [
  // E/M Codes - Office Visits
  { code: "99201", description: "Office visit, new patient, straightforward MDM (10 min)" },
  { code: "99202", description: "Office visit, new patient, straightforward MDM (15-29 min)" },
  { code: "99203", description: "Office visit, new patient, low complexity MDM (30-44 min)" },
  { code: "99204", description: "Office visit, new patient, moderate complexity MDM (45-59 min)" },
  { code: "99205", description: "Office visit, new patient, high complexity MDM (60-74 min)" },
  { code: "99211", description: "Office visit, established patient, may not require physician" },
  { code: "99212", description: "Office visit, established patient, straightforward MDM (10-19 min)" },
  { code: "99213", description: "Office visit, established patient, low complexity MDM (20-29 min)" },
  { code: "99214", description: "Office visit, established patient, moderate complexity MDM (30-39 min)" },
  { code: "99215", description: "Office visit, established patient, high complexity MDM (40-54 min)" },
  
  // Telehealth
  { code: "99421", description: "Online digital E/M, 5-10 minutes" },
  { code: "99422", description: "Online digital E/M, 11-20 minutes" },
  { code: "99423", description: "Online digital E/M, 21+ minutes" },
  { code: "99441", description: "Telephone E/M, 5-10 minutes" },
  { code: "99442", description: "Telephone E/M, 11-20 minutes" },
  { code: "99443", description: "Telephone E/M, 21-30 minutes" },
  
  // Preventive Medicine
  { code: "99381", description: "Preventive visit, new patient, infant (age <1)" },
  { code: "99382", description: "Preventive visit, new patient, 1-4 years" },
  { code: "99383", description: "Preventive visit, new patient, 5-11 years" },
  { code: "99384", description: "Preventive visit, new patient, 12-17 years" },
  { code: "99385", description: "Preventive visit, new patient, 18-39 years" },
  { code: "99386", description: "Preventive visit, new patient, 40-64 years" },
  { code: "99387", description: "Preventive visit, new patient, 65+ years" },
  { code: "99391", description: "Preventive visit, established patient, infant (age <1)" },
  { code: "99392", description: "Preventive visit, established patient, 1-4 years" },
  { code: "99393", description: "Preventive visit, established patient, 5-11 years" },
  { code: "99394", description: "Preventive visit, established patient, 12-17 years" },
  { code: "99395", description: "Preventive visit, established patient, 18-39 years" },
  { code: "99396", description: "Preventive visit, established patient, 40-64 years" },
  { code: "99397", description: "Preventive visit, established patient, 65+ years" },
  
  // Procedures
  { code: "11102", description: "Tangential biopsy of skin, single lesion" },
  { code: "11104", description: "Punch biopsy of skin, single lesion" },
  { code: "11200", description: "Removal of skin tags, up to 15 lesions" },
  { code: "11300", description: "Shaving of lesion, trunk/arms/legs, 0.5 cm or less" },
  { code: "11400", description: "Excision, benign lesion, trunk/arms/legs, 0.5 cm or less" },
  { code: "17000", description: "Destruction of premalignant lesion, first lesion" },
  { code: "17110", description: "Destruction of benign lesions, up to 14 lesions" },
  { code: "20552", description: "Injection, single trigger point" },
  { code: "20553", description: "Injection, 3+ trigger points" },
  { code: "20610", description: "Arthrocentesis, aspiration/injection, major joint" },
  { code: "36415", description: "Collection of venous blood by venipuncture" },
  { code: "69210", description: "Removal of impacted cerumen, unilateral" },
  { code: "90471", description: "Immunization administration, first vaccine" },
  { code: "90472", description: "Immunization administration, each additional vaccine" },
  { code: "96372", description: "Therapeutic injection, subcutaneous or intramuscular" },
  { code: "96374", description: "Therapeutic IV push, single substance" },
  
  // Prolonged Services
  { code: "99354", description: "Prolonged service, first hour" },
  { code: "99355", description: "Prolonged service, each additional 30 min" },
  { code: "99417", description: "Prolonged office visit, each 15 min beyond threshold" },
  
  // Care Management
  { code: "99490", description: "Chronic care management, 20+ minutes" },
  { code: "99491", description: "Chronic care management by physician, 30+ minutes" },
  { code: "99495", description: "Transitional care management, moderate complexity" },
  { code: "99496", description: "Transitional care management, high complexity" },
];

// Common Medications Database
export const medicationDatabase = [
  // Antibiotics
  { name: "Amoxicillin", category: "Antibiotic", commonDoses: ["250mg", "500mg", "875mg"], frequencies: ["TID", "BID"], class: "Penicillin" },
  { name: "Amoxicillin-Clavulanate (Augmentin)", category: "Antibiotic", commonDoses: ["500/125mg", "875/125mg"], frequencies: ["BID"], class: "Penicillin" },
  { name: "Azithromycin (Z-Pack)", category: "Antibiotic", commonDoses: ["250mg", "500mg"], frequencies: ["Daily"], class: "Macrolide" },
  { name: "Ciprofloxacin", category: "Antibiotic", commonDoses: ["250mg", "500mg", "750mg"], frequencies: ["BID"], class: "Fluoroquinolone" },
  { name: "Levofloxacin", category: "Antibiotic", commonDoses: ["500mg", "750mg"], frequencies: ["Daily"], class: "Fluoroquinolone" },
  { name: "Doxycycline", category: "Antibiotic", commonDoses: ["100mg"], frequencies: ["BID", "Daily"], class: "Tetracycline" },
  { name: "Cephalexin (Keflex)", category: "Antibiotic", commonDoses: ["250mg", "500mg"], frequencies: ["QID", "TID"], class: "Cephalosporin" },
  { name: "Sulfamethoxazole-Trimethoprim (Bactrim)", category: "Antibiotic", commonDoses: ["400/80mg DS", "800/160mg DS"], frequencies: ["BID"], class: "Sulfonamide" },
  { name: "Metronidazole (Flagyl)", category: "Antibiotic", commonDoses: ["250mg", "500mg"], frequencies: ["TID", "BID"], class: "Nitroimidazole" },
  { name: "Nitrofurantoin (Macrobid)", category: "Antibiotic", commonDoses: ["100mg"], frequencies: ["BID"], class: "Nitrofuran" },
  
  // Pain/Anti-inflammatory
  { name: "Ibuprofen", category: "NSAID", commonDoses: ["200mg", "400mg", "600mg", "800mg"], frequencies: ["TID", "QID", "PRN"], class: "NSAID" },
  { name: "Naproxen", category: "NSAID", commonDoses: ["250mg", "500mg"], frequencies: ["BID", "PRN"], class: "NSAID" },
  { name: "Acetaminophen (Tylenol)", category: "Analgesic", commonDoses: ["325mg", "500mg", "650mg", "1000mg"], frequencies: ["Q4-6H PRN", "TID", "QID"], class: "Analgesic" },
  { name: "Meloxicam", category: "NSAID", commonDoses: ["7.5mg", "15mg"], frequencies: ["Daily"], class: "NSAID" },
  { name: "Celecoxib (Celebrex)", category: "NSAID", commonDoses: ["100mg", "200mg"], frequencies: ["Daily", "BID"], class: "COX-2 Inhibitor" },
  { name: "Tramadol", category: "Analgesic", commonDoses: ["50mg", "100mg"], frequencies: ["Q4-6H PRN", "TID", "QID"], class: "Opioid Agonist" },
  { name: "Cyclobenzaprine (Flexeril)", category: "Muscle Relaxant", commonDoses: ["5mg", "10mg"], frequencies: ["TID", "BID", "QHS"], class: "Muscle Relaxant" },
  { name: "Methocarbamol (Robaxin)", category: "Muscle Relaxant", commonDoses: ["500mg", "750mg"], frequencies: ["TID", "QID"], class: "Muscle Relaxant" },
  
  // Cardiovascular
  { name: "Lisinopril", category: "Antihypertensive", commonDoses: ["2.5mg", "5mg", "10mg", "20mg", "40mg"], frequencies: ["Daily"], class: "ACE Inhibitor" },
  { name: "Losartan", category: "Antihypertensive", commonDoses: ["25mg", "50mg", "100mg"], frequencies: ["Daily", "BID"], class: "ARB" },
  { name: "Amlodipine", category: "Antihypertensive", commonDoses: ["2.5mg", "5mg", "10mg"], frequencies: ["Daily"], class: "CCB" },
  { name: "Metoprolol Succinate", category: "Antihypertensive", commonDoses: ["25mg", "50mg", "100mg", "200mg"], frequencies: ["Daily"], class: "Beta Blocker" },
  { name: "Metoprolol Tartrate", category: "Antihypertensive", commonDoses: ["25mg", "50mg", "100mg"], frequencies: ["BID"], class: "Beta Blocker" },
  { name: "Atenolol", category: "Antihypertensive", commonDoses: ["25mg", "50mg", "100mg"], frequencies: ["Daily"], class: "Beta Blocker" },
  { name: "Hydrochlorothiazide", category: "Diuretic", commonDoses: ["12.5mg", "25mg", "50mg"], frequencies: ["Daily"], class: "Thiazide Diuretic" },
  { name: "Furosemide (Lasix)", category: "Diuretic", commonDoses: ["20mg", "40mg", "80mg"], frequencies: ["Daily", "BID"], class: "Loop Diuretic" },
  { name: "Spironolactone", category: "Diuretic", commonDoses: ["25mg", "50mg", "100mg"], frequencies: ["Daily", "BID"], class: "Potassium-Sparing" },
  { name: "Atorvastatin (Lipitor)", category: "Lipid Lowering", commonDoses: ["10mg", "20mg", "40mg", "80mg"], frequencies: ["Daily"], class: "Statin" },
  { name: "Rosuvastatin (Crestor)", category: "Lipid Lowering", commonDoses: ["5mg", "10mg", "20mg", "40mg"], frequencies: ["Daily"], class: "Statin" },
  { name: "Simvastatin", category: "Lipid Lowering", commonDoses: ["10mg", "20mg", "40mg"], frequencies: ["Daily"], class: "Statin" },
  { name: "Aspirin", category: "Antiplatelet", commonDoses: ["81mg", "325mg"], frequencies: ["Daily"], class: "Antiplatelet" },
  { name: "Clopidogrel (Plavix)", category: "Antiplatelet", commonDoses: ["75mg"], frequencies: ["Daily"], class: "Antiplatelet" },
  { name: "Warfarin (Coumadin)", category: "Anticoagulant", commonDoses: ["1mg", "2mg", "2.5mg", "3mg", "4mg", "5mg", "6mg", "7.5mg", "10mg"], frequencies: ["Daily"], class: "Anticoagulant" },
  { name: "Apixaban (Eliquis)", category: "Anticoagulant", commonDoses: ["2.5mg", "5mg"], frequencies: ["BID"], class: "DOAC" },
  { name: "Rivaroxaban (Xarelto)", category: "Anticoagulant", commonDoses: ["10mg", "15mg", "20mg"], frequencies: ["Daily"], class: "DOAC" },
  
  // Diabetes
  { name: "Metformin", category: "Antidiabetic", commonDoses: ["500mg", "850mg", "1000mg"], frequencies: ["BID", "TID"], class: "Biguanide" },
  { name: "Metformin ER", category: "Antidiabetic", commonDoses: ["500mg", "750mg", "1000mg"], frequencies: ["Daily"], class: "Biguanide" },
  { name: "Glipizide", category: "Antidiabetic", commonDoses: ["2.5mg", "5mg", "10mg"], frequencies: ["Daily", "BID"], class: "Sulfonylurea" },
  { name: "Glimepiride", category: "Antidiabetic", commonDoses: ["1mg", "2mg", "4mg"], frequencies: ["Daily"], class: "Sulfonylurea" },
  { name: "Sitagliptin (Januvia)", category: "Antidiabetic", commonDoses: ["25mg", "50mg", "100mg"], frequencies: ["Daily"], class: "DPP-4 Inhibitor" },
  { name: "Empagliflozin (Jardiance)", category: "Antidiabetic", commonDoses: ["10mg", "25mg"], frequencies: ["Daily"], class: "SGLT2 Inhibitor" },
  { name: "Semaglutide (Ozempic)", category: "Antidiabetic", commonDoses: ["0.25mg", "0.5mg", "1mg", "2mg"], frequencies: ["Weekly"], class: "GLP-1 Agonist" },
  { name: "Insulin Glargine (Lantus)", category: "Antidiabetic", commonDoses: ["10-100 units"], frequencies: ["Daily"], class: "Long-Acting Insulin" },
  { name: "Insulin Lispro (Humalog)", category: "Antidiabetic", commonDoses: ["Variable"], frequencies: ["With meals"], class: "Rapid-Acting Insulin" },
  
  // Psychiatric
  { name: "Sertraline (Zoloft)", category: "Antidepressant", commonDoses: ["25mg", "50mg", "100mg", "150mg", "200mg"], frequencies: ["Daily"], class: "SSRI" },
  { name: "Escitalopram (Lexapro)", category: "Antidepressant", commonDoses: ["5mg", "10mg", "20mg"], frequencies: ["Daily"], class: "SSRI" },
  { name: "Fluoxetine (Prozac)", category: "Antidepressant", commonDoses: ["10mg", "20mg", "40mg", "60mg"], frequencies: ["Daily"], class: "SSRI" },
  { name: "Paroxetine (Paxil)", category: "Antidepressant", commonDoses: ["10mg", "20mg", "30mg", "40mg"], frequencies: ["Daily"], class: "SSRI" },
  { name: "Citalopram (Celexa)", category: "Antidepressant", commonDoses: ["10mg", "20mg", "40mg"], frequencies: ["Daily"], class: "SSRI" },
  { name: "Bupropion (Wellbutrin)", category: "Antidepressant", commonDoses: ["75mg", "100mg", "150mg", "300mg"], frequencies: ["Daily", "BID"], class: "NDRI" },
  { name: "Venlafaxine (Effexor)", category: "Antidepressant", commonDoses: ["37.5mg", "75mg", "150mg", "225mg"], frequencies: ["Daily"], class: "SNRI" },
  { name: "Duloxetine (Cymbalta)", category: "Antidepressant", commonDoses: ["20mg", "30mg", "60mg"], frequencies: ["Daily"], class: "SNRI" },
  { name: "Trazodone", category: "Antidepressant", commonDoses: ["50mg", "100mg", "150mg"], frequencies: ["QHS"], class: "SARI" },
  { name: "Mirtazapine (Remeron)", category: "Antidepressant", commonDoses: ["7.5mg", "15mg", "30mg", "45mg"], frequencies: ["QHS"], class: "Atypical" },
  { name: "Buspirone", category: "Anxiolytic", commonDoses: ["5mg", "10mg", "15mg"], frequencies: ["BID", "TID"], class: "Azapirone" },
  { name: "Hydroxyzine", category: "Anxiolytic", commonDoses: ["25mg", "50mg"], frequencies: ["TID", "QID", "PRN"], class: "Antihistamine" },
  { name: "Lorazepam (Ativan)", category: "Anxiolytic", commonDoses: ["0.5mg", "1mg", "2mg"], frequencies: ["BID", "TID", "PRN"], class: "Benzodiazepine" },
  { name: "Alprazolam (Xanax)", category: "Anxiolytic", commonDoses: ["0.25mg", "0.5mg", "1mg"], frequencies: ["BID", "TID", "PRN"], class: "Benzodiazepine" },
  
  // GI
  { name: "Omeprazole (Prilosec)", category: "Antacid", commonDoses: ["20mg", "40mg"], frequencies: ["Daily", "BID"], class: "PPI" },
  { name: "Pantoprazole (Protonix)", category: "Antacid", commonDoses: ["20mg", "40mg"], frequencies: ["Daily", "BID"], class: "PPI" },
  { name: "Esomeprazole (Nexium)", category: "Antacid", commonDoses: ["20mg", "40mg"], frequencies: ["Daily"], class: "PPI" },
  { name: "Famotidine (Pepcid)", category: "Antacid", commonDoses: ["20mg", "40mg"], frequencies: ["Daily", "BID"], class: "H2 Blocker" },
  { name: "Ondansetron (Zofran)", category: "Antiemetic", commonDoses: ["4mg", "8mg"], frequencies: ["Q8H PRN", "TID"], class: "5-HT3 Antagonist" },
  { name: "Promethazine (Phenergan)", category: "Antiemetic", commonDoses: ["12.5mg", "25mg"], frequencies: ["Q6H PRN"], class: "Antihistamine" },
  { name: "Polyethylene Glycol (Miralax)", category: "Laxative", commonDoses: ["17g"], frequencies: ["Daily"], class: "Osmotic Laxative" },
  { name: "Docusate (Colace)", category: "Laxative", commonDoses: ["100mg", "250mg"], frequencies: ["Daily", "BID"], class: "Stool Softener" },
  
  // Respiratory
  { name: "Albuterol Inhaler", category: "Bronchodilator", commonDoses: ["90mcg/puff"], frequencies: ["Q4-6H PRN"], class: "SABA" },
  { name: "Fluticasone Inhaler (Flovent)", category: "Inhaled Steroid", commonDoses: ["44mcg", "110mcg", "220mcg"], frequencies: ["BID"], class: "ICS" },
  { name: "Fluticasone-Salmeterol (Advair)", category: "Combination", commonDoses: ["100/50", "250/50", "500/50"], frequencies: ["BID"], class: "ICS/LABA" },
  { name: "Budesonide-Formoterol (Symbicort)", category: "Combination", commonDoses: ["80/4.5", "160/4.5"], frequencies: ["BID"], class: "ICS/LABA" },
  { name: "Tiotropium (Spiriva)", category: "Bronchodilator", commonDoses: ["18mcg"], frequencies: ["Daily"], class: "LAMA" },
  { name: "Montelukast (Singulair)", category: "Antileukotriene", commonDoses: ["4mg", "5mg", "10mg"], frequencies: ["Daily"], class: "LTRA" },
  { name: "Prednisone", category: "Corticosteroid", commonDoses: ["5mg", "10mg", "20mg", "40mg", "60mg"], frequencies: ["Daily", "Taper"], class: "Systemic Steroid" },
  { name: "Methylprednisolone (Medrol)", category: "Corticosteroid", commonDoses: ["4mg", "Dose Pack"], frequencies: ["Per Pack"], class: "Systemic Steroid" },
  { name: "Benzonatate (Tessalon)", category: "Antitussive", commonDoses: ["100mg", "200mg"], frequencies: ["TID"], class: "Antitussive" },
  { name: "Guaifenesin-Codeine", category: "Antitussive", commonDoses: ["10mL"], frequencies: ["Q4-6H PRN"], class: "Antitussive" },
  
  // Thyroid
  { name: "Levothyroxine (Synthroid)", category: "Thyroid", commonDoses: ["25mcg", "50mcg", "75mcg", "88mcg", "100mcg", "112mcg", "125mcg", "137mcg", "150mcg", "175mcg", "200mcg"], frequencies: ["Daily"], class: "Thyroid Hormone" },
  
  // Allergies
  { name: "Cetirizine (Zyrtec)", category: "Antihistamine", commonDoses: ["5mg", "10mg"], frequencies: ["Daily"], class: "2nd Gen Antihistamine" },
  { name: "Loratadine (Claritin)", category: "Antihistamine", commonDoses: ["10mg"], frequencies: ["Daily"], class: "2nd Gen Antihistamine" },
  { name: "Fexofenadine (Allegra)", category: "Antihistamine", commonDoses: ["60mg", "180mg"], frequencies: ["Daily", "BID"], class: "2nd Gen Antihistamine" },
  { name: "Diphenhydramine (Benadryl)", category: "Antihistamine", commonDoses: ["25mg", "50mg"], frequencies: ["Q6H PRN"], class: "1st Gen Antihistamine" },
  { name: "Fluticasone Nasal (Flonase)", category: "Nasal Steroid", commonDoses: ["50mcg/spray"], frequencies: ["1-2 sprays each nostril daily"], class: "Intranasal Steroid" },
  
  // Neurological
  { name: "Gabapentin (Neurontin)", category: "Anticonvulsant", commonDoses: ["100mg", "300mg", "400mg", "600mg", "800mg"], frequencies: ["TID"], class: "Anticonvulsant" },
  { name: "Pregabalin (Lyrica)", category: "Anticonvulsant", commonDoses: ["25mg", "50mg", "75mg", "100mg", "150mg", "200mg", "300mg"], frequencies: ["BID", "TID"], class: "Anticonvulsant" },
  { name: "Topiramate (Topamax)", category: "Anticonvulsant", commonDoses: ["25mg", "50mg", "100mg", "200mg"], frequencies: ["BID"], class: "Anticonvulsant" },
  { name: "Sumatriptan (Imitrex)", category: "Migraine", commonDoses: ["25mg", "50mg", "100mg"], frequencies: ["PRN"], class: "Triptan" },
  
  // Vitamins/Supplements
  { name: "Vitamin D3", category: "Supplement", commonDoses: ["1000 IU", "2000 IU", "5000 IU", "50000 IU"], frequencies: ["Daily", "Weekly"], class: "Vitamin" },
  { name: "Vitamin B12", category: "Supplement", commonDoses: ["1000mcg", "2500mcg"], frequencies: ["Daily"], class: "Vitamin" },
  { name: "Ferrous Sulfate", category: "Supplement", commonDoses: ["325mg"], frequencies: ["Daily", "BID", "TID"], class: "Iron" },
  { name: "Calcium + Vitamin D", category: "Supplement", commonDoses: ["600mg/400IU", "500mg/200IU"], frequencies: ["BID"], class: "Mineral" },
  { name: "Folic Acid", category: "Supplement", commonDoses: ["400mcg", "1mg"], frequencies: ["Daily"], class: "Vitamin" },
];

// Types for clinical data
export interface DiagnosisCode {
  code: string;
  description: string;
  isPrimary?: boolean;
}

export interface ProcedureCode {
  code: string;
  description: string;
  modifier?: string;
  quantity?: number;
}

export interface MedicationEntry {
  name: string;
  dose: string;
  frequency: string;
  duration?: string;
  route?: string;
  instructions?: string;
  refills?: number;
  dispenseQuantity?: number;
}

export interface RosChecklist {
  [system: string]: string[];
}

export interface PeChecklist {
  [region: string]: string[];
}
