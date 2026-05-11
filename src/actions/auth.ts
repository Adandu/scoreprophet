'use server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { getSession } from '@/lib/session'

export async function register(prevState: unknown, formData: FormData) {
  const username = (formData.get('username') as string)?.trim()
  const password = formData.get('password') as string
  if (!username || username.length < 2 || username.length > 30) return { error: 'Username must be 2–30 characters' }
  if (!password || password.length < 6) return { error: 'Password must be at least 6 characters' }
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) return { error: 'Username already taken' }
  const isAdmin = username === process.env.ADMIN_USERNAME
  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({ data: { username, passwordHash, isAdmin } })
  const session = await getSession()
  session.userId = user.id
  session.username = user.username
  session.isAdmin = user.isAdmin
  await session.save()
  redirect('/')
}

export async function login(prevState: unknown, formData: FormData) {
  const username = (formData.get('username') as string)?.trim()
  const password = formData.get('password') as string
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return { error: 'Invalid username or password' }
  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return { error: 'Invalid username or password' }
  let isAdmin = user.isAdmin
  if (!isAdmin && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
    isAdmin = true
    await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } })
  }
  const session = await getSession()
  session.userId = user.id
  session.username = user.username
  session.isAdmin = isAdmin
  await session.save()
  redirect('/')
}

export async function logout() {
  const session = await getSession()
  session.destroy()
  redirect('/login')
}
