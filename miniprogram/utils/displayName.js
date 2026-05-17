const subjectShortMap = {
  English: "英文",
  英文: "英文",
  "Secondary 1 G3 Math": "中一 数学(G3)",
  "Secondary 2 G3 Math": "中二 数学(G3)",
  "Secondary 3/4 G3 Math": "中三/四 数学(G3)",
  "Secondary 3/4 G3 Additional Mathematics": "中三/四 高数(G3)",
  "Lower Secondary G3 History": "中一/二 历史(G3)",
  "Lower Secondary G3 Geography": "中一/二 地理(G3)",
  "Lower Secondary G3 Science": "中一/二 科学(G3)",
  "Secondary 3/4 Pure Physics": "中三/四 物理(纯)",
  "Secondary 3/4 Pure Chemistry": "中三/四 化学(纯)",
  "Secondary 3/4 Pure Biology": "中三/四 生物(纯)",
  "Secondary 3/4 Combined Science (Chemistry, Physics)": "中三/四 混搭科学(化/物)",
  "Secondary 3/4 Combined Science (Chemistry, Biology)": "中三/四 混搭科学(化/生)",
  "Social Studies (Upper Secondary G3)": "中三/四 社会研究(G3)",
  "Secondary 3/4 History (Elective)": "中三/四 历史(选修)",
  "Secondary 3/4 Geography (Elective)": "中三/四 地理(选修)",
};

const topicShortMap = {
  S1M01: "因数与倍数",
  S1M02: "实数",
  S1M03: "近似与估算",
  S1M04: "代数式与公式",
  S1M05: "一元一次方程",
  S1M06: "代数运算",
  S1M07: "比率与速度",
  S1M08: "百分比",
  S1M09: "数列",
  S1M10: "坐标与一次函数",
  S1M11: "一元不等式",
  S1M12: "角与三角形",
  S1M13: "周长与面积",
  S1M14: "体积与表面积",
  S1M15: "统计与数据",

  S2M01: "比例",
  S2M02: "展开与因式分解",
  S2M03: "二次方程",
  S2M04: "二次函数图像",
  S2M05: "代数分式",
  S2M06: "二元一次方程组",
  S2M07: "勾股定理",
  S2M08: "三角比",
  S2M09: "全等与相似",
  S2M10: "锥/球体测量",
  S2M11: "数据分析",
  S2M12: "概率",

  S34M01: "指数与标准式",
  S34M02: "方程与不等式",
  S34M03: "函数与图像",
  S34M04: "解析几何",
  S34M05: "几何测量",
  S34M06: "三角函数",
  S34M07: "平面向量",
  S34M08: "集合与概率",
  S34M09: "矩阵基础",
  S34M10: "统计量",

  S34AM01: "方程与不等式",
  S34AM02: "指数与根式",
  S34AM03: "多项式与部分分式",
  S34AM04: "二项式定理",
  S34AM05: "指数/对数/绝对值函数",
  S34AM06: "三角函数与恒等式",
  S34AM07: "解析几何",
  S34AM08: "平面几何证明",
  S34AM09: "微分",
  S34AM10: "积分",

  LSH01: "新加坡早期史",
  LSH02: "英殖时期",
  LSH03: "日据时期",
  LSH04: "战后到独立",
  LSH05: "建国初期",

  LSG01: "水资源",
  LSG02: "雨林与红树林",
  LSG03: "城市住房",
  LSG04: "城市交通",

  LSS01: "科学探究",
  LSS02: "物质多样性",
  LSS03: "物质模型",
  LSS04: "细胞模型",
  LSS05: "消化系统",
  LSS06: "光的射线模型",
  LSS07: "电路系统",
  LSS08: "生物运输系统",
  LSS09: "生殖系统",
  LSS10: "生态系统互动",
  LSS11: "力与运动",

  PHY01: "测量",
  PHY02: "运动学",
  PHY03: "动力学",
  PHY04: "力",
  PHY05: "能量/功/功率",
  PHY06: "热学",
  PHY07: "波",
  PHY08: "光学",
  PHY09: "电学",
  PHY10: "磁与电磁",
  PHY11: "放射性",

  CHEM01: "实验化学",
  CHEM02: "粒子与原子/周期表",
  CHEM03: "化学键",
  CHEM04: "化学计量与摩尔",
  CHEM05: "酸碱盐",
  CHEM06: "氧化还原",
  CHEM07: "反应与能量变化",
  CHEM08: "电化学(电解)",
  CHEM09: "金属",
  CHEM10: "空气与环境化学",
  CHEM11: "有机化学基础",

  BIO01: "细胞结构",
  BIO02: "生物分子",
  BIO03: "人体营养",
  BIO04: "植物营养",
  BIO05: "植物运输",
  BIO06: "人体运输",
  BIO07: "呼吸与气体交换",
  BIO08: "排泄与稳态",
  BIO09: "协调与反应",
  BIO10: "生殖",
  BIO11: "细胞分裂与遗传",
  BIO12: "生物与环境",

  "CSPH-CHEM1": "化学：粒子与结构",
  "CSPH-CHEM2": "化学：化学变化与能量",
  "CSPH-CHEM3": "化学：酸碱与混合物",
  "CSPH-CHEM4": "化学：材料与环境",
  "CSPH-PHY1": "物理：力学",
  "CSPH-PHY2": "物理：质量/重量/密度",
  "CSPH-PHY3": "物理：热学",
  "CSPH-PHY4": "物理：波(光/声)",
  "CSPH-PHY5": "物理：电与磁",

  "CSBIO-CHEM1": "化学：物质微粒性",
  "CSBIO-CHEM2": "化学：基础反应",
  "CSBIO-CHEM3": "化学：分离与提纯",
  "CSBIO-BIO1": "生物：细胞与物质移动",
  "CSBIO-BIO2": "生物：营养与消化",
  "CSBIO-BIO3": "生物：人体运输",
  "CSBIO-BIO4": "生物：呼吸",
  "CSBIO-BIO5": "生物：人体生殖",
  "CSBIO-BIO6": "生物：生态与人类",

  SS01: "议题1 公民与治理",
  SS02: "议题2 多元社会",
  SS03: "议题3 全球化",

  HISEL01: "一战影响",
  HISEL02: "两战间威权崛起",
  HISEL03: "二战(欧/亚太)",
  HISEL04: "冷战与两极格局",
  HISEL05: "冷战在欧外",
  HISEL06: "冷战结束原因",

  GEOEL01: "旅游",
  GEOEL02: "气候",
  GEOEL03: "板块构造",
};

const hasLatin = (value = "") => /[A-Za-z]/.test(String(value));

const formatSubjectName = (name = "") => {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const mapped = subjectShortMap[raw] || raw;
  if (mapped !== raw && hasLatin(raw)) {
    return `${mapped}\n${raw}`;
  }
  return mapped;
};

const formatTopicTitle = (topic = {}) => {
  const code = typeof topic === "string" ? "" : topic.code || "";
  const title = typeof topic === "string" ? topic : topic.title || "";
  if (code && topicShortMap[code]) return topicShortMap[code];
  return title;
};

module.exports = {
  formatSubjectName,
  formatTopicTitle,
};
