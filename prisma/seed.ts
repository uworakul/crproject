import "dotenv/config";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "../generated/prisma/client";
import { menuSeed } from "./seed-menus";

// Not importing src/lib/password.ts here: it's guarded with `server-only`,
// which throws when run outside the Next.js bundler (e.g. via `tsx` here).
function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

const adapter = new PrismaMssql(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function seedMenus() {
  for (const menu of menuSeed) {
    await prisma.sysMenu.upsert({
      where: { DocumentType: menu.DocumentType },
      update: { MenuNameTH: menu.MenuNameTH, MenuNameEN: menu.MenuNameEN, ModuleGroup: menu.ModuleGroup },
      create: menu,
    });
  }
  console.log(`Seeded/updated ${menuSeed.length} sys_menu rows.`);
}

async function main() {
  await seedMenus();

  const existing = await prisma.sysUser.findUnique({ where: { UserID: "admin" } });
  if (existing) {
    console.log("Admin user seed skipped: sys_user 'admin' already exists.");
    return;
  }

  const generatedPassword = randomBytes(9).toString("base64url"); // dev bootstrap only
  const passwordHash = await hashPassword(generatedPassword);

  await prisma.sysUser.create({
    data: {
      UserID: "admin",
      PasswordHash: passwordHash,
      DisplayName: "System Administrator",
      Role: "ADMIN",
    },
  });

  console.log("Seeded initial admin account:");
  console.log("  UserID:  admin");
  console.log(`  Password: ${generatedPassword}`);
  console.log("Save this password now — it is not stored anywhere else. Change it after first login.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
