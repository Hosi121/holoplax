import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const main = async () => {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@holoplax.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin1234";
  const testEmail = process.env.TEST_EMAIL ?? "test@holoplax.local";
  const testPassword = process.env.TEST_PASSWORD ?? "test1234";

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "Admin",
      email: adminEmail,
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });

  const testUser = await prisma.user.upsert({
    where: { email: testEmail },
    update: {},
    create: {
      name: "Test User",
      email: testEmail,
      role: "USER",
      emailVerified: new Date(),
    },
  });

  const ensurePassword = async (userId, password) => {
    const existing = await prisma.userPassword.findUnique({ where: { userId } });
    if (existing) return;
    const hashed = await bcrypt.hash(password, 10);
    await prisma.userPassword.create({
      data: { userId, hash: hashed },
    });
  };

  await ensurePassword(adminUser.id, adminPassword);
  await ensurePassword(testUser.id, testPassword);
  const ensureTask = async (data) => {
    const existing = await prisma.task.findFirst({
      where: { title: data.title, userId: testUser.id },
    });
    return existing ?? prisma.task.create({ data });
  };

  const tasks = await Promise.all([
    ensureTask({
      title: "新規LPのワイヤー作成",
      description: "ヒーロー、特徴、CTA、FAQまでを簡易にまとめる。",
      points: 5,
      urgency: "中",
      risk: "低",
      status: "BACKLOG",
      userId: testUser.id,
    }),
    ensureTask({
      title: "DBバックアップ導線の検討",
      description: "自動スナップショットと復元フローを整理する。",
      points: 8,
      urgency: "中",
      risk: "中",
      status: "BACKLOG",
      userId: testUser.id,
    }),
    ensureTask({
      title: "ユーザーインタビュー設計",
      description: "ヒアリング項目とスクリーニング条件を作る。",
      points: 3,
      urgency: "高",
      risk: "中",
      status: "SPRINT",
      userId: testUser.id,
    }),
  ]);

  const existingVelocity = await prisma.velocityEntry.count({ where: { userId: testUser.id } });
  if (existingVelocity === 0) {
    await prisma.velocityEntry.createMany({
      data: [
        { name: "Sprint-10", points: 21, range: "18-24", userId: testUser.id },
        { name: "Sprint-11", points: 24, range: "20-26", userId: testUser.id },
        { name: "Sprint-12", points: 23, range: "20-26", userId: testUser.id },
      ],
    });
  }

  const existingAutomation = await prisma.userAutomationSetting.findFirst({
    where: { userId: testUser.id },
  });
  if (!existingAutomation) {
    await prisma.userAutomationSetting.create({
      data: { low: 35, high: 70, userId: testUser.id },
    });
  }

  const existingLogs = await prisma.aiSuggestion.count({ where: { userId: testUser.id } });
  if (existingLogs === 0) {
    await prisma.aiSuggestion.createMany({
      data: [
        {
          type: "TIP",
          taskId: tasks[0].id,
          inputTitle: tasks[0].title,
          inputDescription: tasks[0].description ?? "",
          output: "小さなセクションごとに完了条件を明記すると実装が速くなります。",
          userId: testUser.id,
        },
        {
          type: "SCORE",
          taskId: tasks[1].id,
          inputTitle: tasks[1].title,
          inputDescription: tasks[1].description ?? "",
          output: JSON.stringify({
            points: 8,
            urgency: "中",
            risk: "中",
            score: 66,
            reason: "影響範囲が広いため中程度の工数",
          }),
          userId: testUser.id,
        },
        {
          type: "SPLIT",
          taskId: tasks[1].id,
          inputTitle: tasks[1].title,
          inputDescription: tasks[1].description ?? "",
          output: JSON.stringify([
            {
              title: "バックアップ方式の整理",
              points: 3,
              urgency: "中",
              risk: "中",
              detail: "自動/手動の運用差分を洗い出す。",
            },
            {
              title: "復元手順のドラフト",
              points: 3,
              urgency: "中",
              risk: "中",
              detail: "復元フローとSOPの叩きを作る。",
            },
            {
              title: "監視・通知の検討",
              points: 2,
              urgency: "低",
              risk: "低",
              detail: "失敗時の通知チャネルを整理。",
            },
          ]),
          userId: testUser.id,
        },
      ],
    });
  }

  console.log("Seed completed.");
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
