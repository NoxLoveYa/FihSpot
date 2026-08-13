import type { User } from '@prisma/client';
import { prisma } from '../prisma';
import { config } from '../config';

export function isAdminEmail(email: string): boolean {
  return config.adminEmails.includes(email.toLowerCase());
}

export async function syncAdminRole(user: User): Promise<User> {
  const shouldBeAdmin = isAdminEmail(user.email);
  if (shouldBeAdmin && user.role !== 'ADMIN') {
    return prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  }
  return user;
}
