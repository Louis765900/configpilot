import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'desktop-large', width: 1920, height: 1080 },
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'mobile-small', width: 360, height: 800 },
]

for (const viewport of viewports) {
  test(`accueil sans débordement — ${viewport.name}`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize(viewport)
    await page.goto('/#home')
    await expect(page).toHaveTitle('ConfigPilot — Comparateur et configurateur PC')
    await expect(page.getByRole('heading', { name: /Le copilote de votre/ })).toBeVisible()
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(horizontalOverflow).toBe(false)
    if (viewport.name === 'desktop-large') await page.screenshot({ path: 'docs/screenshots/home-desktop.png', fullPage: true })
    if (viewport.name === 'mobile') await page.screenshot({ path: 'docs/screenshots/home-mobile.png', fullPage: true })
    expect(errors).toEqual([])
  })
}

test('parcours catalogue, configurateur et persistance locale', async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/#catalog')
  await page.getByPlaceholder('Nom, référence, marque, socket…').fill('i9-9900KF')
  await expect(page.getByRole('heading', { name: 'Intel Core i9-9900KF' })).toBeVisible()
  await page.goto('/#builder')
  await expect(page.getByText('BIOS et génération')).toBeVisible()
  await page.reload()
  await expect(page.locator('.part-picker strong').filter({ hasText: 'Intel Core i9-9900KF' })).toBeVisible()
  expect(errors).toEqual([])
})

test('navigation mobile et thème sombre', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#home')
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  await page.getByLabel('Navigation principale').getByRole('button', { name: 'Catalogue', exact: true }).click()
  await expect(page).toHaveURL(/#catalog/)
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
