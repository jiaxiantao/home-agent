import { getDb } from "../src/lib/db";
import { ensurePgTrgmExtension } from "../src/lib/pg-trgm";

function requireDb() {
  const prisma = getDb();

  if (!prisma) {
    throw new Error("DATABASE_URL is not configured");
  }

  return prisma;
}

const prisma = requireDb();

const seededNotes = [
  {
    title: "架构评审时我最先确认的事情",
    slug: "architecture-review-checkpoints",
    summary: "记录我在复杂页面或系统评审时优先确认的边界、数据流和演进风险。",
    contentMarkdown:
      "我通常不会先看页面长什么样，而是先确认边界、数据流、状态落点和后续迭代方式。只要这几件事没理顺，组件拆分和技术选型都很容易漂移。",
    tags: ["架构", "评审", "系统设计"],
  },
  {
    title: "性能排查的默认顺序",
    slug: "performance-debug-default-order",
    summary: "把性能问题拆成资源、渲染、状态更新和异常链路几个维度。",
    contentMarkdown:
      "排查性能时，我会先确认是不是核心链路问题，再看资源加载、渲染路径、状态更新、第三方脚本和异常链路。这样可以避免一开始就陷入局部优化。",
    tags: ["性能", "排查", "体验治理"],
  },
  {
    title: "我如何把 AI 放进日常工程流程",
    slug: "ai-workflow-in-engineering",
    summary: "重点不是让 AI 单次生成得更漂亮，而是让它进入稳定、可校验的工作流。",
    contentMarkdown:
      "我更关注 AI 是否理解项目结构、规则和已有内容，再让结果进入 lint、typecheck、build 和人工 review。只要校验链路在，AI 才能真正长期参与工程。",
    tags: ["AI", "工作流", "工程化"],
  },
  {
    title: "笔记检索：pg_trgm 与内存打分的取舍",
    slug: "notes-search-pg-trgm-vs-memory",
    summary: "有扩展时用相似度排序，没有时回退 token 打分。",
    contentMarkdown:
      "生产环境优先启用 pg_trgm，开发机没权限时自动回退 memory。Agent 的 search_notes 工具会走同一套检索逻辑。",
    tags: ["PostgreSQL", "检索", "pg_trgm"],
  },
];

async function main() {
  await prisma.note.deleteMany();

  for (const note of seededNotes) {
    await prisma.note.create({ data: note });
  }

  const pgTrgm = await ensurePgTrgmExtension();

  console.log(
    `Seeded ${seededNotes.length} notes · pg_trgm: ${pgTrgm ? "enabled" : "unavailable (memory fallback)"}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
