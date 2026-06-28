export const appleRules = {
  fresh: {
    defectLabel: "无明显瑕疵",
    businessDefect: "外观完整",
    grade: "A",
    safety: "safe",
    safetyLabel: "不影响食用",
    priceSuggestion: "市场价 90%-100%",
    reviewRequired: false,
    riskFlags: [],
    consumerTemplate: "这批苹果外观完整度较高，未发现明显瑕疵，适合家庭鲜食、礼盒替换或日常水果补充。"
  },
  scab_defect: {
    defectLabel: "果锈/疮痂斑",
    businessDefect: "表皮瑕疵",
    grade: "B",
    safety: "safe",
    safetyLabel: "通常不影响果肉食用",
    priceSuggestion: "市场价 65%-80%",
    reviewRequired: false,
    riskFlags: [],
    consumerTemplate: "这批苹果表皮有果锈或疮痂斑，外观不如优果完整，但通常不影响果肉和日常食用，适合家庭装。"
  },
  bruise_defect: {
    defectLabel: "轻微碰伤",
    businessDefect: "果面局部碰伤",
    grade: "C",
    safety: "caution",
    safetyLabel: "建议尽快食用",
    priceSuggestion: "市场价 50%-65%",
    reviewRequired: true,
    riskFlags: ["bruise_area_needs_human_check"],
    consumerTemplate: "这批苹果存在局部轻微碰伤，建议收到后优先食用或用于榨汁、果切，平台复核后再展示给消费者。"
  },
  rot_defect: {
    defectLabel: "疑似腐烂",
    businessDefect: "食品安全风险",
    grade: "blocked",
    safety: "risk",
    safetyLabel: "存在食用安全风险",
    priceSuggestion: "不建议销售",
    reviewRequired: true,
    riskFlags: ["possible_food_safety_risk", "forced_review"],
    consumerTemplate: ""
  }
};

export const appleSamples = [
  { id: "apple_fresh_001", label: "fresh", image: "./assets/apple_samples/fresh/SD_REAL_0001.jpg", origin: "山东烟台", weight: 5, expectedPrice: 39.9 },
  { id: "apple_fresh_002", label: "fresh", image: "./assets/apple_samples/fresh/SD_REAL_0002.jpg", origin: "陕西洛川", weight: 3, expectedPrice: 25.9 },
  { id: "apple_fresh_003", label: "fresh", image: "./assets/apple_samples/fresh/SD_REAL_0003.jpg", origin: "甘肃天水", weight: 5, expectedPrice: 36.9 },
  { id: "apple_scab_001", label: "scab_defect", image: "./assets/apple_samples/scab_defect/C_REAL_0001.jpg", origin: "山东烟台", weight: 5, expectedPrice: 27.9 },
  { id: "apple_scab_002", label: "scab_defect", image: "./assets/apple_samples/scab_defect/C_REAL_0002.jpg", origin: "陕西洛川", weight: 4, expectedPrice: 24.9 },
  { id: "apple_scab_003", label: "scab_defect", image: "./assets/apple_samples/scab_defect/C_REAL_0003.jpg", origin: "甘肃天水", weight: 5, expectedPrice: 26.9 },
  { id: "apple_bruise_001", label: "bruise_defect", image: "./assets/apple_samples/bruise_defect/M_REAL_0001.jpg", origin: "山东烟台", weight: 5, expectedPrice: 24.9 },
  { id: "apple_bruise_002", label: "bruise_defect", image: "./assets/apple_samples/bruise_defect/M_REAL_0002.jpg", origin: "陕西洛川", weight: 4, expectedPrice: 21.9 },
  { id: "apple_bruise_003", label: "bruise_defect", image: "./assets/apple_samples/bruise_defect/M_REAL_0003.jpg", origin: "甘肃天水", weight: 5, expectedPrice: 23.9 },
  { id: "apple_rot_001", label: "rot_defect", image: "./assets/apple_samples/rot_defect/P_REAL_0001.png", origin: "山东烟台", weight: 5, expectedPrice: 19.9 },
  { id: "apple_rot_002", label: "rot_defect", image: "./assets/apple_samples/rot_defect/P_REAL_0002.png", origin: "陕西洛川", weight: 4, expectedPrice: 18.9 },
  { id: "apple_rot_003", label: "rot_defect", image: "./assets/apple_samples/rot_defect/P_REAL_0003.png", origin: "甘肃天水", weight: 5, expectedPrice: 17.9 }
];
