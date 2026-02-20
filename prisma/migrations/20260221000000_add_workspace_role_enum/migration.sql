-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'member');

-- AlterTable: WorkspaceMember.role  String -> WorkspaceRole
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" TYPE "WorkspaceRole" USING "role"::"WorkspaceRole";
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DEFAULT 'member'::"WorkspaceRole";

-- AlterTable: WorkspaceInvite.role  String -> WorkspaceRole
ALTER TABLE "WorkspaceInvite" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "WorkspaceInvite" ALTER COLUMN "role" TYPE "WorkspaceRole" USING "role"::"WorkspaceRole";
ALTER TABLE "WorkspaceInvite" ALTER COLUMN "role" SET DEFAULT 'member'::"WorkspaceRole";
