import "server-only";
import { prisma } from "./prisma";

/** Writes to sys_process_log — call for every significant transaction (rule 5, CLAUDE.md). */
export async function logAction(
  userId: string,
  actionType: string,
  opts?: { targetTable?: string; targetId?: string; detail?: string },
) {
  await prisma.sysProcessLog.create({
    data: {
      UserID: userId,
      ActionType: actionType,
      TargetTable: opts?.targetTable,
      TargetID: opts?.targetId,
      Detail: opts?.detail,
    },
  });
}
