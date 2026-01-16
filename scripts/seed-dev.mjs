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
    update: {
      role: "ADMIN",
      emailVerified: new Date(),
      disabledAt: null,
    },
    create: {
      name: "Admin",
      email: adminEmail,
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });

  const testUser = await prisma.user.upsert({
    where: { email: testEmail },
    update: {
      role: "USER",
      emailVerified: new Date(),
      disabledAt: null,
    },
    create: {
      name: "Test User",
      email: testEmail,
      role: "USER",
      emailVerified: new Date(),
    },
  });

  const ensurePassword = async (userId, password) => {
    const hashed = await bcrypt.hash(password, 10);
    await prisma.userPassword.upsert({
      where: { userId },
      update: { hash: hashed },
      create: { userId, hash: hashed },
    });
  };

  await ensurePassword(adminUser.id, adminPassword);
  await ensurePassword(testUser.id, testPassword);

  const workspace = await prisma.workspace.upsert({
    where: { id: `${testUser.id}-personal` },
    update: {},
    create: {
      id: `${testUser.id}-personal`,
      name: "Holoplax Studio",
      ownerId: testUser.id,
      members: { create: { userId: testUser.id, role: "owner" } },
    },
  });

  const sprint = await prisma.sprint.create({
    data: {
      name: "Sprint-Launch",
      status: "ACTIVE",
      capacityPoints: 24,
      userId: testUser.id,
      workspaceId: workspace.id,
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    },
  });

  await prisma.task.createMany({
    data: [
      {
        title: "LPのヒーローコピー確定",
        description: "価値訴求を3案出し、社内レビューで決定。",
        points: 3,
        urgency: "中",
        risk: "低",
        status: "SPRINT",
        sprintId: sprint.id,
        userId: testUser.id,
        workspaceId: workspace.id,
      },
      {
        title: "オンボーディングの質問設計",
        description: "初回セットアップの質問項目と順序を決める。",
        points: 5,
        urgency: "中",
        risk: "中",
        status: "SPRINT",
        sprintId: sprint.id,
        userId: testUser.id,
        workspaceId: workspace.id,
      },
      {
        title: "ベロシティ可視化の文言調整",
        description: "KPIカードの説明文と単位を見直す。",
        points: 2,
        urgency: "低",
        risk: "低",
        status: "DONE",
        sprintId: sprint.id,
        userId: testUser.id,
        workspaceId: workspace.id,
      },
      {
        title: "インボックス取り込みの仕様ドラフト",
        description: "メモ/カレンダーから取り込む粒度を定義。",
        points: 8,
        urgency: "中",
        risk: "高",
        status: "BACKLOG",
        userId: testUser.id,
        workspaceId: workspace.id,
      },
      {
        title: "通知設計のたたき台",
        description: "Slack/メールの通知条件を整理して下書き。",
        points: 5,
        urgency: "低",
        risk: "中",
        status: "BACKLOG",
        userId: testUser.id,
        workspaceId: workspace.id,
      },
      {
        title: "スプリント完了レビューのテンプレ作成",
        description: "振り返りの質問項目を整える。",
        points: 3,
        urgency: "中",
        risk: "低",
        status: "BACKLOG",
        userId: testUser.id,
        workspaceId: workspace.id,
      },
    ],
  });

  const existingVelocity = await prisma.velocityEntry.count({ where: { userId: testUser.id } });
  if (existingVelocity === 0) {
    await prisma.velocityEntry.createMany({
      data: [
        { name: "Sprint-08", points: 18, range: "16-22", userId: testUser.id, workspaceId: workspace.id },
        { name: "Sprint-09", points: 20, range: "18-24", userId: testUser.id, workspaceId: workspace.id },
        { name: "Sprint-10", points: 22, range: "20-26", userId: testUser.id, workspaceId: workspace.id },
        { name: "Sprint-11", points: 24, range: "22-28", userId: testUser.id, workspaceId: workspace.id },
        { name: "Sprint-12", points: 21, range: "20-26", userId: testUser.id, workspaceId: workspace.id },
      ],
    });
  }

  const existingAutomation = await prisma.userAutomationSetting.findFirst({
    where: { userId: testUser.id, workspaceId: workspace.id },
  });
  if (!existingAutomation) {
    await prisma.userAutomationSetting.create({
      data: { low: 35, high: 70, userId: testUser.id, workspaceId: workspace.id },
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
