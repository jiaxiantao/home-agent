import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaConnectionString: string | undefined;
};

export function getDb() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return null;
  }

  if (
    globalForPrisma.prisma &&
    globalForPrisma.prismaConnectionString !== connectionString
  ) {
    void globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
  }

  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({
      connectionString,
    });

    globalForPrisma.prisma = new PrismaClient({
      adapter,
      log:
        process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
    globalForPrisma.prismaConnectionString = connectionString;
  }

  return globalForPrisma.prisma;
}
